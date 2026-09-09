import os
import psycopg2
import psycopg2.extras
from contextlib import contextmanager
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
DEFAULT_ADMIN_USERNAME = os.getenv("DEFAULT_ADMIN_USERNAME", "admin")
DEFAULT_ADMIN_ROLE = os.getenv("DEFAULT_ADMIN_ROLE", "ceo")
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

    cursor.execute("SELECT id FROM users WHERE username = %s", (DEFAULT_ADMIN_USERNAME,))
    if not cursor.fetchone():
        from auth_users import hash_password
        admin_pwd_hash = hash_password(DEFAULT_ADMIN_PASSWORD)
        cursor.execute(
            "INSERT INTO users (username, password_hash, role, name) VALUES (%s, %s, %s, %s)",
            (DEFAULT_ADMIN_USERNAME, admin_pwd_hash, DEFAULT_ADMIN_ROLE, DEFAULT_ADMIN_USERNAME)
        )

    conn.commit()
    cursor.close()
    conn.close()

@contextmanager
def get_db():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        yield conn
    finally:
        conn.close()