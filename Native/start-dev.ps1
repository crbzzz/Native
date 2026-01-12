Set-StrictMode -Version Latest

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# Some setups keep the virtualenv at the repository root (one level above $root).
$repoRoot = Split-Path -Parent $root

$pythonCandidates = @(
	(Join-Path $root ".venv\Scripts\python.exe"),
	(Join-Path $root "venv\Scripts\python.exe"),
	(Join-Path $repoRoot ".venv\Scripts\python.exe"),
	(Join-Path $repoRoot "venv\Scripts\python.exe")
)

$pythonExe = $null
foreach ($p in $pythonCandidates) {
	if (Test-Path $p) { $pythonExe = $p; break }
}

if (-not $pythonExe) {
	throw "Cannot find python venv. Looked in: $($pythonCandidates -join '; ')"
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$root`"; `"$pythonExe`" -m uvicorn backend.app:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$root`"; npm --prefix interface run dev"
