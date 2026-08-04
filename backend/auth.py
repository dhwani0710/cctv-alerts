import os
from dotenv import load_dotenv
from fastapi import Header, HTTPException, Query
from typing import Optional

load_dotenv()

API_SECRET_KEY = os.getenv("API_SECRET_KEY")

def verify_key(x_api_key: Optional[str] = Header(None), api_key: Optional[str] = Query(None)):
    provided_key = x_api_key or api_key
    if not API_SECRET_KEY or provided_key != API_SECRET_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")