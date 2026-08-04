import json
import os

SETTINGS_FILE = "settings.json"

DEFAULTS = {
    "store_open_time": "10:00",
    "store_close_time": "21:00"
}

def load_settings():
    if not os.path.exists(SETTINGS_FILE):
        save_settings(DEFAULTS)
        return DEFAULTS
    with open(SETTINGS_FILE, "r") as f:
        return json.load(f)

def save_settings(settings):
    with open(SETTINGS_FILE, "w") as f:
        json.dump(settings, f)