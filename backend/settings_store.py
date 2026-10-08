import json
import os
import threading

import config
from app_settings import get_setting, set_setting

# Old file-based storage. Only read once, to import existing values into the database.
LEGACY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "store_settings.json")

KEYS = ("store_open_time", "store_close_time")

DEFAULTS = {
    "store_open_time": config.STORE_OPEN_TIME,
    "store_close_time": config.STORE_CLOSE_TIME,
}

_migrate_lock = threading.Lock()
_migrated = False


def _import_legacy_file():
    """One-time: copy values from store_settings.json into the DB if the DB has none yet."""
    global _migrated
    if _migrated:
        return
    with _migrate_lock:
        if _migrated:
            return
        try:
            if os.path.exists(LEGACY_FILE):
                with open(LEGACY_FILE, "r") as f:
                    stored = json.load(f)
                if isinstance(stored, dict):
                    for key in KEYS:
                        if key in stored and get_setting(key) is None:
                            set_setting(key, stored[key])
                            print(f"[settings_store] Imported {key} from store_settings.json into DB")
            _migrated = True
        except Exception as e:
            # Don't set _migrated, so it retries next call (e.g. DB was briefly down)
            print(f"[settings_store] Legacy import skipped for now: {e}")


def load_settings():
    """Returns a fresh dict with store_open_time and store_close_time."""
    try:
        _import_legacy_file()
        result = {}
        for key in KEYS:
            value = get_setting(key)
            result[key] = str(value) if value not in (None, "") else DEFAULTS[key]
        return result
    except Exception as e:
        print(f"[settings_store] Could not read settings from DB, using defaults: {e}")
        return dict(DEFAULTS)


def save_settings(settings):
    """Saves store hours to the database so they survive restarts and redeploys."""
    for key in KEYS:
        if key in settings and settings[key] not in (None, ""):
            set_setting(key, settings[key])