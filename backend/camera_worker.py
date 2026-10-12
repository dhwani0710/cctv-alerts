import os
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|stimeout;5000000|max_delay;500000"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

import cv2
import threading
import time
import numpy as np
from datetime import datetime, timedelta
from recognition import recognize_faces
from alerts import get_alert_priority, is_within_store_hours, log_alert, format_duration, get_shift_datetimes, escalate_stale_incidents
from database import get_db
import config
from video_recorder import get_recorder

# ---- tunables (override in config.py if you like) ----
MOTION_GATE_ENABLED = getattr(config, "MOTION_GATE_ENABLED", True)
MOTION_FORCE_EVERY_SEC = getattr(config, "MOTION_FORCE_EVERY_SEC", 10)
MOTION_MIN_CHANGED_FRACTION = getattr(config, "MOTION_MIN_CHANGED_FRACTION", 0.004)
MOTION_PIXEL_DELTA = 25
RECORDER_PUSH_FPS = 10
CURRENTLY_DETECTED_WRITE_EVERY_SEC = 3
ATTENDANCE_WRITE_EVERY_SEC = 20
EMPLOYEE_CACHE_TTL_SEC = 15

frame_locks = {}
latest_frames = {}
recognition_locks = {}
recognition_in_progress = {}

_camera_threads = {}
_camera_stop_events = {}
_registry_lock = threading.Lock()
_tampered = {}

_heartbeats = {}
_heartbeat_lock = threading.Lock()
_streak_is_zero = {}
_motion_state = {}

_throttle = {}
_throttle_lock = threading.Lock()

_employee_cache = {}
_employee_cache_lock = threading.Lock()


def _should_run(key, every_sec):
    now = time.monotonic()
    with _throttle_lock:
        last = _throttle.get(key)
        if last is not None and now - last < every_sec:
            return False
        _throttle[key] = now
        return True


def get_tampered_cameras():
    return {cid for cid, v in list(_tampered.items()) if v}


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
    if value == 0 and _streak_is_zero.get(location) is True:
        return  # already zero, skip the DB write
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO system_state (key, value) VALUES (%s, %s) "
            "ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
            (f"unknown_streak_{location}", str(value))
        )
        conn.commit()
        cur.close()
    _streak_is_zero[location] = (value == 0)


def update_currently_detected(name, camera_name, now):
    do_upsert = _should_run(("seen", name, camera_name), CURRENTLY_DETECTED_WRITE_EVERY_SEC)
    do_cleanup = _should_run("currently_detected_cleanup", 30)
    if not (do_upsert or do_cleanup):
        return
    cutoff = (now - timedelta(seconds=60)).isoformat()
    with get_db() as conn:
        cur = conn.cursor()
        if do_upsert:
            cur.execute(
                "INSERT INTO currently_detected (person_name, camera_name, last_seen) VALUES (%s, %s, %s) "
                "ON CONFLICT(person_name, camera_name) DO UPDATE SET last_seen = EXCLUDED.last_seen",
                (name, camera_name, now.isoformat())
            )
        if do_cleanup:
            cur.execute("DELETE FROM currently_detected WHERE last_seen < %s", (cutoff,))
        conn.commit()
        cur.close()


def update_attendance(employee_id, now, camera_id, shift_start_dt=None):
    today = now.date().isoformat()
    zone_name = _get_camera_zone_name(camera_id)
    status = "late" if shift_start_dt is not None and now > shift_start_dt else "present"
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO attendance (employee_id, attendance_date, first_seen, last_seen, zone_name, status) "
            "VALUES (%s, %s, %s, %s, %s, %s) "
            "ON CONFLICT(employee_id, attendance_date) DO UPDATE SET "
            "last_seen = EXCLUDED.last_seen, zone_name = EXCLUDED.zone_name, "
            "status = CASE WHEN attendance.status = 'absent' THEN EXCLUDED.status ELSE attendance.status END, "
            "is_override = CASE WHEN attendance.status = 'absent' THEN FALSE ELSE attendance.is_override END",
            (employee_id, today, now.isoformat(), now.isoformat(), zone_name, status)
        )
        conn.commit()
        cur.close()


# Heartbeats live in memory: only this process reads them.
# (If you ever run several uvicorn workers, move them back to the DB.)
def update_camera_heartbeat(camera_id, now):
    with _heartbeat_lock:
        _heartbeats[camera_id] = now


def get_camera_heartbeat(camera_id):
    with _heartbeat_lock:
        return _heartbeats.get(camera_id)


def get_all_camera_heartbeats():
    with _heartbeat_lock:
        return dict(_heartbeats)


def invalidate_employee_cache():
    with _employee_cache_lock:
        _employee_cache.clear()


def _get_employee_by_name(name):
    now = time.monotonic()
    with _employee_cache_lock:
        hit = _employee_cache.get(name)
        if hit and now - hit[0] < EMPLOYEE_CACHE_TTL_SEC:
            return hit[1]
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM employees WHERE name = %s", (name,))
        row = cur.fetchone()
        cur.close()
    emp = dict(row) if row else None
    with _employee_cache_lock:
        _employee_cache[name] = (now, emp)
    return emp


def _is_frame_tampered(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    mean, stddev = cv2.meanStdDev(gray)
    brightness = mean[0][0]
    detail = stddev[0][0]
    return brightness < config.TAMPER_BRIGHTNESS_THRESHOLD or detail < config.TAMPER_VARIANCE_THRESHOLD


def _motion_gate_allows(camera_id, frame):
    """Cheap check so we only run face detection when something is worth looking at.
    Runs detection if: first frame, last check saw faces, it has been a while, or the scene changed."""
    small = cv2.cvtColor(cv2.resize(frame, (160, 90), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
    small = cv2.GaussianBlur(small, (5, 5), 0)

    st = _motion_state.setdefault(camera_id, {"prev": None, "had_faces": True, "last_full": 0.0})
    prev = st["prev"]
    st["prev"] = small
    now = time.monotonic()

    allow = False
    if prev is None or st["had_faces"] or now - st["last_full"] >= MOTION_FORCE_EVERY_SEC:
        allow = True
    else:
        diff = cv2.absdiff(small, prev)
        changed = np.count_nonzero(diff > MOTION_PIXEL_DELTA) / diff.size
        allow = changed >= MOTION_MIN_CHANGED_FRACTION

    if allow:
        st["last_full"] = now
    return allow


def _set_had_faces(camera_id, had_faces):
    st = _motion_state.get(camera_id)
    if st is not None:
        st["had_faces"] = had_faces


_camera_cache = {"data": None, "ts": 0}
_CAMERA_CACHE_TTL = 5  # seconds


def _load_cameras_from_db():
    now = time.time()
    if _camera_cache["data"] is not None and now - _camera_cache["ts"] < _CAMERA_CACHE_TTL:
        return _camera_cache["data"]
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, name, rtsp_url, zone_name, enabled FROM cameras WHERE enabled = TRUE")
        rows = cur.fetchall()
        cur.close()
    cameras = [{"id": r["id"], "name": r["name"], "source": r["rtsp_url"], "zone_name": r["zone_name"] or r["id"]} for r in rows]
    _camera_cache["data"] = cameras
    _camera_cache["ts"] = now
    return cameras


def _get_camera_location(camera_id):
    cameras = _load_cameras_from_db()
    for cam in cameras:
        if cam["id"] == camera_id:
            return cam.get("zone_name", camera_id)
    return camera_id


def _get_camera_zone(camera_id):
    cameras = _load_cameras_from_db()
    for cam in cameras:
        if cam["id"] == camera_id:
            return cam.get("zone_name")
    return None


def _get_camera_zone_name(camera_id):
    cameras = _load_cameras_from_db()
    for cam in cameras:
        if cam["id"] == camera_id:
            if cam.get("zone_name"):
                return cam["zone_name"]
    return _get_camera_location(camera_id)


def draw_oriented_bbox(img, box, label="", color=(0, 0, 255), thickness=2, corner_ratio=0.3, pad_ratio=0.35):
    """
    Draws an oriented bounding box (OBB style corner brackets) around a detected face.
    Expands the bounding box size so it cleanly frames the head/face with comfortable clearance.
    box: (x, y, w, h)
    """
    if img is None:
        return None
    annotated = img.copy()
    if not box or len(box) < 4:
        return annotated

    orig_x, orig_y, orig_w, orig_h = box
    if orig_w <= 0 or orig_h <= 0:
        return annotated

    img_h, img_w = annotated.shape[:2]

    pad_w = int(orig_w * pad_ratio)
    pad_h = int(orig_h * pad_ratio)

    x = max(0, orig_x - pad_w)
    y = max(0, orig_y - pad_h)
    w = min(img_w - x, orig_w + 2 * pad_w)
    h = min(img_h - y, orig_h + 2 * pad_h)

    length = max(10, int(min(w, h) * corner_ratio))

    cv2.line(annotated, (x, y), (x + length, y), color, thickness)
    cv2.line(annotated, (x, y), (x, y + length), color, thickness)

    cv2.line(annotated, (x + w, y), (x + w - length, y), color, thickness)
    cv2.line(annotated, (x + w, y), (x + w, y + length), color, thickness)

    cv2.line(annotated, (x, y + h), (x + length, y + h), color, thickness)
    cv2.line(annotated, (x, y + h), (x, y + h - length), color, thickness)

    cv2.line(annotated, (x + w, y + h), (x + w - length, y + h), color, thickness)
    cv2.line(annotated, (x + w, y + h), (x + w, y + h - length), color, thickness)

    if label:
        font_scale = 0.6
        font_thick = 2
        (_, text_h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, font_scale, font_thick)
        text_y = max(y - 8, text_h + 4)
        cv2.putText(annotated, label, (x, text_y), cv2.FONT_HERSHEY_SIMPLEX, font_scale, color, font_thick, cv2.LINE_AA)

    return annotated


def _process_frame(frame, camera_id, camera_name):
    now = datetime.now()
    zone_name = _get_camera_zone(camera_id)

    # Tamper check always runs (a covered camera is static, so it must not depend on motion)
    if _is_frame_tampered(frame):
        _tampered[camera_id] = True
        msg = f"[{camera_name}] Camera view blocked or tampered with"
        log_alert(f"camera_{camera_id}", "camera_tamper", "high", msg, frame=frame, camera_name=camera_name, zone_name=zone_name)
        return
    _tampered[camera_id] = False

    if MOTION_GATE_ENABLED and not _motion_gate_allows(camera_id, frame):
        return

    detections = recognize_faces(frame)
    _set_had_faces(camera_id, bool(detections))

    if not detections:
        # No faces this pass: reset the unknown streak so isolated false
        # detections can't pile up over hours into a "stranger" alert.
        set_unknown_streak(camera_id, 0)
        return

    any_unknown = False
    unknown_boxes = []

    for item in detections:
        name = item.get("name") if isinstance(item, dict) else item
        box = item.get("box") if isinstance(item, dict) else (0, 0, 0, 0)

        if name == "Unknown":
            any_unknown = True
            if box and sum(box) > 0:
                unknown_boxes.append(box)
            continue

        try:
            update_currently_detected(name, camera_name, now)

            emp = _get_employee_by_name(name)
            if emp:
                shift_start_dt, shift_end_dt = get_shift_datetimes(now, emp["shift_start"], emp["shift_end"])
                if _should_run(("attendance", emp["id"]), ATTENDANCE_WRITE_EVERY_SEC):
                    update_attendance(emp["id"], now, camera_id, shift_start_dt)

                if is_within_store_hours(now):
                    pass  # no early-arrival / overstay alerts during store hours
                elif now < shift_start_dt:
                    minutes_early = (shift_start_dt - now).total_seconds() / 60
                    priority = get_alert_priority(minutes_early)
                    snapshot_frame = draw_oriented_bbox(frame, box, label=name, color=(0, 255, 0))
                    msg = f"[{camera_name}] {name} present {format_duration(minutes_early)} before shift start"
                    log_alert(name, "early_arrival", priority, msg, frame=snapshot_frame, camera_name=camera_name, zone_name=zone_name)
                elif now > shift_end_dt:
                    minutes_past = (now - shift_end_dt).total_seconds() / 60
                    priority = get_alert_priority(minutes_past)
                    snapshot_frame = draw_oriented_bbox(frame, box, label=name, color=(0, 165, 255))
                    msg = f"[{camera_name}] {name} still in store {format_duration(minutes_past)} after shift end"
                    log_alert(name, "overstay", priority, msg, frame=snapshot_frame, camera_name=camera_name, zone_name=zone_name)
        except Exception as e:
            print(f"[camera_worker] Error processing detected person '{name}': {e}")

    if any_unknown:
        snapshot_frame = frame.copy() if frame is not None else None

        if snapshot_frame is not None and unknown_boxes:
            for box in unknown_boxes:
                snapshot_frame = draw_oriented_bbox(snapshot_frame, box, label="", color=(0, 0, 255), thickness=2)

        recorder = get_recorder(camera_id, camera_name)
        recorder.trigger_unknown(zone_name, snapshot_frame=snapshot_frame)

        streak = get_unknown_streak(camera_id) + 1
        set_unknown_streak(camera_id, streak)
        if streak >= config.UNKNOWN_STREAK_THRESHOLD:
            msg = f"[{camera_name}] Unrecognized face detected"
            log_alert("Unknown", "stranger", "high", msg, frame=snapshot_frame, camera_name=camera_name, zone_name=zone_name)
    else:
        set_unknown_streak(camera_id, 0)


def _recognition_worker(frame, camera_id, camera_name):
    try:
        _process_frame(frame, camera_id, camera_name)
    except Exception as e:
        print(f"[camera_worker] Recognition error on '{camera_name}': {type(e).__name__}: {e}")
    finally:
        lock = recognition_locks.get(camera_id)
        if lock is not None:
            with lock:
                recognition_in_progress[camera_id] = False


def _camera_loop(camera_config, stop_event):
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

    while not cap.isOpened() and not stop_event.is_set():
        print(f"[camera_worker] Camera '{camera_name}' ({camera_id}) not detected — retrying in 10s...")
        cap.release()
        stop_event.wait(10)
        if stop_event.is_set():
            break
        cap = _open_capture()

    if stop_event.is_set():
        cap.release()
        _cleanup_camera_state(camera_id)
        return

    last_recognition = 0
    last_heartbeat = 0
    last_recorder_push = 0.0
    consecutive_failures = 0
    MAX_FAILURES_BEFORE_RECONNECT = 5
    recorder_interval = 1.0 / RECORDER_PUSH_FPS

    while not stop_event.is_set():
        # Read continuously (no sleep) so we always hold the freshest frame;
        # reading slower than the stream makes the RTSP buffer grow and frames go stale.
        success, frame = cap.read()
        if not success or frame is None or frame.size == 0:
            consecutive_failures += 1
            if consecutive_failures >= MAX_FAILURES_BEFORE_RECONNECT:
                print(f"[camera_worker] '{camera_name}' ({camera_id}) unresponsive — reconnecting...")
                cap.release()
                stop_event.wait(2)
                cap = _open_capture()
                consecutive_failures = 0
            stop_event.wait(1)
            continue
        consecutive_failures = 0

        # cap.read() returns a fresh array every call and nobody mutates the stored frame,
        # so no copy is needed here. get_current_frame() copies on read by default.
        with frame_locks[camera_id]:
            latest_frames[camera_id] = frame

        now_mono = time.monotonic()
        if now_mono - last_recorder_push >= recorder_interval:
            get_recorder(camera_id, camera_name).push_frame(frame.copy())
            last_recorder_push = now_mono

        if time.time() - last_heartbeat > config.CAMERA_HEARTBEAT_INTERVAL_SEC:
            update_camera_heartbeat(camera_id, datetime.now())
            last_heartbeat = time.time()

        if time.time() - last_recognition > config.RECOGNITION_INTERVAL_SEC:
            start_new = False
            with recognition_locks[camera_id]:
                if not recognition_in_progress[camera_id]:
                    recognition_in_progress[camera_id] = True
                    start_new = True
            if start_new:
                threading.Thread(target=_recognition_worker, args=(frame.copy(), camera_id, camera_name), daemon=True).start()
            last_recognition = time.time()

    cap.release()
    _cleanup_camera_state(camera_id)


def _cleanup_camera_state(camera_id):
    frame_locks.pop(camera_id, None)
    latest_frames.pop(camera_id, None)
    recognition_locks.pop(camera_id, None)
    recognition_in_progress.pop(camera_id, None)
    _tampered.pop(camera_id, None)
    _motion_state.pop(camera_id, None)


def start_camera_threads():
    cameras = _load_cameras_from_db()
    for camera_config in cameras:
        start_single_camera(camera_config)


def start_single_camera(camera_config):
    camera_id = camera_config["id"]
    with _registry_lock:
        if camera_id in _camera_threads:
            return
        stop_event = threading.Event()
        t = threading.Thread(target=_camera_loop, args=(camera_config, stop_event), daemon=True)
        _camera_stop_events[camera_id] = stop_event
        _camera_threads[camera_id] = t
        t.start()


def stop_single_camera(camera_id):
    with _registry_lock:
        stop_event = _camera_stop_events.pop(camera_id, None)
        t = _camera_threads.pop(camera_id, None)
    if stop_event:
        stop_event.set()
    if t:
        t.join(timeout=5)


def stop_all_cameras():
    with _registry_lock:
        camera_ids = list(_camera_threads.keys())
    for camera_id in camera_ids:
        stop_single_camera(camera_id)

def get_current_frame(camera_id, copy=True):
    lock = frame_locks.get(camera_id)
    if lock is None:
        return None
    with lock:
        frame = latest_frames.get(camera_id)
    if frame is None:
        return None
    return frame.copy() if copy else frame


def _health_check_loop():
    already_alerted = set()
    while True:
        time.sleep(config.CAMERA_HEALTH_CHECK_INTERVAL_SEC)
        now = datetime.now()
        cameras = _load_cameras_from_db()
        for camera_config in cameras:
            camera_id = camera_config["id"]
            camera_name = camera_config["name"]
            last_seen = get_camera_heartbeat(camera_id)

            if last_seen is None:
                continue

            seconds_since = (now - last_seen).total_seconds()

            if seconds_since > config.CAMERA_OFFLINE_THRESHOLD_SEC:
                if camera_id not in already_alerted:
                    zone_name = _get_camera_zone(camera_id)
                    msg = f"[{camera_name}] Camera offline or feed lost — no frames for {int(seconds_since)}s"
                    log_alert(f"camera_{camera_id}", "camera_offline", "high", msg, camera_name=camera_name, zone_name=zone_name)
                    already_alerted.add(camera_id)
            else:
                already_alerted.discard(camera_id)


def start_health_check_thread():
    t = threading.Thread(target=_health_check_loop, daemon=True)
    t.start()


def _escalation_loop():
    while True:
        time.sleep(config.ESCALATION_CHECK_INTERVAL_SEC)
        try:
            escalate_stale_incidents()
        except Exception as e:
            print(f"[escalation] Error: {e}")


def start_escalation_thread():
    t = threading.Thread(target=_escalation_loop, daemon=True)
    t.start()