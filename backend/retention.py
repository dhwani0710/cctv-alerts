import os
import time
import threading
from datetime import datetime, timedelta
from urllib.parse import unquote
from database import get_db, OFFICE_ID
import config
import storage

RECORDING_RETENTION_DAYS = getattr(config, "RECORDING_RETENTION_DAYS", 7)
RECORDING_BATCH = 100

CLEANUP_STARTUP_DELAY_SEC = 120
CLEANUP_INTERVAL_SEC = 24 * 60 * 60
CLEANUP_BATCH = 500

# alerts keeps permanent rows, so skip those. alert_records only ever holds archived
# (non-permanent) rows, because the daily reset moves them there.
_SNAPSHOT_TABLES = (
    ("alerts", "AND permanent = FALSE"),
    ("alert_records", ""),
)


def _delete_snapshot_files(filename):
    local_name = os.path.basename(filename)
    local_path = os.path.join("snapshots", local_name)
    try:
        if os.path.exists(local_path):
            os.remove(local_path)
    except OSError as e:
        print(f"[retention] Local delete failed for {local_name}: {e}")
    try:
        storage.delete_file(f"snapshots/{local_name}")
    except Exception as e:
        print(f"[retention] Cloud delete failed for {local_name}: {e}")


def _cleanup_table(table, extra_where, cutoff):
    total = 0
    while True:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                f"SELECT id, snapshot_filename FROM {table} "
                f"WHERE timestamp < %s AND snapshot_filename IS NOT NULL AND office_id = %s {extra_where} "
                f"ORDER BY id LIMIT %s",
                (cutoff, OFFICE_ID, CLEANUP_BATCH),
            )
            rows = cur.fetchall()
            cur.close()

        if not rows:
            return total

        for r in rows:
            _delete_snapshot_files(r["snapshot_filename"])

        ids = [r["id"] for r in rows]
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(f"UPDATE {table} SET snapshot_filename = NULL WHERE id = ANY(%s)", (ids,))
            conn.commit()
            cur.close()

        total += len(rows)
        if len(rows) < CLEANUP_BATCH:
            return total


def _cleanup_old_snapshots():
    cutoff = (datetime.now() - timedelta(days=config.SNAPSHOT_RETENTION_DAYS)).isoformat()
    total = 0
    for table, extra_where in _SNAPSHOT_TABLES:
        total += _cleanup_table(table, extra_where, cutoff)
    if total:
        print(f"[retention] Cleaned up {total} old snapshot(s)")


def _recording_key(video_url):
    marker = f"/storage/v1/object/public/{storage.BUCKET}/"
    if not video_url or marker not in video_url:
        return None
    key = unquote(video_url.split(marker, 1)[1].split("?", 1)[0])
    return None if ".." in key else key


def _local_recording_path(video_url):
    if not video_url or not video_url.startswith("local:"):
        return None
    rel = video_url[len("local:"):].replace("\\", "/").lstrip("/")
    root = os.path.realpath(os.getenv("RECORDINGS_DIR", "recordings"))
    target = os.path.realpath(os.path.join(root, rel))
    if not target.startswith(root + os.sep):
        return None
    return target


def _cleanup_old_recordings():
    cutoff = (datetime.now() - timedelta(days=RECORDING_RETENTION_DAYS)).isoformat()
    total = 0
    while True:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT id, video_url FROM recordings "
                "WHERE timestamp < %s AND office_id = %s ORDER BY id LIMIT %s",
                (cutoff, OFFICE_ID, RECORDING_BATCH),
            )
            rows = cur.fetchall()
            cur.close()

        if not rows:
            break

        ids_to_delete = []
        cloud_keys = []
        cloud_ids = []
        for r in rows:
            url = r["video_url"] or ""
            if url.startswith("local:"):
                path = _local_recording_path(url)
                try:
                    if path and os.path.exists(path):
                        os.remove(path)
                    ids_to_delete.append(r["id"])  # file gone (or already missing)
                except OSError as e:
                    # Keep the DB row so the next run retries this file
                    print(f"[retention] Local recording delete failed for {url}: {e}")
            else:
                key = _recording_key(url)
                if key:
                    cloud_keys.append(key)
                cloud_ids.append(r["id"])

        if cloud_ids:
            if cloud_keys and storage.supabase:
                try:
                    storage.supabase.storage.from_(storage.BUCKET).remove(cloud_keys)
                    ids_to_delete.extend(cloud_ids)
                except Exception as e:
                    print(f"[retention] Recording storage delete failed: {e}")
            else:
                ids_to_delete.extend(cloud_ids)

        if not ids_to_delete:
            break  # nothing could be deleted this round, try again on the next run

        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM recordings WHERE id = ANY(%s)", (ids_to_delete,))
            conn.commit()
            cur.close()

        total += len(ids_to_delete)
        if len(rows) < RECORDING_BATCH:
            break

    if total:
        print(f"[retention] Deleted {total} recording(s) older than {RECORDING_RETENTION_DAYS} days")


def _retention_loop():
    # Run once shortly after startup, then daily
    time.sleep(CLEANUP_STARTUP_DELAY_SEC)
    while True:
        try:
            _cleanup_old_snapshots()
        except Exception as e:
            print(f"[retention] Snapshot error: {e}")
        try:
            _cleanup_old_recordings()
        except Exception as e:
            print(f"[retention] Recording error: {e}")
        time.sleep(CLEANUP_INTERVAL_SEC)


def start_retention_thread():
    t = threading.Thread(target=_retention_loop, daemon=True)
    t.start()


def _next_seven_pm(now):
    target = now.replace(hour=17, minute=30, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return target


def _clear_daily_alerts():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO alert_records (person_name, alert_type, priority, message, timestamp, snapshot_filename, camera_name, zone_name, incident_id, office_id)
            SELECT person_name, alert_type, priority, message, timestamp, snapshot_filename, camera_name, zone_name, incident_id, office_id
            FROM alerts WHERE permanent = FALSE AND office_id = %s
        """, (OFFICE_ID,))
        cur.execute("DELETE FROM alerts WHERE permanent = FALSE AND office_id = %s", (OFFICE_ID,))
        cur.execute("DELETE FROM currently_detected WHERE office_id = %s", (OFFICE_ID,))
        conn.commit()
        cur.close()
    print("[daily-reset] Archived and cleared non-permanent alerts, cleared currently_detected at 5:30 PM")


def _daily_reset_loop():
    while True:
        now = datetime.now()
        target = _next_seven_pm(now)
        time.sleep((target - now).total_seconds())
        try:
            _clear_daily_alerts()
        except Exception as e:
            print(f"[daily-reset] Error: {e}")


def start_daily_reset_thread():
    t = threading.Thread(target=_daily_reset_loop, daemon=True)
    t.start()