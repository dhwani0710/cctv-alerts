import os
import jwt
from datetime import datetime, timedelta
import bcrypt
from dotenv import load_dotenv

load_dotenv()

VALID_ROLES = {"ceo", "owner", "guard", "hr"}
ADMIN_ROLES = {"ceo", "owner"}

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET environment variable is not set")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 12

def hash_password(password: str) -> str:
    pwd_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')

def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode('utf-8')[:72], password_hash.encode('utf-8'))
    except Exception:
        return False

def create_token(user_id, username, role, name):
    payload = {
        "user_id": user_id,
        "username": username,
        "role": role,
        "name": name,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token):
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])