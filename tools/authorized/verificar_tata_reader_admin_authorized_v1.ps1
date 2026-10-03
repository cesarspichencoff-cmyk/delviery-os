param()

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

function Read-Text([string]$RelativePath) {
  Get-Content -LiteralPath (Join-Path $RepoRoot $RelativePath) -Raw -Encoding UTF8
}

function Assert-True([bool]$Condition,[string]$Message) {
  if (-not $Condition) { throw $Message }
}

$authorization = Read-Text "data\tata_reader_admin_authorization_v1.json" | ConvertFrom-Json
$manifest = Read-Text "data\tata_reader_permission_manifest_v1.json" | ConvertFrom-Json
$buildEvidence = Read-Text "data\tata_reader_caixa_build_evidence_v1.json" | ConvertFrom-Json
$apply = Read-Text "tools\authorized\tata_reader_admin_apply_authorized_20261002.ps1"
$rollback = Read-Text "tools\authorized\tata_reader_admin_rollback_authorized_20261002.ps1"
$retryAuthorizationPath = Join-Path $RepoRoot "data\tata_reader_admin_retry_authorization_v3.json"
$retryAuthorized = $false
if (Test-Path -LiteralPath $retryAuthorizationPath -PathType Leaf) {
  $retryAuthorization = Get-Content -LiteralPath $retryAuthorizationPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $retryAuthorized = ([bool]$retryAuthorization.human_retry_authorized) -and ($retryAuthorization.authorization_id -eq "CESAR-2026-10-02-TATA-READER-ADMIN-V1") -and ($retryAuthorization.incident_head -eq "1a5cc22224c4e27226d7b3ea364aeeb2067da84a")
}

$applyTokens = $null
$applyErrors = $null
$rollbackTokens = $null
$rollbackErrors = $null

[System.Management.Automation.Language.Parser]::ParseInput(
  $apply,
  [ref]$applyTokens,
  [ref]$applyErrors
) | Out-Null

[System.Management.Automation.Language.Parser]::ParseInput(
  $rollback,
  [ref]$rollbackTokens,
  [ref]$rollbackErrors
) | Out-Null

Assert-True ($applyErrors.Count -eq 0) ("APPLY_SYNTAX_ERROR:" + ($applyErrors -join " | "))
Assert-True ($rollbackErrors.Count -eq 0) ("ROLLBACK_SYNTAX_ERROR:" + ($rollbackErrors -join " | "))

$authId = "CESAR-2026-10-02-TATA-READER-ADMIN-V1"
$binaryHash = "241073DA0AE678933E2EF88AF2DA2091F1DF4A578E1D78AD2B48839D4465BA6C"
$preflightHash = "FFCFB49577280A596EA951C839C881528D187A33F0B5D19DE08D2A86D1FEFFC6"

Assert-True ([bool]$authorization.human_authorized) "HUMAN_AUTHORIZATION_FALSE"
Assert-True ($authorization.authorization_id -eq $authId) "AUTHORIZATION_ID_FILE_MISMATCH"
Assert-True ($authorization.binary_sha256 -eq $binaryHash) "AUTHORIZATION_BINARY_HASH_MISMATCH"
Assert-True ($authorization.preflight_sha256 -eq $preflightHash) "AUTHORIZATION_PREFLIGHT_HASH_MISMATCH"

Assert-True ($buildEvidence.binary_sha256 -eq $binaryHash) "BUILD_BINARY_HASH_MISMATCH"
Assert-True ($buildEvidence.preflight_sha256 -eq $preflightHash) "BUILD_PREFLIGHT_HASH_MISMATCH"
Assert-True (-not [bool]$buildEvidence.administrative_effect) "BUILD_EVIDENCE_HAS_ADMIN_EFFECT"

Assert-True ($manifest.status -eq "REVIEW_ONLY_NOT_AUTHORIZED") "MANIFEST_STATUS_CHANGED"
Assert-True ($manifest.principal -eq "NT SERVICE\TataComandaReader") "MANIFEST_PRINCIPAL_MISMATCH"
Assert-True ([bool]$manifest.scope_policy.integrated_delivery_channels_only) "MANIFEST_SCOPE_NOT_INTEGRATED_ONLY"
Assert-True (-not [bool]$manifest.scope_policy.manual_pos_delivery) "MANUAL_POS_SCOPE_EXPANDED"
Assert-True (-not [bool]$manifest.scope_policy.dscomanda) "DSCOMANDA_SCOPE_EXPANDED"
Assert-True (-not [bool]$manifest.scope_policy.combo_structure_columns) "COMBO_SCOPE_EXPANDED"
Assert-True (-not [bool]$manifest.scope_policy.takeaway_origin_column) "TAKEAWAY_SCOPE_EXPANDED"

Assert-True ($apply.Contains($authId)) "APPLY_AUTH_ID_MISSING"
Assert-True ($apply.Contains($binaryHash)) "APPLY_BINARY_HASH_MISSING"
Assert-True ($apply.Contains($preflightHash)) "APPLY_PREFLIGHT_HASH_MISSING"
Assert-True ($apply.Contains('Start-Service -Name $ServiceName')) "APPLY_PREFLIGHT_START_MISSING"
Assert-True ($apply.Contains("Invoke-Rollback")) "APPLY_ROLLBACK_MISSING"
Assert-True ($apply.Contains("FAILED_ROLLED_BACK")) "APPLY_ROLLBACK_RESULT_MISSING"
Assert-True ($apply.Contains("PROVEN_ADMIN_PHASE_PASS")) "APPLY_SUCCESS_RESULT_MISSING"
Assert-True ($apply.Contains('order_row_read = $false')) "APPLY_ORDER_EFFECT_BOUNDARY_MISSING"
Assert-True ($apply.Contains('print = $false')) "APPLY_PRINT_EFFECT_BOUNDARY_MISSING"
Assert-True ($apply.Contains('fiscal_action = $false')) "APPLY_FISCAL_EFFECT_BOUNDARY_MISSING"
Assert-True ($apply.Contains('cutover = $false')) "APPLY_CUTOVER_BOUNDARY_MISSING"
Assert-True ($apply.Contains("ACL_ORDER_V2")) "APPLY_ACL_ORDER_V2_MISSING"
Assert-True ($apply.Contains("RetryAuthorizationFile")) "APPLY_RETRY_AUTH_GATE_MISSING"
Assert-True ($apply.Contains("RETRY_NOT_AUTHORIZED_AFTER_INCIDENT")) "APPLY_RETRY_FAIL_CLOSED_MISSING"
Assert-True ($apply.Contains("RUNTIME_TAKEOWN_FAILED")) "APPLY_RUNTIME_ACL_RECOVERY_MISSING"
Assert-True ($apply.Contains("Capture-PreflightDiagnostics")) "APPLY_PREFLIGHT_DIAGNOSTIC_CAPTURE_MISSING"
Assert-True ($apply.Contains("TATA_READER_PREFLIGHT_DIAGNOSTIC.json")) "APPLY_PREFLIGHT_DIAGNOSTIC_PERSISTENCE_MISSING"
Assert-True ($apply.Contains("preflight_diagnostics = $preflightDiagnostics")) "APPLY_RESULT_DIAGNOSTICS_MISSING"
Assert-True ($apply.Contains("tata_reader_admin_retry_authorization_v3.json")) "APPLY_RETRY_V3_GATE_MISSING"
Assert-True ($apply.Contains("1a5cc22224c4e27226d7b3ea364aeeb2067da84a")) "APPLY_RETRY_V3_INCIDENT_MISMATCH"

Assert-True (-not $apply.Contains("DSCOMANDA")) "APPLY_DSCOMANDA_SCOPE_LEAK"
Assert-True (-not $apply.Contains("CDPRODPROMOCAO")) "APPLY_COMBO_SCOPE_LEAK"
Assert-True (-not $apply.Contains("NRSEQPRODCOM")) "APPLY_COMBO_SCOPE_LEAK"
Assert-True (-not $apply.Contains("NRSEQPRODPAI")) "APPLY_COMBO_SCOPE_LEAK"
Assert-True (-not $apply.Contains("IDORIGEMVENDA")) "APPLY_TAKEAWAY_SCOPE_LEAK"

foreach ($forbidden in @(
  "Invoke-WebRequest",
  "Invoke-RestMethod",
  "Out-Printer",
  "StartDocPrinter",
  "WritePrinter",
  "SEFAZ",
  "NFC-e",
  "NFCE",
  "Start-Process"
)) {
  Assert-True (-not $apply.Contains($forbidden)) ("FORBIDDEN_AUTHORIZED_SURFACE:" + $forbidden)
}

Assert-True ($rollback.Contains($authId)) "ROLLBACK_AUTH_ID_MISSING"
Assert-True ($rollback.Contains("DROP USER [NT SERVICE\TataComandaReader]")) "ROLLBACK_DROP_USER_MISSING"
Assert-True ($rollback.Contains("DROP LOGIN [NT SERVICE\TataComandaReader]")) "ROLLBACK_DROP_LOGIN_MISSING"
Assert-True ($rollback.Contains("sc.exe delete")) "ROLLBACK_SERVICE_DELETE_MISSING"
Assert-True ($rollback.Contains("C:\ProgramData\TataComandaReader")) "ROLLBACK_RUNTIME_PATH_MISSING"
Assert-True ($rollback.Contains("takeown.exe")) "ROLLBACK_TAKEOWN_RECOVERY_MISSING"
Assert-True ($rollback.Contains("RUNTIME_ACL_RECOVERY_FAILED")) "ROLLBACK_ACL_RECOVERY_MISSING"

[ordered]@{
  schema = "deliveryos.tata-reader-authorized-bundle-static.v3"
  passed = $true
  authorization_id = $authId
  administrative_effect = $false
  retry_authorized = $retryAuthorized
  ready_for_authorized_admin_execution = $retryAuthorized
  ready_for_human_retry_authorization = (-not $retryAuthorized)
} | ConvertTo-Json -Depth 4
