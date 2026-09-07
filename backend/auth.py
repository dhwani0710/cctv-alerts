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

    if role not in ["ceo", "owner", "guard", "hr"]:
        raise HTTPException(status_code=400, detail="Role must be ceo, owner, guard, or hr")