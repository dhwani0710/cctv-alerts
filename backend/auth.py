# backend/auth.py — replace entirely with ft3's version
from fastapi import Header, HTTPException, Query, Depends
from typing import Optional, List
from auth_users import decode_token
import jwt

VALID_ROLES = {"owner", "ceo", "admin", "hr", "manager", "guard"}

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

def require_owner(authorization: Optional[str] = Header(None)):
    payload = verify_token(authorization)
    if payload.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Owner exclusive access required")
    return payload

def require_admin(authorization: Optional[str] = Header(None)):
    payload = verify_token(authorization)
    if payload.get("role") not in ("owner", "ceo", "admin"):
        raise HTTPException(status_code=403, detail="Admin access required (Owner or CEO)")
    return payload

def require_hr(authorization: Optional[str] = Header(None)):
    payload = verify_token(authorization)
    if payload.get("role") not in ("owner", "ceo", "admin", "hr", "manager"):
        raise HTTPException(status_code=403, detail="HR or Admin access required")
    return payload

def require_guard(authorization: Optional[str] = Header(None)):
    payload = verify_token(authorization)
    if payload.get("role") not in ("owner", "ceo", "admin", "guard"):
        raise HTTPException(status_code=403, detail="Security Guard or Admin access required")
    return payload

def require_staff(authorization: Optional[str] = Header(None)):
    return require_hr(authorization)

def require_roles(allowed_roles: List[str]):
    def role_checker(authorization: Optional[str] = Header(None)):
        payload = verify_token(authorization)
        user_role = payload.get("role", "").lower()
        normalized = [r.lower() for r in allowed_roles]
        if user_role not in normalized:
            raise HTTPException(status_code=403, detail=f"Access forbidden for role '{user_role}'")
        return payload
    return role_checker