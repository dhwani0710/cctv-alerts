import os
import shutil
import cv2
import storage
from PIL import Image, ImageOps
import time
from fastapi import FastAPI, UploadFile, Form, File, Depends, HTTPException, status, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from database import init_db, get_db
from camera_worker import start_camera_threads, get_current_frame, start_health_check_thread
from datetime import datetime, timedelta
import config
from auth import (
    verify_key,
    get_current_user,
    require_roles,
    hash_password,
    verify_password,
    create_access_token
)
from settings_store import load_settings, save_settings

app = FastAPI(title="Jewellery Store Alert System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

KNOWN_FACES_DIR = "known_faces"

@app.on_event("startup")
def startup():
    init_db()
    os.makedirs(KNOWN_FACES_DIR, exist_ok=True)
    storage.sync_known_faces_from_storage(KNOWN_FACES_DIR)
    start_camera_threads()
    start_health_check_thread()

@app.get("/")
def health_check():
    return {"status": "backend is running"}

# --- Auth Models & Endpoints ---

class LoginRequest(BaseModel):
    username: str
    password: str

class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str

class UpdateUserRequest(BaseModel):
    role: Optional[str] = None
    password: Optional[str] = None

@app.post("/auth/login")
def login(req: LoginRequest):
    username = req.username.strip()
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, username, password_hash, role FROM users WHERE username = %s", (username,))
        user = cur.fetchone()
        cur.close()

    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )

    access_token = create_access_token({
        "sub": str(user["id"]),
        "username": user["username"],
        "role": user["role"]
    })

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user["role"],
        "username": user["username"]
    }

@app.get("/auth/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return current_user

# --- User Management Endpoints (Admin Only) ---

@app.get("/users", dependencies=[Depends(require_roles(["admin"]))])
def list_users():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, username, role, created_at FROM users ORDER BY id ASC")
        users = cur.fetchall()
        cur.close()
        return [dict(u) for u in users]

@app.post("/users", dependencies=[Depends(require_roles(["admin"]))])
def create_user(req: CreateUserRequest):
    username = req.username.strip()
    role = req.role.strip().lower()
    if role not in ["admin", "manager", "guard"]:
        raise HTTPException(status_code=400, detail="Role must be admin, manager, or guard")
    if not username or not req.password:
        raise HTTPException(status_code=400, detail="Username and password are required")

    pwd_hash = hash_password(req.password)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        if cur.fetchone():
            cur.close()
            raise HTTPException(status_code=400, detail=f"Username '{username}' already exists")

        cur.execute(
            "INSERT INTO users (username, password_hash, role, created_at) VALUES (%s, %s, %s, %s) RETURNING id, username, role, created_at",
            (username, pwd_hash, role, datetime.utcnow().isoformat())
        )
        new_user = cur.fetchone()
        conn.commit()
        cur.close()

    return dict(new_user)

@app.put("/users/{user_id}", dependencies=[Depends(require_roles(["admin"]))])
def update_user(user_id: int, req: UpdateUserRequest):
    updates = []
    params = []
    if req.role:
        role = req.role.strip().lower()
        if role not in ["admin", "manager", "guard"]:
            raise HTTPException(status_code=400, detail="Role must be admin, manager, or guard")
        updates.append("role = %s")
        params.append(role)
    if req.password:
        updates.append("password_hash = %s")
        params.append(hash_password(req.password))

    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")

    params.append(user_id)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = %s RETURNING id, username, role", tuple(params))
        updated = cur.fetchone()
        conn.commit()
        cur.close()

    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return dict(updated)

@app.delete("/users/{user_id}", dependencies=[Depends(require_roles(["admin"]))])
def delete_user(user_id: int, current_user: dict = Depends(get_current_user)):
    if str(user_id) == str(current_user.get("id")):
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM users WHERE id = %s", (user_id,))
        if not cur.fetchone():
            cur.close()
            raise HTTPException(status_code=404, detail="User not found")

        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()
        cur.close()

    return {"message": "User deleted successfully"}

# --- Employee Management (Admin & Manager) ---

MAX_PHOTO_DIMENSION = 1024

def _save_resized_photo(upload_file, destination_path):
    with open(destination_path, "wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer)

    img = Image.open(destination_path)
    img = ImageOps.exif_transpose(img)
    img = img.convert("RGB")
    if max(img.size) > MAX_PHOTO_DIMENSION:
        img.thumbnail((MAX_PHOTO_DIMENSION, MAX_PHOTO_DIMENSION))
    img.save(destination_path, "JPEG")

def _clear_face_cache():
    for f in os.listdir(KNOWN_FACES_DIR):
        if f.startswith("representations_") or f.endswith(".pkl"):
            os.remove(os.path.join(KNOWN_FACES_DIR, f))

@app.post("/employees", dependencies=[Depends(require_roles(["admin", "manager"]))])
async def add_employee(
    name: str = Form(...),
    shift_start: str = Form(...),
    shift_end: str = Form(...),
    photos: List[UploadFile] = File(...)
):
    if shift_start == shift_end:
        return {"error": "Shift start and end time cannot be the same."}
    if len(photos) == 0:
        return {"error": "At least one photo is required."}

    employee_folder = os.path.join(KNOWN_FACES_DIR, name.replace(" ", "_"))
    os.makedirs(employee_folder, exist_ok=True)

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO employees (name, shift_start, shift_end, photo_filename) VALUES (%s, %s, %s, %s) RETURNING id",
            (name, shift_start, shift_end, "")
        )
        employee_id = cur.fetchone()["id"]

        folder_name = name.replace(" ", "_")
        for i, photo in enumerate(photos):
            filename = f"photo_{i+1}.jpg"
            photo_path = os.path.join(employee_folder, filename)
            _save_resized_photo(photo, photo_path)
            storage.upload_file(photo_path, f"known_faces/{folder_name}/{filename}")
            cur.execute(
                "INSERT INTO employee_photos (employee_id, filename) VALUES (%s, %s)",
                (employee_id, filename)
            )

        conn.commit()
        cur.close()

    _clear_face_cache()

    return {"message": f"Employee {name} added successfully with {len(photos)} photo(s)"}

@app.get("/employees", dependencies=[Depends(require_roles(["admin", "manager"]))])
def list_employees():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM employees")
        rows = cur.fetchall()
        cur.close()
        return [dict(row) for row in rows]

@app.put("/employees/{employee_id}", dependencies=[Depends(require_roles(["admin", "manager"]))])
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

@app.delete("/employees/{employee_id}", dependencies=[Depends(require_roles(["admin", "manager"]))])
def delete_employee(employee_id: int):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM employees WHERE id = %s", (employee_id,))
        emp = cur.fetchone()
        if emp is None:
            cur.close()
            return {"message": "Employee not found"}

        folder_name = emp["name"].replace(" ", "_")
        employee_folder = os.path.join(KNOWN_FACES_DIR, folder_name)
        if os.path.exists(employee_folder):
            shutil.rmtree(employee_folder)

        storage.delete_prefix(f"known_faces/{folder_name}")

        _clear_face_cache()

        cur.execute("DELETE FROM employees WHERE id = %s", (employee_id,))
        conn.commit()
        cur.close()

    return {"message": "Employee deleted"}

# --- Settings Endpoints (Admin Only) ---

@app.get("/settings", dependencies=[Depends(require_roles(["admin"]))])
def get_settings():
    return load_settings()

@app.post("/settings", dependencies=[Depends(require_roles(["admin"]))])
def update_settings(store_open_time: str = Form(...), store_close_time: str = Form(...)):
    save_settings({"store_open_time": store_open_time, "store_close_time": store_close_time})
    return {"message": "Settings updated"}

# --- Attendance Endpoints (Admin & Manager) ---

@app.get("/attendance", dependencies=[Depends(require_roles(["admin", "manager"]))])
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

# --- Monitoring & Streams (Admin, Manager & Guard) ---

@app.get("/cameras", dependencies=[Depends(require_roles(["admin", "manager", "guard"]))])
def list_cameras():
    return config.CAMERAS

@app.get("/status", dependencies=[Depends(require_roles(["admin", "manager", "guard"]))])
def get_status():
    now = datetime.now()
    cutoff = now - timedelta(seconds=config.CURRENTLY_DETECTED_TIMEOUT_SEC)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT person_name, camera_id, last_seen FROM currently_detected WHERE last_seen >= %s",
            (cutoff.isoformat(),)
        )
        detected_rows = cur.fetchall()
        cur.execute(
            "SELECT person_name, alert_type, priority, message, timestamp, snapshot_filename FROM alerts ORDER BY timestamp DESC LIMIT 15"
        )
        alert_rows = cur.fetchall()
        cur.close()

    detected = [{"name": r["person_name"], "camera": r["camera_id"], "last_seen": r["last_seen"]} for r in detected_rows]
    alerts = [dict(r) for r in alert_rows]
    return {"currently_detected": detected, "recent_alerts": alerts}

import numpy as np


def _get_offline_frame(camera_id: str):
    # 640x360 16:9 dark slate placeholder frame
    img = np.zeros((360, 640, 3), dtype=np.uint8)
    img[:] = (20, 15, 10) # BGR dark slate
    cv2.putText(img, f"CAMERA '{camera_id.upper()}' OFFLINE", (150, 170), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (230, 230, 230), 2, cv2.LINE_AA)
    cv2.putText(img, "No webcam or RTSP feed active", (180, 210), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (140, 140, 140), 1, cv2.LINE_AA)
    return img

def _mjpeg_generator(camera_id):
    encode_params = [cv2.IMWRITE_JPEG_QUALITY, 60]
    offline_img = _get_offline_frame(camera_id)
    _, offline_buf = cv2.imencode(".jpg", offline_img, encode_params)
    offline_bytes = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + offline_buf.tobytes() + b"\r\n"

    while True:
        frame = get_current_frame(camera_id)
        if frame is not None:
            _, buffer = cv2.imencode(".jpg", frame, encode_params)
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n")
            time.sleep(1/15)
        else:
            yield offline_bytes
            time.sleep(1.0)

@app.get("/snapshots/{filename}", dependencies=[Depends(require_roles(["admin", "manager", "guard"]))])
def get_snapshot(filename: str):
    filepath = os.path.join("snapshots", filename)
    if not os.path.exists(filepath):
        return {"error": "Snapshot not found"}
    return FileResponse(filepath, media_type="image/jpeg")

@app.get("/video_feed/{camera_id}", dependencies=[Depends(require_roles(["admin", "manager", "guard"]))])
def video_feed(camera_id: str):
    return StreamingResponse(_mjpeg_generator(camera_id), media_type="multipart/x-mixed-replace; boundary=frame")