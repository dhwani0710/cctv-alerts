import os
import requests
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

def send_telegram_alert(message):
    if not BOT_TOKEN or not CHAT_ID:
        print("[notifications] Telegram not configured, skipping")
        return

    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    try:
        requests.post(url, data={"chat_id": CHAT_ID, "text": message}, timeout=5)
    except Exception as e:
        print(f"[notifications ERROR] {e}")

def send_telegram_photo(photo_path, caption):
    if not BOT_TOKEN or not CHAT_ID:
        print("[notifications] Telegram not configured, skipping")
        return

    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendPhoto"
    try:
        with open(photo_path, "rb") as photo_file:
            response = requests.post(url, data={"chat_id": CHAT_ID, "caption": caption}, files={"photo": photo_file}, timeout=10)
        if response.status_code != 200:
            print(f"[notifications ERROR] Telegram API rejected request: {response.status_code} — {response.text}")
    except Exception as e:
        print(f"[notifications ERROR] {e}")