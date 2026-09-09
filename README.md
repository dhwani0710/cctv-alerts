# CCTV Alerts

A real-time CCTV monitoring and alert platform for a jewellery store environment. The project combines a FastAPI backend for authentication, camera handling, employee recognition, attendance tracking, and alert workflows with a React + Vite frontend for dashboards and admin controls.

---

## Overview

This system is designed to:

- monitor live camera feeds and detect persons in configured zones
- match visitors or staff against a known-face database
- generate alert records for suspicious or unexpected activity
- track employee attendance by shift and presence
- support role-based access for different team responsibilities
- store snapshots and media references locally and in cloud storage when configured
- notify staff via Telegram when alerts are raised

The application is currently structured around these primary roles:

- ceo
- owner
- guard
- hr

---

## Role Access Model

The backend and frontend enforce route-level access using JWT-based auth.

| Role | Live camera / alerts | Employee management | User management | Attendance | Settings |
| :--- | :---: | :---: | :---: | :---: | :---: |
| ceo | ✅ | ✅ | ✅ | ✅ | ✅ |
| owner | ✅ | ✅ | ✅ | ✅ | ✅ |
| guard | ✅ | ❌ | ❌ | ❌ | ✅ |
| hr | ❌ | ✅ | ❌ | ✅ | ✅ |

Routes are protected in the frontend via the React router and in the backend via required auth dependencies.

---

## Current Features

### Authentication and RBAC

- JWT-based login flow with username/password verification
- default admin user is created automatically on database initialization
- protected API endpoints for admin-only or staff-only actions
- user management endpoints for creating, updating, and deleting users

### Employee and Face Management

- add employee records with shift times and designation
- upload one or more employee photos
- store face images in the known_faces folder and sync to configured storage
- clear cached face representation data after updates

### Camera and Incident Monitoring

- configured camera sources loaded from backend settings
- live status endpoint for camera and alert health
- incident tracking with first-seen and last-seen timestamps
- zone and camera configuration APIs
- snapshot retrieval endpoints for captured evidence

### Attendance Tracking

- attendance records keyed by employee and date
- first/last seen timestamps
- override support and status tracking
- attendance export endpoints and dashboard views

### Notification and Storage

- Telegram notifications for alert and escalation events
- local snapshots and cloud uploads via Supabase-compatible storage
- retention and daily reset jobs for cleanup and system maintenance

---

## Default Login

On first database initialization, the app seeds a default admin account:

- username: admin
- password: ceo123

You can then create additional users from the admin user management flow.

---

## Project Structure

```text
cctv-alerts/
├── backend/
│   ├── alerts.py              # alert generation and anomaly logic
│   ├── app_settings.py        # app settings management
│   ├── auth.py                # JWT verification and role checks
│   ├── auth_users.py          # password hashing, token creation, role constants
│   ├── camera_worker.py       # camera worker and processing loops
│   ├── config.py              # default camera configuration
│   ├── database.py            # PostgreSQL database setup and migrations
│   ├── main.py                # FastAPI app, routes, and endpoints
│   ├── notifications.py       # Telegram notification helpers
│   ├── recognition.py         # face-recognition flows
│   ├── requirements.txt       # backend Python dependencies
│   ├── retention.py           # retention and cleanup tasks
│   ├── settings_store.py      # settings persistence helpers
│   ├── storage.py             # local/cloud storage sync helpers
│   ├── known_faces/           # known employee photos
│   ├── snapshots/             # captured snapshots
│   ├── .env.example           # sample environment configuration
│   └── .env                   # local runtime settings (not committed)
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── css/
│   └── src/
│       ├── App.jsx
│       ├── components/
│       ├── context/
│       ├── data/
│       └── pages/
├── README.md
└── .gitignore
```

---

## Prerequisites

- Python 3.10+
- Node.js 18+
- npm
- PostgreSQL connection string for the backend database

---

## Backend Setup

1. Open a terminal and change to the backend folder:

   ```bash
   cd backend
   ```
2. Install Python dependencies:

   ```bash
   python -m pip install -r requirements.txt
   ```

3. Copy the sample environment file and define your values:

   ```bash
   copy .env.example .env
   ```

   Then update the variables in .env, including:

   - DATABASE_URL
   - JWT_SECRET
   - API_SECRET_KEY
   - DEFAULT_ADMIN_USERNAME
   - DEFAULT_ADMIN_PASSWORD
   - TELEGRAM_BOT_TOKEN
   - TELEGRAM_CHAT_ID
   - Supabase settings if you want cloud storage

4. Start the API server:

   ```bash
   python -m uvicorn main:app --reload --port 8000
   ```

5. Open the API docs in a browser:

   - http://localhost:8000
   - http://localhost:8000/docs

---

## Frontend Setup

1. Open a second terminal and change to the frontend folder:

   ```bash
   cd frontend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open the app in the browser:

   - http://localhost:5173

---

## Environment File Example

The project expects backend environment values similar to those in [backend/.env.example](backend/.env.example):

```env
API_SECRET_KEY=your-secret-key-here
JWT_SECRET=your-jwt-secret-key-here
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=admin123

TELEGRAM_BOT_TOKEN=your-telegram-bot-token-here
TELEGRAM_CHAT_ID=your-telegram-chat-id-here

DATABASE_URL=your-neon-connection-string-here

SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
SUPABASE_BUCKET_NAME=cctv-alerts-photos
```

> The backend currently expects a PostgreSQL database via DATABASE_URL rather than an automatic SQLite fallback.

---

## Useful Commands

### Backend

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
npm run build
```

---

## Notes

- The app is built for a specific jewellery store use case, but the underlying architecture is reusable for other CCTV, access, and attendance scenarios.
- The actual frontend route structure includes dashboards such as admin-dashboard, guard-dashboard, hr-dashboard, cameras-alerts, records, attendance, and settings.
- Face recognition and media processing are active features, but they depend on working camera sources, uploaded employee images, and compatible environment settings.

This README reflects the current codebase and setup requirements as implemented in the project today.
