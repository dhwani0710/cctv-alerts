import os
import shutil
import cv2
import time
import csv
import io
import math
import threading
import uuid
import numpy as np
from typing import List, Optional
from fastapi import FastAPI, UploadFile, Form, File, Depends, HTTPException, Query, Header, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from database import init_db, get_db
from camera_worker import start_camera_threads, get_current_frame, start_health_check_thread, get_camera_heartbeat, start_escalation_thread, start_single_camera, stop_single_camera, restart_single_camera
from datetime import datetime, timedelta
import config
from auth import verify_token, require_owner, require_admin, require_hr, require_guard, require_staff
from auth_users import verify_password, create_token, hash_password
from app_settings import get_all_settings, set_setting
from settings_store import load_settings, save_settings
from audit import log_audit_event
import storage
from PIL import Image, ImageOps
from retention import start_retention_thread, start_daily_reset_thread

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


def _make_offline_frame_bytes() -> bytes:
    image = Image.new("RGB", (640, 480), color=(0, 0, 0))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=70)
    return buffer.getvalue()


offline_bytes = _make_offline_frame_bytes()


@app.on_event("startup")
def startup():
    init_db()
    _seed_cameras_from_config()
    os.makedirs(KNOWN_FACES_DIR, exist_ok=True)
    os.makedirs("snapshots/acknowledgments", exist_ok=True)
    storage.sync_known_faces_from_storage(KNOWN_FACES_DIR)
    start_camera_threads()
    start_health_check_thread()
    start_escalation_thread()
    start_retention_thread()
    start_daily_reset_thread()

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

@app.post("/auth/login")
def login(payload: LoginRequest):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE username = %s", (payload.username,))
        user = cur.fetchone()
        cur.close()

    if not user or not verify_password(payload.password, user["password_hash"]):
        return {"ok": False, "error": "Incorrect username or password"}

    token = create_token(user["id"], user["username"], user["role"], user["name"])

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

def _upload_photo_async(local_path, remote_path):
    try:
        storage.upload_file(local_path, remote_path)
    except Exception as e:
        print(f"[main] Photo cloud upload failed: {e}")

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
            threading.Thread(target=_upload_photo_async, args=(photo_path, f"known_faces/{folder_name}/{filename}"), daemon=True).start()
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
            threading.Thread(target=_upload_photo_async, args=(photo_path, f"known_faces/{folder_name}/photo_1.jpg"), daemon=True).start()
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

        #storage.delete_prefix(f"known_faces/{folder_name}")
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

# ============================================================
# APPLICATION SETTINGS (granular thresholds/notifications — Owner/CEO)
# ============================================================

class AppSettingRequest(BaseModel):
    key: str
    value: str


ALLOWED_SETTING_KEYS = {
    "notify_motion",
    "notify_person",
    "notify_email",
    "sensitivity",
    "after_hours_start",
    "after_hours_end",
    "door_held_seconds",
    "min_matching_photos",
    "match_distance_threshold",
    "overstay_low_threshold_min",
    "overstay_medium_threshold_min",
    "alert_dedupe_window_sec",
    "escalation_low_to_medium_sec",
    "escalation_medium_to_high_sec",
}


@app.get("/app-settings", dependencies=[Depends(require_admin)])
def get_app_settings():
    try:
        return get_all_settings()
    except Exception as e:
        print(f"[settings] Failed to load settings: {e}")
        raise HTTPException(status_code=500, detail="Failed to load application settings")


@app.post("/app-settings", dependencies=[Depends(require_admin)])
def update_app_setting(payload: AppSettingRequest):
    key = payload.key.strip()
    value = payload.value.strip()

    if key not in ALLOWED_SETTING_KEYS:
        raise HTTPException(status_code=400, detail=f"Unknown setting key: {key}")

    if key in {"notify_motion", "notify_person", "notify_email"}:
        value = value.lower()
        if value not in {"true", "false"}:
            raise HTTPException(status_code=400, detail=f"{key} must be true or false")

    elif key == "sensitivity":
        value = value.lower()
        if value not in {"low", "medium", "high"}:
            raise HTTPException(status_code=400, detail="sensitivity must be low, medium, or high")

    elif key in {"after_hours_start", "after_hours_end"}:
        try:
            datetime.strptime(value, "%H:%M")
        except ValueError:
            raise HTTPException(status_code=400, detail=f"{key} must use HH:MM format")

    elif key == "door_held_seconds":
        try:
            seconds = int(value)
        except ValueError:
            raise HTTPException(status_code=400, detail="door_held_seconds must be a number")
        if seconds < 5 or seconds > 300:
            raise HTTPException(status_code=400, detail="door_held_seconds must be between 5 and 300 seconds")
        value = str(seconds)

    elif key in {
        "min_matching_photos",
        "overstay_low_threshold_min",
        "overstay_medium_threshold_min",
        "alert_dedupe_window_sec",
        "escalation_low_to_medium_sec",
        "escalation_medium_to_high_sec",
    }:
        try:
            number = int(value)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"{key} must be a number")
        if number < 0:
            raise HTTPException(status_code=400, detail=f"{key} cannot be negative")
        value = str(number)

    elif key == "match_distance_threshold":
        if value != "":
            try:
                threshold = float(value)
            except ValueError:
                raise HTTPException(status_code=400, detail="match_distance_threshold must be a number")
            if threshold < 0:
                raise HTTPException(status_code=400, detail="match_distance_threshold cannot be negative")
            value = str(threshold)

    try:
        set_setting(key, value)
    except Exception as e:
        print(f"[settings] Failed to save '{key}': {e}")
        raise HTTPException(status_code=500, detail="Failed to save setting")

    return {"ok": True, "message": "Setting updated successfully", "key": key, "value": value}


# --- Store Hours Settings (Owner & CEO) ---

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
    query = """
        SELECT i.id, i.person_name, i.alert_type, i.priority, i.camera_id,
               i.first_seen, i.last_seen, i.alert_count, i.status,
               a.message, a.snapshot_filename
        FROM incidents i
        LEFT JOIN LATERAL (
            SELECT message, snapshot_filename
            FROM alerts
            WHERE alerts.incident_id = i.id
            ORDER BY timestamp DESC
            LIMIT 1
        ) a ON true
        WHERE 1=1
    """
    params = []

    if camera:
        query += " AND (i.camera_id = %s OR i.camera_id LIKE %s)"
        params.extend([camera, f"%{camera}%"])

    if status:
        status_map = {"flag": "high", "review": "medium", "clear": "low"}
        if status in status_map:
            query += " AND i.priority = %s"
            params.append(status_map[status])
        elif status in ("high", "medium", "low"):
            query += " AND i.priority = %s"
            params.append(status)

    if date:
        query += " AND i.last_seen LIKE %s"
        params.append(f"{date}%")

    query += " ORDER BY i.last_seen DESC LIMIT %s"
    params.append(limit)

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(query, tuple(params))
        rows = cur.fetchall()
        cur.close()

    results = []
    for r in rows:
        rec = dict(r)
        rec["timestamp"] = rec.get("last_seen")
        rec["occurrences"] = rec.get("alert_count")
        results.append(rec)

    return results

@app.delete("/records/{alert_id}", dependencies=[Depends(require_staff)])
def delete_record(alert_id: int, current_user: dict = Depends(require_staff)):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM alerts WHERE id = %s", (alert_id,))
        deleted = cur.rowcount
        if deleted == 0:
            cur.execute("DELETE FROM alert_records WHERE id = %s", (alert_id,))
            deleted = cur.rowcount
        conn.commit()
        cur.close()
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Record not found")

    log_audit_event(
        username=current_user.get("username"),
        user_role=current_user.get("role"),
        action="RECORD_DELETED",
        target_module="Records",
        details=f"Deleted record/alert #{alert_id}",
        user_id=current_user.get("user_id")
    )

    return {"message": "Record deleted"}

@app.get("/records/export", dependencies=[Depends(require_staff)])
def export_records(camera: str = None, status: str = None, date: str = None):
    query = "SELECT person_name, alert_type, priority, message, timestamp, camera_id FROM alerts WHERE 1=1"
    params = []

    if camera:
        query += " AND (camera_id = %s OR camera_id LIKE %s)"
        params.extend([camera, f"%{camera}%"])

    if status:
        status_map = {"flag": "high", "review": "medium", "clear": "low"}
        query += " AND priority = %s"
        params.append(status_map.get(status, status))

    if date:
        query += " AND timestamp LIKE %s"
        params.append(f"{date}%")

    query += " ORDER BY timestamp DESC"

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(query, tuple(params))
        rows = cur.fetchall()
        cur.close()

    output = io.StringIO()
    output.write('\ufeff')
    writer = csv.writer(output)
    writer.writerow(["Timestamp", "Camera", "Person", "Event Type", "Message", "Priority / Status"])
    for r in rows:
        rec = dict(r)
        writer.writerow([
            rec.get("timestamp"),
            rec.get("camera_id") or "Front Door",
            rec.get("person_name") or "Unknown",
            rec.get("alert_type") or "detection",
            rec.get("message") or "",
            rec.get("priority") or "low"
        ])

    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="records_{date or "all"}.csv"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

# --- Attendance Models, Helpers & Endpoints (Owner, CEO & HR) ---
class AttendanceOverrideRequest(BaseModel):
    employee_id: int
    date: str
    first_seen_at: Optional[str] = None
    last_seen_at: Optional[str] = None
    status: Optional[str] = "present"
    reason: Optional[str] = None
    zone_id: Optional[str] = "Manual Entry"

def _calculate_hours(first_seen_str, last_seen_str):
    if not first_seen_str or not last_seen_str:
        return 0.0
    try:
        t1 = datetime.fromisoformat(str(first_seen_str).replace("Z", ""))
        t2 = datetime.fromisoformat(str(last_seen_str).replace("Z", ""))
        diff_sec = max(0, (t2 - t1).total_seconds())
        return round(diff_sec / 3600.0, 2)
    except Exception:
        return 0.0

def _normalize_time(date_str: str, time_val: Optional[str], default_time: str) -> str:
    if not time_val or not str(time_val).strip():
        return f"{date_str}T{default_time}"
    val = str(time_val).strip()
    if "T" in val:
        return val
    parts = val.split(":")
    if len(parts) == 2:
        return f"{date_str}T{parts[0].zfill(2)}:{parts[1].zfill(2)}:00"
    if len(parts) == 3:
        return f"{date_str}T{parts[0].zfill(2)}:{parts[1].zfill(2)}:{parts[2].zfill(2)}"
    return f"{date_str}T{default_time}"

def _build_attendance_query(start_date=None, end_date=None, date=None, employee_id=None, zone_id=None, status=None, search=None):
    where_clauses = []
    params = []

    if start_date and end_date:
        where_clauses.append("a.attendance_date >= %s AND a.attendance_date <= %s")
        params.extend([start_date, end_date])
    elif start_date:
        where_clauses.append("a.attendance_date >= %s")
        params.append(start_date)
    elif end_date:
        where_clauses.append("a.attendance_date <= %s")
        params.append(end_date)
    elif date:
        where_clauses.append("a.attendance_date = %s")
        params.append(date)

    if employee_id:
        where_clauses.append("a.employee_id = %s")
        params.append(int(employee_id))

    if zone_id and zone_id.strip():
        where_clauses.append("(a.zone_id = %s OR a.last_camera_id = %s OR c.location = %s)")
        params.extend([zone_id.strip(), zone_id.strip(), zone_id.strip()])

    if status and status.strip() and status.lower() != "all":
        where_clauses.append("LOWER(COALESCE(a.status, 'present')) = LOWER(%s)")
        params.append(status.strip())

    if search and search.strip():
        where_clauses.append("LOWER(e.name) LIKE %s")
        params.append(f"%{search.strip().lower()}%")

    where_sql = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
    return where_sql, params

@app.get("/attendance", dependencies=[Depends(verify_token)])
def get_attendance(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    date: Optional[str] = None,
    employee_id: Optional[int] = None,
    zone_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 20
):
    where_sql, params = _build_attendance_query(start_date, end_date, date, employee_id, zone_id, status, search)

    with get_db() as conn:
        cur = conn.cursor()
        count_query = (
            "SELECT COUNT(*) as total FROM attendance a "
            "JOIN employees e ON e.id = a.employee_id "
            "LEFT JOIN cameras c ON c.id = a.last_camera_id"
            + where_sql
        )
        cur.execute(count_query, tuple(params))
        count_row = cur.fetchone()
        total = count_row["total"] if count_row else 0

        offset = max(0, (page - 1) * limit)
        data_query = (
            "SELECT a.id, a.employee_id, e.name, e.designation, e.shift_start, e.shift_end, "
            "a.attendance_date, a.first_seen, a.last_seen, a.last_camera_id, "
            "COALESCE(a.zone_id, c.location, a.last_camera_id, 'Front Door') as zone_id, "
            "COALESCE(a.status, 'present') as status, a.override_reason, "
            "COALESCE(a.is_override, FALSE) as is_override "
            "FROM attendance a "
            "JOIN employees e ON e.id = a.employee_id "
            "LEFT JOIN cameras c ON c.id = a.last_camera_id"
            + where_sql
            + " ORDER BY a.attendance_date DESC, a.first_seen ASC LIMIT %s OFFSET %s"
        )
        data_params = list(params) + [limit, offset]
        cur.execute(data_query, tuple(data_params))
        rows = cur.fetchall()
        cur.close()

    formatted_records = []
    for r in rows:
        rec = dict(r)
        hours = _calculate_hours(rec.get("first_seen"), rec.get("last_seen"))
        rec["total_hours"] = hours
        rec["first_seen_at"] = rec.get("first_seen")
        rec["last_seen_at"] = rec.get("last_seen")
        rec["is_override"] = bool(rec.get("is_override"))
        formatted_records.append(rec)

    total_pages = math.ceil(total / limit) if limit > 0 else 1

    return {
        "records": formatted_records,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
        "start_date": start_date or date,
        "end_date": end_date or date,
        "date": date or start_date or datetime.now().date().isoformat()
    }

@app.get("/attendance/export", dependencies=[Depends(verify_token)])
def export_attendance(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    date: Optional[str] = None,
    employee_id: Optional[int] = None,
    zone_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    format: Optional[str] = "csv"
):
    where_sql, params = _build_attendance_query(start_date, end_date, date, employee_id, zone_id, status, search)

    with get_db() as conn:
        cur = conn.cursor()
        data_query = (
            "SELECT a.id, a.employee_id, e.name, e.designation, "
            "a.attendance_date, a.first_seen, a.last_seen, "
            "COALESCE(a.zone_id, c.location, a.last_camera_id, 'Front Door') as zone_id, "
            "COALESCE(a.status, 'present') as status, a.override_reason, "
            "COALESCE(a.is_override, FALSE) as is_override "
            "FROM attendance a "
            "JOIN employees e ON e.id = a.employee_id "
            "LEFT JOIN cameras c ON c.id = a.last_camera_id"
            + where_sql
            + " ORDER BY a.attendance_date DESC, a.first_seen ASC"
        )
        cur.execute(data_query, tuple(params))
        rows = cur.fetchall()
        cur.close()

    output = io.StringIO()
    output.write('\ufeff')
    writer = csv.writer(output)

    writer.writerow([
        "Date", "Employee ID", "Employee Name", "Designation",
        "First Seen (In)", "Last Seen (Out)", "Total Hours",
        "Zone / Location", "Status", "Method", "Override Reason"
    ])

    for r in rows:
        rec = dict(r)
        hours = _calculate_hours(rec.get("first_seen"), rec.get("last_seen"))
        first_time = rec.get("first_seen")
        last_time = rec.get("last_seen")
        try:
            if first_time:
                first_time = datetime.fromisoformat(first_time.replace("Z", "")).strftime("%Y-%m-%d %H:%M:%S")
            if last_time:
                last_time = datetime.fromisoformat(last_time.replace("Z", "")).strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            pass

        method = "Manual Override" if rec.get("is_override") else "Automated (CCTV)"
        writer.writerow([
            rec.get("attendance_date") or "",
            rec.get("employee_id") or "",
            rec.get("name") or "",
            rec.get("designation") or "Staff",
            first_time or "—",
            last_time or "—",
            f"{hours:.2f}",
            rec.get("zone_id") or "Front Door",
            (rec.get("status") or "present").capitalize(),
            method,
            rec.get("override_reason") or ""
        ])

    date_tag = f"{start_date}_to_{end_date}" if (start_date and end_date) else (start_date or date or datetime.now().date().isoformat())
    filename = f"attendance_report_{date_tag}.csv"

    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

@app.post("/attendance/override", dependencies=[Depends(require_staff)])
@app.post("/api/attendance/override", dependencies=[Depends(require_staff)])
def override_attendance(req: AttendanceOverrideRequest):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, name FROM employees WHERE id = %s", (req.employee_id,))
        emp = cur.fetchone()
        if not emp:
            cur.close()
            raise HTTPException(status_code=404, detail="Employee not found")

        first_seen = _normalize_time(req.date, req.first_seen_at, "09:00:00")
        last_seen = _normalize_time(req.date, req.last_seen_at, "18:00:00")
        status = (req.status or "present").lower()
        reason = req.reason or "Manual reconciliation"
        zone = req.zone_id or "Manual Entry"

        cur.execute("SELECT id FROM attendance WHERE employee_id = %s AND attendance_date = %s", (req.employee_id, req.date))
        existing = cur.fetchone()

        if existing:
            cur.execute(
                "UPDATE attendance SET first_seen = %s, last_seen = %s, zone_id = %s, status = %s, "
                "override_reason = %s, is_override = FALSE WHERE employee_id = %s AND attendance_date = %s",
                (first_seen, last_seen, zone, status, reason, req.employee_id, req.date)
            )
        else:
            cur.execute(
                "INSERT INTO attendance (employee_id, attendance_date, first_seen, last_seen, last_camera_id, zone_id, status, override_reason, is_override) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, FALSE)",
                (req.employee_id, req.date, first_seen, last_seen, "manual", zone, status, reason)
            )

        conn.commit()

        cur.execute(
            "SELECT a.id, a.employee_id, e.name, a.attendance_date, a.first_seen, a.last_seen, "
            "a.zone_id, a.status, a.override_reason, a.is_override "
            "FROM attendance a JOIN employees e ON e.id = a.employee_id "
            "WHERE a.employee_id = %s AND a.attendance_date = %s",
            (req.employee_id, req.date)
        )
        updated = cur.fetchone()
        cur.close()

    result = dict(updated) if updated else {}
    result["first_seen_at"] = result.get("first_seen")
    result["last_seen_at"] = result.get("last_seen")
    result["total_hours"] = _calculate_hours(result.get("first_seen"), result.get("last_seen"))
    result["is_override"] = bool(result.get("is_override"))

    return {
        "ok": True,
        "message": f"Attendance for {emp['name']} on {req.date} reconciled successfully",
        "record": result
    }

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
def add_camera(payload: CameraRequest, current_user: dict = Depends(require_admin)):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO cameras (id, name, rtsp_url, location, enabled, zone_id) VALUES (%s, %s, %s, %s, %s, %s)",
            (payload.id, payload.name, payload.rtsp_url, payload.location or payload.id, payload.enabled, payload.zone_id)
        )
        conn.commit()
        cur.close()

    if payload.enabled:
        start_single_camera({
            "id": payload.id,
            "name": payload.name,
            "source": payload.rtsp_url,
            "location": payload.location or payload.id,
            "zone_id": payload.zone_id,
        })

    log_audit_event(
        username=current_user.get("username"),
        user_role=current_user.get("role"),
        action="CAMERA_ADDED",
        target_module="Cameras",
        details=f"Added camera '{payload.name}' ({payload.id}) at location '{payload.location}'",
        user_id=current_user.get("user_id")
    )

    return {"message": "Camera added and connected"}

@app.put("/cameras/{camera_id}", dependencies=[Depends(require_admin)])
def update_camera(camera_id: str, payload: CameraRequest, current_user: dict = Depends(require_admin)):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE cameras SET name=%s, rtsp_url=%s, location=%s, enabled=%s, zone_id=%s WHERE id=%s",
            (payload.name, payload.rtsp_url, payload.location or camera_id, payload.enabled, payload.zone_id, camera_id)
        )
        conn.commit()
        cur.close()

    stop_single_camera(camera_id)
    if payload.enabled:
        start_single_camera({
            "id": camera_id,
            "name": payload.name,
            "source": payload.rtsp_url,
            "location": payload.location or camera_id,
            "zone_id": payload.zone_id,
        })

    log_audit_event(
        username=current_user.get("username"),
        user_role=current_user.get("role"),
        action="CAMERA_UPDATED",
        target_module="Cameras",
        details=f"Updated camera '{payload.name}' ({camera_id})",
        user_id=current_user.get("user_id")
    )

    return {"message": "Camera updated and reconnected"}

@app.delete("/cameras/{camera_id}", dependencies=[Depends(require_admin)])
def delete_camera(camera_id: str, current_user: dict = Depends(require_admin)):
    stop_single_camera(camera_id)
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

    return {"message": "Camera deleted and disconnected"}

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

# --- Zones ---

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

# --- Incidents ---

@app.get("/incidents", dependencies=[Depends(verify_token)])
def list_incidents(status: str = None, limit: int = 100):
    query = """
        SELECT i.*,
            (SELECT a.snapshot_filename FROM alerts a
             WHERE a.incident_id = i.id AND a.snapshot_filename IS NOT NULL
             ORDER BY a.timestamp DESC LIMIT 1) AS snapshot_filename
        FROM incidents i
        WHERE 1=1
    """
    params = []
    if status:
        query += " AND i.status = %s"
        params.append(status)
    query += " ORDER BY i.last_seen DESC LIMIT %s"
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

# --- Reporting ---

@app.get("/reports/attendance-summary", dependencies=[Depends(require_staff)])
def attendance_summary(start_date: str = None, end_date: str = None):
    start_date = start_date or datetime.now().date().isoformat()
    end_date = end_date or start_date
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT e.name, a.attendance_date, a.first_seen, a.last_seen FROM attendance a "
            "JOIN employees e ON e.id = a.employee_id "
            "WHERE a.attendance_date BETWEEN %s AND %s ORDER BY a.attendance_date DESC, e.name",
            (start_date, end_date)
        )
        rows = cur.fetchall()
        cur.close()
    return [dict(r) for r in rows]

@app.get("/reports/alert-frequency", dependencies=[Depends(require_staff)])
def alert_frequency(start_date: str = None, end_date: str = None):
    start_date = start_date or datetime.now().date().isoformat()
    end_date = end_date or start_date
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT alert_type, priority, COUNT(*) as count FROM alerts "
            "WHERE timestamp BETWEEN %s AND %s "
            "GROUP BY alert_type, priority ORDER BY count DESC",
            (f"{start_date}T00:00:00", f"{end_date}T23:59:59")
        )
        rows = cur.fetchall()
        cur.close()
    return [dict(r) for r in rows]

@app.get("/reports/incident-response-times", dependencies=[Depends(require_staff)])
def incident_response_times(start_date: str = None, end_date: str = None):
    start_date = start_date or datetime.now().date().isoformat()
    end_date = end_date or start_date
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, person_name, alert_type, priority, status, first_seen, last_seen, alert_count "
            "FROM incidents WHERE first_seen BETWEEN %s AND %s ORDER BY first_seen DESC",
            (f"{start_date}T00:00:00", f"{end_date}T23:59:59")
        )
        rows = cur.fetchall()
        cur.close()
    return [dict(r) for r in rows]

@app.put("/records/{alert_id}/permanent", dependencies=[Depends(require_admin)])
def mark_permanent(alert_id: int, permanent: bool = True):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE alerts SET permanent = %s WHERE id = %s", (permanent, alert_id))
        updated = cur.rowcount
        conn.commit()
        cur.close()
    if updated == 0:
        raise HTTPException(status_code=404, detail="Record not found or already archived")
    return {"message": "Updated"}

# --- Streaming ---

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
