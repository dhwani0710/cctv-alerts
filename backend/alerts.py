import os
import queue
import threading
import uuid
from datetime import datetime, timedelta

import cv2

import config
import storage
from database import get_db
from notifications import send_telegram_alert, send_telegram_photo
from settings_store import load_settings

SNAPSHOTS_DIR = "snapshots"
os.makedirs(SNAPSHOTS_DIR, exist_ok=True)

SNAPSHOT_JPEG_QUALITY = getattr(config, "SNAPSHOT_JPEG_QUALITY", 85)
SNAPSHOT_MAX_WIDTH = getattr(config, "SNAPSHOT_MAX_WIDTH", 1920)   # 0 = never resize

CAMERA_ALERT_TYPES = {"camera_tamper", "camera_offline"}
MOTION_ALERT_TYPES = CAMERA_ALERT_TYPES          # old name kept for compatibility
PERSON_ALERT_TYPES = {"stranger", "early_arrival", "overstay"}

PRIORITY_EMOJI = {"low": "🟡", "medium": "🟠", "high": "🔴"}

REPEAT_ALERT_THRESHOLD = 5
REPEAT_ALERT_INTERVAL_SEC = 5 * 60


# ------------------------------------------------------------------- settings
# app_settings and settings_store cache internally and refresh immediately after a save.

from app_settings import get_setting as _setting
from app_settings import get_setting_int as _setting_int
from app_settings import get_setting_float as _setting_float


def _store_settings():
    return load_settings()


# ------------------------------------------------- background notifications
# Telegram calls (esp. photo uploads) are slow; never run them on the recognition thread.

_notify_q = queue.Queue(maxsize=200)


def _notify_worker():
    while True:
        fn, args = _notify_q.get()
        try:
            fn(*args)
        except Exception as e:
            print(f"[alerts] Notification failed: {e}")
        finally:
            _notify_q.task_done()


threading.Thread(target=_notify_worker, daemon=True, name="notify-worker").start()


def _enqueue(fn, *args):
    try:
        _notify_q.put_nowait((fn, args))
    except queue.Full:
        print("[alerts] Notification queue full, dropping a message")


# ------------------------------------------------------------------ helpers

def get_alert_priority(minutes_past):
    low = _setting_float("overstay_low_threshold_min") or config.LOW_THRESHOLD_MIN
    medium = _setting_float("overstay_medium_threshold_min") or config.MEDIUM_THRESHOLD_MIN
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
    settings = _store_settings()
    open_h, open_m = map(int, settings["store_open_time"].split(":"))
    close_h, close_m = map(int, settings["store_close_time"].split(":"))
    open_t = now.replace(hour=open_h, minute=open_m, second=0, microsecond=0)
    close_t = now.replace(hour=close_h, minute=close_m, second=0, microsecond=0)
    return open_t <= now <= close_t


# ---------------------------------------------------------------- incidents

def _get_or_create_incident(cur, person_name, alert_type, priority, camera_name, zone_name, now, window_seconds=None):
    """Same logic as before, but runs on a cursor the caller owns (one connection per alert)."""
    if window_seconds is None:
        window_seconds = _setting_int("alert_dedupe_window_sec") or config.ALERT_DEDUPE_WINDOW_SEC
    cutoff = now - timedelta(seconds=window_seconds)

    cur.execute(
        "SELECT id, alert_count, last_notified FROM incidents WHERE person_name = %s AND alert_type = %s "
        "AND camera_name = %s AND last_seen >= %s ORDER BY last_seen DESC LIMIT 1",
        (person_name, alert_type, camera_name, cutoff.isoformat())
    )
    row = cur.fetchone()

    if row:
        cur.execute(
            "UPDATE incidents SET last_seen = %s, alert_count = alert_count + 1, priority = %s, "
            "camera_name = %s, zone_name = %s WHERE id = %s",
            (now.isoformat(), priority, camera_name, zone_name, row["id"])
        )
        return row["id"], row["alert_count"] + 1, False, row["last_notified"]

    cur.execute(
        "INSERT INTO incidents (person_name, alert_type, priority, camera_name, zone_name, first_seen, last_seen, alert_count, last_notified) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, 1, %s) RETURNING id",
        (person_name, alert_type, priority, camera_name, zone_name, now.isoformat(), now.isoformat(), now.isoformat())
    )
    return cur.fetchone()["id"], 1, True, now.isoformat()


def get_or_create_incident(person_name, alert_type, priority, camera_name, zone_name, window_seconds=None):
    """Public wrapper kept for any other module that calls it."""
    now = datetime.now()
    with get_db() as conn:
        cur = conn.cursor()
        result = _get_or_create_incident(cur, person_name, alert_type, priority, camera_name, zone_name, now, window_seconds)
        conn.commit()
        cur.close()
    return result


# ---------------------------------------------------------------- snapshots

def _upload_snapshot_async(alert_id, filepath, filename):
    try:
        public_url = storage.upload_file(filepath, f"snapshots/{filename}")
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("UPDATE alerts SET snapshot_filename = %s WHERE id = %s", (public_url, alert_id))
            conn.commit()
            cur.close()
    except Exception as e:
        print(f"[alerts] Snapshot upload failed, continuing without cloud URL: {e}")


def save_snapshot(frame):
    filename = f"{uuid.uuid4().hex}.jpg"
    filepath = os.path.join(SNAPSHOTS_DIR, filename)
    h, w = frame.shape[:2]
    if SNAPSHOT_MAX_WIDTH and w > SNAPSHOT_MAX_WIDTH:
        scale = SNAPSHOT_MAX_WIDTH / w
        frame = cv2.resize(frame, (SNAPSHOT_MAX_WIDTH, int(h * scale)), interpolation=cv2.INTER_AREA)
    cv2.imwrite(filepath, frame, [cv2.IMWRITE_JPEG_QUALITY, SNAPSHOT_JPEG_QUALITY])
    return filepath, filename


# ------------------------------------------------------------------- alerts

def _notifications_enabled_for(alert_type):
    if alert_type in CAMERA_ALERT_TYPES:
        return _setting("notify_motion") == "true"
    if alert_type in PERSON_ALERT_TYPES:
        return _setting("notify_person") == "true"
    return True


def log_alert(person_name, alert_type, priority, message, frame=None, camera_name=None, zone_name=None):
    if alert_type == "stranger":
        person_name = "Unknown"
    local_path, filename = (save_snapshot(frame) if frame is not None else (None, None))
    final_url = f"/snapshots/{filename}" if filename else None
    now = datetime.now()

    # One connection / one transaction for the incident + the alert row
    with get_db() as conn:
        cur = conn.cursor()
        incident_id, alert_count, is_new, last_notified = _get_or_create_incident(
            cur, person_name, alert_type, priority, camera_name, zone_name, now
        )
        cur.execute(
            "INSERT INTO alerts (person_name, alert_type, priority, message, timestamp, snapshot_filename, "
            "camera_name, zone_name, incident_id) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (person_name, alert_type, priority, message, now.isoformat(), final_url, camera_name, zone_name, incident_id)
        )
        alert_id = cur.fetchone()["id"]
        conn.commit()
        cur.close()

    if local_path and filename:
        threading.Thread(target=_upload_snapshot_async, args=(alert_id, local_path, filename), daemon=True).start()

    notify_key = (
        "notify_person" if alert_type in PERSON_ALERT_TYPES
        else "notify_motion" if alert_type in CAMERA_ALERT_TYPES
        else None
    )
    if notify_key and _setting(notify_key) == "false":
        return  # Telegram muted for this category, still logged to the DB above

    emoji = PRIORITY_EMOJI.get(priority, "")
    caption = f"{emoji} [{priority.upper()}] {message}"
    if not is_new:
        caption += f" (incident #{incident_id}, occurrence {alert_count})"

    notifications_enabled = _notifications_enabled_for(alert_type)

    if is_new:
        if not notifications_enabled:
            return
        if local_path:
            _enqueue(send_telegram_photo, local_path, caption)
        else:
            _enqueue(send_telegram_alert, caption)
        return

    if notifications_enabled and alert_count > REPEAT_ALERT_THRESHOLD:
        should_notify = True
        if last_notified:
            elapsed = (now - datetime.fromisoformat(last_notified)).total_seconds()
            should_notify = elapsed >= REPEAT_ALERT_INTERVAL_SEC

        if should_notify:
            repeat_caption = (
                f"{emoji} [{priority.upper()}] Repeated alert — {message} "
                f"(incident #{incident_id}, {alert_count} occurrences so far)"
            )
            with get_db() as conn:
                cur = conn.cursor()
                cur.execute("UPDATE incidents SET last_notified = %s WHERE id = %s", (now.isoformat(), incident_id))
                conn.commit()
                cur.close()
            _enqueue(send_telegram_alert, repeat_caption)


def get_escalation_thresholds():
    low_to_medium = _setting_int("escalation_low_to_medium_sec") or config.ESCALATION_LOW_TO_MEDIUM_SEC
    medium_to_high = _setting_int("escalation_medium_to_high_sec") or config.ESCALATION_MEDIUM_TO_HIGH_SEC
    return low_to_medium, medium_to_high


def escalate_stale_incidents():
    now = datetime.now()
    low_to_medium, medium_to_high = get_escalation_thresholds()
    messages = []

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, priority, first_seen, person_name, alert_type FROM incidents "
            "WHERE status = 'new' AND priority IN ('low', 'medium')"
        )
        rows = cur.fetchall()

        for r in rows:
            first_seen = datetime.fromisoformat(r["first_seen"])
            elapsed = (now - first_seen).total_seconds()
            new_priority = None

            if r["priority"] == "low" and elapsed >= low_to_medium:
                new_priority = "medium"
            elif r["priority"] == "medium" and elapsed >= medium_to_high:
                new_priority = "high"

            if new_priority:
                cur.execute("UPDATE incidents SET priority = %s WHERE id = %s", (new_priority, r["id"]))
                emoji = PRIORITY_EMOJI.get(new_priority, "")
                messages.append(
                    f"{emoji} Incident #{r['id']} escalated to {new_priority.upper()} — "
                    f"{r['person_name']} ({r['alert_type']}) unacknowledged for {int(elapsed / 60)} min"
                )

        conn.commit()
        cur.close()

    for msg in messages:
        _enqueue(send_telegram_alert, msg)