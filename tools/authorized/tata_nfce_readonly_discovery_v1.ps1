param(
  [string]$AuthorizationId = "CESAR-2026-10-03-TATA-NFCE-READONLY-V1",
  [string]$TeknisaRoot = "C:\TEKNISA"
)

$ErrorActionPreference = "Stop"

$ExpectedAuthorizationId = "CESAR-2026-10-03-TATA-NFCE-READONLY-V1"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$AuthorizationFile = Join-Path $RepoRoot "data\tata_nfce_readonly_authorization_v1.json"

function Hash([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
}

function Assert-Administrator {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "ADMINISTRATOR_REQUIRED"
  }
}

function Get-ExecutablePath([string]$PathName) {
  if ([string]::IsNullOrWhiteSpace($PathName)) { return $null }
  $trimmed = $PathName.Trim()
  if ($trimmed.StartsWith('"')) {
    $end = $trimmed.IndexOf('"',1)
    if ($end -gt 1) { return $trimmed.Substring(1,$end-1) }
  }
  $space = $trimmed.IndexOf(' ')
  if ($space -gt 0) { return $trimmed.Substring(0,$space) }
  return $trimmed
}

if ($AuthorizationId -ne $ExpectedAuthorizationId) { throw "AUTHORIZATION_ID_MISMATCH" }
Assert-Administrator

if (-not (Test-Path -LiteralPath $AuthorizationFile -PathType Leaf)) {
  throw "NFCE_READONLY_AUTHORIZATION_FILE_MISSING"
}
$auth = Get-Content -LiteralPath $AuthorizationFile -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not [bool]$auth.human_authorized) { throw "NFCE_READONLY_HUMAN_AUTHORIZATION_FALSE" }
if ($auth.authorization_id -ne $ExpectedAuthorizationId) { throw "NFCE_READONLY_AUTHORIZATION_ID_FILE_MISMATCH" }
if ((Hash $PSCommandPath) -ne [string]$auth.discovery_script_sha256) { throw "NFCE_DISCOVERY_SCRIPT_HASH_MISMATCH" }

$odhenPerifericos = Join-Path $TeknisaRoot "odhen-perifericos"
$odhenPos = Join-Path $TeknisaRoot "odhenPOS"

$result = [ordered]@{
  schema = "deliveryos.tata-nfce-readonly-discovery.v1"
  mode = "READ_ONLY_LOCAL_FISCAL_DISCOVERY"
  captured_at = (Get-Date).ToString("o")
  status = "STARTED"
  teknisa_root = $TeknisaRoot
  source_config = [ordered]@{
    roots = @()
    files_scanned = 0
    token_hits = @()
    token_hits_truncated = $false
  }
  services = @()
  processes = @()
  listeners = @()
  printers = @()
  certificates = [ordered]@{
    stores_checked = @("LocalMachine\My","CurrentUser\My")
    total = 0
    with_private_key = 0
    currently_valid_with_private_key = 0
    expiring_within_60_days = 0
    candidates = @()
  }
  effects = [ordered]@{
    order_read = $false
    database_query = $false
    database_write = $false
    odhen_write = $false
    config_write = $false
    process_start = $false
    service_change = $false
    printer_change = $false
    print = $false
    http = $false
    sefaz_call = $false
    fiscal_action = $false
    danfe_print = $false
    cutover = $false
  }
  error = $null
}

try {
  $roots = @(
    (Join-Path $odhenPerifericos "src"),
    (Join-Path $odhenPerifericos "routes"),
    (Join-Path $odhenPos "mobile"),
    (Join-Path $odhenPos "backend_74000")
  )

  $tokens = @(
    "NFCe","NFC-e","SEFAZ","DANFE","QRCode","QR Code",
    "Transmissao Automatica","Transmissão Automática","CSC",
    "certificado","cupom fiscal","fiscal","Interface"
  )

  $extensions = @(".js",".ts",".json",".config",".txt",".sql",".xml",".yml",".yaml",".php",".ini",".env",".properties")
  $files = @()

  foreach ($root in $roots) {
    if (Test-Path -LiteralPath $root -PathType Container) {
      $result.source_config.roots += $root
      $files += Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object {
          $extensions -contains $_.Extension.ToLowerInvariant() -and
          $_.FullName -notmatch "\\Log(\\|$)" -and
          $_.FullName -notmatch "\\Logs(\\|$)" -and
          $_.FullName -notmatch "\\Temp(\\|$)" -and
          $_.FullName -notmatch "\\cache(\\|$)" -and
          $_.FullName -notmatch "\\node_modules(\\|$)"
        }
    }
  }

  $files = @($files | Sort-Object FullName -Unique)
  $result.source_config.files_scanned = $files.Count

  foreach ($file in $files) {
    foreach ($token in $tokens) {
      $hits = Select-String -LiteralPath $file.FullName -SimpleMatch -Pattern $token -ErrorAction SilentlyContinue
      foreach ($hit in $hits) {
        if ($result.source_config.token_hits.Count -ge 300) {
          $result.source_config.token_hits_truncated = $true
          break
        }
        $result.source_config.token_hits += [ordered]@{
          token = $token
          path = $file.FullName
          line = $hit.LineNumber
        }
      }
      if ($result.source_config.token_hits_truncated) { break }
    }
    if ($result.source_config.token_hits_truncated) { break }
  }

  $servicePattern = "(?i)(teknisa|odhen|interface|nfce|nfc-e|fiscal)"
  $services = @(
    Get-CimInstance Win32_Service -ErrorAction SilentlyContinue |
      Where-Object {
        $_.Name -match $servicePattern -or
        $_.DisplayName -match $servicePattern -or
        $_.PathName -match $servicePattern
      } |
      Sort-Object Name |
      Select-Object -First 100
  )

  foreach ($service in $services) {
    $exe = Get-ExecutablePath ([string]$service.PathName)
    $version = $null
    $productVersion = $null
    if ($exe -and (Test-Path -LiteralPath $exe -PathType Leaf)) {
      try {
        $vi = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($exe)
        $version = [string]$vi.FileVersion
        $productVersion = [string]$vi.ProductVersion
      } catch { }
    }
    $result.services += [ordered]@{
      name = [string]$service.Name
      display_name = [string]$service.DisplayName
      state = [string]$service.State
      start_mode = [string]$service.StartMode
      start_name = [string]$service.StartName
      executable_path = $exe
      file_version = $version
      product_version = $productVersion
    }
  }

  $processPattern = "(?i)(teknisa|odhen|interface|nfce|nfc|fiscal|apache)"
  $processes = @(
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object {
        $_.Name -match $processPattern -or
        $_.ExecutablePath -match $processPattern
      } |
      Sort-Object ProcessId |
      Select-Object -First 100
  )
  foreach ($process in $processes) {
    $result.processes += [ordered]@{
      pid = [int]$process.ProcessId
      name = [string]$process.Name
      executable_path = [string]$process.ExecutablePath
    }
  }

  $knownPids = @($result.processes | ForEach-Object { [int]$_.pid })
  if ($knownPids.Count -gt 0 -and (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) {
    $tcp = @(
      Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $knownPids -contains [int]$_.OwningProcess } |
        Sort-Object OwningProcess,LocalPort |
        Select-Object -First 100
    )
    foreach ($entry in $tcp) {
      $processName = ($result.processes | Where-Object { $_.pid -eq [int]$entry.OwningProcess } | Select-Object -First 1).name
      $result.listeners += [ordered]@{
        process = [string]$processName
        pid = [int]$entry.OwningProcess
        local_address = [string]$entry.LocalAddress
        local_port = [int]$entry.LocalPort
      }
    }
  }

  $printers = @(
    Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue |
      Sort-Object Name |
      Select-Object -First 100
  )
  foreach ($printer in $printers) {
    $result.printers += [ordered]@{
      name = [string]$printer.Name
      driver = [string]$printer.DriverName
      port = [string]$printer.PortName
      is_default = [bool]$printer.Default
      network = [bool]$printer.Network
      shared = [bool]$printer.Shared
      work_offline = [bool]$printer.WorkOffline
    }
  }

  $now = Get-Date
  $soon = $now.AddDays(60)
  foreach ($store in @("Cert:\LocalMachine\My","Cert:\CurrentUser\My")) {
    if (-not (Test-Path -LiteralPath $store)) { continue }
    foreach ($cert in @(Get-ChildItem -LiteralPath $store -ErrorAction SilentlyContinue | Select-Object -First 100)) {
      $result.certificates.total++
      if ($cert.HasPrivateKey) { $result.certificates.with_private_key++ }
      $valid = ($cert.NotBefore -le $now -and $cert.NotAfter -ge $now)
      if ($cert.HasPrivateKey -and $valid) { $result.certificates.currently_valid_with_private_key++ }
      if ($cert.HasPrivateKey -and $valid -and $cert.NotAfter -le $soon) { $result.certificates.expiring_within_60_days++ }

      if ($cert.HasPrivateKey) {
        $result.certificates.candidates += [ordered]@{
          store = if ($store -like "*LocalMachine*") { "LocalMachine\My" } else { "CurrentUser\My" }
          not_before = $cert.NotBefore.ToString("o")
          not_after = $cert.NotAfter.ToString("o")
          currently_valid = [bool]$valid
          signature_algorithm = [string]$cert.SignatureAlgorithm.FriendlyName
        }
      }
    }
  }

  $result.status = "PROVEN_READONLY_NFCE_DISCOVERY"
}
catch {
  $result.status = "NFCE_READONLY_DISCOVERY_FAILED"
  $result.error = [string]$_.Exception.Message
}

$result | ConvertTo-Json -Depth 10
if ($result.status -eq "PROVEN_READONLY_NFCE_DISCOVERY") { exit 0 }
exit 4
