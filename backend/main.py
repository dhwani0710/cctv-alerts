import os
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
    "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay|stimeout;5000000"
)
import shutil
import cv2
import time
import csv
import io
import math
import threading
import uuid
import re
from urllib.parse import unquote
import anyio
import asyncio
from starlette.concurrency import run_in_threadpool
from typing import List, Optional
from fastapi import FastAPI, UploadFile, Form, File, Depends, HTTPException, Request, Response, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, RedirectResponse
from pydantic import BaseModel
from database import init_db, get_db, OFFICE_ID
from camera_worker import start_camera_threads, get_current_frame, start_health_check_thread, get_all_camera_heartbeats, start_escalation_thread, start_single_camera, stop_single_camera, stop_all_cameras, get_tampered_cameras, invalidate_employee_cache
from recognition import invalidate_gallery, check_gallery_photo
from datetime import datetime, timedelta
import config
from auth import verify_token, require_admin, require_hr, require_guard, require_staff, require_owner, get_office_id, office_sql, enforce_write_office
from auth_users import verify_password, create_token, hash_password, VALID_ROLES
from app_settings import get_all_settings, set_setting
from settings_store import load_settings, save_settings
from audit import log_audit_event
import storage
from PIL import Image, ImageOps
from retention import start_retention_thread, start_daily_reset_thread

# Set RUN_CAMERAS=false on cloud hosts (e.g. Render) where the cameras can't be reached
RUN_CAMERAS = os.getenv("RUN_CAMERAS", "true").strip().lower() == "true"

app = FastAPI(title="Jewellery Store Alert System", dependencies=[Depends(enforce_write_office)])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

KNOWN_FACES_DIR = "known_faces"
# storage.py adds the office prefix (o2/, o3/, ...) itself, so this stays plain
FACES_REMOTE = "known_faces"

def _make_offline_frame_bytes() -> bytes:
    image = Image.new("RGB", (640, 480), color=(0, 0, 0))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=70)
    return buffer.getvalue()

offline_bytes = _make_offline_frame_bytes()

@app.on_event("startup")
async def raise_thread_limit():
    anyio.to_thread.current_default_thread_limiter().total_tokens = 60

def _db_keepalive():
    """Pings the database every few minutes so idle connections are not dropped."""
    while True:
        time.sleep(240)
        try:
            with get_db() as conn:
                cur = conn.cursor()
                cur.execute("SELECT 1")
                cur.close()
        except Exception as e:
            print(f"[db_keepalive] DB ping failed: {e}", flush=True)

@app.on_event("startup")
def startup():
    init_db()
    _seed_cameras_from_config()
    os.makedirs(KNOWN_FACES_DIR, exist_ok=True)
    os.makedirs("snapshots/acknowledgments", exist_ok=True)
    storage.sync_known_faces_from_storage(KNOWN_FACES_DIR)
    if RUN_CAMERAS:
        start_camera_threads()
        start_health_check_thread()
        start_escalation_thread()
    else:
        print("[startup] RUN_CAMERAS=false - camera threads not started")
    start_retention_thread()
    start_daily_reset_thread()
    threading.Thread(target=_db_keepalive, daemon=True).start()

@app.on_event("shutdown")
def shutdown():
    print("[shutdown] Stopping camera threads...")
    stop_all_cameras()
    print("[shutdown] Camera threads stopped.")

@app.get("/")
def health_check():
    return {"status": "backend is running", "office_id": OFFICE_ID}

# --- Auth Models & Endpoints ---

class LoginRequest(BaseModel):
    username: str
    password: str
    remember_me: bool = False  # When True, a 30-day token is issued instead of 12 h

class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str
    office_id: Optional[int] = None  # required for guard, ignored otherwise

class UpdateUserRequest(BaseModel):
    role: Optional[str] = None
    password: Optional[str] = None
    office_id: Optional[int] = None

class UpdateAccountRequest(BaseModel):
    username: str

@app.get("/auth/me")
def get_me(current_user: dict = Depends(verify_token)):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT office_id FROM users WHERE id = %s", (current_user["user_id"],))
        row = cur.fetchone()
        cur.close()
    return {**current_user, "office_id": row["office_id"] if row else None}

@app.put("/auth/me")
def update_own_account(req: UpdateAccountRequest, current_user: dict = Depends(verify_token)):
    new_username = req.username.strip()
    if not new_username:
        raise HTTPException(status_code=400, detail="Username cannot be empty")
    
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM users WHERE username = %s AND id != %s", (new_username, current_user["user_id"]))
        if cur.fetchone():
            cur.close()
            raise HTTPException(status_code=400, detail="Username already taken")
            
        cur.execute("UPDATE users SET username = %s WHERE id = %s", (new_username, current_user["user_id"]))
        conn.commit()
        cur.close()

    new_token = create_token(current_user["user_id"], new_username, current_user["role"])
    
    log_audit_event(
        username=new_username,
        user_role=current_user.get("role"),
        action="ACCOUNT_UPDATED",
        target_module="Users",
        details=f"User updated their username to '{new_username}'",
        user_id=current_user.get("user_id")
    )
    
    return {"message": "Account updated", "username": new_username, "token": new_token}

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

@app.post("/auth/change-password")
def change_own_password(payload: ChangePasswordRequest, current_user: dict = Depends(verify_token)):
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT password_hash FROM users WHERE id = %s", (current_user["user_id"],))
        row = cur.fetchone()
        if not row or not verify_password(payload.current_password, row["password_hash"]):
            cur.close()
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        cur.execute("UPDATE users SET password_hash = %s WHERE id = %s",
                    (hash_password(payload.new_password), current_user["user_id"]))
        conn.commit()
        cur.close()
    log_audit_event(username=current_user.get("username"), user_role=current_user.get("role"),
                    action="PASSWORD_CHANGED", target_module="Users",
                    details="User changed their own password", user_id=current_user.get("user_id"))
    return {"message": "Password updated"}

@app.post("/auth/login")
def login(payload: LoginRequest):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE username = %s", (payload.username,))
        user = cur.fetchone()
        cur.close()

    if not user or not verify_password(payload.password, user["password_hash"]):
        return {"ok": False, "error": "Incorrect username or password"}

    # guard must have an office. All other roles see all offices.
    if user["role"] == "guard" and user["office_id"] is None:
        return {"ok": False, "error": "No office assigned to this guard"}

    token = create_token(user["id"], user["username"], user["role"], remember=payload.remember_me)

    log_audit_event(
        username=user["username"],
        user_role=user["role"],
        action="USER_LOGIN",
        target_module="Auth",
        details=f"User {user['username']} logged in with role {user['role']}",
        user_id=user["id"]
    )

    office_name = None
    if user["office_id"] is not None:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("SELECT name FROM offices WHERE id = %s", (user["office_id"],))
            o = cur.fetchone()
            cur.close()
        office_name = o["name"] if o else None

    return {
        "ok": True,
        "role": user["role"],
        "username": user["username"],
        "office_id": user["office_id"],
        "office_name": office_name,
        "token": token
    }

# --- Offices ---

@app.get("/offices")
def list_offices(current_user: dict = Depends(verify_token)):
    with get_db() as conn:
        cur = conn.cursor()
        if current_user.get("role") == "guard":
            cur.execute(
                "SELECT o.id, o.name, o.city FROM offices o JOIN users u ON u.office_id = o.id WHERE u.id = %s",
                (current_user["user_id"],)
            )
        else:
            cur.execute("SELECT id, name, city FROM offices ORDER BY id")
        rows = cur.fetchall()
        cur.close()
    return [dict(r) for r in rows]

# --- System Audit Log (Owner Exclusive) ---

@app.get("/audit-logs", dependencies=[Depends(require_owner)])
def get_audit_logs(
    role: Optional[str] = None,
    module: Optional[str] = None,
    date: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 200,
    office_id: Optional[int] = Depends(get_office_id)
):
    clause, p = office_sql(office_id)
    query = "SELECT id, office_id, user_id, username, user_role, action, target_module, details, proof_image, timestamp FROM audit_logs WHERE 1=1" + clause
    params = list(p)
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

@app.delete("/audit-logs", dependencies=[Depends(require_owner)])
def clear_audit_logs(current_user: dict = Depends(require_owner)):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT proof_image FROM audit_logs WHERE office_id = %s AND proof_image IS NOT NULL",
            (OFFICE_ID,),
        )
        proofs = {r["proof_image"] for r in cur.fetchall()}

        # proofs still attached to alert records must survive
        cur.execute("SELECT DISTINCT ack_proof_image FROM alerts WHERE ack_proof_image IS NOT NULL")
        in_use = {r["ack_proof_image"] for r in cur.fetchall()}

        cur.execute("DELETE FROM audit_logs WHERE office_id = %s", (OFFICE_ID,))
        logs_deleted = cur.rowcount
        conn.commit()
        cur.close()

    files_deleted = 0
    for url in proofs - in_use:
        if "acknowledgments/" not in url:
            continue
        name = os.path.basename(unquote(url.split("?", 1)[0]))  # basename blocks path traversal
        if not name:
            continue
        local = os.path.join("snapshots", "acknowledgments", name)
        if os.path.isfile(local):
            os.remove(local)
            files_deleted += 1
        try:
            storage.delete_file(f"acknowledgments/{name}")  # adds the office prefix itself
        except Exception as e:
            print(f"[audit] Could not delete cloud proof {name}: {e}")

    # written after the delete so the clear itself leaves a trace
    log_audit_event(
        username=current_user.get("username"),
        user_role=current_user.get("role"),
        action="AUDIT_LOGS_CLEARED",
        target_module="Audit",
        details=f"Cleared {logs_deleted} audit logs and {files_deleted} local proof images",
        user_id=current_user.get("user_id"),
    )
    return {"message": "Audit logs cleared", "logs_deleted": logs_deleted, "files_deleted": files_deleted}

# --- Video Recordings ---

@app.get("/recordings", dependencies=[Depends(verify_token)])
def get_recordings(page: int = 1, limit: int = 10, office_id: Optional[int] = Depends(get_office_id)):
    offset = (page - 1) * limit
    clause, p = office_sql(office_id)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) as count FROM recordings WHERE 1=1" + clause, tuple(p))
        total = cur.fetchone()["count"]

        cur.execute(
            "SELECT id, office_id, camera_id, camera_name, zone_name, timestamp, video_url FROM recordings WHERE 1=1"
            + clause + " ORDER BY timestamp DESC LIMIT %s OFFSET %s",
            tuple(p + [limit, offset])
        )
        rows = cur.fetchall()
        cur.close()
        return {"recordings": [dict(r) for r in rows], "total": total}

# --- User Management (Owner & CEO) ---

@app.get("/users", dependencies=[Depends(require_admin)])
def list_users():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, username, role, office_id, created_at FROM users ORDER BY id")
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]

@app.post("/users", dependencies=[Depends(require_admin)])
def create_user(payload: CreateUserRequest, current_user: dict = Depends(require_admin)):
    username = payload.username.strip()
    role = payload.role.strip().lower()
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of: {', '.join(VALID_ROLES)}")
    if not username or not payload.password:
        raise HTTPException(status_code=400, detail="Username and password are required")
    if role == "guard" and payload.office_id is None:
        raise HTTPException(status_code=400, detail="Guard needs an office")
    new_office = payload.office_id if role == "guard" else None

    with get_db() as conn:
        cur = conn.cursor()
        if new_office is not None:
            cur.execute("SELECT 1 FROM offices WHERE id = %s", (new_office,))
            if not cur.fetchone():
                cur.close()
                raise HTTPException(status_code=400, detail="Unknown office")
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        if cur.fetchone():
            cur.close()
            raise HTTPException(status_code=400, detail=f"Username '{username}' already exists")

        cur.execute(
            "INSERT INTO users (username, password_hash, role, office_id) VALUES (%s, %s, %s, %s)",
            (username, hash_password(payload.password), role, new_office)
        )
        conn.commit()
        cur.close()

    log_audit_event(
        username=current_user.get("username"),
        user_role=current_user.get("role"),
        action="USER_CREATED",
        target_module="Users",
        details=f"Created user account '{username}' with role '{role}'" + (f" (office {new_office})" if new_office else ""),
        user_id=current_user.get("user_id")
    )

    return {"message": "User created"}

@app.put("/users/{user_id}", dependencies=[Depends(require_admin)])
def update_user(user_id: int, req: UpdateUserRequest, current_user: dict = Depends(require_admin)):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, role, office_id FROM users WHERE id = %s", (user_id,))
        u = cur.fetchone()
        if not u:
            cur.close()
            raise HTTPException(status_code=404, detail="User not found")

        new_role = req.role.strip().lower() if req.role else u["role"]
        if new_role not in VALID_ROLES:
            cur.close()
            raise HTTPException(status_code=400, detail=f"Role must be one of: {', '.join(VALID_ROLES)}")
        if new_role == "guard":
            new_office = req.office_id if req.office_id is not None else u["office_id"]
            if new_office is None:
                cur.close()
                raise HTTPException(status_code=400, detail="Guard needs an office")
            cur.execute("SELECT 1 FROM offices WHERE id = %s", (new_office,))
            if not cur.fetchone():
                cur.close()
                raise HTTPException(status_code=400, detail="Unknown office")
        else:
            new_office = None

        updates = ["role = %s", "office_id = %s"]
        params = [new_role, new_office]
        if req.password:
            updates.append("password_hash = %s")
            params.append(hash_password(req.password))
        params.append(user_id)

        cur.execute(
            f"UPDATE users SET {', '.join(updates)} WHERE id = %s RETURNING id, username, role, office_id",
            tuple(params)
        )
        updated = cur.fetchone()
        conn.commit()
        cur.close()

    log_audit_event(
        username=current_user.get("username"),
        user_role=current_user.get("role"),
        action="USER_UPDATED",
        target_module="Users",
        details=f"Updated user ID {user_id} (username: {updated['username']}, role: {updated['role']}, office: {updated['office_id']})",
        user_id=current_user.get("user_id")
    )

    return dict(updated)

@app.delete("/records/{alert_id}", dependencies=[Depends(require_admin)])
def delete_record(alert_id: int, current_user: dict = Depends(require_admin)):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM alerts WHERE incident_id = %s", (alert_id,))
        cur.execute("DELETE FROM alert_records WHERE incident_id = %s", (alert_id,))
        cur.execute("DELETE FROM incidents WHERE id = %s", (alert_id,))
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

# --- Employee Management (Owner, CEO & HR) ---

MAX_PHOTO_DIMENSION = 1024
# Raise to 3 or more once the employee form can send several photos
MIN_PHOTOS_PER_EMPLOYEE = 1

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
    # Tell the recognizer the photos changed, and drop cached employee lookups
    invalidate_gallery()
    invalidate_employee_cache()

def _move_over(src, dst):
    try:
        os.replace(src, dst)
    except OSError:
        shutil.copyfile(src, dst)
        os.remove(src)

def _same_path(a, b):
    try:
        return os.path.samefile(a, b)
    except OSError:
        return False

def _tmp_photo_path():
    os.makedirs("snapshots", exist_ok=True)
    return os.path.join("snapshots", f"tmp_{uuid.uuid4().hex}.jpg")

def _upload_photo_async(local_path, remote_path):
    try:
        storage.upload_file(local_path, remote_path)
    except Exception as e:
        print(f"[main] Photo cloud upload failed: {e}")

_SAFE_NAME_RE = re.compile(r"[^a-zA-Z0-9_\-]")
ALLOWED_PHOTO_TYPES = {"image/jpeg", "image/png", "image/jpg"}
ALLOWED_PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png"}
MAX_PHOTO_BYTES = 5 * 1024 * 1024  # 5MB

def _safe_folder_name(name: str) -> str:
    cleaned = _SAFE_NAME_RE.sub("_", name.strip().replace(" ", "_"))
    if not cleaned:
        raise HTTPException(status_code=400, detail="Invalid employee name")
    return cleaned

def _validate_photo_upload(photo: UploadFile):
    if photo.content_type not in ALLOWED_PHOTO_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {photo.content_type}")
    ext = os.path.splitext(photo.filename or "")[1].lower()
    if ext not in ALLOWED_PHOTO_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file extension: {ext}")
    photo.file.seek(0, os.SEEK_END)
    size = photo.file.tell()
    photo.file.seek(0)
    if size > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=400, detail="Photo exceeds 5MB size limit")

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
        raise HTTPException(status_code=400, detail="Shift start and end time cannot be the same.")
    if len(photos) < MIN_PHOTOS_PER_EMPLOYEE:
        raise HTTPException(
            status_code=400,
            detail=f"At least {MIN_PHOTOS_PER_EMPLOYEE} photo(s) required (different angles and lighting work best)."
        )

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id FROM employees WHERE LOWER(name) = LOWER(%s) AND office_id = %s",
            (name.strip(), OFFICE_ID)
        )
        existing = cur.fetchone()
        cur.close()
    if existing:
        raise HTTPException(status_code=409, detail=f"An employee named '{name.strip()}' already exists.")

    folder_name = _safe_folder_name(name)
    employee_folder = os.path.join(KNOWN_FACES_DIR, folder_name)
    if os.path.isdir(employee_folder) and os.listdir(employee_folder):
        raise HTTPException(status_code=409, detail="A face folder with this name already exists. Use a different name.")
    for photo in photos:
        _validate_photo_upload(photo)

    os.makedirs(employee_folder, exist_ok=True)
    saved = []
    try:
        for i, photo in enumerate(photos):
            filename = f"photo_{i+1}.jpg"
            photo_path = os.path.join(employee_folder, filename)
            _save_resized_photo(photo, photo_path)
            saved.append((filename, photo_path))

        problems = []
        for i, (_fn, photo_path) in enumerate(saved):
            ok, reason = await run_in_threadpool(check_gallery_photo, photo_path)
            if not ok:
                problems.append(f"photo {i+1}: {reason}")
        if problems:
            raise HTTPException(status_code=400, detail="Some photos can't be used for recognition - " + "; ".join(problems))

        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO employees (name, shift_start, shift_end, photo_filename, designation, office_id) VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
                (name, shift_start, shift_end, "", designation, OFFICE_ID)
            )
            employee_id = cur.fetchone()["id"]
            for filename, _p in saved:
                cur.execute(
                    "INSERT INTO employee_photos (employee_id, filename) VALUES (%s, %s)",
                    (employee_id, filename)
                )
            conn.commit()
            cur.close()
    except HTTPException:
        shutil.rmtree(employee_folder, ignore_errors=True)
        raise
    except Exception as e:
        shutil.rmtree(employee_folder, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"Could not process photos: {e}")

    for filename, photo_path in saved:
        threading.Thread(target=_upload_photo_async, args=(photo_path, f"{FACES_REMOTE}/{folder_name}/{filename}"), daemon=True).start()

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
def list_employees(office_id: Optional[int] = Depends(get_office_id)):
    clause, p = office_sql(office_id)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM employees WHERE 1=1" + clause + " ORDER BY id ASC", tuple(p))
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
        raise HTTPException(status_code=400, detail="Shift start and end time cannot be the same.")

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id FROM employees WHERE LOWER(name) = LOWER(%s) AND id != %s AND office_id = %s",
            (name.strip(), employee_id, OFFICE_ID),
        )
        clash = cur.fetchone()
        cur.execute("SELECT * FROM employees WHERE id = %s AND office_id = %s", (employee_id, OFFICE_ID))
        emp = cur.fetchone()
        cur.close()
    if clash:
        raise HTTPException(status_code=409, detail=f"An employee named '{name.strip()}' already exists.")
    if emp is None:
        return {"message": "Employee not found"}

    old_name = emp["name"]
    old_folder_name = _safe_folder_name(old_name)
    new_folder_name = _safe_folder_name(name)
    old_folder = os.path.join(KNOWN_FACES_DIR, old_folder_name)
    new_folder = os.path.join(KNOWN_FACES_DIR, new_folder_name)
    renaming = old_folder_name != new_folder_name

    if renaming and os.path.exists(new_folder) and not _same_path(old_folder, new_folder):
        raise HTTPException(status_code=409, detail="A face folder with this name already exists. Choose a different name.")

    # Check the new photo BEFORE changing anything
    tmp_photo = None
    if photo is not None and photo.filename:
        _validate_photo_upload(photo)
        tmp_photo = _tmp_photo_path()
        try:
            _save_resized_photo(photo, tmp_photo)
        except Exception as e:
            if os.path.exists(tmp_photo):
                os.remove(tmp_photo)
            raise HTTPException(status_code=400, detail=f"Could not read the photo: {e}")
        ok, reason = await run_in_threadpool(check_gallery_photo, tmp_photo)
        if not ok:
            os.remove(tmp_photo)
            raise HTTPException(status_code=400, detail=f"Photo can't be used for recognition: {reason}")

    folder_renamed = False
    if renaming and os.path.exists(old_folder):
        try:
            os.rename(old_folder, new_folder)
            folder_renamed = True
        except OSError as e:
            if tmp_photo and os.path.exists(tmp_photo):
                os.remove(tmp_photo)
            raise HTTPException(status_code=500, detail=f"Could not rename the face folder: {e}")

    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                "UPDATE employees SET name = %s, shift_start = %s, shift_end = %s, designation = %s WHERE id = %s AND office_id = %s",
                (name, shift_start, shift_end, designation, employee_id, OFFICE_ID)
            )
            conn.commit()
            cur.close()
    except Exception:
        # Put things back so the folder and the database name stay in step
        if folder_renamed:
            try:
                os.rename(new_folder, old_folder)
            except OSError:
                pass
        if tmp_photo and os.path.exists(tmp_photo):
            os.remove(tmp_photo)
        raise

    if folder_renamed:
        for fn in os.listdir(new_folder):
            if os.path.splitext(fn)[1].lower() in ALLOWED_PHOTO_EXTENSIONS:
                threading.Thread(
                    target=_upload_photo_async,
                    args=(os.path.join(new_folder, fn), f"{FACES_REMOTE}/{new_folder_name}/{fn}"),
                    daemon=True
                ).start()
        try:
            storage.delete_prefix(f"{FACES_REMOTE}/{old_folder_name}")
        except Exception as e:
            print(f"[update_employee] Could not delete old cloud photos: {e}")

    if tmp_photo:
        os.makedirs(new_folder, exist_ok=True)
        photo_path = os.path.join(new_folder, "photo_1.jpg")
        _move_over(tmp_photo, photo_path)
        threading.Thread(target=_upload_photo_async, args=(photo_path, f"{FACES_REMOTE}/{new_folder_name}/photo_1.jpg"), daemon=True).start()

    if renaming or tmp_photo:
        _clear_face_cache()
    else:
        invalidate_employee_cache()

    log_audit_event(
        username=current_user.get("username"),
        user_role=current_user.get("role"),
        action="EMPLOYEE_UPDATED",
        target_module="Employees",
        details=f"Updated employee ID {employee_id} ('{name}', {designation}, shift: {shift_start}-{shift_end})",
        user_id=current_user.get("user_id")
    )

    return {"message": f"Employee {name} updated successfully"}

@app.post("/employees/{employee_id}/photos", dependencies=[Depends(require_hr)])
async def add_employee_photos(
    employee_id: int,
    photos: List[UploadFile] = File(...),
    current_user: dict = Depends(require_hr)
):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, name FROM employees WHERE id = %s AND office_id = %s", (employee_id, OFFICE_ID))
        emp = cur.fetchone()
        cur.close()
    if emp is None:
        raise HTTPException(status_code=404, detail="Employee not found")

    folder_name = _safe_folder_name(emp["name"])
    employee_folder = os.path.join(KNOWN_FACES_DIR, folder_name)
    os.makedirs(employee_folder, exist_ok=True)

    used = []
    for f in os.listdir(employee_folder):
        m = re.match(r"photo_(\d+)\.jpg$", f)
        if m:
            used.append(int(m.group(1)))
    next_index = max(used, default=0) + 1

    accepted, rejected = [], []
    for photo in photos:
        label = photo.filename or "photo"
        try:
            _validate_photo_upload(photo)
        except HTTPException as e:
            rejected.append({"file": label, "reason": e.detail})
            continue

        tmp = _tmp_photo_path()
        try:
            _save_resized_photo(photo, tmp)
            ok, reason = await run_in_threadpool(check_gallery_photo, tmp)
        except Exception as e:
            ok, reason = False, f"Could not read image: {e}"
        if not ok:
            if os.path.exists(tmp):
                os.remove(tmp)
            rejected.append({"file": label, "reason": reason})
            continue

        filename = f"photo_{next_index}.jpg"
        next_index += 1
        dest = os.path.join(employee_folder, filename)
        _move_over(tmp, dest)
        accepted.append((filename, dest))

    if not accepted:
        raise HTTPException(
            status_code=400,
            detail="No usable photos. " + "; ".join(f"{r['file']}: {r['reason']}" for r in rejected)
        )

    with get_db() as conn:
        cur = conn.cursor()
        for filename, _dest in accepted:
            cur.execute("INSERT INTO employee_photos (employee_id, filename) VALUES (%s, %s)", (employee_id, filename))
        conn.commit()
        cur.close()

    for filename, dest in accepted:
        threading.Thread(target=_upload_photo_async, args=(dest, f"{FACES_REMOTE}/{folder_name}/{filename}"), daemon=True).start()

    _clear_face_cache()

    log_audit_event(
        username=current_user.get("username"),
        user_role=current_user.get("role"),
        action="EMPLOYEE_PHOTOS_ADDED",
        target_module="Employees",
        details=f"Added {len(accepted)} photo(s) for '{emp['name']}' ({len(rejected)} rejected)",
        user_id=current_user.get("user_id")
    )

    return {"message": f"{len(accepted)} photo(s) added", "accepted": len(accepted), "rejected": rejected}

@app.delete("/employees/{employee_id}", dependencies=[Depends(require_hr)])
def delete_employee(employee_id: int, current_user: dict = Depends(require_hr)):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM employees WHERE id = %s AND office_id = %s", (employee_id, OFFICE_ID))
        emp = cur.fetchone()
        if emp is None:
            cur.close()
            return {"message": "Employee not found"}

        cur.execute("DELETE FROM employees WHERE id = %s AND office_id = %s", (employee_id, OFFICE_ID))
        conn.commit()
        cur.close()

    folder_name = _safe_folder_name(emp["name"])
    employee_folder = os.path.join(KNOWN_FACES_DIR, folder_name)
    try:
        if os.path.exists(employee_folder):
            shutil.rmtree(employee_folder)
        else:
            print(f"[delete_employee] Folder not found: {employee_folder}")
    except Exception as e:
        print(f"[delete_employee] Face folder cleanup failed for '{emp['name']}': {e}")
    # Refresh first, so a cloud error below can't leave the deleted person matchable
    _clear_face_cache()
    try:
        from recognition import invalidate_gallery
        invalidate_gallery()
    except Exception as e:
        print(f"[delete_employee] Gallery invalidate failed: {e}")
    try:
        storage.delete_prefix(f"{FACES_REMOTE}/{folder_name}")
    except Exception as e:
        print(f"[delete_employee] Cloud photo cleanup failed for '{emp['name']}': {e}")

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
    "min_matching_photos",
    "match_distance_threshold",
    "match_margin",
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

    if key in {"notify_motion", "notify_person"}:
        value = value.lower()
        if value not in {"true", "false"}:
            raise HTTPException(status_code=400, detail=f"{key} must be true or false")

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

    elif key in {"match_distance_threshold", "match_margin"}:
        if value != "":
            try:
                number = float(value)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"{key} must be a number")
            if number < 0:
                raise HTTPException(status_code=400, detail=f"{key} cannot be negative")
            if key == "match_margin" and number > 1:
                raise HTTPException(status_code=400, detail="match_margin must be between 0 and 1")
            value = str(number)

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

# --- Guard Alert Protocol (Owner, CEO & Guard) ---

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
    clause, p = _scope(current_user)
    with get_db() as conn:
        cur = conn.cursor()

        cur.execute(
            "UPDATE incidents SET status = 'acknowledged' WHERE id = %s" + clause,
            tuple([alert_id] + p)
        )

        cur.execute(
            "UPDATE alerts SET status = 'acknowledged', acknowledged_by = %s, acknowledged_at = %s, "
            "ack_proof_image = %s, ack_notes = %s WHERE (incident_id = %s OR id = %s)" + clause,
            tuple([current_user.get("username"), now_iso, proof_url, notes.strip(), alert_id, alert_id] + p)
        )
        conn.commit()
        cur.close()

    log_audit_event(
        username=current_user.get("username"),
        user_role=current_user.get("role"),
        action="ALERT_ACKNOWLEDGED",
        target_module="Alerts",
        details=f"Acknowledged alert/incident #{alert_id}. Notes: {notes.strip()}",
        proof_image=proof_url,
        user_id=current_user.get("user_id")
    )

    return {"ok": True, "message": f"Alert #{alert_id} acknowledged successfully"}

# --- Records & Ledgers (Owner & CEO) ---

@app.get("/records", dependencies=[Depends(verify_token)])
def get_records(
    camera: str = None,
    status: str = None,
    date: str = None,
    page: int = 1,
    limit: int = 10,
    office_id: Optional[int] = Depends(get_office_id)
):
    offset = (page - 1) * limit

    base_query = """
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
    clause, p = office_sql(office_id, "i.office_id")
    base_query += clause
    params = list(p)

    if camera:
        base_query += " AND (i.camera_name = %s OR i.camera_name LIKE %s)"
        params.extend([camera, f"%{camera}%"])

    if status:
        status_map = {"flag": "high", "review": "medium", "clear": "low"}
        if status in status_map:
            base_query += " AND i.priority = %s"
            params.append(status_map[status])
        elif status in ("high", "medium", "low"):
            base_query += " AND i.priority = %s"
            params.append(status)
    if date:
        base_query += " AND i.last_seen LIKE %s"
        params.append(f"{date}%")

    count_query = "SELECT COUNT(*) AS count " + base_query
    data_query = """
        SELECT i.id, i.office_id, i.person_name, i.alert_type, i.priority, i.camera_name, i.zone_name,
            i.first_seen, i.last_seen, i.alert_count, i.status,
            a.message, a.snapshot_filename
    """ + base_query + " ORDER BY i.last_seen DESC LIMIT %s OFFSET %s"

    data_params = params + [limit, offset]

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(count_query, tuple(params))
        total = cur.fetchone()["count"]

        cur.execute(data_query, tuple(data_params))
        rows = cur.fetchall()
        cur.close()

    results = []
    for r in rows:
        rec = dict(r)
        rec["timestamp"] = rec.get("last_seen")
        rec["occurrences"] = rec.get("alert_count")
        results.append(rec)

    return {
        "records": results,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": math.ceil(total / limit) if limit > 0 else 1
    }

@app.delete("/records/{alert_id}", dependencies=[Depends(require_admin)])
def delete_record(alert_id: int, current_user: dict = Depends(require_admin)):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM alerts WHERE incident_id = %s AND office_id = %s", (alert_id, OFFICE_ID))
        cur.execute("DELETE FROM alert_records WHERE incident_id = %s AND office_id = %s", (alert_id, OFFICE_ID))
        cur.execute("DELETE FROM incidents WHERE id = %s AND office_id = %s", (alert_id, OFFICE_ID))
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

@app.delete("/records", dependencies=[Depends(require_admin)])
def clear_all_records(current_user: dict = Depends(require_admin)):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM alerts WHERE office_id = %s", (OFFICE_ID,))
        alerts_deleted = cur.rowcount
        cur.execute("DELETE FROM alert_records WHERE office_id = %s", (OFFICE_ID,))
        cur.execute("DELETE FROM incidents WHERE office_id = %s", (OFFICE_ID,))
        incidents_deleted = cur.rowcount
        conn.commit()
        cur.close()
    log_audit_event(username=current_user.get("username"), 
        user_role=current_user.get("role"), 
        action="RECORDS_CLEARED", target_module="Records",
        details=f"Cleared all records ({alerts_deleted} alerts, {incidents_deleted} incidents)",
        user_id=current_user.get("user_id"))
    return {"message": "All records cleared", "alerts_deleted": alerts_deleted, "incidents_deleted": incidents_deleted}

@app.get("/records/export", dependencies=[Depends(require_staff)])
def export_records(
    camera: str = None,
    status: str = None,
    date: str = None,
    office_id: Optional[int] = Depends(get_office_id)
):
    clause, p = office_sql(office_id)
    query = "SELECT person_name, alert_type, priority, message, timestamp, camera_name FROM alerts WHERE 1=1" + clause
    params = list(p)

    if camera:
        query += " AND (camera_name = %s OR camera_name LIKE %s)"
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
            rec.get("camera_name") or "Front Door",
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
    zone_name: Optional[str] = "Manual Entry"

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

def _resolve_attendance_range(start_date=None, end_date=None, date=None):
    if start_date and end_date:
        return start_date, end_date
    if start_date:
        return start_date, start_date
    if end_date:
        return end_date, end_date
    if date:
        return date, date
    today = datetime.now().date().isoformat()
    return today, today

def _build_attendance_filters(employee_id=None, zone_name=None, status=None, search=None, office_id=None):
    where_clauses = []
    params = []

    if office_id is not None:
        where_clauses.append("emp.office_id = %s")
        params.append(office_id)

    if employee_id:
        where_clauses.append("emp.id = %s")
        params.append(int(employee_id))

    if zone_name and zone_name.strip():
        where_clauses.append("a.zone_name = %s")
        params.append(zone_name.strip())

    if status and status.strip() and status.lower() != "all":
        where_clauses.append(
            "LOWER(CASE WHEN a.id IS NULL THEN 'absent' ELSE COALESCE(a.status, 'present') END) = LOWER(%s)"
        )
        params.append(status.strip())

    if search and search.strip():
        where_clauses.append("LOWER(emp.name) LIKE %s")
        params.append(f"%{search.strip().lower()}%")

    where_sql = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
    return where_sql, params

@app.get("/attendance", dependencies=[Depends(verify_token)])
def get_attendance(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    date: Optional[str] = None,
    employee_id: Optional[int] = None,
    zone_name: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    office_id: Optional[int] = Depends(get_office_id)
):
    range_start, range_end = _resolve_attendance_range(start_date, end_date, date)
    where_sql, filter_params = _build_attendance_filters(employee_id, zone_name, status, search, office_id)

    base_from = (
        "FROM employees emp "
        "CROSS JOIN generate_series(%s::date, %s::date, interval '1 day') AS d(day) "
        "LEFT JOIN attendance a ON a.employee_id = emp.id AND a.attendance_date = d.day::date::text"
    )
    range_params = [range_start, range_end]

    with get_db() as conn:
        cur = conn.cursor()
        count_query = "SELECT COUNT(*) as total " + base_from + where_sql
        cur.execute(count_query, tuple(range_params + filter_params))
        count_row = cur.fetchone()
        total = count_row["total"] if count_row else 0

        offset = max(0, (page - 1) * limit)
        data_query = (
            "SELECT emp.id as employee_id, emp.office_id, emp.name, emp.designation, emp.shift_start, emp.shift_end, "
            "d.day::date::text as attendance_date, "
            "a.first_seen, a.last_seen, "
            "a.zone_name, "
            "CASE WHEN a.id IS NULL THEN 'absent' ELSE COALESCE(a.status, 'present') END as status, "
            "a.override_reason, "
            "COALESCE(a.is_override, FALSE) as is_override "
            + base_from + where_sql
            + " ORDER BY d.day DESC, emp.name ASC LIMIT %s OFFSET %s"
        )
        data_params = range_params + filter_params + [limit, offset]
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
        "start_date": range_start,
        "end_date": range_end,
        "date": date or range_start
    }

@app.get("/attendance/export", dependencies=[Depends(verify_token)])
def export_attendance(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    date: Optional[str] = None,
    employee_id: Optional[int] = None,
    zone_name: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    format: Optional[str] = "csv",
    office_id: Optional[int] = Depends(get_office_id)
):
    range_start, range_end = _resolve_attendance_range(start_date, end_date, date)
    where_sql, filter_params = _build_attendance_filters(employee_id, zone_name, status, search, office_id)

    base_from = (
        "FROM employees emp "
        "CROSS JOIN generate_series(%s::date, %s::date, interval '1 day') AS d(day) "
        "LEFT JOIN attendance a ON a.employee_id = emp.id AND a.attendance_date = d.day::date::text"
    )
    range_params = [range_start, range_end]

    with get_db() as conn:
        cur = conn.cursor()
        data_query = (
            "SELECT emp.id as employee_id, emp.name, emp.designation, "
            "d.day::date::text as attendance_date, a.first_seen, a.last_seen, "
            "COALESCE(a.zone_name, 'Front Door') as zone_name, "
            "CASE WHEN a.id IS NULL THEN 'absent' ELSE COALESCE(a.status, 'present') END as status, "
            "a.override_reason, "
            "COALESCE(a.is_override, FALSE) as is_override "
            + base_from + where_sql
            + " ORDER BY d.day DESC, emp.name ASC"
        )
        cur.execute(data_query, tuple(range_params + filter_params))
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
            rec.get("zone_name") or "Front Door",
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
        cur.execute("SELECT id, name FROM employees WHERE id = %s AND office_id = %s", (req.employee_id, OFFICE_ID))
        emp = cur.fetchone()
        if not emp:
            cur.close()
            raise HTTPException(status_code=404, detail="Employee not found")

        first_seen = _normalize_time(req.date, req.first_seen_at, "09:00:00")
        last_seen = _normalize_time(req.date, req.last_seen_at, "18:00:00")
        status = (req.status or "present").lower()
        reason = req.reason or "Manual reconciliation"
        zone = req.zone_name or "Manual Entry"

        cur.execute("SELECT id FROM attendance WHERE employee_id = %s AND attendance_date = %s", (req.employee_id, req.date))
        existing = cur.fetchone()

        if existing:
            cur.execute(
                "UPDATE attendance SET first_seen = %s, last_seen = %s, zone_name = %s, status = %s, "
                "override_reason = %s, is_override = TRUE WHERE employee_id = %s AND attendance_date = %s",
                (first_seen, last_seen, zone, status, reason, req.employee_id, req.date)
            )
        else:
            cur.execute(
                "INSERT INTO attendance (office_id, employee_id, attendance_date, first_seen, last_seen, zone_name, status, override_reason, is_override) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, TRUE)",
                (OFFICE_ID, req.employee_id, req.date, first_seen, last_seen, zone, status, reason)
            )

        conn.commit()

        cur.execute(
            "SELECT a.id, a.employee_id, e.name, a.attendance_date, a.first_seen, a.last_seen, "
            "a.zone_name, a.status, a.override_reason, a.is_override "
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

@app.get("/status", dependencies=[Depends(require_guard)])
def get_status(office_id: Optional[int] = Depends(get_office_id)):
    now = datetime.now()
    cutoff = now - timedelta(seconds=config.CURRENTLY_DETECTED_TIMEOUT_SEC)
    clause, p = office_sql(office_id)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT office_id, person_name, MAX(last_seen) AS last_seen, STRING_AGG(camera_name, ', ') AS camera_name "
            "FROM currently_detected WHERE last_seen > %s" + clause +
            " GROUP BY office_id, person_name ORDER BY MAX(last_seen) DESC",
            tuple([cutoff.isoformat()] + p)
        )
        detected_rows = cur.fetchall()

        cur.execute(
            "SELECT id, office_id, person_name, alert_type, priority, message, timestamp, snapshot_filename, status, "
            "acknowledged_by, acknowledged_at, ack_proof_image, ack_notes FROM alerts WHERE 1=1" + clause +
            " ORDER BY timestamp DESC LIMIT 50",
            tuple(p)
        )
        alert_rows = cur.fetchall()
        cur.close()

    detected = [{"name": r["person_name"], "camera": r["camera_name"], "last_seen": r["last_seen"], "office_id": r["office_id"]} for r in detected_rows]
    alerts = [dict(r) for r in alert_rows]
    return {"currently_detected": detected, "recent_alerts": alerts}

# --- Camera Streaming & Management ---

def _is_super(user):
    return (user.get("role") or "").lower() in ("owner", "ceo")

def _scope(user, col="office_id"):
    if _is_super(user):
        return "", []
    return f" AND {col} = %s", [OFFICE_ID]

@app.get("/cameras", dependencies=[Depends(require_guard)])
def list_cameras(office_id: Optional[int] = Depends(get_office_id)):
    now = datetime.utcnow()
    clause, p = office_sql(office_id)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, name, zone_name, enabled, office_id, last_heartbeat, tampered FROM cameras WHERE 1=1"
            + clause + " ORDER BY office_id, id",
            tuple(p)
        )
        rows = cur.fetchall()
        cur.close()
    result = []
    for cam in rows:
        hb = None
        if cam["last_heartbeat"]:
            try:
                hb = datetime.fromisoformat(cam["last_heartbeat"])
            except ValueError:
                hb = None
        is_live = hb is not None and (now - hb).total_seconds() <= config.CAMERA_OFFLINE_THRESHOLD_SEC
        if not is_live:
            cam_status = "offline"
        elif cam["tampered"]:
            cam_status = "tampered"
        else:
            cam_status = "online"
        result.append({
            "id": cam["id"], "name": cam["name"], "zone_name": cam["zone_name"],
            "enabled": cam["enabled"], "live": is_live, "status": cam_status,
            "office_id": cam["office_id"],
        })
    return result

class CameraRequest(BaseModel):
    id: str
    name: str
    rtsp_url: str
    zone_name: str = None
    enabled: bool = True
    office_id: Optional[int] = None

@app.post("/cameras", dependencies=[Depends(require_admin)])
def add_camera(payload: CameraRequest, current_user: dict = Depends(require_admin)):
    target = payload.office_id if payload.office_id is not None else OFFICE_ID
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM offices WHERE id = %s", (target,))
        if not cur.fetchone():
            cur.close()
            raise HTTPException(status_code=400, detail="Unknown office")
        cur.execute("SELECT 1 FROM cameras WHERE id = %s", (payload.id,))
        if cur.fetchone():
            cur.close()
            raise HTTPException(status_code=400, detail=f"Camera ID '{payload.id}' is already in use. Choose a different ID.")
        cur.execute(
            "INSERT INTO cameras (id, name, rtsp_url, zone_name, enabled, office_id) VALUES (%s, %s, %s, %s, %s, %s)",
            (payload.id, payload.name, payload.rtsp_url, payload.zone_name or payload.id, payload.enabled, target)
        )
        conn.commit()
        cur.close()

    if payload.enabled and target == OFFICE_ID:
        threading.Thread(target=start_single_camera, args=({
            "id": payload.id,
            "name": payload.name,
            "source": payload.rtsp_url,
            "zone_name": payload.zone_name or payload.id,
        },), daemon=True).start()

    log_audit_event(
        username=current_user.get("username"),
        user_role=current_user.get("role"),
        action="CAMERA_ADDED",
        target_module="Cameras",
        details=f"Added camera '{payload.name}' ({payload.id}) at zone '{payload.zone_name}' in office {target}",
        user_id=current_user.get("user_id")
    )

    return {"message": "Camera added and connected" if target == OFFICE_ID else "Camera saved. Restart that office's server to connect it."}

@app.put("/cameras/{camera_id}", dependencies=[Depends(require_admin)])
def update_camera(camera_id: str, payload: CameraRequest, current_user: dict = Depends(require_admin)):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT office_id FROM cameras WHERE id = %s", (camera_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            raise HTTPException(status_code=404, detail="Camera not found")
        cam_office = row["office_id"]
        cur.execute(
            "UPDATE cameras SET name=%s, rtsp_url=%s, zone_name=%s, enabled=%s WHERE id=%s",
            (payload.name, payload.rtsp_url, payload.zone_name or camera_id, payload.enabled, camera_id)
        )
        conn.commit()
        cur.close()

    if cam_office == OFFICE_ID:
        def _reconnect():
            stop_single_camera(camera_id)
            if payload.enabled:
                start_single_camera({
                    "id": camera_id,
                    "name": payload.name,
                    "source": payload.rtsp_url,
                    "zone_name": payload.zone_name or camera_id,
                })
        threading.Thread(target=_reconnect, daemon=True).start()

    log_audit_event(
        username=current_user.get("username"),
        user_role=current_user.get("role"),
        action="CAMERA_UPDATED",
        target_module="Cameras",
        details=f"Updated camera '{payload.name}' ({camera_id})",
        user_id=current_user.get("user_id")
    )

    return {"message": "Camera updated"}

@app.delete("/cameras/{camera_id}", dependencies=[Depends(require_admin)])
def delete_camera(camera_id: str, current_user: dict = Depends(require_admin)):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT office_id FROM cameras WHERE id = %s", (camera_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            raise HTTPException(status_code=404, detail="Camera not found")
        cam_office = row["office_id"]
        cur.execute("DELETE FROM cameras WHERE id = %s", (camera_id,))
        deleted = cur.rowcount
        conn.commit()
        cur.close()

    if deleted == 0:
        raise HTTPException(status_code=404, detail="Camera was not deleted")

    if cam_office == OFFICE_ID:
        threading.Thread(target=stop_single_camera, args=(camera_id,), daemon=True).start()

    log_audit_event(
        username=current_user.get("username"),
        user_role=current_user.get("role"),
        action="CAMERA_DELETED",
        target_module="Cameras",
        details=f"Deleted camera {camera_id} (office {cam_office})",
        user_id=current_user.get("user_id")
    )

    return {"deleted": deleted, "id": camera_id, "message": "Camera deleted"}

def _seed_cameras_from_config():
    if OFFICE_ID != 1:
        return  # other offices add their own cameras from the Admin page
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) as count FROM cameras WHERE office_id = %s", (OFFICE_ID,))
        count = cur.fetchone()["count"]
        if count == 0:
            for cam in config.CAMERAS:
                cur.execute(
                    "INSERT INTO cameras (id, name, rtsp_url, zone_name, enabled, office_id) VALUES (%s, %s, %s, %s, %s, %s)",
                    (cam["id"], cam["name"], cam["source"], cam.get("zone_name", cam.get("location", cam["id"])), True, OFFICE_ID)
                )
            conn.commit()
        cur.close()

# --- Zones ---

class ZoneRequest(BaseModel):
    id: str
    name: str
    office_id: Optional[int] = None

@app.get("/zones", dependencies=[Depends(verify_token)])
def list_zones(office_id: Optional[int] = Depends(get_office_id)):
    clause, p = office_sql(office_id)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, name, office_id FROM zones WHERE 1=1" + clause + " ORDER BY office_id, id", tuple(p))
        rows = cur.fetchall()
        cur.close()
    return [dict(r) for r in rows]

@app.post("/zones", dependencies=[Depends(require_admin)])
def add_zone(payload: ZoneRequest, current_user: dict = Depends(require_admin)):
    target = payload.office_id if payload.office_id is not None else OFFICE_ID
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM zones WHERE id = %s", (payload.id,))
        if cur.fetchone():
            cur.close()
            raise HTTPException(status_code=400, detail=f"Zone ID '{payload.id}' is already in use. Choose a different ID.")
        cur.execute("INSERT INTO zones (id, name, office_id) VALUES (%s, %s, %s)", (payload.id, payload.name, target))
        conn.commit()
        cur.close()

    log_audit_event(
        username=current_user.get("username"),
        user_role=current_user.get("role"),
        action="ZONE_ADDED",
        target_module="Zones",
        details=f"Added zone '{payload.name}' ({payload.id})",
        user_id=current_user.get("user_id")
    )

    return {"message": "Zone added"}

@app.delete("/zones/{zone_id}", dependencies=[Depends(require_admin)])
def delete_zone(zone_id: str, current_user: dict = Depends(require_admin)):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM zones WHERE id = %s", (zone_id,))
        conn.commit()
        cur.close()

    log_audit_event(
        username=current_user.get("username"),
        user_role=current_user.get("role"),
        action="ZONE_DELETED",
        target_module="Zones",
        details=f"Deleted zone {zone_id}",
        user_id=current_user.get("user_id")
    )

    return {"message": "Zone deleted"}

# --- Incidents ---

@app.get("/incidents", dependencies=[Depends(verify_token)])
def list_incidents(status: str = None, limit: int = 100, office_id: Optional[int] = Depends(get_office_id)):
    query = """
        SELECT i.*,
            COALESCE(
                (SELECT a.snapshot_filename FROM alerts a
                 WHERE a.incident_id = i.id AND a.snapshot_filename IS NOT NULL
                 ORDER BY a.timestamp DESC LIMIT 1),
                (SELECT r.snapshot_filename FROM alert_records r
                 WHERE r.incident_id = i.id AND r.snapshot_filename IS NOT NULL
                 ORDER BY r.timestamp DESC LIMIT 1)
            ) AS snapshot_filename
        FROM incidents i
        WHERE 1=1
    """
    clause, p = office_sql(office_id, "i.office_id")
    query += clause
    params = list(p)
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

@app.put("/incidents/{incident_id}")
def update_incident(incident_id: int, payload: IncidentUpdateRequest, current_user: dict = Depends(require_staff)):
    status = payload.status.strip().lower()
    if status not in ["new", "acknowledged", "dismissed", "resolved"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    clause, p = _scope(current_user)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE incidents SET status = %s WHERE id = %s" + clause, tuple([status, incident_id] + p))
        conn.commit()
        cur.close()
    return {"message": "Incident updated"}

# --- Reporting ---

@app.get("/reports/attendance-summary", dependencies=[Depends(require_staff)])
def attendance_summary(start_date: str = None, end_date: str = None, office_id: Optional[int] = Depends(get_office_id)):
    start_date = start_date or datetime.now().date().isoformat()
    end_date = end_date or start_date
    clause, p = office_sql(office_id, "e.office_id")
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT e.office_id, e.name, a.attendance_date, a.first_seen, a.last_seen FROM attendance a "
            "JOIN employees e ON e.id = a.employee_id "
            "WHERE a.attendance_date BETWEEN %s AND %s" + clause +
            " ORDER BY a.attendance_date DESC, e.name",
            tuple([start_date, end_date] + p)
        )
        rows = cur.fetchall()
        cur.close()
    return [dict(r) for r in rows]

@app.get("/reports/alert-frequency", dependencies=[Depends(require_staff)])
def alert_frequency(start_date: str = None, end_date: str = None, office_id: Optional[int] = Depends(get_office_id)):
    start_date = start_date or datetime.now().date().isoformat()
    end_date = end_date or start_date
    clause, p = office_sql(office_id)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT alert_type, priority, COUNT(*) as count FROM alerts "
            "WHERE timestamp BETWEEN %s AND %s" + clause +
            " GROUP BY alert_type, priority ORDER BY count DESC",
            tuple([f"{start_date}T00:00:00", f"{end_date}T23:59:59"] + p)
        )
        rows = cur.fetchall()
        cur.close()
    return [dict(r) for r in rows]

@app.get("/reports/incident-response-times", dependencies=[Depends(require_staff)])
def incident_response_times(start_date: str = None, end_date: str = None, office_id: Optional[int] = Depends(get_office_id)):
    start_date = start_date or datetime.now().date().isoformat()
    end_date = end_date or start_date
    clause, p = office_sql(office_id)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, office_id, person_name, alert_type, priority, status, first_seen, last_seen, alert_count "
            "FROM incidents WHERE first_seen BETWEEN %s AND %s" + clause + " ORDER BY first_seen DESC",
            tuple([f"{start_date}T00:00:00", f"{end_date}T23:59:59"] + p)
        )
        rows = cur.fetchall()
        cur.close()
    return [dict(r) for r in rows]

@app.put("/records/{alert_id}/permanent", dependencies=[Depends(require_admin)])
def mark_permanent(alert_id: int, permanent: bool = True):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE alerts SET permanent = %s WHERE id = %s AND office_id = %s", (permanent, alert_id, OFFICE_ID))
        updated = cur.rowcount
        conn.commit()
        cur.close()
    if updated == 0:
        raise HTTPException(status_code=404, detail="Record not found or already archived")
    return {"message": "Updated"}

# --- Streaming ---
async def _mjpeg_generator(camera_id, request):
    encode_params = [cv2.IMWRITE_JPEG_QUALITY, 70]
    offline_frame = cv2.imread("snapshots/offline.jpg") if os.path.exists("snapshots/offline.jpg") else None
    offline_bytes = b""
    if offline_frame is not None:
        _, buffer = cv2.imencode(".jpg", offline_frame, encode_params)
        offline_bytes = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"

    while True:
        if await request.is_disconnected():
            break
        frame = get_current_frame(camera_id)
        if frame is not None:
            buffer = await run_in_threadpool(lambda: cv2.imencode(".jpg", frame, encode_params)[1])
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"
            await asyncio.sleep(1 / 8)
        else:
            yield offline_bytes
            await asyncio.sleep(1.0)

def _guard_must_be_local(current_user, office_id):
    """Local disk and live frames belong to this server's office only."""
    if current_user.get("role") == "guard" and office_id != OFFICE_ID:
        raise HTTPException(status_code=403, detail="Not available for your office on this server")

@app.get("/snapshots/{filename:path}")
def get_snapshot(filename: str, current_user: dict = Depends(verify_token), office_id: Optional[int] = Depends(get_office_id)):
    _guard_must_be_local(current_user, office_id)
    base = os.path.realpath("snapshots")
    target = os.path.realpath(os.path.join(base, filename))
    if not target.startswith(base + os.sep) or not os.path.isfile(target):
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return FileResponse(target, media_type="image/jpeg")

def _local_recording_path(ref: str):
    """Map a 'local:...' reference to a real file path, or None if it isn't safe/valid."""
    rel = ref[len("local:"):].replace("\\", "/").lstrip("/")
    if not rel or ".." in rel.split("/"):
        return None
    # Office 1 files sit directly in the recordings folder, other offices in o2/, o3/, ...
    if OFFICE_ID == 1:
        if "/" in rel:
            return None
    elif not rel.startswith(f"o{OFFICE_ID}/"):
        return None
    root = os.path.realpath(os.getenv("RECORDINGS_DIR", "recordings"))
    target = os.path.realpath(os.path.join(root, rel))
    if not target.startswith(root + os.sep) or not os.path.isfile(target):
        return None
    return target


def _iter_file_range(path, start, end, chunk_size=1024 * 1024):
    with open(path, "rb") as f:
        f.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            data = f.read(min(chunk_size, remaining))
            if not data:
                break
            remaining -= len(data)
            yield data


def _serve_local_video(path: str, request: Request):
    """Serves the clip with Range support so the video player can seek."""
    file_size = os.path.getsize(path)
    base_headers = {"Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3000"}
    range_header = request.headers.get("range")
    if not range_header:
        return FileResponse(path, media_type="video/mp4", headers=base_headers)

    m = re.match(r"bytes=(\d*)-(\d*)$", range_header.strip())
    if not m or (m.group(1) == "" and m.group(2) == ""):
        return Response(status_code=416, headers={"Content-Range": f"bytes */{file_size}"})

    if m.group(1) == "":
        # suffix range: last N bytes
        start = max(0, file_size - int(m.group(2)))
        end = file_size - 1
    else:
        start = int(m.group(1))
        end = int(m.group(2)) if m.group(2) else file_size - 1
        end = min(end, file_size - 1)

    if start >= file_size or start > end:
        return Response(status_code=416, headers={"Content-Range": f"bytes */{file_size}"})

    headers = {
        **base_headers,
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Content-Length": str(end - start + 1),
    }
    return StreamingResponse(
        _iter_file_range(path, start, end),
        status_code=206,
        media_type="video/mp4",
        headers=headers,
    )


@app.get("/media", dependencies=[Depends(verify_token)])
def get_media(u: str, request: Request):
    # New recordings are stored on local disk as "local:<relative path>"
    if u.startswith("local:"):
        path = _local_recording_path(u)
        if not path:
            raise HTTPException(status_code=404, detail="Recording not found")
        return _serve_local_video(path, request)

    # Everything else (snapshots, old cloud recordings) keeps using signed URLs
    signed = storage.signed_url_for(u)
    if not signed:
        raise HTTPException(status_code=404, detail="Media not found")
    return RedirectResponse(
        signed,
        status_code=302,
        headers={"Cache-Control": "private, max-age=3000"},
    )

@app.get("/video_feed/{camera_id}")
async def video_feed(camera_id: str, request: Request, current_user: dict = Depends(verify_token), office_id: Optional[int] = Depends(get_office_id)):
    _guard_must_be_local(current_user, office_id)
    return StreamingResponse(
        _mjpeg_generator(camera_id, request),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )