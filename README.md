# Jewellery Store Security Alert System

A modern facial-recognition CCTV monitoring and alert application with Role-Based Access Control (RBAC), built with **FastAPI** on the backend and **React + Vite** on the frontend.

---

## 🔐 Role-Based Access Control (RBAC)

The system supports three user roles with granular permission levels:

| Role | Live CCTV & Alerts (`/dashboard`) | Attendance Logs (`/attendance`) | Staff & Photo Setup (`/admin`) | Store Hours (`/admin`) | User Management (`/admin`) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **👑 Admin** | ✅ Full Access | ✅ Full Access | ✅ Full Access | ✅ Full Access | ✅ Full Access |
| **👔 Manager** | ✅ Full Access | ✅ Full Access | ✅ Full Access | ❌ Restricted | ❌ Restricted |
| **🛡️ Security Guard** | ✅ Full Access | ❌ Restricted | ❌ Restricted | ❌ Restricted | ❌ Restricted |

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Python**: 3.10, 3.11, or 3.12+
- **Node.js**: 18+ and npm

---

### 2. Backend Setup
1. Open a terminal and navigate to the `backend/` folder:
   ```bash
   cd backend
   ```
2. Install Python dependencies:
   ```bash
   python -m pip install -r requirements.txt
   ```
3. (Optional) Copy `.env.example` to `.env` to configure PostgreSQL (Neon/Supabase) or Telegram alerts. If omitted, the backend will automatically use a local SQLite database (`cctv.db`).
4. Start the backend API server:
   ```bash
   python -m uvicorn main:app --reload --port 8000
   ```
   * The API server runs at: `http://localhost:8000`
   * Interactive Swagger docs: `http://localhost:8000/docs`

---

### 3. Frontend Setup
1. Open a second terminal and navigate to the `frontend/` folder:
   ```bash
   cd frontend
   ```
2. Install Node dependencies (if not already installed):
   ```bash
   npm install
   ```
3. Start the Vite React development server:
   ```bash
   npm run dev
   ```
4. Open the application in your browser at:
   👉 **[http://localhost:5173](http://localhost:5173)**

---

## 🔑 Default Super Admin Login

On initial startup, the database automatically seeds a default Super Admin account:
* **Username**: `admin`
* **Password**: `admin123`

Once logged in as Admin, you can navigate to the **User Management (RBAC)** section on the Admin page to create separate accounts for **Managers** and **Security Guards**.

---

## 🛠️ Project Structure

```
cctv-alerts/
├── backend/
│   ├── auth.py             # JWT token generation, password hashing & role guards
│   ├── database.py         # Database layer (PostgreSQL + SQLite auto-fallback)
│   ├── main.py             # FastAPI REST endpoints & MJPEG stream
│   ├── camera_worker.py    # Multi-threaded camera processing
│   ├── recognition.py      # Face recognition module
│   ├── alerts.py           # Anomaly detection & alert triggers
│   ├── storage.py          # Cloud & local snapshot/face storage
│   └── requirements.txt    # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/     # Navbar, ProtectedRoute
│   │   ├── context/        # AuthContext (JWT & state management)
│   │   ├── pages/          # LoginPage, DashboardPage, AdminPage, AttendancePage
│   │   ├── App.jsx         # React Router configuration
│   │   └── main.jsx        # React root entry
│   ├── package.json        # Frontend dependencies & build scripts
│   ├── vite.config.js      # Vite dev server & API proxy config
│   └── tailwind.config.js  # Tailwind CSS configuration
└── README.md
```

---

## 🧪 Verification & Build Commands

* **Run Lint**:
  ```bash
  cd frontend
  npm run lint
  ```
* **Build Frontend Production Bundle**:
  ```bash
  cd frontend
  npm run build
  ```