@echo off
cd /d "%~dp0"
:loop
py -3.11 -m uvicorn main:app --host 0.0.0.0 --port 8000
timeout /t 10
goto loop
