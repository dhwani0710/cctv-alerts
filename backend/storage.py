import os
import time
from urllib.parse import unquote
import httpx
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
BUCKET = os.getenv("SUPABASE_BUCKET_NAME") or "cctv-alerts-photos"
OFFICE_ID = int(os.getenv("OFFICE_ID", "1"))
_PFX = "" if OFFICE_ID == 1 else f"o{OFFICE_ID}/"

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY) if (SUPABASE_URL and SUPABASE_SERVICE_KEY) else None

def upload_file(local_path, remote_key):
    if not supabase:
        return local_path
    remote_key = _PFX + remote_key
    content_type = "video/webm" if remote_key.endswith(".webm") else "video/mp4" if remote_key.endswith(".mp4") else "image/jpeg"
    with open(local_path, "rb") as f:
        data = f.read()
    last_err = None
    for attempt in range(4):
        try:
            client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            client.storage.from_(BUCKET).upload(
                remote_key, data, {"upsert": "true", "content-type": content_type}
            )
            return client.storage.from_(BUCKET).get_public_url(remote_key)
        except Exception as e:
            last_err = e
            print(f"[storage] Upload attempt {attempt + 1} failed: {e}")
            time.sleep(1.5 * (attempt + 1))
    raise last_err

def get_signed_url(remote_key, expires_in=3600):
    if not supabase:
        return remote_key
    remote_key = remote_key.lstrip("/")
    res = supabase.storage.from_(BUCKET).create_signed_url(remote_key, expires_in)
    return res.get("signedURL") or res.get("signedUrl") or res.get("signed_url")

def object_exists(signed_url):
    """Signing can succeed even when the file is missing, so ask for 1 byte."""
    try:
        r = httpx.get(signed_url, headers={"Range": "bytes=0-0"}, timeout=5, follow_redirects=True)
        return r.status_code in (200, 206)
    except Exception:
        return False

def download_file(remote_key, local_path):
    if not supabase:
        return
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    data = supabase.storage.from_(BUCKET).download(remote_key)
    with open(local_path, "wb") as f:
        f.write(data)

def delete_file(remote_key):
    if not supabase:
        return
    remote_key = _PFX + remote_key
    supabase.storage.from_(BUCKET).remove([remote_key])

def delete_prefix(prefix):
    if not supabase:
        return
    prefix = _PFX + prefix
    files = supabase.storage.from_(BUCKET).list(prefix)
    paths = [f"{prefix}/{f['name']}" for f in files]
    if paths:
        supabase.storage.from_(BUCKET).remove(paths)

def delete_all_in_prefix(prefix):
    """Delete every file under prefix in the bucket, paging through the listing.
    Returns the number of files removed. Raises on failure."""
    if not supabase:
        return 0
    removed = 0
    for _ in range(1000):  # safety cap
        files = supabase.storage.from_(BUCKET).list(prefix, {"limit": 100, "offset": 0})
        names = [
            f"{prefix}/{f['name']}"
            for f in files
            if f.get("name") and f["name"] != ".emptyFolderPlaceholder"
        ]
        if not names:
            break
        supabase.storage.from_(BUCKET).remove(names)
        removed += len(names)
    return removed

def sync_known_faces_from_storage(local_dir="known_faces"):
    if not supabase:
        return
    try:
        employee_folders = supabase.storage.from_(BUCKET).list(f"{_PFX}known_faces")
    except Exception as e:
        print(f"[storage] Could not list known_faces from storage: {e}")
        return
    for folder in employee_folders:
        folder_name = folder["name"]
        try:
            files = supabase.storage.from_(BUCKET).list(f"{_PFX}known_faces/{folder_name}")
        except Exception:
            continue
        for f in files:
            remote_key = f"{_PFX}known_faces/{folder_name}/{f['name']}"
            local_path = os.path.join(local_dir, folder_name, f['name'])
            if not os.path.exists(local_path):
                try:
                    download_file(remote_key, local_path)
                except Exception as e:
                    print(f"[storage] Failed to sync {remote_key}: {e}")

def signed_url_for(public_url, expires_in=3600):
    """Turn a stored public Supabase URL into a short-lived signed URL.
    Returns None if the URL isn't from our own bucket."""
    public_url = (public_url or "").lstrip("/")
    if not supabase or not SUPABASE_URL or not public_url:
        return None
    base = SUPABASE_URL.rstrip("/")
    marker = f"/storage/v1/object/public/{BUCKET}/"
    if not public_url.startswith(base) or marker not in public_url:
        return None
    key = unquote(public_url.split(marker, 1)[1].split("?", 1)[0])
    if ".." in key:
        return None
    try:
        res = supabase.storage.from_(BUCKET).create_signed_url(key, expires_in)
    except Exception as e:
        print(f"[storage] Could not sign URL: {e}")
        return None
    url = res.get("signedURL") or res.get("signedUrl")
    if not url:
        return None
    if url.startswith("/"):
        url = f"{base}/storage/v1{url}"
    return url