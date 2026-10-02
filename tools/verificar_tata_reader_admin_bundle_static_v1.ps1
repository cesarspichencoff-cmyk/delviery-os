param()

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

function Read-Text([string]$RelativePath) {
  Get-Content -LiteralPath (Join-Path $Root $RelativePath) -Raw -Encoding UTF8
}

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Normalize-Set([object[]]$Values) {
  @($Values | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ } | Sort-Object -Unique)
}

function Assert-SameSet([object[]]$Actual, [object[]]$Expected, [string]$Label) {
  $a = Normalize-Set $Actual
  $e = Normalize-Set $Expected
  if (($a -join '|') -ne ($e -join '|')) {
    throw ($Label + ': actual=' + ($a -join ',') + ' expected=' + ($e -join ','))
  }
}

$manifest = Read-Text 'data\tata_reader_permission_manifest_v1.json' | ConvertFrom-Json
$preflight = Read-Text 'tools\tata_reader_least_privilege_preflight.ps1'
$sql = Read-Text 'tools\tata_reader_sql_apply_REVIEW_ONLY.sql'
$serviceApply = Read-Text 'tools\tata_reader_windows_service_apply_REVIEW_ONLY.ps1'
$serviceRollback = Read-Text 'tools\tata_reader_windows_service_rollback_REVIEW_ONLY.ps1'
$runtimeCleanup = Read-Text 'tools\tata_reader_runtime_cleanup_REVIEW_ONLY.ps1'
$hostSource = Read-Text 'tools\tata_reader_preflight_service\TataComandaReader.PreflightService.cs'
$hostBuild = Read-Text 'tools\tata_reader_preflight_service\build.ps1'
$doc = Read-Text 'docs\TATA_READER_ADMIN_REVIEW_GATE_2026-10-02.md'

function Parse-PreflightColumns([string]$Table) {
  $pattern = '(?ms)^\s*' + [regex]::Escape($Table) + '\s*=\s*@\((.*?)\)'
  $m = [regex]::Match($preflight, $pattern)
  Assert-True $m.Success ('preflight allowlist missing ' + $Table)
  @([regex]::Matches($m.Groups[1].Value, '"([^"]+)"') | ForEach-Object { $_.Groups[1].Value })
}

function Parse-SqlColumns([string]$Table) {
  $pattern = '(?ms)GRANT\s+SELECT\s*\((.*?)\)\s*ON\s+OBJECT::\[TEKNISA\]\.\[' + [regex]::Escape($Table) + '\]'
  $m = [regex]::Match($sql, $pattern)
  Assert-True $m.Success ('SQL grant missing ' + $Table)
  @([regex]::Matches($m.Groups[1].Value, '\[([A-Z0-9_]+)\]', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase) | ForEach-Object { $_.Groups[1].Value })
}

function Parse-DocColumns([string]$Table) {
  $heading = '### TEKNISA.' + $Table
  $start = $doc.IndexOf($heading)
  Assert-True ($start -ge 0) ('doc section missing ' + $Table)
  $tail = $doc.Substring($start + $heading.Length)
  $line = @($tail -split "`r?`n" | Where-Object { $_.Trim().StartsWith([string][char]96) })[0]
  Assert-True (-not [string]::IsNullOrWhiteSpace($line)) ('doc columns missing ' + $Table)
  @($line.Replace([string][char]96, '').Split(',') | ForEach-Object { $_.Trim() })
}

Assert-True ($manifest.status -eq 'REVIEW_ONLY_NOT_AUTHORIZED') 'manifest status mismatch'
Assert-True ($manifest.principal -eq 'NT SERVICE\TataComandaReader') 'principal mismatch'
Assert-True ($manifest.server -eq '(local)\SQLEXPRESS') 'server mismatch'
Assert-True ($manifest.database -eq 'teknisa') 'database mismatch'
Assert-True ($manifest.object_schema -eq 'TEKNISA') 'schema mismatch'
Assert-True ([bool]$manifest.scope_policy.integrated_delivery_channels_only) 'integrated scope mismatch'
Assert-True (-not [bool]$manifest.scope_policy.manual_pos_delivery) 'manual POS scope must be false'
Assert-True (-not [bool]$manifest.scope_policy.dscomanda) 'DSCOMANDA scope must be false'
Assert-True (-not [bool]$manifest.scope_policy.combo_structure_columns) 'combo scope must be false'
Assert-True (-not [bool]$manifest.scope_policy.takeaway_origin_column) 'takeaway scope must be false'

foreach ($property in $manifest.allowed_columns.PSObject.Properties) {
  $table = $property.Name
  $expected = @($property.Value)
  Assert-SameSet (Parse-PreflightColumns $table) $expected ('preflight mismatch ' + $table)
  Assert-SameSet (Parse-SqlColumns $table) $expected ('SQL mismatch ' + $table)
  Assert-SameSet (Parse-DocColumns $table) $expected ('doc mismatch ' + $table)
}

foreach ($excluded in @($manifest.explicitly_excluded_columns)) {
  foreach ($property in $manifest.allowed_columns.PSObject.Properties) {
    Assert-True ((Parse-PreflightColumns $property.Name) -notcontains $excluded) ('excluded in preflight: ' + $excluded)
    Assert-True ((Parse-SqlColumns $property.Name) -notcontains $excluded) ('excluded in SQL: ' + $excluded)
  }
}

Assert-True ($preflight.Contains('deliveryos.tata-reader-least-privilege-preflight.v4')) 'preflight v4 marker missing'
Assert-True ($preflight.Contains('INTEGRATED_DELIVERY_CHANNELS_ONLY')) 'scope marker missing'
Assert-True (-not $preflight.Contains('AllowDsComanda')) 'latent DSCOMANDA switch present'
Assert-True ($preflight.Contains('SPECIFIC_LOGIN_IMPERSONATION_PRESENT')) 'login impersonation guard missing'
Assert-True ($preflight.Contains('SPECIFIC_USER_IMPERSONATION_PRESENT')) 'user impersonation guard missing'
Assert-True ($preflight.Contains('NON_TABLE_OBJECT_PERMISSION_PRESENT')) 'non-table guard missing'
Assert-True ($preflight.Contains('READABLE_SURFACE_OUTSIDE_ALLOWLIST')) 'outside surface guard missing'

Assert-True ([regex]::IsMatch($sql, 'SET\s+NOEXEC\s+ON\s*;', 'IgnoreCase')) 'review SQL is not inert'
Assert-True (-not [regex]::IsMatch($sql, '\bGRANT\s+CONNECT\b', 'IgnoreCase')) 'explicit CONNECT grant present'
Assert-True (-not [regex]::IsMatch($sql, '\bGRANT\s+(INSERT|UPDATE|DELETE|EXECUTE|ALTER|CONTROL|IMPERSONATE)\b', 'IgnoreCase')) 'forbidden SQL grant present'

$applyThrow = $serviceApply.IndexOf('throw "REVIEW_ONLY_NOT_AUTHORIZED')
$applyCreate = $serviceApply.IndexOf('& sc.exe create')
Assert-True ($applyThrow -ge 0 -and $applyCreate -gt $applyThrow) 'service apply guard order invalid'
Assert-True ($serviceApply.Contains("$SqlDependency = 'MSSQL$SQLEXPRESS'")) 'SQL dependency quoting invalid'
Assert-True ($serviceApply.Contains('start= demand')) 'service must be demand start'
Assert-True (-not $serviceApply.Contains('start= auto')) 'auto start present'
Assert-True (-not $serviceApply.Contains('sidtype')) 'sidtype dependency present'
Assert-True (-not $serviceApply.Contains('password=')) 'password argument present'
Assert-True ($serviceApply.Contains('/inheritance:r')) 'ACL inheritance removal missing'
Assert-True ($serviceApply.Contains('S-1-5-18')) 'SYSTEM SID grant missing'
Assert-True ($serviceApply.Contains('S-1-5-32-544')) 'Administrators SID grant missing'
Assert-True ($serviceApply.Contains('Assert-PinnedHash')) 'hash pin guard missing'
Assert-True ($serviceApply.Contains('__PIN_AFTER_CAIXA_BUILD__')) 'hash pin placeholder missing before build proof'

$rollbackThrow = $serviceRollback.IndexOf('throw "REVIEW_ONLY_NOT_AUTHORIZED')
$rollbackStop = $serviceRollback.IndexOf('& sc.exe stop')
Assert-True ($rollbackThrow -ge 0 -and $rollbackStop -gt $rollbackThrow) 'service rollback guard order invalid'

$removeToken = 'Remove' + '-Item'
$cleanupThrow = $runtimeCleanup.IndexOf('throw "REVIEW_ONLY_NOT_AUTHORIZED')
$cleanupRemove = $runtimeCleanup.IndexOf($removeToken)
Assert-True ($cleanupThrow -ge 0 -and $cleanupRemove -gt $cleanupThrow) 'runtime cleanup guard order invalid'

Assert-True ($hostSource.Contains('ExpectedIdentityName = @"NT SERVICE\TataComandaReader"')) 'host identity pin missing'
Assert-True ($hostSource.Contains('WindowsIdentity.GetCurrent()')) 'host identity proof missing'
Assert-True ($hostSource.Contains('preflight.identity.txt')) 'host identity evidence missing'
Assert-True ($hostSource.Contains('tata_reader_least_privilege_preflight.ps1')) 'host preflight target missing'
foreach ($forbidden in @('HttpClient','WebRequest','TcpClient','Socket','SqlConnection','Out-Printer')) {
  Assert-True (-not $hostSource.Contains($forbidden)) ('forbidden host surface: ' + $forbidden)
}
Assert-True ($hostBuild.Contains('Framework64\v4.0.30319\csc.exe')) 'csc64 build path missing'
Assert-True ($hostBuild.Contains('nuget_used = $false')) 'no-NuGet marker missing'

Assert-True ($doc.Contains('## Preflight v4 requirements')) 'doc preflight version mismatch'
Assert-True ($doc.Contains('start=demand')) 'doc demand-start marker missing'

[ordered]@{
  schema = 'deliveryos.tata-reader-admin-bundle-static.v1'
  verifier = 'powershell'
  passed = $true
  node_required = $false
  administrative_effect = $false
} | ConvertTo-Json -Depth 4