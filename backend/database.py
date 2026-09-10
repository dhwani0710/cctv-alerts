import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
DEFAULT_ADMIN_USERNAME = os.getenv("DEFAULT_ADMIN_USERNAME", "admin")
DEFAULT_ADMIN_PASSWORD = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123")

DB_TYPE = "postgres" if (DATABASE_URL and ("postgres" in DATABASE_URL or "postgresql" in DATABASE_URL)) else "sqlite"

class SQLiteCursorWrapper:
    def __init__(self, cursor):
        self.cursor = cursor

    def execute(self, query, params=None):
        # Convert Postgres %s placeholders to SQLite ? placeholders
        sqlite_query = query.replace("%s", "?")
        # Replace Postgres SERIAL with INTEGER
        sqlite_query = sqlite_query.replace("SERIAL PRIMARY KEY", "INTEGER PRIMARY KEY AUTOINCREMENT")
        if params is not None:
            return self.cursor.execute(sqlite_query, params)
        return self.cursor.execute(sqlite_query)

    def fetchone(self):
        row = self.cursor.fetchone()
        if row is None:
            return None
        return dict(row)

    def fetchall(self):
        rows = self.cursor.fetchall()
        return [dict(r) for r in rows]

    def close(self):
        self.cursor.close()

    @property
    def lastrowid(self):
        return self.cursor.lastrowid

class SQLiteConnWrapper:
    def __init__(self, conn):
        self.conn = conn

    def cursor(self):
        return SQLiteCursorWrapper(self.conn.cursor())

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        self.conn.close()

def _get_raw_connection():
    global DB_TYPE
    if DB_TYPE == "postgres":
        try:
            import psycopg2
            import psycopg2.extras
            conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
            return "postgres", conn
        except Exception as e:
            print(f"[database] PostgreSQL connection failed ({e}). Falling back to local SQLite database.")
            DB_TYPE = "sqlite"

    # SQLite connection
    db_path = os.path.join(os.path.dirname(__file__), "cctv.db")
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return "sqlite", SQLiteConnWrapper(conn)

def init_db():
    db_type, conn = _get_raw_connection()
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
            timestamp TEXT NOT NULL,
            snapshot_filename TEXT
        )
    """)
    cursor.execute("""
            ALTER TABLE alerts ADD COLUMN IF NOT EXISTS snapshot_filename TEXT
        """)
    cursor.execute("""
            ALTER TABLE alerts ADD COLUMN IF NOT EXISTS camera_id TEXT
        """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS employee_photos (
            id SERIAL PRIMARY KEY,
            employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
            filename TEXT NOT NULL
        )
    """)
    cursor.execute("""
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS designation TEXT NOT NULL DEFAULT 'Staff'
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL,
            name TEXT NOT NULL
        )
    """)
    cursor.execute("""
        ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()
    """)

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
    cursor.execute("""
        ALTER TABLE attendance ADD COLUMN IF NOT EXISTS last_camera_id TEXT
    """)

    try:
        cursor.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'")
        cursor.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS acknowledged_by TEXT")
        cursor.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS acknowledged_at TEXT")
        cursor.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS ack_proof_image TEXT")
        cursor.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS ack_notes TEXT")
    except Exception as e:
        print(f"[database] Note on alerts columns: {e}")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS currently_detected (
            person_name TEXT NOT NULL,
            camera_id TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            PRIMARY KEY (person_name, camera_id)
        )
    """)
    try:
        cursor.execute("DELETE FROM currently_detected")
    except Exception as e:
        pass

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS system_state (
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

    # Seed the 4 core role accounts (Owner, CEO, HR, Guard) + admin
    from auth_users import hash_password
    default_users = [
        {"username": "admin", "password": "ceo123", "role": "owner", "name": "System Owner"},
        {"username": "owner", "password": "ceo123", "role": "owner", "name": "System Owner"},
        {"username": "ceo", "password": "ceo123", "role": "ceo", "name": "Chief Executive Officer"},
        {"username": "hr", "password": "hr1234", "role": "hr", "name": "HR Department"},
        {"username": "guard", "password": "guard123", "role": "guard", "name": "Security Guard"},
    ]

    for u in default_users:
        cursor.execute("SELECT id FROM users WHERE username = %s", (u["username"],))
        existing = cursor.fetchone()
        pwd_hash = hash_password(u["password"])
        if not existing:
            cursor.execute(
                "INSERT INTO users (username, password_hash, role, name) VALUES (%s, %s, %s, %s)",
                (u["username"], pwd_hash, u["role"], u["name"])
            )
        else:
            # Ensure proper role and password hash are active
            cursor.execute(
                "UPDATE users SET password_hash = %s, role = %s, name = %s WHERE username = %s",
                (pwd_hash, u["role"], u["name"], u["username"])
            )

    conn.commit()
    cursor.close()
    conn.close()

@contextmanager
def get_db():
    db_type, conn = _get_raw_connection()
    try:
        yield conn
    finally:
        conn.close()
