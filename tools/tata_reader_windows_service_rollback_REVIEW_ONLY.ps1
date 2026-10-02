param()

$ErrorActionPreference = "Stop"

# REVIEW ONLY / NOT AUTHORIZED.
# This guard intentionally prevents any service change.
throw "REVIEW_ONLY_NOT_AUTHORIZED:TataComandaReader service rollback"

# The code below is unreachable in this review artifact.
# If rollback is authorized later, generate a fresh executable script rather
# than editing/removing this guard in place.

$ServiceName = "TataComandaReader"

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($service) {
  if ($service.Status -ne "Stopped") {
    & sc.exe stop $ServiceName
    if ($LASTEXITCODE -ne 0) { throw "SERVICE_STOP_FAILED" }
  }

  & sc.exe delete $ServiceName
  if ($LASTEXITCODE -ne 0) { throw "SERVICE_DELETE_FAILED" }
}