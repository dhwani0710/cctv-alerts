@echo off
cd /d C:\Users\DELL\cctv\cctv-alerts\backend
start "backend" cmd /k "for /l %%i in (0,0,1) do (py -3.11 -m uvicorn main:app --host 0.0.0.0 --port 8000 & timeout /t 5)"
cd /d C:\Users\DELL\cctv\cctv-alerts\frontend
start "frontend" cmd /k "for /l %%i in (0,0,1) do (serve -s dist -l 5173 & timeout /t 5)"