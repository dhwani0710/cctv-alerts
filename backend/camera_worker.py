import cv2
import threading
import time
from datetime import datetime
from recognition import recognize_face
from alerts import get_alert_priority, is_within_store_hours, log_alert, format_duration, get_shift_datetimes, already_alerted_recently
from database import get_db
import config

frame_lock = threading.Lock()
latest_frame = None
recognition_lock = threading.Lock()
recognition_in_progress = False

def get_unknown_streak():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT value FROM system_state WHERE key = 'unknown_streak'")
        row = cur.fetchone()
        cur.close()
        return int(row["value"]) if row else 0

def set_unknown_streak(value):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO system_state (key, value) VALUES ('unknown_streak', %s) "
            "ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
            (str(value),)
        )
        conn.commit()
        cur.close()

def update_currently_detected(name, now):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO currently_detected (person_name, last_seen) VALUES (%s, %s) "
            "ON CONFLICT(person_name) DO UPDATE SET last_seen = EXCLUDED.last_seen",
            (name, now.isoformat())
        )
        conn.commit()
        cur.close()

def _process_frame(frame):
    name = recognize_face(frame)
    now = datetime.now()

    if name != "Unknown":
        update_currently_detected(name, now)
        set_unknown_streak(0)

        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM employees WHERE name = %s", (name,))
            emp = cur.fetchone()
            cur.close()
        if emp:
            shift_start_dt, shift_end_dt = get_shift_datetimes(now, emp["shift_start"], emp["shift_end"])

            if now < shift_start_dt:
                minutes_early = (shift_start_dt - now).total_seconds() / 60
                priority = get_alert_priority(minutes_early)
                if not already_alerted_recently(name, "early_arrival", priority, config.ALERT_DEDUPE_WINDOW_SEC):
                    msg = f"{name} present {format_duration(minutes_early)} before shift start"
                    log_alert(name, "early_arrival", priority, msg)
            elif now > shift_end_dt:
                minutes_past = (now - shift_end_dt).total_seconds() / 60
                priority = get_alert_priority(minutes_past)
                if not already_alerted_recently(name, "overstay", priority, config.ALERT_DEDUPE_WINDOW_SEC):
                    msg = f"{name} still in store {format_duration(minutes_past)} after shift end"
                    log_alert(name, "overstay", priority, msg)
    else:
        streak = get_unknown_streak() + 1
        set_unknown_streak(streak)
        if streak >= config.UNKNOWN_STREAK_THRESHOLD and not is_within_store_hours(now):
            if not already_alerted_recently("Unknown", "stranger", "high", config.ALERT_DEDUPE_WINDOW_SEC):
                msg = "Unknown person detected outside store hours"
                log_alert("Unknown", "stranger", "high", msg)

def _recognition_worker(frame):
    global recognition_in_progress
    try:
        _process_frame(frame)
    finally:
        with recognition_lock:
            recognition_in_progress = False

def camera_loop():
    global latest_frame, recognition_in_progress
    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        print("[camera_worker] No camera detected — running without live video.")
        while True:
            time.sleep(5)

    last_recognition = 0

    while True:
        success, frame = cap.read()
        if not success:
            time.sleep(1)
            continue

        with frame_lock:
            latest_frame = frame.copy()

        if time.time() - last_recognition > config.RECOGNITION_INTERVAL_SEC:
            start_new = False
            with recognition_lock:
                if not recognition_in_progress:
                    recognition_in_progress = True
                    start_new = True
            if start_new:
                threading.Thread(target=_recognition_worker, args=(frame.copy(),), daemon=True).start()
            last_recognition = time.time()

        time.sleep(0.03)

def start_camera_thread():
    t = threading.Thread(target=camera_loop, daemon=True)
    t.start()

def get_current_frame():
    with frame_lock:
        return latest_frame.copy() if latest_frame is not None else None