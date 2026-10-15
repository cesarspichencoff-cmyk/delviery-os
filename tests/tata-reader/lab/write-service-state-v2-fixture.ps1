<#
  SOMENTE LABORATORIO. Nunca atualiza o estado da CAIXA_MOOCA.
  Gera fixture sintética do contrato v2 em diretório filho DIRETO do TEMP,
  com sentinela de teste. Nao comprova turno humano nem recupera pedidos.
  Existe para testar, sem tocar em C:\ProgramData, as guardas do watcher v2.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$LabRoot,
  [Parameter(Mandatory=$true)][ValidateSet("LUNCH","DINNER")][string]$Service,
  [Parameter(Mandatory=$true)][ValidatePattern("^\d{4}-\d{2}-\d{2}$")][string]$OperationalDate,
  [Parameter(Mandatory=$true)][string]$ValidFromLocal,
  [Parameter(Mandatory=$true)][string]$ValidUntilLocal,
  [Parameter(Mandatory=$true)][string]$SourceRef,
  [ValidateSet("None","AfterPrepared")][string]$FailurePoint = "None"
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Caminho deliberadamente mais restrito do que o necessario: direto sob TEMP,
# sem reparse point/junction e com marcador criado pelo harness de laboratorio.
$temp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\','/')
$root = [IO.Path]::GetFullPath($LabRoot).TrimEnd('\','/')
$parent = [IO.Path]::GetDirectoryName($root)
if (-not [string]::Equals($parent, $temp, [StringComparison]::OrdinalIgnoreCase) -or
    -not [IO.Path]::GetFileName($root).StartsWith("deliveryos_g1_lab_", [StringComparison]::Ordinal)) {
  throw "LAB_ROOT_MUST_BE_DIRECT_TEMP_CHILD"
}
if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw "LAB_ROOT_MISSING" }
if (((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
  throw "LAB_ROOT_REPARSE_FORBIDDEN"
}
$marker = Join-Path $root ".deliveryos-g1-lab"
if (-not (Test-Path -LiteralPath $marker -PathType Leaf) -or
    (Get-Content -LiteralPath $marker -Raw -Encoding UTF8).Trim() -ne "DELIVERYOS_G1_LAB_V2_ONLY") {
  throw "LAB_MARKER_MISSING_OR_INVALID"
}
if ($SourceRef -cnotmatch '^LAB_SYNTHETIC:[A-Za-z0-9._-]{4,80}$') {
  throw "LAB_SYNTHETIC_SOURCE_REQUIRED"
}
$from = [datetime]::MinValue
$until = [datetime]::MinValue
$fmt = "yyyy-MM-ddTHH:mm:ss"
$ci = [Globalization.CultureInfo]::InvariantCulture
$style = [Globalization.DateTimeStyles]::None
if (-not [datetime]::TryParseExact($ValidFromLocal,$fmt,$ci,$style,[ref]$from)) {
  throw "VALID_FROM_FORMAT_INVALID"
}
if (-not [datetime]::TryParseExact($ValidUntilLocal,$fmt,$ci,$style,[ref]$until)) {
  throw "VALID_UNTIL_FORMAT_INVALID"
}
if ($from -ge $until) { throw "SERVICE_WINDOW_EMPTY_OR_REVERSED" }
if ($from.ToString("yyyy-MM-dd") -cne $OperationalDate -or
    $until.ToString("yyyy-MM-dd") -cne $OperationalDate) {
  throw "SERVICE_WINDOW_DATE_MISMATCH"
}
$stateDir = Join-Path $root "state"
$statePath = Join-Path $stateDir "production-service-state.json"
$historyPath = Join-Path $root "production-service-history.jsonl"
$lockPath = Join-Path $root ".writer.lock"

function Add-Journal([string]$path,$entry) {
  $line = ($entry | ConvertTo-Json -Compress -Depth 8) + [Environment]::NewLine
  $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($line)
  $file = New-Object IO.FileStream($path,[IO.FileMode]::Append,[IO.FileAccess]::Write,[IO.FileShare]::Read)
  try { $file.Write($bytes,0,$bytes.Length); $file.Flush($true) }
  finally { $file.Dispose() }
}
function Write-Atomic([string]$path,$obj) {
  $json = ($obj | ConvertTo-Json -Depth 8)
  $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($json)
  $tmp = $path + ".tmp." + [guid]::NewGuid().ToString("N")
  $f = New-Object IO.FileStream($tmp,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try { $f.Write($bytes,0,$bytes.Length); $f.Flush($true) }
  finally { $f.Dispose() }
  if (Test-Path -LiteralPath $path -PathType Leaf) {
    [IO.File]::Replace($tmp,$path,$null,$true)
  } else {
    [IO.File]::Move($tmp,$path)
  }
}

# Exclusao mutua local; sem tentar desbloquear automaticamente um writer cuja
# execucao foi interrompida. A seguranca precede a recuperacao automatica.
$lock = $null
try {
  $lock = New-Object IO.FileStream($lockPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  if (-not (Test-Path -LiteralPath $stateDir -PathType Container)) {
    [IO.Directory]::CreateDirectory($stateDir) | Out-Null
  }
  if (((Get-Item -LiteralPath $stateDir).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "STATE_DIR_REPARSE_FORBIDDEN"
  }
  $previous = $null
  if (Test-Path -LiteralPath $statePath -PathType Leaf) {
    $previous = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($previous.schema -ne "deliveryos.production-service-shift-state.v2" -or
        $previous.lab_only -ne $true) { throw "PREVIOUS_STATE_NOT_LAB_V2" }
  }
  $lines = @()
  if (Test-Path -LiteralPath $historyPath -PathType Leaf) {
    $lines = @(Get-Content -LiteralPath $historyPath -Encoding UTF8 | Where-Object { $_.Trim() })
  }
  if ($lines.Count -gt 0) {
    $last = $lines[$lines.Count-1] | ConvertFrom-Json
    if ($last.phase -cne "COMMITTED" -or $null -eq $previous -or
        $last.revision_id -cne $previous.revision_id) {
      throw "JOURNAL_PENDING_AUDIT_REQUIRED"
    }
  } elseif ($null -ne $previous) {
    throw "STATE_WITHOUT_JOURNAL"
  }
  $revision = [guid]::NewGuid().ToString("N")
  $state = [ordered]@{
    schema = "deliveryos.production-service-shift-state.v2"
    store_id = "0001"
    operational_date = $OperationalDate
    service = $Service
    evidence = "HUMAN_CONFIRMED_RULE"
    source_ref = $SourceRef
    clock_inference_used = $false
    valid_from_local = $ValidFromLocal
    valid_until_local = $ValidUntilLocal
    updated_at = (Get-Date).ToString("o")
    lab_only = $true
    revision_id = $revision
  }
  $baseEntry = [ordered]@{
    schema = "deliveryos.g1-lab-journal.v1"
    revision_id = $revision
    previous_revision_id = $(if ($null -eq $previous) { $null } else { $previous.revision_id })
    written_at = (Get-Date).ToString("o")
  }
  $prepared = [ordered]@{}; foreach($key in $baseEntry.Keys){$prepared[$key]=$baseEntry[$key]}
  $prepared.phase = "PREPARED"
  Add-Journal $historyPath $prepared
  if ($FailurePoint -ceq "AfterPrepared") { throw "INJECTED_AFTER_PREPARED" }
  Write-Atomic $statePath $state
  $readback = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($readback.revision_id -cne $revision -or
      $readback.valid_from_local -cne $ValidFromLocal -or
      $readback.valid_until_local -cne $ValidUntilLocal -or
      $readback.lab_only -ne $true) {
    throw "STATE_READBACK_MISMATCH"
  }
  $committed = [ordered]@{}; foreach($key in $baseEntry.Keys){$committed[$key]=$baseEntry[$key]}
  $committed.phase = "COMMITTED"
  Add-Journal $historyPath $committed
  Write-Output ("LAB_V2_COMMITTED " + $revision)
} finally {
  if ($null -ne $lock) {
    $lock.Dispose()
    if (Test-Path -LiteralPath $lockPath -PathType Leaf) {
      Remove-Item -LiteralPath $lockPath -Force
    }
  }
}
