from datetime import datetime, timedelta
from database import get_db
from settings_store import load_settings
from notifications import send_telegram_alert, send_telegram_photo
import config
import os
import cv2
import uuid
import storage

SNAPSHOTS_DIR = "snapshots"

def get_alert_priority(minutes_past):
    from app_settings import get_setting_float
    low = get_setting_float("overstay_low_threshold_min") or config.LOW_THRESHOLD_MIN
    medium = get_setting_float("overstay_medium_threshold_min") or config.MEDIUM_THRESHOLD_MIN
    if minutes_past <= low:
        return "low"
    elif minutes_past <= medium:
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

    from app_settings import get_setting_int
    if window_seconds is None:
        window_seconds = get_setting_int("alert_dedupe_window_sec") or 60
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

def get_or_create_incident(person_name, alert_type, priority, camera_id, zone_id, window_seconds=None):
    from app_settings import get_setting_int
    if window_seconds is None:
        window_seconds = get_setting_int("alert_dedupe_window_sec") or 60
    now = datetime.now()
    cutoff = now - timedelta(seconds=window_seconds)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, alert_count, last_notified FROM incidents WHERE person_name = %s AND alert_type = %s "
            "AND camera_id = %s AND last_seen >= %s ORDER BY last_seen DESC LIMIT 1",
            (person_name, alert_type, camera_id, cutoff.isoformat())
        )
        row = cur.fetchone()

        if row:
            cur.execute(
                "UPDATE incidents SET last_seen = %s, alert_count = alert_count + 1, priority = %s WHERE id = %s",
                (now.isoformat(), priority, row["id"])
            )
            conn.commit()
            cur.close()
            return row["id"], row["alert_count"] + 1, False, row["last_notified"]
        else:
            cur.execute(
                "INSERT INTO incidents (person_name, alert_type, priority, camera_id, zone_id, first_seen, last_seen, alert_count, last_notified) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, 1, %s) RETURNING id",
                (person_name, alert_type, priority, camera_id, zone_id, now.isoformat(), now.isoformat(), now.isoformat())
            )
            incident_id = cur.fetchone()["id"]
            conn.commit()
            cur.close()
            return incident_id, 1, True, now.isoformat()

def save_snapshot(frame):
    os.makedirs(SNAPSHOTS_DIR, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.jpg"
    filepath = os.path.join(SNAPSHOTS_DIR, filename)
    cv2.imwrite(filepath, frame)
    try:
        public_url = storage.upload_file(filepath, f"snapshots/{filename}")
    except Exception as e:
        print(f"[alerts] Snapshot upload failed, continuing without cloud URL: {e}")
        public_url = None
    return filepath, public_url

PRIORITY_EMOJI = {"low": "🟡", "medium": "🟠", "high": "🔴"}

REPEAT_ALERT_THRESHOLD = 5
REPEAT_ALERT_INTERVAL_SEC = 5 * 60

def log_alert(person_name, alert_type, priority, message, frame=None, camera_id=None, zone_id=None):
    local_path, snapshot_url = (save_snapshot(frame) if frame is not None else (None, None))
    final_url = snapshot_url
    if local_path and not snapshot_url:
        final_url = f"/snapshots/{os.path.basename(local_path)}"

    incident_id, alert_count, is_new, last_notified = get_or_create_incident(person_name, alert_type, priority, camera_id, zone_id)

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO alerts (person_name, alert_type, priority, message, timestamp, snapshot_filename, camera_id, zone_id, incident_id) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (person_name, alert_type, priority, message, datetime.now().isoformat(), final_url, camera_id, zone_id, incident_id)
        )
        conn.commit()
        cur.close()

    emoji = PRIORITY_EMOJI.get(priority, "")
    caption = f"{emoji} [{priority.upper()}] {message}"
    if not is_new:
        caption += f" (incident #{incident_id}, occurrence {alert_count})"

    if is_new:
        if local_path:
            send_telegram_photo(local_path, caption)
        else:
            send_telegram_alert(caption)
        return

    if alert_count > REPEAT_ALERT_THRESHOLD:
        now = datetime.now()
        should_notify = True
        if last_notified:
            elapsed = (now - datetime.fromisoformat(last_notified)).total_seconds()
            should_notify = elapsed >= REPEAT_ALERT_INTERVAL_SEC

        if should_notify:
            repeat_caption = (
                f"{emoji} [{priority.upper()}] Repeated alert — {message} "
                f"(incident #{incident_id}, {alert_count} occurrences so far)"
            )
            send_telegram_alert(repeat_caption)
            with get_db() as conn:
                cur = conn.cursor()
                cur.execute("UPDATE incidents SET last_notified = %s WHERE id = %s", (now.isoformat(), incident_id))
                conn.commit()
                cur.close()

def escalate_stale_incidents():
    now = datetime.now()
    low_to_medium, medium_to_high = get_escalation_thresholds()

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, priority, first_seen, person_name, alert_type FROM incidents WHERE status = 'new'")
        rows = cur.fetchall()
        cur.close()

    for r in rows:
        first_seen = datetime.fromisoformat(r["first_seen"])
        elapsed = (now - first_seen).total_seconds()
        new_priority = None

        if r["priority"] == "low" and elapsed >= low_to_medium:
            new_priority = "medium"
        elif r["priority"] == "medium" and elapsed >= medium_to_high:
            new_priority = "high"

        if new_priority:
            with get_db() as conn:
                cur = conn.cursor()
                cur.execute("UPDATE incidents SET priority = %s WHERE id = %s", (new_priority, r["id"]))
                conn.commit()
                cur.close()

            emoji = PRIORITY_EMOJI.get(new_priority, "")
            msg = (f"{emoji} Incident #{r['id']} escalated to {new_priority.upper()} — "
                   f"{r['person_name']} ({r['alert_type']}) unacknowledged for {int(elapsed/60)} min")
            send_telegram_alert(msg)

def get_escalation_thresholds():
    from app_settings import get_setting_int
    low_to_medium = get_setting_int("escalation_low_to_medium_sec") or config.ESCALATION_LOW_TO_MEDIUM_SEC
    medium_to_high = get_setting_int("escalation_medium_to_high_sec") or config.ESCALATION_MEDIUM_TO_HIGH_SEC
    return low_to_medium, medium_to_high