import cv2
import threading
import time
from datetime import datetime
from recognition import recognize_face
from alerts import get_alert_priority, is_within_store_hours, log_alert, format_duration, get_shift_datetimes
from database import get_db
import config

state_lock = threading.Lock()
state = {
    "currently_detected": {},   # name -> last_seen datetime
    "recent_alerts": [],        # last few alerts for the dashboard
    "unknown_streak": 0         # consecutive "Unknown" recognition results in a row
}

latest_frame = None
frame_lock = threading.Lock()

def _already_alerted_recently(person_name, alert_type, priority, window_seconds=120):
    now = datetime.now()
    for a in reversed(state["recent_alerts"]):
        if a["person_name"] == person_name and a["alert_type"] == alert_type and a["priority"] == priority:
            alert_time = datetime.fromisoformat(a["timestamp"])
            return (now - alert_time).total_seconds() <= window_seconds
    return False

def _process_frame(frame):
    name = recognize_face(frame)
    now = datetime.now()

    with state_lock:
        if name != "Unknown":
            state["currently_detected"][name] = now
            state["unknown_streak"] = 0

            with get_db() as conn:
                emp = conn.execute("SELECT * FROM employees WHERE name = ?", (name,)).fetchone()
            if emp:
                shift_start_dt, shift_end_dt = get_shift_datetimes(now, emp["shift_start"], emp["shift_end"])

                if now < shift_start_dt:
                    minutes_early = (shift_start_dt - now).total_seconds() / 60
                    priority = get_alert_priority(minutes_early)
                    if not _already_alerted_recently(name, "early_arrival", priority):
                        msg = f"{name} present {format_duration(minutes_early)} before shift start"
                        log_alert(name, "early_arrival", priority, msg)
                        state["recent_alerts"].append({
                            "person_name": name, "alert_type": "early_arrival",
                            "priority": priority, "message": msg,
                            "timestamp": now.isoformat()
                        })
                elif now > shift_end_dt:
                    minutes_past = (now - shift_end_dt).total_seconds() / 60
                    priority = get_alert_priority(minutes_past)
                    if not _already_alerted_recently(name, "overstay", priority):
                        msg = f"{name} still in store {format_duration(minutes_past)} after shift end"
                        log_alert(name, "overstay", priority, msg)
                        state["recent_alerts"].append({
                            "person_name": name, "alert_type": "overstay",
                            "priority": priority, "message": msg,
                            "timestamp": now.isoformat()
                        })
                else:
                    print(f"[OVERSTAY DEBUG] not past shift end yet, no alert")
            else:
                print(f"[OVERSTAY DEBUG] no employee record found for name='{name}'")
        else:
            state["unknown_streak"] += 1
            if state["unknown_streak"] >= config.UNKNOWN_STREAK_THRESHOLD and not is_within_store_hours(now):
                if not _already_alerted_recently("Unknown", "stranger", "high"):
                    msg = "Unknown person detected outside store hours"
                    log_alert("Unknown", "stranger", "high", msg)
                    state["recent_alerts"].append({
                        "person_name": "Unknown", "alert_type": "stranger",
                        "priority": "high", "message": msg,
                        "timestamp": now.isoformat()
                    })

def camera_loop():
    global latest_frame
    cap = cv2.VideoCapture(0)
    last_recognition = 0

    while True:
        success, frame = cap.read()
        if not success:
            time.sleep(1)
            continue

        with frame_lock:
            latest_frame = frame.copy()

        if time.time() - last_recognition > config.RECOGNITION_INTERVAL_SEC:
            _process_frame(frame)
            last_recognition = time.time()

        time.sleep(0.03)

def start_camera_thread():
    t = threading.Thread(target=camera_loop, daemon=True)
    t.start()

def get_current_frame():
    with frame_lock:
        return latest_frame.copy() if latest_frame is not None else None