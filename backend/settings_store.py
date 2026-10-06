from app_settings import get_setting, set_setting

KEYS = ("store_open_time", "store_close_time")


def load_settings():
    return {
        "store_open_time": get_setting("store_open_time") or "10:00",
        "store_close_time": get_setting("store_close_time") or "21:00",
    }


def save_settings(settings):
    for key in KEYS:
        if key in settings:
            set_setting(key, settings[key])