import os
import shutil
import cv2
import time
import csv
import io
import math
from typing import List, Optional
from fastapi import FastAPI, UploadFile, Form, File, Depends, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from database import init_db, get_db
from camera_worker import start_camera_threads, get_current_frame, start_health_check_thread, get_camera_heartbeat, start_escalation_thread
from datetime import datetime, timedelta
import config
from auth import verify_token, require_admin, require_staff
from auth_users import verify_password, create_token, hash_password
from settings_store import load_settings, save_settings
import storage
from PIL import Image, ImageOps
from retention import start_retention_thread

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
    start_escalation_thread()
    start_retention_thread()

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
        if role not in ["ceo", "owner", "guard", "hr"]:
            raise HTTPException(status_code=400, detail="Role must be ceo, owner, guard, or hr")
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

@app.post("/auth/login")
async def login(payload: LoginRequest):
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

from app_settings import get_all_settings, set_setting

@app.get("/app-settings", dependencies=[Depends(require_admin)])
def get_app_settings():
    return get_all_settings()

class AppSettingRequest(BaseModel):
    key: str
    value: str

@app.post("/app-settings", dependencies=[Depends(require_admin)])
def update_app_setting(payload: AppSettingRequest):
    allowed_keys = [
        "min_matching_photos", "match_distance_threshold",
        "overstay_low_threshold_min", "overstay_medium_threshold_min",
        "alert_dedupe_window_sec", "escalation_low_to_medium_sec", "escalation_medium_to_high_sec",
    ]
    if payload.key not in allowed_keys:
        raise HTTPException(status_code=400, detail="Unknown setting key")
    set_setting(payload.key, payload.value)
    return {"message": "Setting updated"}

@app.get("/records", dependencies=[Depends(verify_token)])
def get_records(camera: str = None, status: str = None, date: str = None, page: int = 1, limit: int = 10):
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
    params = []

    if camera:
        base_query += " AND (i.camera_id = %s OR i.camera_id LIKE %s)"
        params.extend([camera, f"%{camera}%"])

    if status:
        status_map = {"flag": "high", "review": "medium", "clear": "low"}
        base_query += " AND i.priority = %s"
        params.append(status_map.get(status, status))

    if date:
        base_query += " AND i.last_seen LIKE %s"
        params.append(f"{date}%")

    count_query = "SELECT COUNT(*) AS count " + base_query
    data_query = """
        SELECT i.id, i.person_name, i.alert_type, i.priority, i.camera_id, i.zone_id,
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

@app.delete("/records/{alert_id}", dependencies=[Depends(require_staff)])
def delete_record(alert_id: int):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM alerts WHERE id = %s", (alert_id,))
        conn.commit()
        cur.close()
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

# --- Attendance Models, Helpers & Endpoints ---
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
    output.write('\ufeff')  # UTF-8 BOM for Microsoft Excel
    writer = csv.writer(output)

    writer.writerow([
        "Date",
        "Employee ID",
        "Employee Name",
        "Designation",
        "First Seen (In)",
        "Last Seen (Out)",
        "Total Hours",
        "Zone / Location",
        "Status",
        "Method",
        "Override Reason"
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
    if role not in ["ceo", "owner", "guard", "hr"]:
        raise HTTPException(status_code=400, detail="Role must be ceo, owner, guard, or hr")
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

        result = []
        for r in rows:
            row = dict(r)
            cur.execute(
                "SELECT snapshot_filename FROM alerts WHERE incident_id = %s AND snapshot_filename IS NOT NULL ORDER BY timestamp DESC LIMIT 1",
                (r["id"],)
            )
            snap = cur.fetchone()
            row["snapshot_filename"] = snap["snapshot_filename"] if snap else None
            result.append(row)
        cur.close()
    return result

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
        conn.commit()
        cur.close()
    return {"message": "Updated"}