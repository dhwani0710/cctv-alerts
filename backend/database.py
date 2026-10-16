import os
import threading
import psycopg2
import psycopg2.extras
import sys
import time
import traceback
from contextlib import contextmanager
from dotenv import load_dotenv
from psycopg2 import pool

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
OFFICE_ID = int(os.getenv("OFFICE_ID", "1"))

print("[db] using:", DATABASE_URL.split("@")[-1] if DATABASE_URL else "NOT SET")
print("[db] office id:", OFFICE_ID)

_POOL_MAX = 40
_pool_sem = threading.BoundedSemaphore(_POOL_MAX)

_pg_pool = None
def _get_pg_pool():
    global _pg_pool
    if _pg_pool is None:
        _pg_pool = pool.ThreadedConnectionPool(
            minconn=1,
            maxconn=_POOL_MAX,
            dsn=DATABASE_URL,
            cursor_factory=psycopg2.extras.RealDictCursor,
            keepalives=1,
            keepalives_idle=30,
            keepalives_interval=10,
            keepalives_count=5,
            connect_timeout=10,
            tcp_user_timeout=15000,
        )
    return _pg_pool

DEFAULT_ADMIN_USERNAME = os.getenv("DEFAULT_ADMIN_USERNAME", "admin")
DEFAULT_ADMIN_ROLE = os.getenv("DEFAULT_ADMIN_ROLE", "owner")
DEFAULT_ADMIN_PASSWORD = os.getenv("DEFAULT_ADMIN_PASSWORD")


def init_db():
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT pg_advisory_lock(918273645)")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS employees (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                shift_start TEXT NOT NULL,
                shift_end TEXT NOT NULL,
                photo_filename TEXT NOT NULL
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS alerts (
                id SERIAL PRIMARY KEY,
                person_name TEXT NOT NULL,
                alert_type TEXT NOT NULL,
                priority TEXT NOT NULL,
                message TEXT NOT NULL,
                timestamp TEXT NOT NULL
            )
        """)
        cursor.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS snapshot_filename TEXT")
        cursor.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS camera_name TEXT")
        cursor.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS zone_name TEXT")
        cursor.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS permanent BOOLEAN NOT NULL DEFAULT FALSE")
        cursor.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'")
        cursor.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS acknowledged_by TEXT")
        cursor.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS acknowledged_at TEXT")
        cursor.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS ack_proof_image TEXT")
        cursor.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS ack_notes TEXT")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS alert_records (
                id SERIAL PRIMARY KEY,
                person_name TEXT NOT NULL,
                alert_type TEXT NOT NULL,
                priority TEXT NOT NULL,
                message TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                snapshot_filename TEXT,
                camera_id TEXT,
                zone_id TEXT
            )
        """)
        cursor.execute("ALTER TABLE alert_records ADD COLUMN IF NOT EXISTS incident_id INTEGER")
        cursor.execute("ALTER TABLE alert_records ADD COLUMN IF NOT EXISTS camera_name TEXT")
        cursor.execute("ALTER TABLE alert_records ADD COLUMN IF NOT EXISTS zone_name TEXT")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS employee_photos (
                id SERIAL PRIMARY KEY,
                employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                filename TEXT NOT NULL
            )
        """)
        cursor.execute("ALTER TABLE employees ADD COLUMN IF NOT EXISTS designation TEXT NOT NULL DEFAULT 'Staff'")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL
            )
        """)
        cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()")
        cursor.execute("ALTER TABLE users DROP COLUMN IF EXISTS name")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS attendance (
                id SERIAL PRIMARY KEY,
                employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                attendance_date TEXT NOT NULL,
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL,
                UNIQUE(employee_id, attendance_date)
            )
        """)
        cursor.execute("ALTER TABLE attendance ADD COLUMN IF NOT EXISTS zone_name TEXT")
        cursor.execute("ALTER TABLE attendance ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'present'")
        cursor.execute("ALTER TABLE attendance ADD COLUMN IF NOT EXISTS override_reason TEXT")
        cursor.execute("ALTER TABLE attendance ADD COLUMN IF NOT EXISTS is_override BOOLEAN DEFAULT FALSE")

        # ---- currently_detected: one row per (office, person, camera) ----
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS currently_detected (
                person_name TEXT NOT NULL,
                camera_name TEXT NOT NULL,
                last_seen TEXT NOT NULL
            )
        """)
        cursor.execute("ALTER TABLE currently_detected ADD COLUMN IF NOT EXISTS camera_name TEXT")
        cursor.execute("ALTER TABLE currently_detected DROP COLUMN IF EXISTS camera_id")
        cursor.execute("ALTER TABLE currently_detected ADD COLUMN IF NOT EXISTS office_id INTEGER NOT NULL DEFAULT 1")
        cursor.execute("ALTER TABLE currently_detected DROP CONSTRAINT IF EXISTS currently_detected_pkey")
        cursor.execute("DROP INDEX IF EXISTS idx_cd_person_camera")
        cursor.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_cd_office_person_camera
            ON currently_detected (office_id, person_name, camera_name)
        """)
        # Clear stale "currently in view" rows left over from before a restart
        cursor.execute("DELETE FROM currently_detected WHERE office_id = %s", (OFFICE_ID,))

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS system_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cameras (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                rtsp_url TEXT NOT NULL,
                location TEXT,
                enabled BOOLEAN NOT NULL DEFAULT TRUE
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS zones (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL
            )
        """)
        cursor.execute("ALTER TABLE cameras ADD COLUMN IF NOT EXISTS zone_name TEXT")
        cursor.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'cameras' AND column_name = 'location'
        """)
        if cursor.fetchone():
            cursor.execute("UPDATE cameras SET zone_name = location WHERE zone_name IS NULL")
            cursor.execute("ALTER TABLE cameras DROP COLUMN location")
        cursor.execute("ALTER TABLE cameras DROP COLUMN IF EXISTS zone_id")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                username TEXT NOT NULL,
                user_role TEXT NOT NULL,
                action TEXT NOT NULL,
                target_module TEXT NOT NULL,
                details TEXT NOT NULL,
                proof_image TEXT,
                timestamp TEXT NOT NULL
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS incidents (
                id SERIAL PRIMARY KEY,
                person_name TEXT NOT NULL,
                alert_type TEXT NOT NULL,
                priority TEXT NOT NULL,
                camera_name TEXT,
                zone_name TEXT,
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL,
                alert_count INTEGER NOT NULL DEFAULT 1,
                status TEXT NOT NULL DEFAULT 'new'
            )
        """)
        cursor.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS incident_id INTEGER REFERENCES incidents(id)")
        cursor.execute("ALTER TABLE incidents ADD COLUMN IF NOT EXISTS last_notified TEXT")
        cursor.execute("ALTER TABLE incidents ADD COLUMN IF NOT EXISTS camera_id TEXT")
        cursor.execute("ALTER TABLE incidents ADD COLUMN IF NOT EXISTS zone_id TEXT")

        # From ft3
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS recordings (
                id SERIAL PRIMARY KEY,
                camera_id TEXT NOT NULL,
                camera_name TEXT NOT NULL,
                zone_name TEXT,
                timestamp TEXT NOT NULL,
                video_url TEXT NOT NULL
            )
        """)

        # ---- multi-office ----
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS offices (
                id SERIAL PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                city TEXT
            )
        """)
        cursor.execute("""
            INSERT INTO offices (id, name) VALUES (1, 'Main Office')
            ON CONFLICT (id) DO NOTHING
        """)
        cursor.execute("""
            SELECT setval(pg_get_serial_sequence('offices','id'),
                          (SELECT MAX(id) FROM offices))
        """)
        for t in ("employees", "alerts", "alert_records", "attendance",
                  "cameras", "zones", "incidents", "recordings", "audit_logs"):
            cursor.execute(
                f"ALTER TABLE {t} ADD COLUMN IF NOT EXISTS office_id "
                f"INTEGER NOT NULL DEFAULT 1 REFERENCES offices(id)"
            )
            cursor.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{t}_office ON {t} (office_id)"
            )
        # users.office_id NULL = all offices (owner/ceo)
        cursor.execute(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS office_id "
            "INTEGER REFERENCES offices(id)"
        )
        cursor.execute(
            "UPDATE users SET office_id = 1 WHERE role IN ('guard','hr') AND office_id IS NULL"
        )

        # Indexes — created AFTER the tables exist
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts (timestamp DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_incidents_last_seen ON incidents (last_seen DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents (status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_currently_detected_last_seen ON currently_detected (last_seen)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_alerts_incident ON alerts (incident_id, timestamp DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_alert_records_incident ON alert_records (incident_id, timestamp DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_recordings_ts ON recordings (timestamp DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_incidents_dedupe ON incidents (person_name, alert_type, camera_name, last_seen DESC)")

        # Create the first admin account only when no users exist yet.
        # Credentials come from environment variables. If no password is set,
        # a random one is generated and printed once on the console.
        from auth_users import hash_password
        import secrets
        cursor.execute("SELECT COUNT(*) FROM users")
        if cursor.fetchone()[0] == 0:
            admin_password = DEFAULT_ADMIN_PASSWORD
            generated = False
            if not admin_password:
                admin_password = secrets.token_urlsafe(12)
                generated = True
            cursor.execute(
                "INSERT INTO users (username, password_hash, role) VALUES (%s, %s, %s)",
                (DEFAULT_ADMIN_USERNAME, hash_password(admin_password), DEFAULT_ADMIN_ROLE),
            )
            if generated:
                print("=" * 60)
                print(f"[setup] First admin created. Username: {DEFAULT_ADMIN_USERNAME}")
                print(f"[setup] Password (shown only once): {admin_password}")
                print("=" * 60)
    except Exception:
        conn.rollback()
        raise
    finally:
        try:
            cursor.execute("SELECT pg_advisory_unlock(918273645)")
            conn.commit()
        except Exception:
            pass
        cursor.close()
        conn.close()

_holders = {}
_holders_lock = threading.Lock()
_last_used = {}

def _dump_holders():
    frames = sys._current_frames()
    now = time.time()
    with _holders_lock:
        items = list(_holders.values())
    print(f"[db] POOL BUSY: {len(items)} holders", flush=True)
    for tid, t0 in items:
        f = frames.get(tid)
        stack = "".join(traceback.format_stack(f)[-5:]) if f else "(thread gone)"
        print(f"[db] held {now - t0:.1f}s by thread {tid}\n{stack}", flush=True)

@contextmanager
def get_db():
    if not _pool_sem.acquire(timeout=30):
        _dump_holders()
        raise pool.PoolError("db busy: waited 30s for a connection")
    key = object()
    with _holders_lock:
        _holders[key] = (threading.get_ident(), time.time())
    p = _get_pg_pool()
    conn = None
    broken = False
    try:
        for _ in range(3):
            c = p.getconn()
            try:
                if c.closed:
                    raise psycopg2.OperationalError("closed")
                if time.monotonic() - _last_used.get(id(c), 0) > 20:
                    with c.cursor() as cur:
                        cur.execute("SELECT 1")
                    c.rollback()
                conn = c
                break
            except Exception:
                _last_used.pop(id(c), None)
                p.putconn(c, close=True)
        if conn is None:
            raise psycopg2.OperationalError("no healthy db connection")
        try:
            yield conn
        except (psycopg2.OperationalError, psycopg2.InterfaceError):
            broken = True
            raise
        finally:
            try:
                if not broken and not conn.closed:
                    conn.rollback()
            except Exception:
                broken = True
            if broken or conn.closed:
                _last_used.pop(id(conn), None)
            else:
                _last_used[id(conn)] = time.monotonic()
            p.putconn(conn, close=(broken or bool(conn.closed)))
    finally:
        with _holders_lock:
            _holders.pop(key, None)
        _pool_sem.release()