# Jewellery Store Security Alert System

Face-recognition based CCTV alert system — flags unknown people and staff
present outside their scheduled shift hours.

## Setup

1. Install Python 3.10 or 3.11.
2. Clone this repo and open a terminal in the `backend/` folder.
3. Install dependencies: pip install -r requirements.txt
4. Copy `.env.example` to a new file named `.env` in the same folder, and fill in:
   - `API_SECRET_KEY` — any long random string you choose (this is your app's password).
   - `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — optional, only needed for Telegram alerts (see notifications setup below).
5. **Important**: open `frontend/admin.html` and `frontend/dashboard.html`, find the line
   `const API_KEY = "..."` in each, and set it to the exact same value as your `API_SECRET_KEY` in `.env`.
6. Run the backend: uvicorn main:app --reload --port 8000
7. Open `frontend/dashboard.html` and `frontend/admin.html` directly in your browser.

## Notes
- Needs a working webcam on your machine (no real CCTV camera integration yet).
- First run downloads face-recognition model files automatically (~one-time, needs internet).