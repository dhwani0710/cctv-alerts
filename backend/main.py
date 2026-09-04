import os
import shutil
import cv2
import time
from typing import List, Optional
from fastapi import FastAPI, UploadFile, Form, File, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from database import init_db, get_db
from camera_worker import start_camera_threads, get_current_frame, start_health_check_thread, get_camera_heartbeat
from datetime import datetime, timedelta
import config
from auth import verify_token, require_admin, require_staff
from auth_users import verify_password, create_token, hash_password
from settings_store import load_settings, save_settings
import storage
from PIL import Image, ImageOps

app = FastAPI(title="Jewellery Store Alert System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

KNOWN_FACES_DIR = "known_faces"

@app.on_event("startup")
def startup():
    init_db()
    _seed_cameras_from_config()
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

@app.get("/auth/me")
def get_me(current_user: dict = Depends(verify_token)):
    return current_user

# --- User Management Endpoints (Admin Only) ---
@app.put("/users/{user_id}", dependencies=[Depends(require_admin)])
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
    return {
    "ok": True,
    "role": user["role"],
    "name": user["name"],
    "username": user["username"],
    "token": token
}

@app.post("/employees", dependencies=[Depends(require_staff)])
async def add_employee(
    name: str = Form(...),
    shift_start: str = Form(...),
    shift_end: str = Form(...),
    designation: str = Form("Staff"),
    photos: List[UploadFile] = File(...)
):
    if shift_start == shift_end:
        return {"error": "Shift start and end time cannot be the same."}
    if len(photos) == 0:
        return {"error": "At least one photo is required."}

    folder_name = name.replace(" ", "_")
    employee_folder = os.path.join(KNOWN_FACES_DIR, folder_name)
    os.makedirs(employee_folder, exist_ok=True)

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO employees (name, shift_start, shift_end, photo_filename, designation) VALUES (%s, %s, %s, %s, %s) RETURNING id",
            (name, shift_start, shift_end, "", designation)
        )
        employee_id = cur.fetchone()["id"]

        for i, photo in enumerate(photos):
            filename = f"photo_{i+1}.jpg"
            photo_path = os.path.join(employee_folder, filename)
            _save_resized_photo(photo, photo_path)
            try:
                storage.upload_file(photo_path, f"known_faces/{folder_name}/{filename}")
            except Exception as e:
                print(f"[main] Photo cloud upload failed, continuing with local copy only: {e}")
            cur.execute(
                "INSERT INTO employee_photos (employee_id, filename) VALUES (%s, %s)",
                (employee_id, filename)
            )

        conn.commit()
        cur.close()

    _clear_face_cache()

    return {"message": f"Employee {name} added successfully with {len(photos)} photo(s)"}

@app.get("/employees", dependencies=[Depends(require_staff)])
def list_employees():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM employees")
        rows = cur.fetchall()
        cur.close()
        return [dict(row) for row in rows]

@app.put("/employees/{employee_id}", dependencies=[Depends(require_staff)])
async def update_employee(
    employee_id: int,
    name: str = Form(...),
    shift_start: str = Form(...),
    shift_end: str = Form(...),
    designation: str = Form("Staff"),
    photo: Optional[UploadFile] = File(None)
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

        if photo is not None:
            folder_name = name.replace(" ", "_")
            employee_folder = os.path.join(KNOWN_FACES_DIR, folder_name)
            os.makedirs(employee_folder, exist_ok=True)
            photo_path = os.path.join(employee_folder, "photo_1.jpg")
            _save_resized_photo(photo, photo_path)
            try:
                storage.upload_file(photo_path, f"known_faces/{folder_name}/photo_1.jpg")
            except Exception as e:
                print(f"[main] Photo cloud upload failed, continuing with local copy only: {e}")
            _clear_face_cache()

        cur.execute(
            "UPDATE employees SET name = %s, shift_start = %s, shift_end = %s, designation = %s WHERE id = %s",
            (name, shift_start, shift_end, designation, employee_id)
        )
        conn.commit()
        cur.close()

    return {"message": f"Employee {name} updated successfully"}

@app.delete("/employees/{employee_id}", dependencies=[Depends(require_staff)])
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

        #storage.delete_prefix(f"known_faces/{folder_name}")
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

@app.get("/cameras", dependencies=[Depends(verify_token)])
def list_cameras():
    now = datetime.now()
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, name, rtsp_url, location, enabled, zone_id FROM cameras")
        rows = cur.fetchall()
        cur.close()
    result = []
    for cam in rows:
        heartbeat = get_camera_heartbeat(cam["id"])
        is_live = heartbeat is not None and (now - heartbeat).total_seconds() <= config.CAMERA_OFFLINE_THRESHOLD_SEC
        result.append({"id": cam["id"], "name": cam["name"], "location": cam["location"], "zone_id": cam["zone_id"], "enabled": cam["enabled"], "live": is_live})
    return result

class CameraRequest(BaseModel):
    id: str
    name: str
    rtsp_url: str
    location: str = None
    zone_id: str = None
    enabled: bool = True

@app.post("/cameras", dependencies=[Depends(require_admin)])
def add_camera(payload: CameraRequest):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO cameras (id, name, rtsp_url, location, enabled, zone_id) VALUES (%s, %s, %s, %s, %s, %s)",
            (payload.id, payload.name, payload.rtsp_url, payload.location or payload.id, payload.enabled, payload.zone_id)
        )
        conn.commit()
        cur.close()
    return {"message": "Camera added — restart backend to apply"}

@app.put("/cameras/{camera_id}", dependencies=[Depends(require_admin)])
def update_camera(camera_id: str, payload: CameraRequest):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE cameras SET name=%s, rtsp_url=%s, location=%s, enabled=%s, zone_id=%s WHERE id=%s",
            (payload.name, payload.rtsp_url, payload.location or camera_id, payload.enabled, payload.zone_id, camera_id)
        )
        conn.commit()
        cur.close()
    return {"message": "Camera updated — restart backend to apply"}

@app.delete("/cameras/{camera_id}", dependencies=[Depends(require_admin)])
def delete_camera(camera_id: str):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM cameras WHERE id = %s", (camera_id,))
        conn.commit()
        cur.close()
    return {"message": "Camera deleted — restart backend to apply"}

def _seed_cameras_from_config():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) as count FROM cameras")
        count = cur.fetchone()["count"]
        if count == 0:
            for cam in config.CAMERAS:
                cur.execute(
                    "INSERT INTO cameras (id, name, rtsp_url, location, enabled) VALUES (%s, %s, %s, %s, %s)",
                    (cam["id"], cam["name"], cam["source"], cam.get("location", cam["id"]), True)
                )
            conn.commit()
        cur.close()

class ZoneRequest(BaseModel):
    id: str
    name: str

@app.get("/zones", dependencies=[Depends(verify_token)])
def list_zones():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, name FROM zones ORDER BY id")
        rows = cur.fetchall()
        cur.close()
    return [dict(r) for r in rows]

@app.post("/zones", dependencies=[Depends(require_admin)])
def add_zone(payload: ZoneRequest):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("INSERT INTO zones (id, name) VALUES (%s, %s)", (payload.id, payload.name))
        conn.commit()
        cur.close()
    return {"message": "Zone added"}

@app.delete("/zones/{zone_id}", dependencies=[Depends(require_admin)])
def delete_zone(zone_id: str):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM zones WHERE id = %s", (zone_id,))
        conn.commit()
        cur.close()
    return {"message": "Zone deleted"}

@app.get("/status", dependencies=[Depends(verify_token)])
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

def _mjpeg_generator(camera_id):
    encode_params = [cv2.IMWRITE_JPEG_QUALITY, 70]
    while True:
        frame = get_current_frame(camera_id)
        if frame is not None:
            _, buffer = cv2.imencode(".jpg", frame, encode_params)
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n")
            time.sleep(1/15)
        else:
            yield offline_bytes
            time.sleep(1.0)

@app.get("/snapshots/{filename}", dependencies=[Depends(verify_token)])
def get_snapshot(filename: str):
    filepath = os.path.join("snapshots", filename)
    if not os.path.exists(filepath):
        return {"error": "Snapshot not found"}
    return FileResponse(filepath, media_type="image/jpeg")

@app.get("/video_feed/{camera_id}", dependencies=[Depends(verify_token)])
def video_feed(camera_id: str):
    return StreamingResponse(_mjpeg_generator(camera_id), media_type="multipart/x-mixed-replace; boundary=frame")

@app.post("/users", dependencies=[Depends(require_admin)])
def create_user(payload: CreateUserRequest):
    username = payload.username.strip()
    role = payload.role.strip().lower()
    if role not in ["admin", "manager", "guard"]:
        raise HTTPException(status_code=400, detail="Role must be admin, manager, or guard")
    if not username or not payload.password:
        raise HTTPException(status_code=400, detail="Username and password are required")

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        if cur.fetchone():
            cur.close()
            raise HTTPException(status_code=400, detail=f"Username '{username}' already exists")

        cur.execute(
            "INSERT INTO users (username, password_hash, role, name) VALUES (%s, %s, %s, %s)",
            (username, hash_password(payload.password), role, username)
        )
        conn.commit()
        cur.close()

    return {"message": "User created"}

@app.get("/users", dependencies=[Depends(require_admin)])
def list_users():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, username, role, name, created_at FROM users ORDER BY id")
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]

@app.delete("/users/{user_id}", dependencies=[Depends(require_admin)])
def delete_user(user_id: int, current_user: dict = Depends(verify_token)):
    if str(user_id) == str(current_user.get("user_id")):
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


@app.get("/incidents", dependencies=[Depends(verify_token)])
def list_incidents(status: str = None, limit: int = 100):
    query = "SELECT * FROM incidents WHERE 1=1"
    params = []
    if status:
        query += " AND status = %s"
        params.append(status)
    query += " ORDER BY last_seen DESC LIMIT %s"
    params.append(limit)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(query, tuple(params))
        rows = cur.fetchall()
        cur.close()
    return [dict(r) for r in rows]

class IncidentUpdateRequest(BaseModel):
    status: str

@app.put("/incidents/{incident_id}", dependencies=[Depends(require_staff)])
def update_incident(incident_id: int, payload: IncidentUpdateRequest):
    status = payload.status.strip().lower()
    if status not in ["new", "acknowledged", "dismissed", "resolved"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE incidents SET status = %s WHERE id = %s", (status, incident_id))
        conn.commit()
        cur.close()
    return {"message": "Incident updated"}
