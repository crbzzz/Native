Set-StrictMode -Version Latest

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$root`"; .\venv\Scripts\python.exe -m uvicorn backend.app:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$root`"; npm --prefix interface run dev"
