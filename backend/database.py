import os
import psycopg2
import psycopg2.extras
from contextlib import contextmanager
from datetime import datetime
from dotenv import load_dotenv
from psycopg2 import pool

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

_pg_pool = None
def _get_pg_pool():
    global _pg_pool
    if _pg_pool is None:
        _pg_pool = pool.ThreadedConnectionPool(
            minconn=2,
            maxconn=20,
            dsn=DATABASE_URL,
            cursor_factory=psycopg2.extras.RealDictCursor,
        )
    return _pg_pool

DEFAULT_ADMIN_USERNAME = os.getenv("DEFAULT_ADMIN_USERNAME", "admin")
DEFAULT_ADMIN_ROLE = os.getenv("DEFAULT_ADMIN_ROLE", "owner")
DEFAULT_ADMIN_PASSWORD = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123")


def init_db():
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()

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
    cursor.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS camera_id TEXT")
    cursor.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS zone_id TEXT")
    cursor.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS permanent BOOLEAN NOT NULL DEFAULT FALSE")

    # Guard acknowledgment protocol columns (from feature/ft3)
    try:
        cursor.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'")
        cursor.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS acknowledged_by TEXT")
        cursor.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS acknowledged_at TEXT")
        cursor.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS ack_proof_image TEXT")
        cursor.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS ack_notes TEXT")
    except Exception as e:
        print(f"[database] Note on alerts columns: {e}")

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
            role TEXT NOT NULL,
            name TEXT NOT NULL
        )
    """)
    cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()")

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
    cursor.execute("ALTER TABLE attendance ADD COLUMN IF NOT EXISTS last_camera_id TEXT")
    cursor.execute("ALTER TABLE attendance ADD COLUMN IF NOT EXISTS zone_id TEXT")
    cursor.execute("ALTER TABLE attendance ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'present'")
    cursor.execute("ALTER TABLE attendance ADD COLUMN IF NOT EXISTS override_reason TEXT")
    cursor.execute("ALTER TABLE attendance ADD COLUMN IF NOT EXISTS is_override BOOLEAN DEFAULT FALSE")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS currently_detected (
            person_name TEXT NOT NULL,
            camera_id TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            PRIMARY KEY (person_name, camera_id)
        )
    """)
    # Clear stale "currently in view" rows left over from before a restart
    try:
        cursor.execute("DELETE FROM currently_detected")
    except Exception:
        pass

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
    cursor.execute("ALTER TABLE cameras ADD COLUMN IF NOT EXISTS zone_id TEXT REFERENCES zones(id)")

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
            camera_id TEXT,
            zone_id TEXT,
            first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            alert_count INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'new'
        )
    """)
    cursor.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS incident_id INTEGER REFERENCES incidents(id)")
    cursor.execute("ALTER TABLE incidents ADD COLUMN IF NOT EXISTS last_notified TEXT")

    # Seed default accounts so every role in the RBAC set has a working login
    # out of the box. The primary admin account honors the env vars if set;
    # the rest are fixed demo credentials, meant to be changed after first login.
    from auth_users import hash_password
    default_users = [
        {"username": DEFAULT_ADMIN_USERNAME, "password": DEFAULT_ADMIN_PASSWORD, "role": DEFAULT_ADMIN_ROLE, "name": "System Owner"},
        {"username": "owner", "password": "ceo123", "role": "owner", "name": "System Owner"},
        {"username": "ceo", "password": "ceo123", "role": "ceo", "name": "Chief Executive Officer"},
        {"username": "hr", "password": "hr1234", "role": "hr", "name": "HR Department"},
        {"username": "guard", "password": "guard123", "role": "guard", "name": "Security Guard"},
    ]

    for u in default_users:
        cursor.execute("SELECT id FROM users WHERE username = %s", (u["username"],))
        existing = cursor.fetchone()
        if not existing:
            cursor.execute(
                "INSERT INTO users (username, password_hash, role, name) VALUES (%s, %s, %s, %s)",
                (u["username"], hash_password(u["password"]), u["role"], u["name"])
            )
        # Existing accounts are left untouched — don't clobber a real admin's
        # changed password/role on every restart.

    conn.commit()
    cursor.close()
    conn.close()

@contextmanager
def get_db():
    p = _get_pg_pool()
    conn = p.getconn()
    try:
        yield conn
    finally:
        conn.close()
        p.putconn(conn)
