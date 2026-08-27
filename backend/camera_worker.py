import os
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay"
import cv2
import threading
import time
from datetime import datetime
from recognition import recognize_faces
from alerts import get_alert_priority, is_within_store_hours, log_alert, format_duration, get_shift_datetimes, already_alerted_recently
from database import get_db
import config

frame_locks = {}
latest_frames = {}
recognition_locks = {}
recognition_in_progress = {}

def get_unknown_streak(camera_id):
    location = _get_camera_location(camera_id)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT value FROM system_state WHERE key = %s", (f"unknown_streak_{location}",))
        row = cur.fetchone()
        cur.close()
        return int(row["value"]) if row else 0

def set_unknown_streak(camera_id, value):
    location = _get_camera_location(camera_id)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO system_state (key, value) VALUES (%s, %s) "
            "ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
            (f"unknown_streak_{location}", str(value))
        )
        conn.commit()
        cur.close()

def update_currently_detected(name, camera_id, now):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO currently_detected (person_name, camera_id, last_seen) VALUES (%s, %s, %s) "
            "ON CONFLICT(person_name, camera_id) DO UPDATE SET last_seen = EXCLUDED.last_seen",
            (name, camera_id, now.isoformat())
        )
        conn.commit()
        cur.close()

def update_attendance(employee_id, now):
    today = now.date().isoformat()
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO attendance (employee_id, attendance_date, first_seen, last_seen) "
            "VALUES (%s, %s, %s, %s) "
            "ON CONFLICT(employee_id, attendance_date) DO UPDATE SET last_seen = EXCLUDED.last_seen",
            (employee_id, today, now.isoformat(), now.isoformat())
        )
        conn.commit()
        cur.close()

def update_camera_heartbeat(camera_id, now):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO system_state (key, value) VALUES (%s, %s) "
            "ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
            (f"heartbeat_{camera_id}", now.isoformat())
        )
        conn.commit()
        cur.close()

def get_camera_heartbeat(camera_id):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT value FROM system_state WHERE key = %s", (f"heartbeat_{camera_id}",))
        row = cur.fetchone()
        cur.close()
        return datetime.fromisoformat(row["value"]) if row else None

def _is_frame_tampered(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    mean, stddev = cv2.meanStdDev(gray)
    brightness = mean[0][0]
    detail = stddev[0][0]
    return brightness < config.TAMPER_BRIGHTNESS_THRESHOLD or detail < config.TAMPER_VARIANCE_THRESHOLD

def _get_camera_location(camera_id):
    for cam in config.CAMERAS:
        if cam["id"] == camera_id:
            return cam.get("location", camera_id)
    return camera_id

def _process_frame(frame, camera_id, camera_name):
    now = datetime.now()

    if _is_frame_tampered(frame):
        if not already_alerted_recently(f"camera_{camera_id}", "camera_tamper", "high", config.ALERT_DEDUPE_WINDOW_SEC):
            msg = f"[{camera_name}] Camera view blocked or tampered with"
            log_alert(f"camera_{camera_id}", "camera_tamper", "high", msg, frame=frame)
        return

    names = recognize_faces(frame)

    if not names:
        time.sleep(0.3)
        retry_frame = get_current_frame(camera_id)
        if retry_frame is not None:
            names = recognize_faces(retry_frame)
            if names:
                print(f"[camera_worker] Recovered detection on retry for '{camera_name}' (first frame likely corrupted)")

    if not names:
        return

    any_unknown = False

    for name in names:
        if name == "Unknown":
            any_unknown = True
            continue

        try:
            update_currently_detected(name, camera_id, now)

            with get_db() as conn:
                cur = conn.cursor()
                cur.execute("SELECT * FROM employees WHERE name = %s", (name,))
                emp = cur.fetchone()
                cur.close()
            if emp:
                update_attendance(emp["id"], now)
                shift_start_dt, shift_end_dt = get_shift_datetimes(now, emp["shift_start"], emp["shift_end"])

                if now < shift_start_dt:
                    minutes_early = (shift_start_dt - now).total_seconds() / 60
                    priority = get_alert_priority(minutes_early)
                    if not already_alerted_recently(name, "early_arrival", priority, config.ALERT_DEDUPE_WINDOW_SEC):
                        msg = f"[{camera_name}] {name} present {format_duration(minutes_early)} before shift start"
                        log_alert(name, "early_arrival", priority, msg)
                elif now > shift_end_dt:
                    minutes_past = (now - shift_end_dt).total_seconds() / 60
                    priority = get_alert_priority(minutes_past)
                    if not already_alerted_recently(name, "overstay", priority, config.ALERT_DEDUPE_WINDOW_SEC):
                        msg = f"[{camera_name}] {name} still in store {format_duration(minutes_past)} after shift end"
                        log_alert(name, "overstay", priority, msg)
        except Exception as e:
            print(f"[camera_worker] Error processing detected person '{name}': {e}")

    if any_unknown:
        streak = get_unknown_streak(camera_id) + 1
        set_unknown_streak(camera_id, streak)
        if streak >= config.UNKNOWN_STREAK_THRESHOLD and not is_within_store_hours(now):
            location = _get_camera_location(camera_id)
            location_key = f"Unknown@{location}"
            if not already_alerted_recently(location_key, "stranger", "high", config.ALERT_DEDUPE_WINDOW_SEC):
                current = get_current_frame(camera_id)
                snapshot_frame = current if current is not None else frame
                msg = f"[{camera_name}] Unknown person detected outside store hours"
                log_alert(location_key, "stranger", "high", msg, frame=snapshot_frame)
    else:
        set_unknown_streak(camera_id, 0)

def _recognition_worker(frame, camera_id, camera_name):
    try:
        _process_frame(frame, camera_id, camera_name)
    finally:
        with recognition_locks[camera_id]:
            recognition_in_progress[camera_id] = False

def _camera_loop(camera_config):
    camera_id = camera_config["id"]
    camera_name = camera_config["name"]
    source = camera_config["source"]

    frame_locks[camera_id] = threading.Lock()
    recognition_locks[camera_id] = threading.Lock()
    recognition_in_progress[camera_id] = False
    latest_frames[camera_id] = None

    def _open_capture():
        c = cv2.VideoCapture(source, cv2.CAP_FFMPEG)
        c.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        c.set(cv2.CAP_PROP_FPS, 15)
        return c

    cap = _open_capture()

    if not cap.isOpened():
        print(f"[camera_worker] Camera '{camera_name}' ({camera_id}) not detected — running without live video.")
        while True:
            time.sleep(5)

    last_recognition = 0
    consecutive_failures = 0
    MAX_FAILURES_BEFORE_RECONNECT = 15

    while True:
        for _ in range(3):
            cap.grab()
        success, frame = cap.retrieve()
        if not success:
            consecutive_failures += 1
            if consecutive_failures >= MAX_FAILURES_BEFORE_RECONNECT:
                print(f"[camera_worker] '{camera_name}' ({camera_id}) unresponsive — reconnecting...")
                cap.release()
                time.sleep(2)
                cap = _open_capture()
                consecutive_failures = 0
            time.sleep(1)
            continue
        consecutive_failures = 0

        with frame_locks[camera_id]:
            latest_frames[camera_id] = frame.copy()
        update_camera_heartbeat(camera_id, datetime.now())

        if time.time() - last_recognition > config.RECOGNITION_INTERVAL_SEC:
            start_new = False
            with recognition_locks[camera_id]:
                if not recognition_in_progress[camera_id]:
                    recognition_in_progress[camera_id] = True
                    start_new = True
            if start_new:
                threading.Thread(target=_recognition_worker, args=(frame.copy(), camera_id, camera_name), daemon=True).start()
            last_recognition = time.time()

        time.sleep(0.03)

def start_camera_threads():
    for camera_config in config.CAMERAS:
        t = threading.Thread(target=_camera_loop, args=(camera_config,), daemon=True)
        t.start()

def get_current_frame(camera_id):
    lock = frame_locks.get(camera_id)
    if lock is None:
        return None
    with lock:
        frame = latest_frames.get(camera_id)
        return frame.copy() if frame is not None else None

def _health_check_loop():
    already_alerted = set()
    while True:
        time.sleep(config.CAMERA_HEALTH_CHECK_INTERVAL_SEC)
        now = datetime.now()
        for camera_config in config.CAMERAS:
            camera_id = camera_config["id"]
            camera_name = camera_config["name"]
            last_seen = get_camera_heartbeat(camera_id)

            if last_seen is None:
                continue

            seconds_since = (now - last_seen).total_seconds()

            if seconds_since > config.CAMERA_OFFLINE_THRESHOLD_SEC:
                if camera_id not in already_alerted:
                    if not already_alerted_recently(f"camera_{camera_id}", "camera_offline", "high", config.ALERT_DEDUPE_WINDOW_SEC):
                        msg = f"[{camera_name}] Camera offline or feed lost — no frames for {int(seconds_since)}s"
                        log_alert(f"camera_{camera_id}", "camera_offline", "high", msg)
                    already_alerted.add(camera_id)
            else:
                already_alerted.discard(camera_id)

def start_health_check_thread():
    t = threading.Thread(target=_health_check_loop, daemon=True)
    t.start()