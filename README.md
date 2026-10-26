# CCTV Alerts (VaultWatch)

Real-time CCTV monitoring and alerting platform for jewellery stores. It detects people and animals on camera feeds, recognises staff by face, tracks attendance, raises incidents and sends Telegram notifications, with role-based dashboards for owners, CEOs, guards and HR.

- **Backend:** FastAPI, PostgreSQL, DeepFace, Ultralytics YOLO
- **Frontend:** React + Vite
- **Storage:** local snapshots with optional Supabase-compatible cloud storage
- **Alerts:** in-app incidents with Telegram notifications

---

## Table of contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Roles and access](#roles-and-access)
4. [Project structure](#project-structure)
5. [Prerequisites](#prerequisites)
6. [Quick start](#quick-start)
7. [Configuration](#configuration)
8. [Detection and alerts](#detection-and-alerts)
9. [Production deployment](#production-deployment)
10. [Security checklist](#security-checklist)
11. [Troubleshooting](#troubleshooting)
12. [Licensing](#licensing)

---

## Features

**Monitoring and detection**
- Live camera feeds over RTSP with online, offline and tamper status
- Face recognition against a known-faces database (DeepFace)
- Person and animal detection with YOLO26n
- Incident grouping: repeated alerts for the same event merge into one incident, with first-seen and last-seen times and an occurrence count
- Priority escalation of unacknowledged incidents

**Operations**
- Employee management with shift times, designation and face photos
- Attendance tracking by employee and date, with overrides and export
- Multi-office support
- Alert acknowledge and dismiss workflow with proof images
- Audit log of administrative actions
- Retention and daily reset jobs

**Notifications and storage**
- Telegram alerts with snapshots, and escalation messages
- Local snapshots, with optional upload to Supabase-compatible storage

---

## Architecture

```text
 RTSP cameras ──► camera_worker ──► motion gate ──► object_detector (YOLO26n)  ──► alerts.py ──► PostgreSQL
                                          │                                          │
                                          └──► recognition (DeepFace)  ──────────────┤
                                                                                     ├──► Telegram
 React + Vite frontend ◄──── FastAPI (JWT auth, REST) ◄──────────────────────────────┘
                                                                                     └──► Supabase storage (optional)
```

---

## Roles and access

Access is enforced by JWT-based auth on the backend and by protected routes on the frontend.

| Role | Live cameras / alerts | Employee management | User management | Attendance | Settings |
| :--- | :---: | :---: | :---: | :---: | :---: |
| ceo | Yes | Yes | Yes | Yes | Yes |
| owner | Yes | Yes | Yes | Yes | Yes |
| guard | Yes | No | No | No | Yes |
| hr | No | Yes | No | Yes | Yes |

---

## Project structure

```text
cctv-alerts/
├── backend/
│   ├── main.py               # FastAPI app and routes
│   ├── auth.py               # JWT verification and role checks
│   ├── auth_users.py         # password hashing, tokens, role constants
│   ├── alerts.py             # alert logging, incidents, escalation
│   ├── camera_worker.py      # per-camera processing loop
│   ├── object_detector.py    # YOLO26n person and animal detection
│   ├── recognition.py        # face recognition
│   ├── notifications.py      # Telegram helpers
│   ├── storage.py            # local / cloud storage sync
│   ├── retention.py          # cleanup and daily reset jobs
│   ├── audit.py              # audit logging
│   ├── database.py           # PostgreSQL setup and migrations
│   ├── config.py             # tunable settings
│   ├── requirements.txt
│   ├── .env.example
│   ├── known_faces/          # employee face photos
│   ├── snapshots/            # alert snapshots
│   └── recordings/           # stored recordings
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   └── src/ (pages, components, context)
├── README.md
└── .gitignore
```

---

## Prerequisites

| Requirement | Notes |
| :--- | :--- |
| Python **3.12** | 3.13 and newer are not supported: DeepFace, tf-keras and mtcnn do not install there |
| Node.js 18+ and npm | for the frontend |
| PostgreSQL | any managed instance works (for example Neon) |
| RTSP camera feeds | or a local video source for testing |
| Git | only needed for optional dependencies installed from GitHub |

On Windows, use the Python launcher so the right version is used: `py -3.12 -m ...`.

---

## Quick start

### 1. Backend

```bash
cd backend
py -3.12 -m pip install -r requirements.txt     # Windows
# python3.12 -m pip install -r requirements.txt  # macOS / Linux
```

Create your environment file and fill it in (see [Configuration](#configuration)):

```bash
copy .env.example .env        # Windows
# cp .env.example .env        # macOS / Linux
```

Generate a strong secret for `JWT_SECRET`:

```bash
py -3.12 -c "import secrets; print(secrets.token_hex(32))"
```

Start the API:

```bash
py -3.12 -m uvicorn main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

App: http://localhost:5173

### 3. First login

On first start the backend creates an admin account from `DEFAULT_ADMIN_USERNAME` and `DEFAULT_ADMIN_PASSWORD` in `.env`. Sign in, create your real users in the user management page, then **change or delete the default account**.

---

## Configuration

### Environment variables (`backend/.env`)

| Variable | Required | Description |
| :--- | :---: | :--- |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for signing tokens. The server refuses to start without it |
| `API_SECRET_KEY` | Yes | Internal API secret |
| `DEFAULT_ADMIN_USERNAME` | Yes | Initial admin username (first start only) |
| `DEFAULT_ADMIN_PASSWORD` | Yes | Initial admin password. Use a strong one |
| `CORS_ORIGINS` | Yes | Allowed frontend origins, for example `https://store.example.com` |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token for alerts |
| `TELEGRAM_CHAT_ID` | No | Chat or channel that receives alerts |
| `SUPABASE_URL` | No | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | No | Supabase service-role key. Keep it secret |
| `SUPABASE_BUCKET_NAME` | No | Storage bucket, for example `cctv-alerts-photos` |
| `CAM1_RTSP_URL`, `CAM2_RTSP_URL`, ... | No | RTSP stream URLs |

Never commit `.env`. Only `.env.example` belongs in version control.

### Tuning (`backend/config.py`)

| Setting | Default | Purpose |
| :--- | :---: | :--- |
| `YOLO_MODEL` | `yolo26n.pt` | Detection model |
| `DETECT_CONF` | `0.5` | Minimum confidence for people |
| `ANIMAL_CONF` | `0.55` | Minimum confidence for animals. Keep it at or above `DETECT_CONF` |
| `ANIMAL_WINDOW` | `5` | Number of recent checks considered per camera |
| `ANIMAL_HITS_REQUIRED` | `2` | Checks within the window that must contain an animal before alerting |
| `ANIMAL_COOLDOWN_SEC` | `60` | Minimum seconds between animal alerts per camera |
| `ALERT_DEDUPE_WINDOW_SEC` | `300` | Alerts of the same type on the same camera merge into one incident within this window |
| `ESCALATION_LOW_TO_MEDIUM_SEC` | `1800` | Unacknowledged low incidents rise to medium |
| `ESCALATION_MEDIUM_TO_HIGH_SEC` | `3600` | Unacknowledged medium incidents rise to high |

---

## Detection and alerts

- **People:** detected with YOLO26n, then matched against known faces. Unrecognised faces raise a `stranger` alert.
- **Animals:** the model is trained on COCO and recognises these animals: bird, cat, dog, horse, sheep, cow, elephant, bear, zebra and giraffe. **Rodents, snakes and monkeys are not detected.** Supporting them needs a fine-tuned or open-vocabulary model.
- Animal checks run only on frames that pass the motion gate, and an alert needs repeated detections within the configured window. This reduces false alarms.
- Detection quality depends on size and clarity. Small, distant or on-screen animals are detected less reliably than real animals in the room.
- Alerts of the same type on the same camera within the dedupe window merge into one incident. Acknowledged or dismissed incidents stay hidden from the live list even if new alerts merge into them.

---

## Production deployment

### Current setup

The application runs on the store PC and is published through Tailscale:

- **Backend:** FastAPI (uvicorn) on port 8000
- **Frontend:** production build (`npm run build`) served from `frontend/dist`
- **Access:** HTTPS through Tailscale on the store PC's `*.ts.net` address. Ask the project owner for the URL.

Check how it is published on the store PC:

```bash
tailscale status
tailscale serve status
tailscale funnel status
```

- `serve` makes the site available **only to devices on your tailnet**.
- `funnel` makes it available to **the whole internet**. Use it only if staff must reach the console from devices that are not on the tailnet, and keep the security checklist below in force.

### Running the backend

```bash
cd backend
py -3.12 -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Do not use `--reload` in production. Run it under a process manager (a Windows service, NSSM, systemd or similar) so it restarts after crashes and reboots.

### Building the frontend

```bash
cd frontend
npm run build
```

Serve `dist/` with your web server or Tailscale. **Rebuild after every frontend change**, otherwise the site keeps serving the old build. Staff may need a hard refresh (Ctrl+F5).

### Recommended practice

- Prefer tailnet-only access (`tailscale serve`) over Funnel where you can
- Set `CORS_ORIGINS` to the exact site URL only
- Use a managed PostgreSQL instance with backups enabled
- Keep `known_faces/` backed up. It is the source of truth for face recognition
- Monitor free disk space for snapshots and your storage bucket
- Keep the store PC awake, and set the backend and Tailscale to start on boot

---

## Security checklist

- [ ] Change or delete the default admin account after first login
- [ ] Use a strong, unique `JWT_SECRET` and `API_SECRET_KEY`
- [ ] Keep `.env` out of git, and rotate any secret that was ever committed
- [ ] Do not store real usernames or passwords in the README, in code or in git history
- [ ] Restrict `CORS_ORIGINS` to your own domain
- [ ] Serve everything over HTTPS
- [ ] Use least-privilege roles: guards do not need owner access
- [ ] Do not share logs publicly. They can contain access tokens in request URLs
- [ ] If the site is published with Tailscale Funnel, use strong passwords for every account and consider limiting access to the tailnet

---

## Troubleshooting

| Symptom | Likely cause and fix |
| :--- | :--- |
| `JWT_SECRET environment variable is not set` | Create `backend/.env` and set `JWT_SECRET` |
| `DeepFace import failed` | Wrong Python version. Run everything with Python 3.12 (`py -3.12`) |
| `pip` is not recognised | Use `py -3.12 -m pip ...` |
| `ModuleNotFoundError: ultralytics` | Install requirements into the same Python you run the server with |
| No animal alert | Check the animal is one of the supported types, large and clear in frame, and `ANIMAL_CONF` is not too high |
| Alert not visible on dashboard | The incident may have been acknowledged or dismissed within the dedupe window. Check its status |
| Frontend change not showing | Rebuild the frontend (`npm run build`) and hard refresh (Ctrl+F5) |
| Supabase error 402 | Storage quota is full. Free space, upgrade, or disable cloud upload. Never delete `known_faces/` |
| Site loads on other devices but not mine | Test in Incognito or another browser, turn off Chrome Secure DNS and QUIC, check VPN or proxy settings |

---

## Licensing

- This project: add your licence here (a `LICENSE` file is recommended).
- **Ultralytics YOLO is licensed under AGPL-3.0.** Running it inside a product or service can carry obligations, including source disclosure for the whole application. Review the Ultralytics licence or buy an Ultralytics Enterprise License before commercial or client deployments. This is not legal advice.