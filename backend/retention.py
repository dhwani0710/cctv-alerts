import os
import time
import threading
from datetime import datetime, timedelta
from database import get_db
import config
import storage

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
                f"WHERE timestamp < %s AND snapshot_filename IS NOT NULL {extra_where} "
                f"ORDER BY id LIMIT %s",
                (cutoff, CLEANUP_BATCH),
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


def _retention_loop():
    # Run once shortly after startup (the old loop slept 24h first, so restarts meant it never ran)
    time.sleep(CLEANUP_STARTUP_DELAY_SEC)
    while True:
        try:
            _cleanup_old_snapshots()
        except Exception as e:
            print(f"[retention] Error: {e}")
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
            INSERT INTO alert_records (person_name, alert_type, priority, message, timestamp, snapshot_filename, camera_name, zone_name, incident_id)
            SELECT person_name, alert_type, priority, message, timestamp, snapshot_filename, camera_name, zone_name, incident_id
            FROM alerts WHERE permanent = FALSE
        """)
        cur.execute("DELETE FROM alerts WHERE permanent = FALSE")
        cur.execute("DELETE FROM currently_detected")
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