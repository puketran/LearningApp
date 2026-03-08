@echo off
cd /d "%~dp0"

:: Activate virtualenv and start the server
call venv\Scripts\python.exe run.py

pause
