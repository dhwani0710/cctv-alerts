<div align="center">

# 💎 Jewellery Store Intelligent CCTV Security & Attendance System

**An enterprise-grade, AI-powered CCTV surveillance, biometric facial recognition, and automated attendance tracking system featuring Role-Based Access Control (RBAC), multi-camera RTSP streaming, intelligent anomaly detection, and instant incident dispatch.**

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/Frontend-React%2018-61DAFB.svg?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Bundler-Vite-646CFF.svg?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![DeepFace](https://img.shields.io/badge/AI-DeepFace%20%2B%20MTCNN-FF6F00.svg?style=flat-square)](https://github.com/serengil/deepface)
[![OpenCV](https://img.shields.io/badge/Vision-OpenCV-5C3EE8.svg?style=flat-square&logo=opencv&logoColor=white)](https://opencv.org/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%20%2F%20SQLite-336791.svg?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![TailwindCSS](https://img.shields.io/badge/Styling-Tailwind%20CSS-38B2AC.svg?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Python](https://img.shields.io/badge/Python-3.10%20|%203.11%20|%203.12-3776AB.svg?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)

</div>

---

## 📑 Table of Contents

- [Overview](#-overview)
- [System Architecture](#️-system-architecture)
- [Computer Vision & AI Intelligence](#-computer-vision--ai-intelligence)
- [Security Anomaly & Threat Engine](#-security-anomaly--threat-engine)
- [Attendance & Workforce Tracking](#-attendance--workforce-tracking)
- [Forensics & Audit Records](#-forensics--audit-records)
- [Dynamic RTSP Camera Pipeline](#-dynamic-rtsp-camera-pipeline)
- [Role-Based Access Control (RBAC)](#-role-based-access-control-rbac)
- [Database Schema & Data Model](#-database-schema--data-model)
- [Notification & Storage Architecture](#-notification--storage-architecture)
- [Frontend Application Structure](#-frontend-application-structure)
- [Configuration & Environment Variables](#️-configuration--environment-variables)
- [Quick Start & Installation](#-quick-start--installation)
- [REST API Reference & Payloads](#-rest-api-reference--payloads)
- [Production Deployment & Hardware Sizing](#-production-deployment--hardware-sizing)
- [Troubleshooting & FAQs](#-troubleshooting--faqs)
- [License](#-license)

---

## 📌 Overview

The **Jewellery Store Intelligent CCTV Security & Attendance System** is an integrated security and workforce management solution tailored for high-risk retail premises, jewellery showrooms, and secure vault facilities. Combining real-time computer vision, deep facial recognition, behavioral shift analysis, and distributed camera streaming, the platform automates 24/7 premises protection and daily operational compliance.

### Core Objectives
1. **Intrusion Prevention**: Detect unauthorized strangers roaming in or around store facilities outside operating hours.
2. **Shift Adherence**: Automatically record staff entry/exit times, flag unauthorized early arrivals and overstaying/loitering staff.
3. **Surveillance Tamper Detection**: Continuously analyze camera feeds for lens obstruction, spray covering, or signal drops.
4. **Frictionless Biometric Attendance**: Eliminate physical biometric machines or cards with non-intrusive CCTV facial recognition punch-in.
5. **Instant Incident Escalation**: Immediate Telegram alerts containing high-resolution snapshot photos of security violations sent directly to security personnel and owners.

---

## 🏛️ System Architecture

The system decouples high-throughput video ingestion from analytical deep learning and API serving via multi-threaded asynchronous workers.

```mermaid
flowchart TB
    subgraph CaptureLayer["1. Surveillance Ingest Layer"]
        C1["RTSP IP Camera 1 (Front Door)"]
        C2["RTSP IP Camera 2 (Vault Entry)"]
        CN["RTSP IP Camera N (Showroom)"]
    end

    subgraph CoreWorker["2. Multi-Threaded Camera Engine (OpenCV + Worker Threads)"]
        Grabber["Frame Ingestion Loop (3x Buffer Flush)"]
        Tamper["Tamper / Occlusion Analyzer (Luminance & Variance)"]
        Health["Heartbeat Watchdog (15s Loop)"]
        Recognizer["DeepFace Face Recognition (MTCNN + Cosine Similarity)"]
    end

    subgraph BusinessEngine["3. Security Rules & Business Logic"]
        StoreHours["Store Hours Validator (settings.json)"]
        ShiftCalc["Shift Timing Evaluator (Overnight Resilient)"]
        StreakTracker["Unknown Streak Accumulator"]
        Dedupe["Alert Deduplicator (60s Window)"]
    end

    subgraph StorageLayer["4. Persistence & Storage Layer"]
        DB[("PostgreSQL / SQLite Fallback")]
        Cloud[("Supabase Storage / Local Snapshots")]
    end

    subgraph DispatchLayer["5. Notification & Alert Dispatch"]
        Telegram["Telegram Bot API (Text & Photo Payloads)"]
    end

    subgraph PresentationLayer["6. React 18 + Vite Web Application"]
        LiveFeed["Live CCTV Video Player (MJPEG Stream)"]
        AlertsFeed["Real-Time Incident Feed & Toasts"]
        AttSheet["Attendance Dashboard & Manual Override"]
        RecVault["Audit Records & Snapshot Modal Inspector"]
        AdminConsole["Employee & User Management (RBAC)"]
    end

    C1 & C2 & CN -->|"RTSP/H.264 Stream"| Grabber
    Grabber --> Tamper
    Grabber --> Health
    Tamper -->|"Valid Frame"| Recognizer
    Recognizer -->|"Matched / Unknown Faces"| ShiftCalc & StreakTracker & StoreHours
    ShiftCalc & StreakTracker --> Dedupe
    Dedupe -->|"Log Incident"| DB
    Dedupe -->|"Save Snapshot Frame"| Cloud
    Dedupe -->|"High-Priority Trigger"| Telegram
    Grabber -.->|"Low-Latency MJPEG"| LiveFeed
    DB & Cloud <--> PresentationLayer
```

---

## 🔬 Computer Vision & AI Intelligence

### 1. DeepFace Biometric Pipeline
The recognition engine operates on top of the **DeepFace** framework utilizing state-of-the-art computer vision models:
- **Detector Backend**: `MTCNN` (Multi-task Cascaded Convolutional Networks), performing multi-stage face proposal, bounding box regression, and facial landmark alignment.
- **Distance Metric**: **Cosine Similarity Distance** ($D_{cosine} = 1 - \frac{u \cdot v}{\|u\|_2 \|v\|_2}$). Faces with distance scores under the strict facial threshold are identified as known staff; unindexed faces resolve to `Unknown`.
- **Corrupted Frame Resiliency**: In RTSP network streams, frame corruption or packet loss can cause partial distortion. The pipeline employs an automatic recovery mechanism: if no face is detected on an initial frame, it pauses for `300ms` and re-samples a fresh frame, dramatically reducing false-negative drops.

### 2. Multi-Photo Training & Angle Enrollment
- Staff members can be registered with **multiple portrait images** (front-facing, slight tilt left/right, glasses/no-glasses).
- The system checks multi-photo matching thresholds (`MIN_MATCHING_PHOTOS`), ensuring that lighting anomalies or partial head rotations do not trigger false alerts.

### 3. Anti-Tamper & Lens Occlusion Detection
The video engine continuously calculates grayscale luminance mean ($\mu$) and standard deviation ($\sigma$) using `cv2.meanStdDev(gray)`:
$$\mu = \frac{1}{N} \sum_{i=1}^N I_i, \quad \sigma = \sqrt{\frac{1}{N} \sum_{i=1}^N (I_i - \mu)^2}$$
- **Blackout / Lens Cover**: Triggered when brightness $\mu < 15$ (`TAMPER_BRIGHTNESS_THRESHOLD`).
- **Uniform Spray / Defocus Blur**: Triggered when detail variance $\sigma < 5$ (`TAMPER_VARIANCE_THRESHOLD`).
- Tamper events instantly dispatch high-priority alerts with the offending frame.

---

## 🚨 Security Anomaly & Threat Engine

The anomaly detection engine runs asynchronously without impeding video frame rates.

### 1. After-Hours Stranger Intrusion
- **Operating Hours Context**: Checks current system time against store operating parameters (`store_open_time` and `store_close_time`).
- **Consecutive Streak Accumulator**: Single-frame false positives are filtered out. An unknown face must be detected continuously across `3` consecutive checks (`UNKNOWN_STREAK_THRESHOLD = 3`) outside operating hours before triggering an intrusion event.
- **Location Tagging**: Tracks streak state per camera location (e.g., `unknown_streak_front`), isolating alerts by zone.

### 2. Shift Adherence & Loitering Violations
The system compares biometric detections against the employee's assigned schedule:
- **Cross-Midnight Shift Calculation**: Supports standard day shifts (e.g., `09:00 - 18:00`) as well as overnight shifts (e.g., `20:00 - 06:00`), correctly projecting `start_tonight` to `end_tomorrow_morning`.
- **Early Arrival**: Flags employees detected on premises prior to their official start time.
- **Overstay / Loitering**: Flags employees remaining inside store premises after their shift end time.

#### Incident Priority Classification
| Violation Type | Time Difference ($\Delta t$) | Priority | Notification Action |
| :--- | :--- | :---: | :--- |
| **Early Arrival / Overstay** | $\Delta t \le 30\text{ minutes}$ | 🟡 `LOW` | Recorded in database, UI toast alert |
| **Early Arrival / Overstay** | $30\text{ min} < \Delta t \le 60\text{ minutes}$ | 🟠 `MEDIUM` | Recorded in database, UI badge alert |
| **Early Arrival / Overstay** | $\Delta t > 60\text{ minutes}$ | 🔴 `HIGH` | Dispatched to Telegram with Snapshot |
| **Stranger Outside Hours** | Any after-hours detection ($\text{streak} \ge 3$) | 🔴 `HIGH` | Dispatched to Telegram with Snapshot |
| **Camera Tampering** | Obstructed / Blacked-out frame | 🔴 `HIGH` | Dispatched to Telegram with Snapshot |
| **Camera Offline** | Heartbeat gap $> 30\text{ seconds}$ | 🔴 `HIGH` | Dispatched to Telegram notification |

### 3. Sliding Deduplication Window
To eliminate notification flooding while an intruder or overstaying employee remains in frame, the system verifies `already_alerted_recently()`:
- Alerts for the same `(person_name, alert_type, priority)` within `60` seconds (`ALERT_DEDUPE_WINDOW_SEC`) are suppressed.

---

## ⏱️ Attendance & Workforce Tracking

### 1. Automated Punch-In & Punch-Out
- When an enrolled employee is identified by any active camera, the system automatically updates the `attendance` table for the current date (`attendance_date`):
  - `first_seen`: Populated upon the first detection of the day (Clock-In).
  - `last_seen`: Updated continuously on every subsequent detection throughout the shift (Clock-Out).
  - `last_camera_id`: Records the exact camera zone where the employee was last observed.

### 2. Real-Time Status Computation
The attendance engine calculates status dynamically based on shift parameters:
- **Present**: Employee detected within their scheduled shift time window.
- **Late**: Employee's `first_seen` occurred after scheduled `shift_start`.
- **Left Early**: Employee's `last_seen` occurred before scheduled `shift_end`.
- **Overstay**: Employee's `last_seen` extends significantly past `shift_end`.
- **Absent**: Enrolled employee with zero facial detections for that calendar date.

### 3. Administrative Manual Override
To support authorized exceptions (medical leave, off-site duty, equipment maintenance):
- **Role Permission**: Available to `Admin` and `Manager` accounts.
- **Audited Fields**: Custom `first_seen`, `last_seen`, `status` (`present`, `late`, `absent`, `half-day`, `on-leave`), and mandatory `override_reason`.
- **Audit Flag**: Stored with `is_override = TRUE` and highlighted in the attendance table with a distinct audit indicator.

### 4. 1-Click CSV Data Export
- Endpoints `/attendance/export` and `/api/attendance/export` generate structured CSV spreadsheets respecting applied filters (date range, employee ID, zone) for direct import into payroll software.

---

## 📁 Forensics & Audit Records

The **Records** module (`/records`) functions as a searchable digital evidence repository:
- **Multi-Filter Queries**: Filter by date, specific camera feed, search term (name/incident), or severity status (`Flagged / High`, `Needs Review / Medium`, `Clear / Low`).
- **Instant Snapshot Preview Modal**: Click any incident row to open a full-resolution forensic photo preview taken at the exact second of the event.
- **CSV Audit Export**: Export incident catalogs with snapshot URLs, timestamps, and priority tags.

---

## 📹 Dynamic RTSP Camera Pipeline

### Multi-Threaded Architecture
1. **Thread Isolation**: Each enabled camera runs inside an independent daemon thread `_camera_loop(camera_config)`.
2. **Buffer Flushing**: RTSP network streams frequently accumulate latency if frames are buffered. The capture loop calls `cap.grab()` 3 times before `cap.retrieve()`, ensuring the system always analyzes real-time frames.
3. **Reconnect Watchdog**: If a camera fails to produce valid frames for 15 consecutive iterations, the capture session is closed and cleanly re-initialized without interrupting other cameras.
4. **Health Check Worker**: A dedicated background thread `_health_check_loop()` executes every 15 seconds, inspecting the `system_state` heartbeat for every registered camera. If `now - last_seen > 30s`, an offline alert is logged and sent to Telegram.
5. **Dynamic DB Registry**: Cameras are persisted in the database (`cameras` table). Adding, updating, or disabling cameras via the API takes effect without restarting the backend.

---

## 🔐 Role-Based Access Control (RBAC)

The application enforces strict role separation using JSON Web Tokens (JWT) and route-level dependencies.

| Route / Capability | Endpoint | Description | 👑 Admin | 👔 Manager | 🛡️ Security Guard |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **Live CCTV Dashboard** | `/dashboard` | View live MJPEG video streams & real-time detection toasts | ✅ Full | ✅ Full | ✅ Full |
| **Incident Records** | `/records` | Browse historical security events, open snapshots, export CSV | ✅ Full | ✅ Full | ✅ Full |
| **Attendance Sheet** | `/attendance` | View daily staff punch-in/out logs & export attendance CSV | ✅ Full | ✅ Full | ❌ Restricted |
| **Attendance Override** | `/attendance/override` | Manually adjust attendance records with audit reason | ✅ Full | ✅ Full | ❌ Restricted |
| **Staff Enrollment** | `/admin` | Enroll employees, upload multi-angle photos, edit shifts | ✅ Full | ✅ Full | ❌ Restricted |
| **User Management** | `/admin` | Create system logins, assign roles, reset user passwords | ✅ Full | ❌ Restricted | ❌ Restricted |
| **Camera Hardware** | `/cameras` | Add, modify, disable, or delete RTSP camera feeds | ✅ Full | ❌ Restricted | ❌ Restricted |
| **Store Hours** | `/settings` | Configure store opening and closing threat windows | ✅ Full | ❌ Restricted | ❌ Restricted |

---

## 🗄️ Database Schema & Data Model

The system utilizes an automated migration layer supporting **PostgreSQL** in production with zero-configuration auto-fallback to **SQLite** (`backend/cctv.db`).

```mermaid
erDiagram
    employees ||--o{ employee_photos : "has many photos"
    employees ||--o{ attendance : "records daily punch"
    cameras ||--o{ alerts : "triggers incident"
    cameras ||--o{ attendance : "logs zone"

    employees {
        int id PK
        text name
        text shift_start
        text shift_end
        text photo_filename
        text designation
    }

    employee_photos {
        int id PK
        int employee_id FK
        text filename
    }

    attendance {
        int id PK
        int employee_id FK
        text attendance_date
        text first_seen
        text last_seen
        text last_camera_id
        text zone_id
        text status
        text override_reason
        boolean is_override
    }

    alerts {
        int id PK
        text person_name
        text alert_type
        text priority
        text message
        text timestamp
        text snapshot_filename
        text camera_id
    }

    cameras {
        text id PK
        text name
        text rtsp_url
        text location
        boolean enabled
    }

    users {
        int id PK
        text username UK
        text password_hash
        text role
        text name
        timestamp created_at
    }

    currently_detected {
        text person_name PK
        text camera_id PK
        text last_seen
    }

    system_state {
        text key PK
        text value
    }
```

---

## 🔔 Notification & Storage Architecture

### 1. Telegram Dispatch Service
- **Text & Photo Delivery**: When an incident with `high` priority triggers, the backend uses `requests.post` to deliver the alert directly to the configured Telegram chat.
- **Alert Caption Format**:
  ```text
  🔴 [HIGH] [Front Door Camera] Unknown person detected outside store hours
  🟠 [MEDIUM] [Showroom Cam] Rajesh Kumar still in store 45 min after shift end
  🔴 [HIGH] [201 Door] Camera view blocked or tampered with
  ```

### 2. Dual Storage Architecture
- **Snapshots & Training Photos**:
  - **Cloud Mode**: Uploads snapshot images to Supabase Storage bucket (`cctv-alerts-photos`) and generates persistent public CDN URLs.
  - **Local Mode**: When Supabase is not configured, files are stored under `backend/snapshots/` and `backend/known_faces/` and served directly via the authenticated `/snapshots/{filename}` API endpoint.

---

## 💻 Frontend Application Structure

Built with modern **React 18**, **Vite**, and **Tailwind CSS**, styled in an enterprise dark theme with curated color tokens.

```
frontend/
├── src/
│   ├── components/
│   │   ├── Navbar.jsx          # Header navigation bar with branding
│   │   ├── ProtectedRoute.jsx  # Route guard validating JWT and role claims
│   │   ├── Sidebar.jsx         # Collapsible navigation bar with role-filtered icons
│   │   └── Topbar.jsx          # Top user profile, role badge & title header
│   ├── context/
│   │   └── AuthContext.jsx     # Centralized JWT state, login/logout & apiFetch wrapper
│   ├── pages/
│   │   ├── AdminPage.jsx       # Staff enrollment, shift schedules & User RBAC panel
│   │   ├── Attendance.jsx      # Daily attendance grid, date filters, override modal & CSV export
│   │   ├── AttendancePage.jsx  # Wrapper component for attendance
│   │   ├── DashboardPage.jsx   # Live CCTV MJPEG player, detection feed & alert toasts
│   │   ├── LoginPage.jsx       # Secure credentials login portal
│   │   ├── Records.jsx         # Forensics incident records, snapshot modal & CSV export
│   │   └── SettingsPage.jsx    # Store open/close operating hours settings
│   ├── App.jsx                 # Client-side routing table & RBAC permissions map
│   ├── index.css               # Design system variables & Tailwind CSS directives
│   └── main.jsx                # Application root entry point
├── index.html                  # HTML skeleton with Plus Jakarta Sans typography
├── tailwind.config.js          # Custom theme configuration
└── vite.config.js              # Dev server proxy configuration for backend endpoints
```

---

## ⚙️ Configuration & Environment Variables

Copy `backend/.env.example` to `backend/.env`:

```bash
cp backend/.env.example backend/.env
```

### Complete Variable Reference
| Variable | Required | Default / Example | Purpose |
| :--- | :---: | :--- | :--- |
| `API_SECRET_KEY` | Optional | `super-secret-key-1234` | Internal cryptographic verification key |
| `JWT_SECRET` | **Yes** | `your-secure-jwt-secret-key` | Secret key used to sign and verify session JWTs |
| `DEFAULT_ADMIN_USERNAME` | Optional | `admin` | Username for the auto-seeded root Administrator |
| `DEFAULT_ADMIN_PASSWORD` | Optional | `admin123` | Password for the auto-seeded root Administrator |
| `DATABASE_URL` | Optional | `postgres://user:pass@host/db` | PostgreSQL connection string. Falls back to SQLite if omitted |
| `TELEGRAM_BOT_TOKEN` | Optional | `123456789:ABCdefGhI...` | Telegram Bot API token for dispatching alerts |
| `TELEGRAM_CHAT_ID` | Optional | `-1001234567890` | Telegram Chat ID / Channel ID receiving notifications |
| `SUPABASE_URL` | Optional | `https://xyzproject.supabase.co`| Supabase Project URL for remote photo storage |
| `SUPABASE_SERVICE_KEY` | Optional | `eyJh...` | Supabase Service Role Key |
| `SUPABASE_BUCKET_NAME` | Optional | `cctv-alerts-photos` | Bucket name for snapshots and face templates |

### Operational Parameters (`backend/config.py`)
| Parameter | Default Value | Description |
| :--- | :---: | :--- |
| `LOW_THRESHOLD_MIN` | `30` | Minutes early/overstay for Low priority classification |
| `MEDIUM_THRESHOLD_MIN` | `60` | Minutes early/overstay for Medium priority classification |
| `RECOGNITION_INTERVAL_SEC`| `5` | Frequency of facial recognition worker execution |
| `UNKNOWN_STREAK_THRESHOLD`| `3` | Consecutive unknown detections required before stranger alert |
| `ALERT_DEDUPE_WINDOW_SEC` | `60` | Cooldown window preventing identical alert spamming |
| `CAMERA_OFFLINE_THRESHOLD_SEC`| `30` | Inactivity threshold before flagging camera offline |
| `CAMERA_HEALTH_CHECK_INTERVAL_SEC`| `15` | Polling frequency of camera health watchdog thread |
| `TAMPER_BRIGHTNESS_THRESHOLD` | `15` | Minimum average luminance before flagging blackout tamper |
| `TAMPER_VARIANCE_THRESHOLD` | `5` | Minimum pixel variance before flagging occlusion tamper |

---

## 🚀 Quick Start & Installation

### 1. Prerequisites
- **Python**: `3.10`, `3.11`, or `3.12` (TensorFlow and DeepFace are optimized for these versions)
- **Node.js**: `18+` and `npm`
- **Git**

---

### 2. Backend Installation

```bash
# 1. Navigate to backend directory
cd backend

# 2. Create and activate virtual environment
# On Windows:
python -m venv venv
.\venv\Scripts\Activate.ps1
# On Linux/macOS:
python3 -m venv venv
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Initialize environment variables
cp .env.example .env
# Edit .env with your preferred secrets and credentials

# 5. Start the backend API server
python -m uvicorn main:app --reload --port 8000
```
- **Backend Running**: `http://localhost:8000`
- **Interactive OpenAPI Documentation**: `http://localhost:8000/docs`

---

### 3. Frontend Installation

```bash
# 1. Open a new terminal and navigate to frontend directory
cd frontend

# 2. Install dependencies
npm install

# 3. Launch Vite development server
npm run dev
```
- **Web Application Portal**: `http://localhost:5173`

---

### 4. Default Super Admin Credentials

On the initial database boot, the system seeds a default Super Admin:
- **Username**: `admin`
- **Password**: `admin123`
- **Role**: `admin`

> ⚠️ **Security Recommendation**: Change this password immediately after first login via the **User Management** panel on the `/admin` page.

---

## 📡 REST API Reference & Payloads

### 1. Authentication
#### `POST /login`
Authenticates a user and issues a bearer token.
- **Request**:
  ```json
  {
    "username": "admin",
    "password": "admin123"
  }
  ```
- **Response**:
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
    "role": "admin",
    "username": "admin",
    "name": "admin"
  }
  ```

---

### 2. Real-Time Status
#### `GET /status`
Returns real-time surveillance statistics for the dashboard.
- **Response**:
  ```json
  {
    "cameras_running": 1,
    "currently_detected": [
      {
        "person_name": "Rajesh Kumar",
        "camera_id": "cam1",
        "last_seen": "2026-09-08T16:30:15"
      }
    ],
    "recent_alerts": [
      {
        "id": 42,
        "person_name": "Unknown@front",
        "alert_type": "stranger",
        "priority": "high",
        "message": "[201 Door] Unknown person detected outside store hours",
        "timestamp": "2026-09-08T16:30:10",
        "snapshot_filename": "/snapshots/c7f8a9...jpg"
      }
    ],
    "store_open": true
  }
  ```

---

### 3. Attendance Override
#### `POST /attendance/override` (Staff / Admin)
Applies a verified manual override to an employee's attendance record.
- **Request**:
  ```json
  {
    "employee_id": 3,
    "date": "2026-09-08",
    "first_seen_at": "09:00",
    "last_seen_at": "18:00",
    "status": "present",
    "reason": "Biometric sensor missed recognition during camera maintenance",
    "zone_id": "Manual Entry"
  }
  ```

---

### 4. Dynamic Camera Management
#### `POST /cameras` (Admin Only)
Registers a new RTSP camera feed in the active monitoring pool.
- **Request**:
  ```json
  {
    "id": "cam2",
    "name": "Vault Room",
    "rtsp_url": "rtsp://admin:pass@192.168.1.50:554/Streaming/Channels/101",
    "location": "vault",
    "enabled": true
  }
  ```

---

## 🖥️ Production Deployment & Hardware Sizing

### Minimum Hardware Sizing
| Component | Minimum Specification | Recommended Production Spec |
| :--- | :--- | :--- |
| **CPU** | Intel Core i5 8th Gen (4 Cores) | Intel Core i7 / Xeon (8+ Cores) or AMD Ryzen 7 |
| **RAM** | 8 GB | 16 GB – 32 GB DDR4 |
| **Storage** | 128 GB SSD | 512 GB NVMe SSD |
| **GPU Acceleration** | Optional (CPU MTCNN) | NVIDIA GeForce GTX 1660 / RTX 3060 (CUDA accelerated) |
| **Network** | 100 Mbps Ethernet | Gigabit Ethernet (dedicated surveillance VLAN) |

### Nginx Reverse Proxy Configuration (Sample)
```nginx
server {
    listen 80;
    server_name cctv.yourstore.com;

    # Frontend Single Page App
    location / {
        root /var/www/cctv-alerts/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Backend API & Streaming Proxy
    location ~ ^/(api|auth|login|users|employees|attendance|records|settings|status|cameras|video_feed|snapshots)/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
        proxy_read_timeout 86400s;
    }
}
```

---

## ❓ Troubleshooting & FAQs

<details>
<summary><b>1. DeepFace is downloading large weight files on first start. Is this normal?</b></summary>
Yes. On the first run, DeepFace downloads pretrained weights for MTCNN and facial representation models into <code>~/.deepface/weights/</code>. Ensure the machine has internet connectivity during initial startup.
</details>

<details>
<summary><b>2. How do I test the system without physical IP cameras?</b></summary>
You can simulate an RTSP camera using a local MP4 file or webcam using tools like <a href="https://github.com/bluenviron/mediamtx">MediaMTX</a> or VLC media player streaming over RTSP. Alternatively, update <code>config.py</code> to test with local test RTSP feeds.
</details>

<details>
<summary><b>3. Why does the console show "PostgreSQL connection failed. Falling back to local SQLite"?</b></summary>
This indicates that <code>DATABASE_URL</code> is either not set in your <code>.env</code> file or the remote PostgreSQL host is unreachable. The application automatically falls back to an embedded SQLite database (<code>cctv.db</code>) with zero interruption.
</details>

<details>
<summary><b>4. How do I setup Telegram notifications?</b></summary>
1. Contact <code>@BotFather</code> on Telegram, send <code>/newbot</code>, and copy your HTTP API bot token into <code>TELEGRAM_BOT_TOKEN</code>.<br/>
2. Add your bot to your target security channel or group.<br/>
3. Obtain your Chat ID via <code>@userinfobot</code> and add it into <code>TELEGRAM_CHAT_ID</code>.
</details>

---

## 📄 License

This software and related documentation are proprietary and confidential. All rights reserved.