import os
import datetime
import hmac
import hashlib
import jwt
from dotenv import load_dotenv
from fastapi import Header, HTTPException, Query, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, List
from database import get_db

load_dotenv()

API_SECRET_KEY = os.getenv("API_SECRET_KEY", "super-secret-system-key-change-in-production")
JWT_SECRET = os.getenv("JWT_SECRET", API_SECRET_KEY)
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))  # 24 hours default

# Password hashing with PBKDF2-HMAC-SHA256 (built-in, cross-platform & robust)
def hash_password(password: str) -> str:
    salt = os.urandom(16).hex()
    pwd_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000).hex()
    return f"{salt}${pwd_hash}"

def verify_password(password: str, hashed_password: str) -> bool:
    try:
        salt, pwd_hash = hashed_password.split("$")
        check_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000).hex()
        return hmac.compare_digest(pwd_hash, check_hash)
    except Exception:
        return False

def create_access_token(data: dict, expires_delta: Optional[datetime.timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.datetime.utcnow() + expires_delta
    else:
        expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=JWT_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None

security = HTTPBearer(auto_error=False)

def get_current_user(
    auth: Optional[HTTPAuthorizationCredentials] = Depends(security),
    token: Optional[str] = Query(None),
    x_api_key: Optional[str] = Header(None),
    api_key: Optional[str] = Query(None)
):
    # 1. Check Bearer Token or Query Token
    token_str = None
    if auth and auth.credentials:
        token_str = auth.credentials
    elif token:
        token_str = token

    if token_str:
        payload = decode_access_token(token_str)
        if payload and "username" in payload and "role" in payload:
            return {
                "id": payload.get("sub"),
                "username": payload.get("username"),
                "role": payload.get("role")
            }

    # 2. Check API Key (Super Admin level access for legacy / internal scripts)
    provided_key = x_api_key or api_key
    if API_SECRET_KEY and provided_key == API_SECRET_KEY:
        return {
            "id": 0,
            "username": "api_key_service",
            "role": "admin"
        }

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated or invalid token",
        headers={"WWW-Authenticate": "Bearer"},
    )

def require_roles(allowed_roles: List[str]):
    def role_checker(current_user: dict = Depends(get_current_user)):
        user_role = current_user.get("role", "").lower()
        if user_role not in [r.lower() for r in allowed_roles]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: requires one of roles [{', '.join(allowed_roles)}]"
            )
        return current_user
    return role_checker

# Backward-compatible wrapper for existing single-key dependencies
def verify_key(
    x_api_key: Optional[str] = Header(None),
    api_key: Optional[str] = Query(None),
    auth: Optional[HTTPAuthorizationCredentials] = Depends(security),
    token: Optional[str] = Query(None)
):
    return get_current_user(auth=auth, token=token, x_api_key=x_api_key, api_key=api_key)