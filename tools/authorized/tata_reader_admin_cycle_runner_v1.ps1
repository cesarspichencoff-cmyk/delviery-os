param(
  [string]$AuthorizationId = "CESAR-2026-10-02-TATA-READER-ADMIN-V1"
)

$ErrorActionPreference = "Stop"

$ExpectedAuthorizationId = "CESAR-2026-10-02-TATA-READER-ADMIN-V1"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Verifier = Join-Path $PSScriptRoot "verificar_tata_reader_admin_authorized_v1.ps1"
$Apply = Join-Path $PSScriptRoot "tata_reader_admin_apply_authorized_20261002.ps1"

$ResultDirectory = "C:\TATA\comanda-v1\saida\fase3"
$ApplyResultPath = Join-Path $ResultDirectory "TATA_READER_ADMIN_PHASE_RESULT.json"
$DiagnosticPath = Join-Path $ResultDirectory "TATA_READER_PREFLIGHT_DIAGNOSTIC.json"

$ServiceName = "TataComandaReader"
$InstallRoot = "C:\ProgramData\TataComandaReader"
$SqlServer = "(local)\SQLEXPRESS"
$Database = "teknisa"

function Assert-Administrator {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "ADMINISTRATOR_REQUIRED"
  }
}

function Quote-Arg([string]$Value) {
  return '"' + $Value.Replace('"','\"') + '"'
}

function Invoke-PowerShellFile {
  param(
    [string]$ScriptPath,
    [string[]]$ScriptArgs,
    [string]$StdoutPath,
    [string]$StderrPath
  )

  $argParts = @(
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy","Bypass",
    "-File",(Quote-Arg $ScriptPath)
  )
  if ($ScriptArgs) {
    foreach ($arg in $ScriptArgs) { $argParts += (Quote-Arg $arg) }
  }

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $psi.Arguments = ($argParts -join " ")
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true

  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  if (-not $p.Start()) { throw "CHILD_POWERSHELL_START_FAILED" }

  $stdout = $p.StandardOutput.ReadToEnd()
  $stderr = $p.StandardError.ReadToEnd()
  $p.WaitForExit()

  [System.IO.File]::WriteAllText($StdoutPath, $stdout, (New-Object System.Text.UTF8Encoding($false)))
  [System.IO.File]::WriteAllText($StderrPath, $stderr, (New-Object System.Text.UTF8Encoding($false)))

  return [pscustomobject]@{
    exit_code = $p.ExitCode
    stdout = $stdout
    stderr = $stderr
  }
}

function Read-FreshJson {
  param([string]$Path,[datetime]$StartedUtc)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
  $item = Get-Item -LiteralPath $Path
  if ($item.LastWriteTimeUtc -lt $StartedUtc.AddSeconds(-2)) { return $null }

  try {
    return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
  }
  catch {
    return $null
  }
}

function Read-AdministrativeState {
  $state = [ordered]@{
    service_present = $null
    runtime_present = $null
    sql_login_present = $null
    sql_user_present = $null
    check_error = $null
  }

  try {
    $state.service_present = [bool](Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)
    $state.runtime_present = Test-Path -LiteralPath $InstallRoot

    $master = New-Object System.Data.SqlClient.SqlConnection (
      "Server=$SqlServer;Database=master;Integrated Security=SSPI;Application Name=TataReaderCycleStateCheck;Connect Timeout=5;Encrypt=False;TrustServerCertificate=True"
    )
    try {
      $master.Open()
      $cmd = $master.CreateCommand()
      $cmd.CommandText = "SELECT CASE WHEN SUSER_ID(N'NT SERVICE\TataComandaReader') IS NULL THEN 0 ELSE 1 END"
      $state.sql_login_present = ([int]$cmd.ExecuteScalar() -eq 1)
    }
    finally {
      if ($master.State -ne [System.Data.ConnectionState]::Closed) { $master.Close() }
    }

    $db = New-Object System.Data.SqlClient.SqlConnection (
      "Server=$SqlServer;Database=$Database;Integrated Security=SSPI;Application Name=TataReaderCycleStateCheck;Connect Timeout=5;Encrypt=False;TrustServerCertificate=True"
    )
    try {
      $db.Open()
      $cmd = $db.CreateCommand()
      $cmd.CommandText = "SELECT CASE WHEN USER_ID(N'NT SERVICE\TataComandaReader') IS NULL THEN 0 ELSE 1 END"
      $state.sql_user_present = ([int]$cmd.ExecuteScalar() -eq 1)
    }
    finally {
      if ($db.State -ne [System.Data.ConnectionState]::Closed) { $db.Close() }
    }
  }
  catch {
    $state.check_error = $_.Exception.Message
  }

  return [pscustomobject]$state
}

if ($AuthorizationId -ne $ExpectedAuthorizationId) { throw "AUTHORIZATION_ID_MISMATCH" }
Assert-Administrator
if (-not (Test-Path -LiteralPath $Verifier -PathType Leaf)) { throw "AUTHORIZED_VERIFIER_NOT_FOUND" }
if (-not (Test-Path -LiteralPath $Apply -PathType Leaf)) { throw "AUTHORIZED_APPLY_NOT_FOUND" }

New-Item -ItemType Directory -Path $ResultDirectory -Force | Out-Null
$cycleId = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssfffZ")
$cycleDirectory = Join-Path $ResultDirectory ("cycle-" + $cycleId)
New-Item -ItemType Directory -Path $cycleDirectory -Force | Out-Null

$verifierOut = Join-Path $cycleDirectory "verifier.stdout.txt"
$verifierErr = Join-Path $cycleDirectory "verifier.stderr.txt"
$applyOut = Join-Path $cycleDirectory "apply.stdout.txt"
$applyErr = Join-Path $cycleDirectory "apply.stderr.txt"
$runnerResultPath = Join-Path $cycleDirectory "runner-result.json"

$verifierRun = Invoke-PowerShellFile -ScriptPath $Verifier -ScriptArgs @() -StdoutPath $verifierOut -StderrPath $verifierErr
$verifier = $null
try { $verifier = $verifierRun.stdout | ConvertFrom-Json } catch { }

if (
  $verifierRun.exit_code -ne 0 -or
  $null -eq $verifier -or
  -not [bool]$verifier.passed -or
  -not [bool]$verifier.ready_for_authorized_admin_execution
) {
  $state = Read-AdministrativeState
  $summary = [ordered]@{
    schema = "deliveryos.tata-reader-admin-cycle-runner.v1"
    cycle_id = $cycleId
    status = "BLOCKED_BEFORE_EFFECT"
    verifier_exit_code = $verifierRun.exit_code
    verifier_passed = if ($null -eq $verifier) { $false } else { [bool]$verifier.passed }
    retry_authorized = if ($null -eq $verifier) { $false } else { [bool]$verifier.retry_authorized }
    ready_for_authorized_admin_execution = if ($null -eq $verifier) { $false } else { [bool]$verifier.ready_for_authorized_admin_execution }
    administrative_state = $state
    order_row_read = $false
    print = $false
    fiscal_action = $false
    cutover = $false
  }
  $json = $summary | ConvertTo-Json -Depth 6
  [System.IO.File]::WriteAllText($runnerResultPath, $json, (New-Object System.Text.UTF8Encoding($false)))
  $json
  exit 10
}

$startedUtc = (Get-Date).ToUniversalTime()
$applyRun = Invoke-PowerShellFile -ScriptPath $Apply -ScriptArgs @("-AuthorizationId",$AuthorizationId) -StdoutPath $applyOut -StderrPath $applyErr

$applyResult = Read-FreshJson -Path $ApplyResultPath -StartedUtc $startedUtc
$diagnostic = Read-FreshJson -Path $DiagnosticPath -StartedUtc $startedUtc
$state = Read-AdministrativeState

$allClean =
  ($state.check_error -eq $null) -and
  ($state.service_present -eq $false) -and
  ($state.runtime_present -eq $false) -and
  ($state.sql_login_present -eq $false) -and
  ($state.sql_user_present -eq $false)

$successState =
  ($state.check_error -eq $null) -and
  ($state.service_present -eq $true) -and
  ($state.runtime_present -eq $true) -and
  ($state.sql_login_present -eq $true) -and
  ($state.sql_user_present -eq $true)

$status = "UNRESOLVED_RUNNER_STATE"
if (
  $applyRun.exit_code -eq 0 -and
  $null -ne $applyResult -and
  $applyResult.status -eq "PROVEN_ADMIN_PHASE_PASS" -and
  $successState
) {
  $status = "PROVEN_ADMIN_PHASE_PASS"
}
elseif ($applyRun.exit_code -ne 0 -and $allClean) {
  $status = "FAILED_ROLLED_BACK_PROVEN_CLEAN"
}
elseif ($applyRun.exit_code -ne 0 -and -not $allClean) {
  $status = "FAILED_ROLLBACK_RESIDUE_OR_STATE_UNKNOWN"
}

$stderrTail = [string]$applyRun.stderr
if ($stderrTail.Length -gt 4000) { $stderrTail = $stderrTail.Substring($stderrTail.Length - 4000) }

$summary = [ordered]@{
  schema = "deliveryos.tata-reader-admin-cycle-runner.v1"
  cycle_id = $cycleId
  status = $status
  verifier_passed = [bool]$verifier.passed
  candidate_preflight_sha256 = [string]$verifier.candidate_preflight_sha256
  apply_exit_code = $applyRun.exit_code
  apply_status = if ($null -eq $applyResult) { $null } else { [string]$applyResult.status }
  failure = if ($null -eq $applyResult) { $stderrTail } else { [string]$applyResult.failure }
  blocker = if ($null -eq $diagnostic) { $null } else { [string]$diagnostic.blocker }
  diagnostic_error = if ($null -eq $diagnostic) { $null } else { [string]$diagnostic.error }
  administrative_state = $state
  evidence_directory = $cycleDirectory
  order_row_read = $false
  print = $false
  fiscal_action = $false
  cutover = $false
}

$json = $summary | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($runnerResultPath, $json, (New-Object System.Text.UTF8Encoding($false)))
$json

if ($status -eq "PROVEN_ADMIN_PHASE_PASS") { exit 0 }
if ($status -eq "FAILED_ROLLED_BACK_PROVEN_CLEAN") { exit 4 }
exit 5
