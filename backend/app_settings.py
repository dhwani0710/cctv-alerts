from database import get_db


# Default values used when a setting has not been saved yet.
DEFAULTS = {
    # Notification settings
    "notify_motion": "true",
    "notify_person": "true",

    # Existing system settings
    "min_matching_photos": "2",
    "match_distance_threshold": "",
    "overstay_low_threshold_min": "30",
    "overstay_medium_threshold_min": "60",
    "alert_dedupe_window_sec": "60",
    "escalation_low_to_medium_sec": "1800",
    "escalation_medium_to_high_sec": "3600",
}

import time
_settings_cache = {"data": None, "ts": 0}
_SETTINGS_CACHE_TTL = 5  # seconds

def get_setting(key):
    now = time.time()
    if _settings_cache["data"] is None or now - _settings_cache["ts"] >= _SETTINGS_CACHE_TTL:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("SELECT key, value FROM app_settings")
            rows = cur.fetchall()
            cur.close()
        _settings_cache["data"] = {r["key"]: r["value"] for r in rows}
        _settings_cache["ts"] = now

    if key in _settings_cache["data"]:
        return _settings_cache["data"][key]

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
        _settings_cache["data"] = None

        # Read it straight back within the same connection to confirm the
        # write actually landed, and log it. If this print ever shows a
        # different value than what you just saved, the write itself is
        # not persisting (check DATABASE_URL / DB permissions).
        cur.execute("SELECT value FROM app_settings WHERE key = %s", (key,))
        confirm = cur.fetchone()

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