import time
from storage import supabase, BUCKET

# Flat folders only. Add "known_faces" ONLY if you want to wipe employee photos.
FOLDERS = ["recordings", "snapshots", "acknowledgments"]
PAGE = 50


def retry(fn, tries=6):
    for attempt in range(tries):
        try:
            return fn()
        except Exception as e:
            wait = 3 * (attempt + 1)
            print(f"  retry {attempt + 1}/{tries} after error: {type(e).__name__}. Waiting {wait}s")
            time.sleep(wait)
    raise RuntimeError("Gave up after repeated errors")


def clean_folder(folder):
    deleted = 0
    skip = 0  # sub-folders that cannot be removed this way
    while True:
        items = retry(lambda: supabase.storage.from_(BUCKET).list(folder, {"limit": PAGE, "offset": skip}))
        if not items:
            break
        files = [f"{folder}/{it['name']}" for it in items if it.get("id") is not None]
        skip += len(items) - len(files)
        if not files:
            break
        retry(lambda: supabase.storage.from_(BUCKET).remove(files))
        deleted += len(files)
        print(f"  {folder}: deleted {deleted}")
    return deleted


def main():
    if not supabase:
        print("Supabase not configured. Check .env")
        return
    print(f"Bucket: {BUCKET}")
    print(f"Folders: {', '.join(FOLDERS)}")
    if input("Type DELETE to wipe these folders: ") != "DELETE":
        print("Cancelled")
        return
    total = 0
    for folder in FOLDERS:
        print(f"Cleaning {folder}...")
        total += clean_folder(folder)
    print(f"Done. Deleted {total} files")


if __name__ == "__main__":
    main()