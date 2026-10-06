import threading
import time

import config
from database import get_db

# Defaults come from config.py so there is one place to edit them.
# Anything saved on the Settings page (stored in the app_settings table) overrides these.
DEFAULTS = {
    # Notification settings
    "notify_motion": "true",
    "notify_person": "true",

    # Recognition / alert settings
    "min_matching_photos": "2",
    "match_distance_threshold": "",
    "overstay_low_threshold_min": str(config.LOW_THRESHOLD_MIN),
    "overstay_medium_threshold_min": str(config.MEDIUM_THRESHOLD_MIN),
    "alert_dedupe_window_sec": str(config.ALERT_DEDUPE_WINDOW_SEC),
    "escalation_low_to_medium_sec": str(config.ESCALATION_LOW_TO_MEDIUM_SEC),
    "escalation_medium_to_high_sec": str(config.ESCALATION_MEDIUM_TO_HIGH_SEC),
}

_CACHE_TTL_SEC = 5
_lock = threading.Lock()
_cache = {"data": None, "ts": float("-inf")}
_generation = 0   # bumped on every write so an in-flight refresh can't leave stale data cached


def _fetch_saved():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT key, value FROM app_settings")
        rows = cur.fetchall()
        cur.close()
    return {r["key"]: r["value"] for r in rows}


def _saved_settings():
    """Saved rows from the DB, cached for a few seconds. Never returns None."""
    data = _cache["data"]
    if data is not None and time.monotonic() - _cache["ts"] < _CACHE_TTL_SEC:
        return data

    # One thread refreshes; the others wait and reuse its result instead of all hitting the DB.
    with _lock:
        now = time.monotonic()
        data = _cache["data"]
        if data is not None and now - _cache["ts"] < _CACHE_TTL_SEC:
            return data

        gen = _generation
        try:
            fresh = _fetch_saved()
        except Exception as e:
            if data is not None:
                # DB blip: keep serving the last known values instead of failing every caller
                print(f"[app_settings] DB read failed, using last known settings: {e}")
                _cache["ts"] = now
                return data
            raise

        if gen == _generation:
            _cache["data"] = fresh
            _cache["ts"] = now
        return fresh


def invalidate_cache():
    """Force the next read to go to the DB (called after every write)."""
    global _generation
    with _lock:
        _generation += 1
        _cache["ts"] = float("-inf")


def get_setting(key):
    saved = _saved_settings()
    if key in saved:
        return saved[key]
    return DEFAULTS.get(key)


def get_setting_float(key):
    """Get a setting as a float. Returns None if the value cannot be converted."""
    try:
        return float(get_setting(key))
    except (TypeError, ValueError):
        return None


def get_setting_int(key):
    """Get a setting as an integer. Returns None if the value cannot be converted."""
    try:
        return int(get_setting(key))
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
        cur.close()
    # After the connection is released, so we never hold a pooled connection while waiting on the lock
    invalidate_cache()


def get_all_settings():
    """Defaults, overridden by whatever is saved in the app_settings table."""
    result = dict(DEFAULTS)
    result.update(_saved_settings())
    return result