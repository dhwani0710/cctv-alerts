import os
import shutil
import cv2
import config
from fastapi import FastAPI, UploadFile, Form, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from database import init_db, get_db
from camera_worker import start_camera_thread, get_current_frame, state, state_lock
from settings_store import load_settings, save_settings
from datetime import datetime

app = FastAPI(title="Jewellery Store Alert System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

@app.post("/employees")
async def add_employee(
    name: str = Form(...),
    shift_start: str = Form(...),
    shift_end: str = Form(...),
    photo: UploadFile = File(...)
):
    if shift_start == shift_end:
        return {"error": "Shift start and end time cannot be the same."}

    photo_filename = f"{name.replace(' ', '_')}.jpg"
    photo_path = os.path.join(KNOWN_FACES_DIR, photo_filename)
    with open(photo_path, "wb") as buffer:
        shutil.copyfileobj(photo.file, buffer)

    with get_db() as conn:
        conn.execute(
            "INSERT INTO employees (name, shift_start, shift_end, photo_filename) VALUES (?, ?, ?, ?)",
            (name, shift_start, shift_end, photo_filename)
        )
        conn.commit()

    return {"message": f"Employee {name} added successfully"}

@app.get("/employees")
def list_employees():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM employees").fetchall()
        return [dict(row) for row in rows]

def _clear_face_cache():
    for f in os.listdir(KNOWN_FACES_DIR):
        if f.startswith("representations_") or f.endswith(".pkl"):
            os.remove(os.path.join(KNOWN_FACES_DIR, f))

@app.put("/employees/{employee_id}")
async def update_employee(
    employee_id: int,
    name: str = Form(...),
    shift_start: str = Form(...),
    shift_end: str = Form(...),
    photo: UploadFile = File(None)
):
    if shift_start == shift_end:
        return {"error": "Shift start and end time cannot be the same."}

    with get_db() as conn:
        emp = conn.execute("SELECT * FROM employees WHERE id = ?", (employee_id,)).fetchone()
        if emp is None:
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

        conn.execute(
            "UPDATE employees SET name = ?, shift_start = ?, shift_end = ?, photo_filename = ? WHERE id = ?",
            (name, shift_start, shift_end, photo_filename, employee_id)
        )
        conn.commit()
        
    return {"message": f"Employee {name} updated successfully"}

@app.delete("/employees/{employee_id}")
def delete_employee(employee_id: int):
    with get_db() as conn:
        emp = conn.execute("SELECT * FROM employees WHERE id = ?", (employee_id,)).fetchone()
        if emp is None:
            return {"message": "Employee not found"}

        photo_path = os.path.join(KNOWN_FACES_DIR, emp["photo_filename"])
        if os.path.exists(photo_path):
            os.remove(photo_path)

        _clear_face_cache()

        conn.execute("DELETE FROM employees WHERE id = ?", (employee_id,))
        conn.commit()

    return {"message": "Employee deleted"}

@app.get("/status")
def get_status():
    now = datetime.now()
    with state_lock:
        detected = [
            {"name": k, "last_seen": v.isoformat()}
            for k, v in state["currently_detected"].items()
            if (now - v).total_seconds() <= config.CURRENTLY_DETECTED_TIMEOUT_SEC
        ]
        alerts = list(reversed(state["recent_alerts"][-15:]))
    return {"currently_detected": detected, "recent_alerts": alerts}

@app.get("/settings")
def get_settings():
    return load_settings()

@app.post("/settings")
def update_settings(store_open_time: str = Form(...), store_close_time: str = Form(...)):
    save_settings({"store_open_time": store_open_time, "store_close_time": store_close_time})
    return {"message": "Settings updated"}

def _mjpeg_generator():
    while True:
        frame = get_current_frame()
        if frame is not None:
            _, buffer = cv2.imencode(".jpg", frame)
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n")

@app.get("/video_feed")
def video_feed():
    return StreamingResponse(_mjpeg_generator(), media_type="multipart/x-mixed-replace; boundary=frame")