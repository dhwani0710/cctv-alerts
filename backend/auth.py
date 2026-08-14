from fastapi import Header, HTTPException
from typing import Optional
from auth_users import decode_token
import jwt

def verify_token(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization.replace("Bearer ", "")
    try:
        payload = decode_token(token)
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