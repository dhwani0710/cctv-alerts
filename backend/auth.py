from fastapi import Header, HTTPException, Query
from typing import Optional
from auth_users import decode_token
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

    return payload

def require_admin(authorization: Optional[str] = Header(None)):
    payload = verify_token(authorization)
    if payload["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return payload

def require_staff(authorization: Optional[str] = Header(None)):
    payload = verify_token(authorization)
    if payload["role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Staff access required")
    return payload