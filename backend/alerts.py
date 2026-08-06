from datetime import datetime, timedelta
from database import get_db
from settings_store import load_settings
from notifications import send_telegram_alert
import config

def get_alert_priority(minutes_past):
    if minutes_past <= config.LOW_THRESHOLD_MIN:
        return "low"
    elif minutes_past <= config.MEDIUM_THRESHOLD_MIN:
        return "medium"
    else:
        return "high"

def format_duration(total_minutes):
    total_minutes = int(total_minutes)
    hours = total_minutes // 60
    minutes = total_minutes % 60
    if hours > 0:
        return f"{hours} hr {minutes} min" if minutes else f"{hours} hr"
    return f"{minutes} min"

def get_shift_datetimes(now, shift_start_str, shift_end_str):
    sh, sm = map(int, shift_start_str.split(":"))
    eh, em = map(int, shift_end_str.split(":"))

    start_today = now.replace(hour=sh, minute=sm, second=0, microsecond=0)
    end_today = now.replace(hour=eh, minute=em, second=0, microsecond=0)

    is_overnight = (eh, em) <= (sh, sm)

    if not is_overnight:
        return start_today, end_today

    start_tonight = start_today
    end_tomorrow_morning = end_today + timedelta(days=1)
    start_last_night = start_today - timedelta(days=1)
    end_this_morning = end_today

    if now >= start_tonight:
        return start_tonight, end_tomorrow_morning
    else:
        return start_last_night, end_this_morning

def is_within_store_hours(now: datetime):
    settings = load_settings()
    open_h, open_m = map(int, settings["store_open_time"].split(":"))
    close_h, close_m = map(int, settings["store_close_time"].split(":"))
    open_t = now.replace(hour=open_h, minute=open_m, second=0, microsecond=0)
    close_t = now.replace(hour=close_h, minute=close_m, second=0, microsecond=0)
    return open_t <= now <= close_t

def already_alerted_recently(person_name, alert_type, priority, window_seconds=120):
    cutoff = datetime.now() - timedelta(seconds=window_seconds)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT timestamp FROM alerts WHERE person_name = %s AND alert_type = %s AND priority = %s "
            "ORDER BY timestamp DESC LIMIT 1",
            (person_name, alert_type, priority)
        )
        row = cur.fetchone()
        cur.close()
    if not row:
        return False
    alert_time = datetime.fromisoformat(row["timestamp"])
    return alert_time >= cutoff

PRIORITY_EMOJI = {"low": "🟡", "medium": "🟠", "high": "🔴"}

def log_alert(person_name, alert_type, priority, message):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO alerts (person_name, alert_type, priority, message, timestamp) VALUES (%s, %s, %s, %s, %s)",
            (person_name, alert_type, priority, message, datetime.now().isoformat())
        )
        conn.commit()
        cur.close()

    emoji = PRIORITY_EMOJI.get(priority, "")
    send_telegram_alert(f"{emoji} [{priority.upper()}] {message}")