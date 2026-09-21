import os
import time
import threading
from datetime import datetime, timedelta
from database import get_db
import config
import storage

def _cleanup_old_snapshots():
    cutoff = (datetime.now() - timedelta(days=config.SNAPSHOT_RETENTION_DAYS)).isoformat()
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, snapshot_filename FROM alerts WHERE timestamp < %s AND permanent = FALSE AND snapshot_filename IS NOT NULL",
            (cutoff,)
        )
        rows = cur.fetchall()
        cur.close()

    for r in rows:
        filename = r["snapshot_filename"]
        if not filename:
            continue
        local_name = os.path.basename(filename)
        local_path = os.path.join("snapshots", local_name)
        if os.path.exists(local_path):
            os.remove(local_path)
        try:
            storage.delete_prefix(f"snapshots/{local_name}")
        except Exception as e:
            print(f"[retention] Cloud delete failed for {local_name}: {e}")

        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("UPDATE alerts SET snapshot_filename = NULL WHERE id = %s", (r["id"],))
            conn.commit()
            cur.close()

    if rows:
        print(f"[retention] Cleaned up {len(rows)} old snapshot(s)")

def _retention_loop():
    while True:
        time.sleep(24 * 60 * 60)
        try:
            _cleanup_old_snapshots()
        except Exception as e:
            print(f"[retention] Error: {e}")

def start_retention_thread():
    t = threading.Thread(target=_retention_loop, daemon=True)
    t.start()

def _next_seven_pm(now):
    target = now.replace(hour=19, minute=0, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return target

def _clear_daily_alerts():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO alert_records (person_name, alert_type, priority, message, timestamp, snapshot_filename, camera_id, zone_id)
            SELECT person_name, alert_type, priority, message, timestamp, snapshot_filename, camera_id, zone_id
            FROM alerts WHERE permanent = FALSE
        """)
        cur.execute("DELETE FROM alerts WHERE permanent = FALSE")
        cur.execute("DELETE FROM currently_detected")
        conn.commit()
        cur.close()
    print("[daily-reset] Archived and cleared non-permanent alerts, cleared currently_detected at 7:00 PM")

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