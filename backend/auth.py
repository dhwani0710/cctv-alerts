from fastapi import Header, HTTPException, Query, Request
from typing import Optional
from auth_users import decode_token
from database import get_db, OFFICE_ID
import jwt

def verify_token(authorization: Optional[str] = Header(None), token: Optional[str] = Query(None)):
    raw_token = None
    if authorization and authorization.startswith("Bearer "):
        raw_token = authorization.replace("Bearer ", "")
    elif token:
        raw_token = token
    if not raw_token:
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization")
    try:
        payload = decode_token(raw_token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if "role" in payload:
        payload["role"] = payload["role"].lower()
    return payload

def require_admin(authorization: Optional[str] = Header(None)):
    payload = verify_token(authorization)
    if payload.get("role") not in ("owner", "ceo"):
        raise HTTPException(status_code=403, detail="Admin access required (Owner or CEO)")
    return payload

def require_hr(authorization: Optional[str] = Header(None)):
    payload = verify_token(authorization)
    if payload.get("role") not in ("owner", "ceo", "hr"):
        raise HTTPException(status_code=403, detail="HR or Admin access required")
    return payload

def require_guard(authorization: Optional[str] = Header(None)):
    payload = verify_token(authorization)
    if payload.get("role") not in ("owner", "ceo", "guard"):
        raise HTTPException(status_code=403, detail="Security Guard or Admin access required")
    return payload

def require_staff(authorization: Optional[str] = Header(None)):
    payload = verify_token(authorization)
    if payload.get("role") not in ("owner", "ceo", "hr", "guard"):
        raise HTTPException(status_code=403, detail="Staff access required")
    return payload

def require_owner(authorization: Optional[str] = Header(None)):
    payload = verify_token(authorization)
    if payload.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Owner access required")
    return payload


def office_sql(office_id, col="office_id"):
    """Returns (sql_fragment, params). None = all offices."""
    if office_id is None:
        return "", []
    return f" AND {col} = %s", [office_id]


def get_office_id(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None),
    x_office_id: Optional[str] = Header(None),
    office_id: Optional[str] = Query(None),
):
    """Guard: forced to the office stored in DB (client input ignored).
    Everyone else: requested office, or None = all offices."""
    payload = verify_token(authorization, token)
    if payload.get("role") == "guard":
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("SELECT office_id FROM users WHERE id = %s", (payload.get("user_id"),))
            row = cur.fetchone()
            cur.close()
        if not row or row["office_id"] is None:
            raise HTTPException(status_code=403, detail="No office assigned to this guard")
        return int(row["office_id"])
    raw = x_office_id or office_id
    if raw in (None, "", "all"):
        return None
    try:
        return int(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail="Bad office id")

def enforce_write_office(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_office_id: Optional[str] = Header(None),
    office_id: Optional[str] = Query(None),
):
    """Global guard: writes only hit this server's own office.
    Owner and CEO may write to any office, except employee/attendance paths
    (those need this server's local face photos)."""
    if request.method not in ("POST", "PUT", "DELETE"):
        return
    path = request.url.path
    if path.startswith("/auth/") or path.startswith("/users"):
        return
    payload = verify_token(authorization, None)
    if payload.get("role") in ("owner", "ceo") and not (
        path.startswith("/employees") or path.startswith("/attendance")
    ):
        return
    target = get_office_id(authorization, None, x_office_id, office_id)
    if target is not None and target != OFFICE_ID:
        raise HTTPException(
            status_code=409,
            detail=f"Changes for office {target} must be made on that office's own server",
        )