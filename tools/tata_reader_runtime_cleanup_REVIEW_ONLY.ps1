param()

$ErrorActionPreference = "Stop"

# REVIEW ONLY / NOT AUTHORIZED.
# This guard intentionally prevents deletion.
throw "REVIEW_ONLY_NOT_AUTHORIZED:TataComandaReader runtime cleanup"

# Run only after the Windows service has been removed and SQL rollback completed.
$ServiceName = "TataComandaReader"
$InstallRoot = "C:\ProgramData\TataComandaReader"

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
  throw "SERVICE_STILL_EXISTS_CLEANUP_BLOCKED"
}

if (Test-Path -LiteralPath $InstallRoot) {
  Remove-Item -LiteralPath $InstallRoot -Recurse -Force
}