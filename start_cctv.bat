@echo off
cd /d C:\Users\user\cctv-alerts\backend
start "backend" cmd /k uvicorn main:app --host 0.0.0.0 --port 8000
cd /d C:\Users\user\cctv-alerts\frontend
start "frontend" cmd /k npx serve -s dist -l 5173