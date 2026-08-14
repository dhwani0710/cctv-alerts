import os
import shutil
import cv2
from fastapi import FastAPI, UploadFile, Form, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from database import init_db, get_db
from camera_worker import start_camera_thread, get_current_frame
from datetime import datetime, timedelta
import config
from auth import verify_token, require_admin
from settings_store import load_settings, save_settings
from auth_users import verify_password, create_token
from pydantic import BaseModel

app = FastAPI(title="Jewellery Store Alert System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["null", "http://localhost", "http://127.0.0.1", "https://cctv-alerts-f.onrender.com"],
    allow_methods=["*"],
    allow_headers=["*"],
)

KNOWN_FACES_DIR = "known_faces"

@app.on_event("startup")
def startup():
    init_db()
    os.makedirs(KNOWN_FACES_DIR, exist_ok=True)
    start_camera_thread()

@app.get("/")
def health_check():
    return {"status": "backend is running"}

def _clear_face_cache():
    for f in os.listdir(KNOWN_FACES_DIR):
        if f.startswith("representations_") or f.endswith(".pkl"):
            os.remove(os.path.join(KNOWN_FACES_DIR, f))

<<<<<<< Updated upstream
@app.post("/employees", dependencies=[Depends(verify_key)])
=======
from typing import List

@app.post("/employees", dependencies=[Depends(require_admin)])
>>>>>>> Stashed changes
async def add_employee(
    name: str = Form(...),
    shift_start: str = Form(...),
    shift_end: str = Form(...),
<<<<<<< Updated upstream
    photo: UploadFile = File(...)
=======
    designation: str = Form("Staff"),
    photos: List[UploadFile] = File(...)
>>>>>>> Stashed changes
):
    if shift_start == shift_end:
        return {"error": "Shift start and end time cannot be the same."}

    photo_filename = f"{name.replace(' ', '_')}.jpg"
    photo_path = os.path.join(KNOWN_FACES_DIR, photo_filename)
    with open(photo_path, "wb") as buffer:
        shutil.copyfileobj(photo.file, buffer)

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
<<<<<<< Updated upstream
            "INSERT INTO employees (name, shift_start, shift_end, photo_filename) VALUES (%s, %s, %s, %s)",
            (name, shift_start, shift_end, photo_filename)
=======
            "INSERT INTO employees (name, shift_start, shift_end, photo_filename, designation) VALUES (%s, %s, %s, %s, %s) RETURNING id",
            (name, shift_start, shift_end, "", designation)
>>>>>>> Stashed changes
        )
        conn.commit()
        cur.close()

    return {"message": f"Employee {name} added successfully"}

@app.get("/employees", dependencies=[Depends(require_admin)])
def list_employees():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM employees")
        rows = cur.fetchall()
        cur.close()
        return [dict(row) for row in rows]

@app.put("/employees/{employee_id}", dependencies=[Depends(require_admin)])
async def update_employee(
    employee_id: int,
    name: str = Form(...),
    shift_start: str = Form(...),
    shift_end: str = Form(...),
    designation: str = Form("Staff"),
    photo: UploadFile = File(None)
):
    if shift_start == shift_end:
        return {"error": "Shift start and end time cannot be the same."}

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM employees WHERE id = %s", (employee_id,))
        emp = cur.fetchone()
        if emp is None:
            cur.close()
            return {"message": "Employee not found"}

        photo_filename = emp["photo_filename"]

        if photo is not None:
            old_photo_path = os.path.join(KNOWN_FACES_DIR, emp["photo_filename"])
            if os.path.exists(old_photo_path):
                os.remove(old_photo_path)

            photo_filename = f"{name.replace(' ', '_')}.jpg"
            new_photo_path = os.path.join(KNOWN_FACES_DIR, photo_filename)
            with open(new_photo_path, "wb") as buffer:
                shutil.copyfileobj(photo.file, buffer)

            _clear_face_cache()

        cur.execute(
            "UPDATE employees SET name = %s, shift_start = %s, shift_end = %s, photo_filename = %s, designation = %s WHERE id = %s",
            (name, shift_start, shift_end, photo_filename, designation, employee_id)
        )
        conn.commit()
        cur.close()

    return {"message": f"Employee {name} updated successfully"}

@app.delete("/employees/{employee_id}", dependencies=[Depends(require_admin)])
def delete_employee(employee_id: int):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM employees WHERE id = %s", (employee_id,))
        emp = cur.fetchone()
        if emp is None:
            cur.close()
            return {"message": "Employee not found"}

        photo_path = os.path.join(KNOWN_FACES_DIR, emp["photo_filename"])
        if os.path.exists(photo_path):
            os.remove(photo_path)

        _clear_face_cache()

        cur.execute("DELETE FROM employees WHERE id = %s", (employee_id,))
        conn.commit()
        cur.close()

    return {"message": "Employee deleted"}

@app.get("/settings", dependencies=[Depends(require_admin)])
def get_settings():
    return load_settings()

@app.post("/settings", dependencies=[Depends(require_admin)])
def update_settings(store_open_time: str = Form(...), store_close_time: str = Form(...)):
    save_settings({"store_open_time": store_open_time, "store_close_time": store_close_time})
    return {"message": "Settings updated"}

<<<<<<< Updated upstream
@app.get("/status", dependencies=[Depends(verify_key)])
=======
@app.get("/records", dependencies=[Depends(verify_token)])
def get_records(camera: str = None, status: str = None, date: str = None, limit: int = 100):
    query = "SELECT person_name, alert_type, priority, message, timestamp, snapshot_filename FROM alerts WHERE 1=1"
    params = []

    if status:
        status_map = {"flag": "high", "review": "medium", "clear": "low"}
        if status in status_map:
            query += " AND priority = %s"
            params.append(status_map[status])

    if date:
        query += " AND timestamp LIKE %s"
        params.append(f"{date}%")

    query += " ORDER BY timestamp DESC LIMIT %s"
    params.append(limit)

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(query, tuple(params))
        rows = cur.fetchall()
        cur.close()

    return [dict(r) for r in rows]

@app.get("/attendance", dependencies=[Depends(verify_token)])
def get_attendance(date: str = None):
    target_date = date or datetime.now().date().isoformat()
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT e.name, a.first_seen, a.last_seen FROM attendance a "
            "JOIN employees e ON e.id = a.employee_id "
            "WHERE a.attendance_date = %s ORDER BY a.first_seen ASC",
            (target_date,)
        )
        rows = cur.fetchall()
        cur.close()
    return {"date": target_date, "records": [dict(r) for r in rows]}

from camera_worker import get_camera_heartbeat

@app.get("/cameras", dependencies=[Depends(verify_token)])
def list_cameras():
    now = datetime.now()
    result = []
    for cam in config.CAMERAS:
        heartbeat = get_camera_heartbeat(cam["id"])
        is_live = heartbeat is not None and (now - heartbeat).total_seconds() <= config.CAMERA_OFFLINE_THRESHOLD_SEC
        result.append({"id": cam["id"], "name": cam["name"], "live": is_live})
    return result

@app.get("/status", dependencies=[Depends(verify_token)])
>>>>>>> Stashed changes
def get_status():
    now = datetime.now()
    cutoff = now - timedelta(seconds=config.CURRENTLY_DETECTED_TIMEOUT_SEC)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT person_name, last_seen FROM currently_detected WHERE last_seen >= %s",
            (cutoff.isoformat(),)
        )
        detected_rows = cur.fetchall()
        cur.execute(
            "SELECT person_name, alert_type, priority, message, timestamp FROM alerts ORDER BY timestamp DESC LIMIT 15"
        )
        alert_rows = cur.fetchall()
        cur.close()

    detected = [{"name": r["person_name"], "last_seen": r["last_seen"]} for r in detected_rows]
    alerts = [dict(r) for r in alert_rows]
    return {"currently_detected": detected, "recent_alerts": alerts}

def _mjpeg_generator():
    while True:
        frame = get_current_frame()
        if frame is not None:
            _, buffer = cv2.imencode(".jpg", frame)
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n")

<<<<<<< Updated upstream
@app.get("/video_feed", dependencies=[Depends(verify_key)])
def video_feed():
    return StreamingResponse(_mjpeg_generator(), media_type="multipart/x-mixed-replace; boundary=frame")
=======
@app.get("/snapshots/{filename}", dependencies=[Depends(require_admin)])
def get_snapshot(filename: str):
    filepath = os.path.join("snapshots", filename)
    if not os.path.exists(filepath):
        return {"error": "Snapshot not found"}
    return FileResponse(filepath, media_type="image/jpeg")

@app.get("/video_feed/{camera_id}", dependencies=[Depends(verify_token)])
def video_feed(camera_id: str):
    return StreamingResponse(_mjpeg_generator(camera_id), media_type="multipart/x-mixed-replace; boundary=frame")

class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/login")
def login(payload: LoginRequest):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE username = %s", (payload.username,))
        user = cur.fetchone()
        cur.close()

    if not user or not verify_password(payload.password, user["password_hash"]):
        return {"ok": False, "error": "Incorrect username or password"}

    token = create_token(user["id"], user["username"], user["role"], user["name"])
    return {"ok": True, "role": user["role"], "name": user["name"], "token": token}
>>>>>>> Stashed changes
