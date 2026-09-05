from database import get_db

DEFAULTS = {
    "min_matching_photos": "2",
    "match_distance_threshold": "",
    "overstay_low_threshold_min": "30",
    "overstay_medium_threshold_min": "60",
    "alert_dedupe_window_sec": "60",
    "escalation_low_to_medium_sec": "1800",
    "escalation_medium_to_high_sec": "3600",
}

def get_setting(key):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT value FROM app_settings WHERE key = %s", (key,))
        row = cur.fetchone()
        cur.close()
    if row:
        return row["value"]
    return DEFAULTS.get(key)

def get_setting_float(key):
    val = get_setting(key)
    try:
        return float(val)
    except (TypeError, ValueError):
        return None

def get_setting_int(key):
    val = get_setting(key)
    try:
        return int(val)
    except (TypeError, ValueError):
        return None

def set_setting(key, value):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO app_settings (key, value) VALUES (%s, %s) "
            "ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
            (key, str(value))
        )
        conn.commit()
        cur.close()

def get_all_settings():
    result = dict(DEFAULTS)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT key, value FROM app_settings")
        rows = cur.fetchall()
        cur.close()
    for r in rows:
        result[r["key"]] = r["value"]
    return result