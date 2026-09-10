from database import get_db


# Default values used when a setting has not been saved yet.
DEFAULTS = {
    # Notification settings
    "notify_motion": "true",
    "notify_person": "true",
    "notify_email": "false",

    # Alert / detection settings
    "sensitivity": "medium",
    "after_hours_start": "21:00",
    "after_hours_end": "08:00",
    "door_held_seconds": "30",

    # Existing system settings
    "min_matching_photos": "2",
    "match_distance_threshold": "",
    "overstay_low_threshold_min": "30",
    "overstay_medium_threshold_min": "60",
    "alert_dedupe_window_sec": "60",
    "escalation_low_to_medium_sec": "1800",
    "escalation_medium_to_high_sec": "3600",
}


def get_setting(key):
    """
    Get a single setting from PostgreSQL.

    If the setting has not been saved yet, return its default value.
    """
    with get_db() as conn:
        cur = conn.cursor()

        cur.execute(
            "SELECT value FROM app_settings WHERE key = %s",
            (key,)
        )

        row = cur.fetchone()
        cur.close()

    if row:
        return row["value"]

    return DEFAULTS.get(key)


def get_setting_float(key):
    """
    Get a setting as a float.
    Returns None if the value cannot be converted.
    """
    val = get_setting(key)

    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def get_setting_int(key):
    """
    Get a setting as an integer.
    Returns None if the value cannot be converted.
    """
    val = get_setting(key)

    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def set_setting(key, value):
    """
    Save or update a setting in PostgreSQL.

    If the key already exists, its value is updated.
    If it does not exist, a new row is created.
    """
    print(f"[app_settings] set_setting called: key={key!r} value={value!r}")

    with get_db() as conn:
        cur = conn.cursor()

        cur.execute(
            """
            INSERT INTO app_settings (key, value)
            VALUES (%s, %s)
            ON CONFLICT (key)
            DO UPDATE SET value = EXCLUDED.value
            """,
            (key, str(value))
        )

        conn.commit()

        # Read it straight back within the same connection to confirm the
        # write actually landed, and log it. If this print ever shows a
        # different value than what you just saved, the write itself is
        # not persisting (check DATABASE_URL / DB permissions).
        cur.execute("SELECT value FROM app_settings WHERE key = %s", (key,))
        confirm = cur.fetchone()
        print(f"[app_settings] confirmed in DB after commit: key={key!r} value={confirm['value'] if confirm else None!r}")

        cur.close()


def get_all_settings():
    """
    Return all settings.

    Starts with the default values and then replaces them
    with values saved in PostgreSQL.
    """
    result = dict(DEFAULTS)

    with get_db() as conn:
        cur = conn.cursor()

        cur.execute(
            "SELECT key, value FROM app_settings"
        )

        rows = cur.fetchall()
        cur.close()

    print(f"[app_settings] get_all_settings: {len(rows)} row(s) found in DB, overriding defaults")

    for row in rows:
        result[row["key"]] = row["value"]

    return result