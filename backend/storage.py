import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
BUCKET = os.getenv("SUPABASE_BUCKET_NAME", "cctv-alerts-photos")

supabase = None
if SUPABASE_URL and SUPABASE_SERVICE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    except Exception as e:
        print(f"[storage] Supabase client init error: {e}")

def upload_file(local_path, remote_key):
    if not supabase:
        return local_path
    with open(local_path, "rb") as f:
        supabase.storage.from_(BUCKET).upload(remote_key, f, {"upsert": "true"})
    return supabase.storage.from_(BUCKET).get_public_url(remote_key)

def download_file(remote_key, local_path):
    if not supabase:
        return
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    data = supabase.storage.from_(BUCKET).download(remote_key)
    with open(local_path, "wb") as f:
        f.write(data)

def delete_prefix(prefix):
    if not supabase:
        return
    files = supabase.storage.from_(BUCKET).list(prefix)
    paths = [f"{prefix}/{f['name']}" for f in files]
    if paths:
        supabase.storage.from_(BUCKET).remove(paths)

def list_all_keys(prefix=""):
    if not supabase:
        return []
    files = supabase.storage.from_(BUCKET).list(prefix)
    return [f["name"] for f in files]

def sync_known_faces_from_storage(local_dir="known_faces"):
    if not supabase:
        return

    try:
        employee_folders = supabase.storage.from_(BUCKET).list("known_faces")
    except Exception as e:
        print(f"[storage] Could not list known_faces from storage: {e}")
        return

    for folder in employee_folders:
        folder_name = folder["name"]
        try:
            files = supabase.storage.from_(BUCKET).list(f"known_faces/{folder_name}")
        except Exception:
            continue
        for f in files:
            remote_key = f"known_faces/{folder_name}/{f['name']}"
            local_path = os.path.join(local_dir, folder_name, f['name'])
            if not os.path.exists(local_path):
                try:
                    download_file(remote_key, local_path)
                except Exception as e:
                    print(f"[storage] Failed to sync {remote_key}: {e}")