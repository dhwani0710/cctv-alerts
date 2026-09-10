import os
import shutil
import cv2
import time
import io
import csv
import uuid
from typing import List, Optional
from fastapi import FastAPI, UploadFile, Form, File, Depends, HTTPException, Query, Header, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from database import init_db, get_db
from camera_worker import start_camera_threads, get_current_frame, start_health_check_thread, get_camera_heartbeat
from datetime import datetime, timedelta
import config
from auth import verify_token, require_owner, require_admin, require_hr, require_guard, require_staff
from auth_users import verify_password, create_token, hash_password
from settings_store import load_settings, save_settings
from audit import log_audit_event
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
    os.makedirs("snapshots/acknowledgments", exist_ok=True)
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
    
    # Audit log login event
    log_audit_event(
        username=user["username"],
        user_role=user["role"],
        action="USER_LOGIN",
        target_module="Auth",
        details=f"User {user['username']} logged in with role {user['role']}",
        user_id=user["id"]
    )

    return {
        "ok": True,
        "role": user["role"],
        "name": user["name"],
        "username": user["username"],
        "token": token
    }

# --- System Audit Log (Owner Exclusive) ---

@app.get("/audit-logs", dependencies=[Depends(require_owner)])
def get_audit_logs(
    role: Optional[str] = None,
    module: Optional[str] = None,
    date: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 200
):
    query = "SELECT id, user_id, username, user_role, action, target_module, details, proof_image, timestamp FROM audit_logs WHERE 1=1"
    params = []
    if role:
        query += " AND LOWER(user_role) = %s"
        params.append(role.lower())
    if module:
        query += " AND LOWER(target_module) = %s"
        params.append(module.lower())
    if date:
        query += " AND timestamp LIKE %s"
        params.append(f"{date}%")
    if search:
        query += " AND (LOWER(details) LIKE %s OR LOWER(username) LIKE %s OR LOWER(action) LIKE %s)"
        s = f"%{search.lower()}%"
        params.extend([s, s, s])

    query += " ORDER BY timestamp DESC LIMIT %s"
    params.append(limit)

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(query, tuple(params))
        rows = cur.fetchall()
        cur.close()

    return [dict(r) for r in rows]

# --- User Management (Owner & CEO) ---

@app.get("/users", dependencies=[Depends(require_admin)])
def list_users():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, username, role, name, created_at FROM users ORDER BY id")
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]

@app.post("/users", dependencies=[Depends(require_admin)])
def create_user(payload: CreateUserRequest, current_user: dict = Depends(require_admin)):
    username = payload.username.strip()
    role = payload.role.strip().lower()
    valid_roles = ["owner", "ceo", "admin", "hr", "manager", "guard"]
    if role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Role must be one of: {', '.join(valid_roles)}")
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

    log_audit_event(
        username=current_user.get("username"),
        user_role=current_user.get("role"),
        action="USER_CREATED",
        target_module="Users",
        details=f"Created user account '{username}' with role '{role}'",
        user_id=current_user.get("user_id")
    )

    return {"message": "User created"}

@app.put("/users/{user_id}", dependencies=[Depends(require_admin)])
def update_user(user_id: int, req: UpdateUserRequest, current_user: dict = Depends(require_admin)):
    updates = []
    params = []
    valid_roles = ["owner", "ceo", "admin", "hr", "manager", "guard"]
    if req.role:
        role = req.role.strip().lower()
        if role not in valid_roles:
            raise HTTPException(status_code=400, detail=f"Role must be one of: {', '.join(valid_roles)}")
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

    log_audit_event(
        username=current_user.get("username"),
        user_role=current_user.get("role"),
        action="USER_UPDATED",
        target_module="Users",
        details=f"Updated user ID {user_id} (username: {updated['username']}, role: {updated['role']})",
        user_id=current_user.get("user_id")
    )

    return dict(updated)

@app.delete("/users/{user_id}", dependencies=[Depends(require_admin)])
def delete_user(user_id: int, current_user: dict = Depends(require_admin)):
    if str(user_id) == str(current_user.get("user_id")):
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, username, role FROM users WHERE id = %s", (user_id,))
        u = cur.fetchone()
        if not u:
            cur.close()
            raise HTTPException(status_code=404, detail="User not found")

        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()
        cur.close()

    log_audit_event(
        username=current_user.get("username"),
        user_role=current_user.get("role"),
        action="USER_DELETED",
        target_module="Users",
        details=f"Deleted user account '{u['username']}' (role: {u['role']})",
        user_id=current_user.get("user_id")
    )

    return {"message": "User deleted successfully"}

# --- Employee Management (Owner, CEO & HR) ---

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

@app.post("/employees", dependencies=[Depends(require_hr)])
async def add_employee(
    name: str = Form(...),
    shift_start: str = Form(...),
    shift_end: str = Form(...),
    designation: str = Form("Staff"),
    photos: List[UploadFile] = File(...),
    current_user: dict = Depends(require_hr)
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
                print(f"[main] Photo cloud upload failed: {e}")
            cur.execute(
                "INSERT INTO employee_photos (employee_id, filename) VALUES (%s, %s)",
                (employee_id, filename)
            )

        conn.commit()
        cur.close()

    _clear_face_cache()

    log_audit_event(
        username=current_user.get("username"),
        user_role=current_user.get("role"),
        action="EMPLOYEE_ADDED",
        target_module="Employees",
        details=f"Added employee '{name}' ({designation}), shift: {shift_start}-{shift_end} with {len(photos)} photo(s)",
        user_id=current_user.get("user_id")
    )

    return {"message": f"Employee {name} added successfully with {len(photos)} photo(s)"}

@app.get("/employees", dependencies=[Depends(require_hr)])
def list_employees():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM employees ORDER BY id ASC")
        rows = cur.fetchall()
        cur.close()
        return [dict(row) for row in rows]

@app.put("/employees/{employee_id}", dependencies=[Depends(require_hr)])
async def update_employee(
    employee_id: int,
    name: str = Form(...),
    shift_start: str = Form(...),
    shift_end: str = Form(...),
    designation: str = Form("Staff"),
    photo: Optional[UploadFile] = File(None),
    current_user: dict = Depends(require_hr)
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

        if photo is not None and photo.filename:
            folder_name = name.replace(" ", "_")
            employee_folder = os.path.join(KNOWN_FACES_DIR, folder_name)
            os.makedirs(employee_folder, exist_ok=True)
            photo_path = os.path.join(employee_folder, "photo_1.jpg")
            _save_resized_photo(photo, photo_path)
            try:
                storage.upload_file(photo_path, f"known_faces/{folder_name}/photo_1.jpg")
            except Exception as e:
                print(f"[main] Photo cloud upload failed: {e}")
            _clear_face_cache()

        cur.execute(
            "UPDATE employees SET name = %s, shift_start = %s, shift_end = %s, designation = %s WHERE id = %s",
            (name, shift_start, shift_end, designation, employee_id)
        )
        conn.commit()
        cur.close()

    log_audit_event(
        username=current_user.get("username"),
        user_role=current_user.get("role"),
        action="EMPLOYEE_UPDATED",
        target_module="Employees",
        details=f"Updated employee ID {employee_id} ('{name}', {designation}, shift: {shift_start}-{shift_end})",
        user_id=current_user.get("user_id")
    )

    return {"message": f"Employee {name} updated successfully"}

@app.delete("/employees/{employee_id}", dependencies=[Depends(require_hr)])
def delete_employee(employee_id: int, current_user: dict = Depends(require_hr)):
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

    log_audit_event(
        username=current_user.get("username"),
        user_role=current_user.get("role"),
        action="EMPLOYEE_DELETED",
        target_module="Employees",
        details=f"Deleted employee '{emp['name']}' (ID: {employee_id})",
        user_id=current_user.get("user_id")
    )

    return {"message": "Employee deleted"}

# --- Settings Management (Owner & CEO) ---

@app.get("/settings", dependencies=[Depends(require_admin)])
def get_settings():
    return load_settings()

@app.post("/settings", dependencies=[Depends(require_admin)])
def update_settings(
    store_open_time: str = Form(...),
    store_close_time: str = Form(...),
    current_user: dict = Depends(require_admin)
):
    save_settings({"store_open_time": store_open_time, "store_close_time": store_close_time})
    
    log_audit_event(
        username=current_user.get("username"),
        user_role=current_user.get("role"),
        action="SETTINGS_UPDATED",
        target_module="Settings",
        details=f"Updated store open hours: {store_open_time} - {store_close_time}",
        user_id=current_user.get("user_id")
    )

    return {"message": "Settings updated"}

# --- Records & Ledgers (Owner & CEO) ---

@app.get("/records", dependencies=[Depends(require_admin)])
def get_records(camera: str = None, status: str = None, date: str = None, limit: int = 100):
    query = "SELECT id, person_name, alert_type, priority, message, timestamp, snapshot_filename, status, acknowledged_by, acknowledged_at, ack_proof_image, ack_notes FROM alerts WHERE 1=1"
    params = []

    if status:
        status_map = {"flag": "high", "review": "medium", "clear": "low"}
        if status in status_map:
            query += " AND priority = %s"
            params.append(status_map[status])
        elif status in ("high", "medium", "low"):
            query += " AND priority = %s"
            params.append(status)

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

# --- Attendance Management (Owner, CEO & HR) ---

@app.get("/attendance", dependencies=[Depends(require_hr)])
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

# --- Guard Alert Protocol & Status (Owner, CEO & Guard) ---

@app.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: int,
    notes: str = Form(...),
    proof: Optional[UploadFile] = File(None),
    current_user: dict = Depends(verify_token)
):
    user_role = current_user.get("role", "").lower()
    if user_role not in ("owner", "ceo", "admin", "guard"):
        raise HTTPException(status_code=403, detail="Only Security Guards or Admins can acknowledge alerts")

    # Guard Protocol Enforcement: proof image & text details are strictly required for Guards
    if user_role == "guard":
        if not notes or not notes.strip():
            raise HTTPException(status_code=400, detail="Guard protocol requires text explanation/inspection notes")
        if not proof or not proof.filename:
            raise HTTPException(status_code=400, detail="Guard protocol strictly requires a mandatory proof image upload")

    proof_url = None
    if proof and proof.filename:
        os.makedirs("snapshots/acknowledgments", exist_ok=True)
        safe_fn = f"ack_{alert_id}_{uuid.uuid4().hex[:8]}.jpg"
        local_path = os.path.join("snapshots/acknowledgments", safe_fn)
        with open(local_path, "wb") as buf:
            shutil.copyfileobj(proof.file, buf)

        try:
            cloud_url = storage.upload_file(local_path, f"acknowledgments/{safe_fn}")
            proof_url = cloud_url or f"/snapshots/acknowledgments/{safe_fn}"
        except Exception:
            proof_url = f"/snapshots/acknowledgments/{safe_fn}"

    now_iso = datetime.now().isoformat()
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE alerts 
            SET status = 'acknowledged', acknowledged_by = %s, acknowledged_at = %s, ack_proof_image = %s, ack_notes = %s 
            WHERE id = %s
            """,
            (current_user.get("username"), now_iso, proof_url, notes.strip(), alert_id)
        )
        conn.commit()
        cur.close()

    log_audit_event(
        username=current_user.get("username"),
        user_role=current_user.get("role"),
        action="ALERT_ACKNOWLEDGED",
        target_module="Alerts",
        details=f"Acknowledged alert #{alert_id}. Notes: {notes.strip()}",
        proof_image=proof_url,
        user_id=current_user.get("user_id")
    )

    return {"ok": True, "message": f"Alert #{alert_id} acknowledged successfully"}

@app.get("/status", dependencies=[Depends(require_guard)])
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
            "SELECT id, person_name, alert_type, priority, message, timestamp, snapshot_filename, status, acknowledged_by, acknowledged_at, ack_proof_image, ack_notes FROM alerts ORDER BY timestamp DESC LIMIT 20"
        )
        alert_rows = cur.fetchall()
        cur.close()

    detected = [{"name": r["person_name"], "camera": r["camera_id"], "last_seen": r["last_seen"]} for r in detected_rows]
    alerts = [dict(r) for r in alert_rows]
    return {"currently_detected": detected, "recent_alerts": alerts}

# --- Camera Streaming & Management ---

@app.get("/cameras", dependencies=[Depends(require_guard)])
def list_cameras():
    now = datetime.now()
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, name, rtsp_url, location, enabled FROM cameras")
        rows = cur.fetchall()
        cur.close()
    result = []
    for cam in rows:
        heartbeat = get_camera_heartbeat(cam["id"])
        is_live = heartbeat is not None and (now - heartbeat).total_seconds() <= config.CAMERA_OFFLINE_THRESHOLD_SEC
        result.append({"id": cam["id"], "name": cam["name"], "location": cam["location"], "enabled": cam["enabled"], "live": is_live})
    return result

class CameraRequest(BaseModel):
    id: str
    name: str
    rtsp_url: str
    location: str = None
    enabled: bool = True

@app.post("/cameras", dependencies=[Depends(require_admin)])
def add_camera(payload: CameraRequest, current_user: dict = Depends(require_admin)):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO cameras (id, name, rtsp_url, location, enabled) VALUES (%s, %s, %s, %s, %s)",
            (payload.id, payload.name, payload.rtsp_url, payload.location or payload.id, payload.enabled)
        )
        conn.commit()
        cur.close()

    log_audit_event(
        username=current_user.get("username"),
        user_role=current_user.get("role"),
        action="CAMERA_ADDED",
        target_module="Cameras",
        details=f"Added camera '{payload.name}' ({payload.id}) at location '{payload.location}'",
        user_id=current_user.get("user_id")
    )

    return {"message": "Camera added — restart backend to apply"}

@app.put("/cameras/{camera_id}", dependencies=[Depends(require_admin)])
def update_camera(camera_id: str, payload: CameraRequest, current_user: dict = Depends(require_admin)):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE cameras SET name=%s, rtsp_url=%s, location=%s, enabled=%s WHERE id=%s",
            (payload.name, payload.rtsp_url, payload.location or camera_id, payload.enabled, camera_id)
        )
        conn.commit()
        cur.close()

    log_audit_event(
        username=current_user.get("username"),
        user_role=current_user.get("role"),
        action="CAMERA_UPDATED",
        target_module="Cameras",
        details=f"Updated camera '{payload.name}' ({camera_id})",
        user_id=current_user.get("user_id")
    )

    return {"message": "Camera updated — restart backend to apply"}

@app.delete("/cameras/{camera_id}", dependencies=[Depends(require_admin)])
def delete_camera(camera_id: str, current_user: dict = Depends(require_admin)):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM cameras WHERE id = %s", (camera_id,))
        conn.commit()
        cur.close()

    log_audit_event(
        username=current_user.get("username"),
        user_role=current_user.get("role"),
        action="CAMERA_DELETED",
        target_module="Cameras",
        details=f"Deleted camera {camera_id}",
        user_id=current_user.get("user_id")
    )

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

def _mjpeg_generator(camera_id):
    encode_params = [cv2.IMWRITE_JPEG_QUALITY, 70]
    offline_frame = cv2.imread("snapshots/offline.jpg") if os.path.exists("snapshots/offline.jpg") else None
    offline_bytes = b""
    if offline_frame is not None:
        _, buffer = cv2.imencode(".jpg", offline_frame, encode_params)
        offline_bytes = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"

    while True:
        frame = get_current_frame(camera_id)
        if frame is not None:
            _, buffer = cv2.imencode(".jpg", frame, encode_params)
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n")
            time.sleep(1/15)
        else:
            yield offline_bytes
            time.sleep(1.0)

@app.get("/snapshots/{filename:path}")
def get_snapshot(filename: str):
    filepath = os.path.join("snapshots", filename)
    if not os.path.exists(filepath):
        return {"error": "Snapshot not found"}
    return FileResponse(filepath, media_type="image/jpeg")

@app.get("/video_feed/{camera_id}", dependencies=[Depends(verify_token)])
def video_feed(camera_id: str):
    return StreamingResponse(_mjpeg_generator(camera_id), media_type="multipart/x-mixed-replace; boundary=frame")