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
from auth import verify_key
from settings_store import load_settings, save_settings

app = FastAPI(title="Jewellery Store Alert System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["null", "http://localhost", "http://127.0.0.1"],
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

@app.post("/employees", dependencies=[Depends(verify_key)])
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
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO employees (name, shift_start, shift_end, photo_filename) VALUES (%s, %s, %s, %s)",
            (name, shift_start, shift_end, photo_filename)
        )
        conn.commit()
        cur.close()

    return {"message": f"Employee {name} added successfully"}

@app.get("/employees", dependencies=[Depends(verify_key)])
def list_employees():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM employees")
        rows = cur.fetchall()
        cur.close()
        return [dict(row) for row in rows]

@app.put("/employees/{employee_id}", dependencies=[Depends(verify_key)])
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
            "UPDATE employees SET name = %s, shift_start = %s, shift_end = %s, photo_filename = %s WHERE id = %s",
            (name, shift_start, shift_end, photo_filename, employee_id)
        )
        conn.commit()
        cur.close()

    return {"message": f"Employee {name} updated successfully"}

@app.delete("/employees/{employee_id}", dependencies=[Depends(verify_key)])
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

@app.get("/settings", dependencies=[Depends(verify_key)])
def get_settings():
    return load_settings()

@app.post("/settings", dependencies=[Depends(verify_key)])
def update_settings(store_open_time: str = Form(...), store_close_time: str = Form(...)):
    save_settings({"store_open_time": store_open_time, "store_close_time": store_close_time})
    return {"message": "Settings updated"}

@app.get("/status", dependencies=[Depends(verify_key)])
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

@app.get("/video_feed", dependencies=[Depends(verify_key)])
def video_feed():
    return StreamingResponse(_mjpeg_generator(), media_type="multipart/x-mixed-replace; boundary=frame")