param(
  [Parameter(Mandatory=$true)]
  [ValidateSet("LUNCH","DINNER")]
  [string]$Service,

  [Parameter(Mandatory=$true)]
  [ValidatePattern("^\\d{4}-\\d{2}-\\d{2}$")]
  [string]$OperationalDate,

  [Parameter(Mandatory=$true)]
  [ValidateNotNullOrEmpty()]
  [string]$SourceRef,

  [string]$StoreId = "0001",
  [string]$StatePath = "C:\\ProgramData\\TataComandaReader\\state\\production-service-state.json",
  [string]$HistoryPath = "C:\\ProgramData\\TataComandaReader\\state\\production-service-history.jsonl"
)

$ErrorActionPreference = "Stop"

function Write-AtomicJson([string]$Path, $Object) {
  $dir = [IO.Path]::GetDirectoryName($Path)
  if (-not (Test-Path -LiteralPath $dir -PathType Container)) {
    throw "STATE_DIRECTORY_MISSING"
  }
  $tmp = $Path + ".tmp." + $PID + "." + [Guid]::NewGuid().ToString("N")
  $bak = $Path + ".bak"
  $json = $Object | ConvertTo-Json -Depth 10
  $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($json)
  $fs = [IO.File]::Open($tmp,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try {
    $fs.Write($bytes,0,$bytes.Length)
    $fs.Flush($true)
  } finally {
    $fs.Dispose()
  }
  if (Test-Path -LiteralPath $Path -PathType Leaf) {
    if (Test-Path -LiteralPath $bak) { Remove-Item -LiteralPath $bak -Force }
    [IO.File]::Replace($tmp,$Path,$bak,$true)
    if (Test-Path -LiteralPath $bak) { Remove-Item -LiteralPath $bak -Force }
  } else {
    [IO.File]::Move($tmp,$Path)
  }
}

$lockPath = $StatePath + ".lock"
$lock = $null
try {
  $lock = [IO.File]::Open($lockPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)

  $previous = $null
  if (Test-Path -LiteralPath $StatePath -PathType Leaf) {
    $previous = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($previous.schema -ne "deliveryos.production-service-shift-state.v1") {
      throw "SERVICE_STATE_SCHEMA_MISMATCH"
    }
  }

  $state = [ordered]@{
    schema = "deliveryos.production-service-shift-state.v1"
    store_id = $StoreId.Trim()
    operational_date = $OperationalDate
    service = $Service
    evidence = "HUMAN_CONFIRMED_RULE"
    source_ref = $SourceRef.Trim()
    clock_inference_used = $false
    updated_at = (Get-Date).ToString("o")
  }

  if ([string]::IsNullOrWhiteSpace($state.store_id)) { throw "STORE_ID_REQUIRED" }
  if ([string]::IsNullOrWhiteSpace($state.source_ref)) { throw "SOURCE_REF_REQUIRED" }

  Write-AtomicJson $StatePath $state
  $readback = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json
  if (
    $readback.schema -ne $state.schema -or
    $readback.store_id -ne $state.store_id -or
    $readback.operational_date -ne $state.operational_date -or
    $readback.service -ne $state.service -or
    $readback.evidence -ne "HUMAN_CONFIRMED_RULE" -or
    [bool]$readback.clock_inference_used
  ) {
    throw "SERVICE_STATE_READBACK_FAILED"
  }

  $historyRecord = [ordered]@{
    schema = "deliveryos.production-service-shift-history.v1"
    changed_at = (Get-Date).ToString("o")
    store_id = $state.store_id
    operational_date = $state.operational_date
    previous_service = if ($null -eq $previous) { $null } else { [string]$previous.service }
    new_service = $state.service
    evidence = $state.evidence
    source_ref = $state.source_ref
    clock_inference_used = $false
  } | ConvertTo-Json -Compress

  $historyBytes = (New-Object Text.UTF8Encoding($false)).GetBytes($historyRecord + [Environment]::NewLine)
  $history = [IO.File]::Open($HistoryPath,[IO.FileMode]::Append,[IO.FileAccess]::Write,[IO.FileShare]::Read)
  try {
    $history.Write($historyBytes,0,$historyBytes.Length)
    $history.Flush($true)
  } finally {
    $history.Dispose()
  }

  [ordered]@{
    schema = "deliveryos.production-service-shift-set-result.v1"
    status = "SERVICE_STATE_UPDATED"
    state_path = $StatePath
    history_path = $HistoryPath
    previous_service = if ($null -eq $previous) { $null } else { [string]$previous.service }
    current_service = $state.service
    operational_date = $state.operational_date
    state_sha256 = (Get-FileHash -LiteralPath $StatePath -Algorithm SHA256).Hash.ToUpperInvariant()
    effects = [ordered]@{
      local_state_write = $true
      local_history_append = $true
      database_write = $false
      print = $false
      fiscal_action = $false
      cutover = $false
    }
  } | ConvertTo-Json -Depth 8
}
finally {
  if ($null -ne $lock) { $lock.Dispose() }
  if (Test-Path -LiteralPath $lockPath) { Remove-Item -LiteralPath $lockPath -Force }
}
