from datetime import datetime
from database import get_db

def log_audit_event(username: str, user_role: str, action: str, target_module: str, details: str, proof_image: str = None, user_id: int = None):
    """
    Records an immutable audit log entry for user activity.
    Accessible exclusively to the System Owner.
    """
    try:
        role_str = str(user_role or '').lower()
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO audit_logs (user_id, username, user_role, action, target_module, details, proof_image, timestamp)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (user_id, username or "system", role_str, action, target_module, details, proof_image, datetime.now().isoformat())
            )
            conn.commit()
            cur.close()
    except Exception as e:
        print(f"[audit] Error logging audit event for {username} ({action}): {e}")
