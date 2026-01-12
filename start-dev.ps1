Set-StrictMode -Version Latest

$ErrorActionPreference = "Stop"

$outerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$innerRoot = Join-Path $outerRoot "Native"

$innerScript = Join-Path $innerRoot "start-dev.ps1"
if (-not (Test-Path $innerScript)) {
  throw "Cannot find inner dev script at: $innerScript"
}

# Delegate to the actual project root (Native/Native) to avoid venv/path confusion.
& $innerScript
