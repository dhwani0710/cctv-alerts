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

import re

class SQLiteCursorWrapper:
    def __init__(self, cursor):
        self.cursor = cursor

    def execute(self, query, params=None):
        # Convert Postgres %s placeholders to SQLite ? placeholders
        sqlite_query = query.replace("%s", "?")
        # Replace Postgres SERIAL with INTEGER
        sqlite_query = sqlite_query.replace("SERIAL PRIMARY KEY", "INTEGER PRIMARY KEY AUTOINCREMENT")
        sqlite_query = sqlite_query.replace("DEFAULT NOW()", "DEFAULT CURRENT_TIMESTAMP")

        # Handle ALTER TABLE ... ADD COLUMN IF NOT EXISTS in SQLite
        if re.search(r'ALTER\s+TABLE\s+.*?\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS', sqlite_query, re.IGNORECASE):
            clean_query = re.sub(r'ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS', 'ADD COLUMN', sqlite_query, flags=re.IGNORECASE)
            try:
                if params is not None:
                    return self.cursor.execute(clean_query, params)
                return self.cursor.execute(clean_query)
            except sqlite3.OperationalError as e:
                if "duplicate column name" in str(e).lower():
                    return self.cursor
                raise e

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
    cursor.execute("""
        ALTER TABLE attendance ADD COLUMN IF NOT EXISTS zone_id TEXT
    """)
    cursor.execute("""
        ALTER TABLE attendance ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'present'
    """)
    cursor.execute("""
        ALTER TABLE attendance ADD COLUMN IF NOT EXISTS override_reason TEXT
    """)
    cursor.execute("""
        ALTER TABLE attendance ADD COLUMN IF NOT EXISTS is_override BOOLEAN DEFAULT FALSE
    """)

    cursor.execute("DROP TABLE IF EXISTS currently_detected")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS currently_detected (
            person_name TEXT NOT NULL,
            camera_id TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            PRIMARY KEY (person_name, camera_id)
        )
    """)
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

    # Users Table for Role Based Access Control
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    # Auto-seed default Super Admin if not present
    cursor.execute("SELECT id FROM users WHERE username = %s", (DEFAULT_ADMIN_USERNAME,))
    if not cursor.fetchone():
        from auth_users import hash_password
        admin_pwd_hash = hash_password(DEFAULT_ADMIN_PASSWORD)
        cursor.execute(
            "INSERT INTO users (username, password_hash, role, name, created_at) VALUES (%s, %s, %s, %s, %s)",
            (DEFAULT_ADMIN_USERNAME, admin_pwd_hash, "admin", DEFAULT_ADMIN_USERNAME, datetime.utcnow().isoformat())
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
