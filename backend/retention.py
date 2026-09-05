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