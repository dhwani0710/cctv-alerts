import json
import os
import threading

import config

KEYS = ("store_open_time", "store_close_time")

DEFAULTS = {
    "store_open_time": config.STORE_OPEN_TIME,
    "store_close_time": config.STORE_CLOSE_TIME,
}

_lock = threading.Lock()
_cache = {"data": None, "mtime": None}


def _file_mtime():
    try:
        return os.stat(SETTINGS_FILE).st_mtime_ns
    except OSError:
        return None


def load_settings():
    """Returns a fresh dict each call. The file is re-read only if it changed on disk."""
    mtime = _file_mtime()
    with _lock:
        if mtime is not None and _cache["data"] is not None and _cache["mtime"] == mtime:
            return dict(_cache["data"])

    if mtime is None:
        save_settings(DEFAULTS)
        with _lock:
            return dict(_cache["data"])

    try:
        with open(SETTINGS_FILE, "r") as f:
            stored = json.load(f)
        if not isinstance(stored, dict):
            stored = {}
    except (OSError, ValueError) as e:
        print(f"[settings_store] Could not read {SETTINGS_FILE}, using defaults: {e}")
        stored = {}

    data = {**DEFAULTS, **stored}
    with _lock:
        _cache["data"] = data
        _cache["mtime"] = mtime
    return dict(data)


def save_settings(settings):
    data = {**DEFAULTS, **settings}
    tmp = SETTINGS_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f)
    os.replace(tmp, SETTINGS_FILE)       # atomic: a crash can't leave a half-written file
    with _lock:
        _cache["data"] = data
        _cache["mtime"] = _file_mtime()
