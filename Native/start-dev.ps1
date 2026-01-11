Set-StrictMode -Version Latest

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$pythonExe = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
	$pythonExe = Join-Path $root "venv\Scripts\python.exe"
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$root`"; `"$pythonExe`" -m uvicorn backend.app:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$root`"; npm --prefix interface run dev"
