param(
  [string]$OdhenRoot = "C:\TEKNISA\odhen-perifericos",
  [string]$Server = "192.168.0.24\SQLEXPRESS",
  [string]$Database = "teknisa",
  [string]$OutputPath = ".\mooca-commandas-preflight-real.json"
)

$ErrorActionPreference = "Stop"

# STANDALONE READ-ONLY PREFLIGHT.
# No helper scripts, no HTTP, no order-row reads, no print, no fiscal action.
# Intentional write: the single evidence JSON at $OutputPath.

function Clean([object]$Value) { return [string]($Value ?? "") }
function PermissionFromReader($reader, [string]$name) {
  if ($reader[$name] -is [DBNull]) { return $null }
  return ([int]$reader[$name] -eq 1)
}
function AnyUnknown($values) {
  return @($values | Where-Object { $_ -eq $null }).Count -gt 0
}
function Safe-GetPrintConfiguration([string]$PrinterName) {
  try {
    $c = Get-PrintConfiguration -PrinterName $PrinterName -ErrorAction Stop
    return [ordered]@{
      paper_size = [string]$c.PaperSize
      paper_size_raw_kind = [string]$c.PaperSize.RawKind
      color = [bool]$c.Color
      duplexing_mode = [string]$c.DuplexingMode
    }
  } catch {
    return [ordered]@{ error = $_.Exception.Message }
  }
}

$result = [ordered]@{
  schema = "deliveryos.mooca-commandas-preflight-standalone.v1"
  captured_at = (Get-Date).ToString("o")
  computer_name = $env:COMPUTERNAME
  script = [ordered]@{
    path = $PSCommandPath
    sha256 = if (Test-Path -LiteralPath $PSCommandPath) { (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash } else { $null }
  }
  source = [ordered]@{
    root = $OdhenRoot
    root_exists = $false
    scanned_roots = @()
    skipped_roots = @()
    files_scanned = 0
    file_hashes = @()
    token_hits = @()
    required_tokens = @(
      "NRCOMANDA","NRCOMANDAEXT","CDPRODUTO","NMPRODUTO","QTPRODCOMVEN",
      "DSOBSDESCIT","DSOBSPEDDIGCMD","DSOBSCOMANDA","TXPRODCOMVEN"
    )
    missing_tokens = @()
    contract_tokens_present = $false
    errors = @()
  }
  fiscal_surface = [ordered]@{
    token_hits = @()
    native_nfce_candidate_detected = $false
  }
  sql = [ordered]@{
    mode = "WINDOWS_INTEGRATED_AUTH_METADATA_ONLY"
    server = $Server
    database = $Database
    connected = $false
    database_matches = $false
    database_permissions = [ordered]@{ select=$null; insert=$null; update=$null; delete=$null; execute=$null; alter=$null; control=$null }
    elevated_roles = [ordered]@{ sysadmin=$null; db_owner=$null; db_datawriter=$null; db_ddladmin=$null }
    executable_procedure_count = $null
    objects = @()
    safe_for_order_read = $false
    blocker = $null
  }
  printers = [ordered]@{
    metadata_collected = $false
    expected = @()
    windows_queues = @()
    errors = @()
  }
  gate = [ordered]@{
    ready_for_one_minimized_order_read_candidate = $false
    observation_semantics_proven = $false
    live_order_read_performed = $false
    physical_print_authorized = $false
  }
  evidence_activity = [ordered]@{
    source_files_read = $false
    database_metadata_query = $false
    printer_metadata_read = $false
    evidence_file_write = $true
  }
  effect_boundary = [ordered]@{
    order_row_read = $false
    database_write = $false
    odhen_write = $false
    fiscal_action = $false
    sefaz_call = $false
    print = $false
    spooler_write = $false
    printer_configuration_change = $false
    network_payload_sent_to_printer = $false
    cutover = $false
  }
}

# ---- 1) Odhen source/config metadata only ----
$codeRoots = @(
  (Join-Path $OdhenRoot "perifericos\src"),
  (Join-Path $OdhenRoot "perifericos\routes"),
  (Join-Path $OdhenRoot "odhenPOS\mobile"),
  (Join-Path $OdhenRoot "odhenPOS\backend_74000")
)
$sourceTokens = @(
  "DeliveryRepository","getAllDeliveryOrders","NRCOMANDA","NRCOMANDAEXT","NRVENDAREST",
  "CDPRODUTO","NMPRODUTO","QTPRODCOMVEN","BUSCA_ITPEDIDO_ENTREGA",
  "DSOBSDESCIT","DSOBSPEDDIGCMD","DSOBSCOMANDA","TXPRODCOMVEN","/print"
)
$fiscalTokens = @(
  "NFCe","NFC-e","SEFAZ","DANFE","QRCode","QR Code",
  "Transmissao Automatica","Transmissão Automática","CSC","certificado","cupom fiscal","fiscal","Interface"
)
$extensions = @(".js",".ts",".json",".config",".txt",".sql",".xml",".yml",".yaml",".php",".ini",".properties")

if (Test-Path -LiteralPath $OdhenRoot -PathType Container) {
  $result.source.root_exists = $true
  $files = @()
  foreach ($root in $codeRoots) {
    if (Test-Path -LiteralPath $root -PathType Container) {
      $result.source.scanned_roots += $root
      $files += Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
        $extensions -contains $_.Extension.ToLowerInvariant() -and
        $_.FullName -notmatch "\\Log(\\|$)" -and
        $_.FullName -notmatch "\\Logs(\\|$)" -and
        $_.FullName -notmatch "\\Temp(\\|$)" -and
        $_.FullName -notmatch "\\cache(\\|$)" -and
        $_.FullName -notmatch "\\node_modules(\\|$)"
      }
    } else {
      $result.source.skipped_roots += $root
    }
  }
  $files = @($files | Sort-Object FullName -Unique)
  $result.source.files_scanned = $files.Count
  if ($files.Count -gt 0) { $result.evidence_activity.source_files_read = $true }

  foreach ($file in $files) {
    try {
      $hash = Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256
      $result.source.file_hashes += [ordered]@{
        path = $file.FullName; sha256 = $hash.Hash; length = $file.Length; last_write_utc = $file.LastWriteTimeUtc.ToString("o")
      }
      foreach ($token in $sourceTokens) {
        $hits = Select-String -LiteralPath $file.FullName -SimpleMatch -Pattern $token -ErrorAction SilentlyContinue
        foreach ($hit in $hits) {
          $result.source.token_hits += [ordered]@{ token=$token; path=$file.FullName; line=$hit.LineNumber }
        }
      }
      foreach ($token in $fiscalTokens) {
        $hits = Select-String -LiteralPath $file.FullName -SimpleMatch -Pattern $token -ErrorAction SilentlyContinue
        foreach ($hit in $hits) {
          $result.fiscal_surface.token_hits += [ordered]@{ token=$token; path=$file.FullName; line=$hit.LineNumber }
        }
      }
    } catch {
      $result.source.errors += ("READ_ERROR:" + $file.FullName)
    }
  }
} else {
  $result.source.errors += "ODHEN_ROOT_NOT_FOUND"
}

$presentTokens = @($result.source.token_hits | ForEach-Object { [string]$_.token } | Sort-Object -Unique)
$result.source.missing_tokens = @($result.source.required_tokens | Where-Object { $_ -notin $presentTokens })
$result.source.contract_tokens_present = (
  $result.source.root_exists -and
  $result.source.missing_tokens.Count -eq 0 -and
  $result.source.errors.Count -eq 0
)
$result.fiscal_surface.native_nfce_candidate_detected = @(
  $result.fiscal_surface.token_hits | Where-Object { $_.token -in @("NFCe","NFC-e","DANFE","SEFAZ") }
).Count -gt 0

# ---- 2) SQL permission metadata only; no operational rows ----
$connectionString = "Server=$Server;Database=$Database;Integrated Security=SSPI;Application Name=DeliveryOSShadowPreflightStandalone;Connect Timeout=5;Encrypt=False;TrustServerCertificate=True"
$conn = New-Object System.Data.SqlClient.SqlConnection $connectionString
try {
  $conn.Open()
  $result.sql.connected = $true
  $result.evidence_activity.database_metadata_query = $true

  $cmd = $conn.CreateCommand()
  $cmd.CommandTimeout = 5
  $cmd.CommandText = @"
SET NOCOUNT ON;
SELECT
  CASE WHEN DB_NAME() = @expected_db THEN 1 ELSE 0 END AS database_matches,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'SELECT') AS can_select,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'INSERT') AS can_insert,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'UPDATE') AS can_update,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'DELETE') AS can_delete,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'EXECUTE') AS can_execute,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'ALTER') AS can_alter,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CONTROL') AS can_control,
  IS_SRVROLEMEMBER('sysadmin') AS is_sysadmin,
  IS_MEMBER('db_owner') AS is_db_owner,
  IS_MEMBER('db_datawriter') AS is_db_datawriter,
  IS_MEMBER('db_ddladmin') AS is_db_ddladmin;
"@
  $null = $cmd.Parameters.Add("@expected_db", [System.Data.SqlDbType]::NVarChar, 128)
  $cmd.Parameters["@expected_db"].Value = $Database
  $reader = $cmd.ExecuteReader()
  if (-not $reader.Read()) { throw "PREFLIGHT_NO_DATABASE_ROW" }
  $result.sql.database_matches = PermissionFromReader $reader "database_matches"
  $result.sql.database_permissions.select = PermissionFromReader $reader "can_select"
  $result.sql.database_permissions.insert = PermissionFromReader $reader "can_insert"
  $result.sql.database_permissions.update = PermissionFromReader $reader "can_update"
  $result.sql.database_permissions.delete = PermissionFromReader $reader "can_delete"
  $result.sql.database_permissions.execute = PermissionFromReader $reader "can_execute"
  $result.sql.database_permissions.alter = PermissionFromReader $reader "can_alter"
  $result.sql.database_permissions.control = PermissionFromReader $reader "can_control"
  $result.sql.elevated_roles.sysadmin = PermissionFromReader $reader "is_sysadmin"
  $result.sql.elevated_roles.db_owner = PermissionFromReader $reader "is_db_owner"
  $result.sql.elevated_roles.db_datawriter = PermissionFromReader $reader "is_db_datawriter"
  $result.sql.elevated_roles.db_ddladmin = PermissionFromReader $reader "is_db_ddladmin"
  $reader.Close()

  $procCmd = $conn.CreateCommand()
  $procCmd.CommandTimeout = 5
  $procCmd.CommandText = @"
SET NOCOUNT ON;
SELECT COUNT_BIG(*)
FROM sys.procedures p
JOIN sys.schemas s ON s.schema_id = p.schema_id
WHERE HAS_PERMS_BY_NAME(s.name + '.' + p.name, 'OBJECT', 'EXECUTE') = 1;
"@
  $result.sql.executable_procedure_count = [int64]$procCmd.ExecuteScalar()

  foreach ($objectName in @("COMANDAVEN","VENDAREST","ITCOMANDAVEN","PRODUTO")) {
    $objCmd = $conn.CreateCommand()
    $objCmd.CommandTimeout = 5
    $objCmd.CommandText = @"
SET NOCOUNT ON;
SELECT s.name AS schema_name, o.name AS object_name, o.type_desc,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'SELECT') AS can_select,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'INSERT') AS can_insert,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'UPDATE') AS can_update,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'DELETE') AS can_delete,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'ALTER') AS can_alter,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'CONTROL') AS can_control,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'TAKE OWNERSHIP') AS can_take_ownership
FROM sys.objects o
JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE o.name = @object_name AND o.type IN ('U','V','SN')
ORDER BY s.name;
"@
    $null = $objCmd.Parameters.Add("@object_name", [System.Data.SqlDbType]::NVarChar, 128)
    $objCmd.Parameters["@object_name"].Value = $objectName
    $rows = @()
    $objReader = $objCmd.ExecuteReader()
    while ($objReader.Read()) {
      $rows += [ordered]@{
        schema=[string]$objReader["schema_name"]; name=[string]$objReader["object_name"]; type=[string]$objReader["type_desc"];
        select=PermissionFromReader $objReader "can_select"; insert=PermissionFromReader $objReader "can_insert";
        update=PermissionFromReader $objReader "can_update"; delete=PermissionFromReader $objReader "can_delete";
        alter=PermissionFromReader $objReader "can_alter"; control=PermissionFromReader $objReader "can_control";
        take_ownership=PermissionFromReader $objReader "can_take_ownership"
      }
    }
    $objReader.Close()
    if ($rows.Count -ne 1) {
      $result.sql.objects += [ordered]@{ requested_name=$objectName; resolved=$false; match_count=$rows.Count; blocker=if($rows.Count -eq 0){"OBJECT_NOT_FOUND_OR_NOT_VISIBLE"}else{"OBJECT_NAME_AMBIGUOUS"} }
      continue
    }
    $obj = $rows[0]
    $colCmd = $conn.CreateCommand()
    $colCmd.CommandTimeout = 5
    $colCmd.CommandText = @"
SET NOCOUNT ON;
SELECT COUNT_BIG(*)
FROM sys.columns c
JOIN sys.objects o ON o.object_id = c.object_id
JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE s.name = @schema_name AND o.name = @object_name
AND HAS_PERMS_BY_NAME(s.name + '.' + o.name + '.' + c.name, 'COLUMN', 'UPDATE') = 1;
"@
    $null = $colCmd.Parameters.Add("@schema_name", [System.Data.SqlDbType]::NVarChar, 128)
    $colCmd.Parameters["@schema_name"].Value = $obj.schema
    $null = $colCmd.Parameters.Add("@object_name", [System.Data.SqlDbType]::NVarChar, 128)
    $colCmd.Parameters["@object_name"].Value = $obj.name
    $writableColumns = [int64]$colCmd.ExecuteScalar()
    $permUnknown = AnyUnknown @($obj.select,$obj.insert,$obj.update,$obj.delete,$obj.alter,$obj.control,$obj.take_ownership)
    $hasWrite = ($obj.insert -eq $true) -or ($obj.update -eq $true) -or ($obj.delete -eq $true) -or ($obj.alter -eq $true) -or ($obj.control -eq $true) -or ($obj.take_ownership -eq $true) -or ($writableColumns -gt 0)
    $result.sql.objects += [ordered]@{
      requested_name=$objectName; resolved=$true; schema=$obj.schema; name=$obj.name; type=$obj.type;
      permissions=[ordered]@{ select=$obj.select; insert=$obj.insert; update=$obj.update; delete=$obj.delete; alter=$obj.alter; control=$obj.control; take_ownership=$obj.take_ownership; writable_column_count=$writableColumns };
      permission_state_unknown=$permUnknown; safe_read_only=(($obj.select -eq $true) -and -not $permUnknown -and -not $hasWrite)
    }
  }

  $allDbValues = @(
    $result.sql.database_permissions.select,$result.sql.database_permissions.insert,$result.sql.database_permissions.update,
    $result.sql.database_permissions.delete,$result.sql.database_permissions.execute,$result.sql.database_permissions.alter,
    $result.sql.database_permissions.control,$result.sql.elevated_roles.sysadmin,$result.sql.elevated_roles.db_owner,
    $result.sql.elevated_roles.db_datawriter,$result.sql.elevated_roles.db_ddladmin
  )
  $dbUnknown = AnyUnknown $allDbValues
  $hasDbWrite = $result.sql.database_permissions.insert -or $result.sql.database_permissions.update -or $result.sql.database_permissions.delete -or $result.sql.database_permissions.execute -or $result.sql.database_permissions.alter -or $result.sql.database_permissions.control
  $hasElevated = $result.sql.elevated_roles.sysadmin -or $result.sql.elevated_roles.db_owner -or $result.sql.elevated_roles.db_datawriter -or $result.sql.elevated_roles.db_ddladmin
  $allResolved = $result.sql.objects.Count -eq 4 -and @($result.sql.objects | Where-Object { -not $_.resolved }).Count -eq 0
  $allReadOnly = $allResolved -and @($result.sql.objects | Where-Object { -not $_.safe_read_only }).Count -eq 0

  if (-not $result.sql.database_matches) { $result.sql.blocker = "DATABASE_MISMATCH" }
  elseif ($dbUnknown) { $result.sql.blocker = "DATABASE_PERMISSION_STATE_UNKNOWN" }
  elseif ($result.sql.executable_procedure_count -gt 0) { $result.sql.blocker = "WINDOWS_PRINCIPAL_CAN_EXECUTE_PROCEDURE" }
  elseif ($hasElevated) { $result.sql.blocker = "WINDOWS_PRINCIPAL_HAS_ELEVATED_ROLE" }
  elseif ($hasDbWrite) { $result.sql.blocker = "WINDOWS_PRINCIPAL_HAS_DATABASE_WRITE_OR_EXECUTE" }
  elseif (-not $allResolved) { $result.sql.blocker = "TARGET_OBJECT_SET_NOT_PROVEN" }
  elseif (-not $allReadOnly) { $result.sql.blocker = "TARGET_OBJECT_NOT_READ_ONLY" }
  else { $result.sql.safe_for_order_read = $true }
} catch {
  $result.sql.blocker = "INTEGRATED_AUTH_CONNECTION_OR_METADATA_FAILED"
  $result.sql.error = $_.Exception.Message
} finally {
  if ($conn.State -ne [System.Data.ConnectionState]::Closed) { $conn.Close() }
}

# ---- 3) Windows printer metadata only ----
$expected = @(
  @{ code="00002"; name="COZINHA"; ip="192.168.0.116"; alias="LPT3" },
  @{ code="00003"; name="DELIVERY SUSHI 1"; ip="192.168.0.153"; alias=$null },
  @{ code="00004"; name="DELIVERY SUSHI 2"; ip="192.168.0.4"; alias=$null },
  @{ code="00006"; name="BALCAOSUSHI2"; ip="192.168.0.110"; alias="LPT5" },
  @{ code="00007"; name="BAR"; ip="192.168.0.232"; alias="LPT6" },
  @{ code="00009"; name="BALCAOSUSHI1"; ip="192.168.0.142"; alias="LPT4" }
)
try {
  $printers = @(Get-Printer -ErrorAction Stop)
  $ports = @(Get-PrinterPort -ErrorAction Stop)
  $cimPrinters = @()
  try { $cimPrinters = @(Get-CimInstance Win32_Printer -ErrorAction Stop) } catch {}
  $result.evidence_activity.printer_metadata_read = $true

  foreach ($printer in $printers) {
    $port = $ports | Where-Object { $_.Name -eq $printer.PortName } | Select-Object -First 1
    $cim = $cimPrinters | Where-Object { $_.Name -eq $printer.Name } | Select-Object -First 1
    $result.printers.windows_queues += [ordered]@{
      printer_name=[string]$printer.Name; driver_name=[string]$printer.DriverName; port_name=[string]$printer.PortName;
      shared=[bool]$printer.Shared; share_name=[string]$printer.ShareName; published=[bool]$printer.Published;
      printer_status=[string]$printer.PrinterStatus; job_count=[int]$printer.JobCount;
      port=if($port){[ordered]@{name=[string]$port.Name;description=[string]$port.Description;printer_host_address=[string]$port.PrinterHostAddress;port_number=if($null-ne $port.PortNumber){[int]$port.PortNumber}else{$null};snmp_enabled=if($null-ne $port.SNMPEnabled){[bool]$port.SNMPEnabled}else{$null}}}else{$null};
      cim=if($cim){[ordered]@{work_offline=[bool]$cim.WorkOffline;detected_error_state=[string]$cim.DetectedErrorState;extended_printer_status=[string]$cim.ExtendedPrinterStatus;printer_state=[string]$cim.PrinterState;printer_status=[string]$cim.PrinterStatus}}else{$null};
      configuration=Safe-GetPrintConfiguration -PrinterName $printer.Name
    }
  }
  foreach ($e in $expected) {
    $matchingPorts = @($ports | Where-Object { ([string]$_.PrinterHostAddress -eq [string]$e.ip) -or ($e.alias -and ([string]$_.Name -eq [string]$e.alias)) })
    $matchingQueues = @($printers | Where-Object {
      $pn=[string]$_.PortName
      (($matchingPorts | Where-Object { [string]$_.Name -eq $pn }).Count -gt 0) -or ([string]$_.Name -eq [string]$e.name)
    })
    $result.printers.expected += [ordered]@{
      printer_code=$e.code; configured_name=$e.name; configured_ip=$e.ip; configured_port_alias=$e.alias;
      matching_windows_ports=@($matchingPorts | ForEach-Object { [string]$_.Name });
      matching_windows_queues=@($matchingQueues | ForEach-Object { [string]$_.Name })
    }
  }
  $result.printers.metadata_collected = $true
} catch {
  $result.printers.errors += $_.Exception.Message
}

# ---- Gate: still NO order row read ----
$result.gate.ready_for_one_minimized_order_read_candidate = (
  $result.source.contract_tokens_present -and
  $result.sql.safe_for_order_read
)

$json = $result | ConvertTo-Json -Depth 14
$json | Set-Content -LiteralPath $OutputPath -Encoding UTF8
Write-Output $json

if (-not $result.gate.ready_for_one_minimized_order_read_candidate) { exit 4 }
exit 0