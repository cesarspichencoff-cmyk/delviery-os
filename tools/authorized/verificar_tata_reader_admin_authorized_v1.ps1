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
$runner = Read-Text "tools\authorized\tata_reader_admin_cycle_runner_v1.ps1"
$preflight = Read-Text "tools\tata_reader_least_privilege_preflight.ps1"
$preflightCandidate = Read-Text "data\tata_reader_preflight_candidate_v7.json" | ConvertFrom-Json
$retryAuthorizationPath = Join-Path $RepoRoot "data\tata_reader_admin_retry_authorization_v7.json"
$retryAuthorization = $null
$retryAuthorized = $false
if (Test-Path -LiteralPath $retryAuthorizationPath -PathType Leaf) {
  $retryAuthorization = Get-Content -LiteralPath $retryAuthorizationPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $retryAuthorized = ([bool]$retryAuthorization.human_retry_authorized) -and ($retryAuthorization.authorization_id -eq "CESAR-2026-10-02-TATA-READER-ADMIN-V1") -and ($retryAuthorization.incident_head -eq "e473036fb2c5ab98e003a2254485f8697d798df3") -and ($retryAuthorization.preflight_sha256 -eq "3BBE4C37FEDC8EC45A25FE08497B999453B181EBA3033861CFF37F701B4A0035") -and ($retryAuthorization.runner_sha256 -eq "CE41F422823C459030293C5CD05E0AC7562A9B0A063E23773D0A02C19F3FDB49") -and ($retryAuthorization.runner_path -eq "tools/authorized/tata_reader_admin_cycle_runner_v1.ps1")
}

$applyTokens = $null
$applyErrors = $null
$rollbackTokens = $null
$rollbackErrors = $null
$runnerTokens = $null
$runnerErrors = $null

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

[System.Management.Automation.Language.Parser]::ParseInput(
  $runner,
  [ref]$runnerTokens,
  [ref]$runnerErrors
) | Out-Null

Assert-True ($applyErrors.Count -eq 0) ("APPLY_SYNTAX_ERROR:" + ($applyErrors -join " | "))
Assert-True ($rollbackErrors.Count -eq 0) ("ROLLBACK_SYNTAX_ERROR:" + ($rollbackErrors -join " | "))
Assert-True ($runnerErrors.Count -eq 0) ("RUNNER_SYNTAX_ERROR:" + ($runnerErrors -join " | "))

$authId = "CESAR-2026-10-02-TATA-READER-ADMIN-V1"
$binaryHash = "241073DA0AE678933E2EF88AF2DA2091F1DF4A578E1D78AD2B48839D4465BA6C"
$historicalPreflightHash = "FFCFB49577280A596EA951C839C881528D187A33F0B5D19DE08D2A86D1FEFFC6"
$candidatePreflightHash = "3BBE4C37FEDC8EC45A25FE08497B999453B181EBA3033861CFF37F701B4A0035"
$runnerHash = "CE41F422823C459030293C5CD05E0AC7562A9B0A063E23773D0A02C19F3FDB49"

Assert-True ([bool]$authorization.human_authorized) "HUMAN_AUTHORIZATION_FALSE"
Assert-True ($authorization.authorization_id -eq $authId) "AUTHORIZATION_ID_FILE_MISMATCH"
Assert-True ($authorization.binary_sha256 -eq $binaryHash) "AUTHORIZATION_BINARY_HASH_MISMATCH"
Assert-True ($authorization.preflight_sha256 -eq $historicalPreflightHash) "HISTORICAL_AUTHORIZATION_PREFLIGHT_HASH_MISMATCH"

Assert-True ($buildEvidence.binary_sha256 -eq $binaryHash) "BUILD_BINARY_HASH_MISMATCH"
Assert-True ($buildEvidence.preflight_sha256 -eq $historicalPreflightHash) "HISTORICAL_BUILD_PREFLIGHT_HASH_MISMATCH"
Assert-True (-not [bool]$buildEvidence.administrative_effect) "BUILD_EVIDENCE_HAS_ADMIN_EFFECT"

Assert-True ($preflightCandidate.status -eq "CANDIDATE_NOT_AUTHORIZED") "PREFLIGHT_CANDIDATE_STATUS_MISMATCH"
Assert-True ($preflightCandidate.predecessor_sha256 -eq "6CCA333F206D8DD508029C35F6B43B41793707AA09357E250208BBCCB8B968AE") "PREFLIGHT_CANDIDATE_PREDECESSOR_MISMATCH"
Assert-True ($preflightCandidate.candidate_sha256 -eq $candidatePreflightHash) "PREFLIGHT_CANDIDATE_HASH_MISMATCH"
Assert-True (-not [bool]$preflightCandidate.semantic_scope_changed) "PREFLIGHT_CANDIDATE_SCOPE_CHANGED"
$actualPreflightHash = (Get-FileHash -LiteralPath (Join-Path $RepoRoot "tools\tata_reader_least_privilege_preflight.ps1") -Algorithm SHA256).Hash
Assert-True ([string]::Equals($actualPreflightHash,$candidatePreflightHash,[System.StringComparison]::OrdinalIgnoreCase)) "PREFLIGHT_FILE_HASH_MISMATCH"
Assert-True ($preflight.Contains("USER_NAME() AS [current_user]")) "PREFLIGHT_RESERVED_ALIAS_FIX_MISSING"
Assert-True ($preflight.Contains("specific_login_impersonation_targets")) "PREFLIGHT_IMPERSONATION_TARGETS_MISSING"
Assert-True ($preflight.Contains("server_impersonation_grants")) "PREFLIGHT_IMPERSONATION_GRANTS_MISSING"
Assert-True ($preflight.Contains("effective_login_impersonation_evidence")) "PREFLIGHT_IMPERSONATION_EVIDENCE_MISSING"
Assert-True ($preflight.Contains("sys.login_token")) "PREFLIGHT_LOGIN_TOKEN_METADATA_MISSING"
Assert-True ($preflight.Contains("non_impersonable_server_group_targets")) "PREFLIGHT_SERVER_GROUP_DIAGNOSTIC_MISSING"
Assert-True ($preflight.Contains("non_impersonable_database_group_targets")) "PREFLIGHT_DATABASE_GROUP_DIAGNOSTIC_MISSING"
Assert-True ($preflight.Contains('if ([string]$loginImpersonationReader["type"] -eq "G")')) "PREFLIGHT_SERVER_GROUP_SPLIT_MISSING"
Assert-True ($preflight.Contains('if ([string]$userImpersonationReader["type"] -eq "G")')) "PREFLIGHT_DATABASE_GROUP_SPLIT_MISSING"
$actualRunnerHash = (Get-FileHash -LiteralPath (Join-Path $RepoRoot "tools\authorized\tata_reader_admin_cycle_runner_v1.ps1") -Algorithm SHA256).Hash
Assert-True ([string]::Equals($actualRunnerHash,$runnerHash,[System.StringComparison]::OrdinalIgnoreCase)) "RUNNER_FILE_HASH_MISMATCH"
if ($null -ne $retryAuthorization) {
  Assert-True ($retryAuthorization.runner_sha256 -eq $runnerHash) "RETRY_AUTHORIZATION_RUNNER_HASH_MISMATCH"
  Assert-True ($retryAuthorization.runner_path -eq "tools/authorized/tata_reader_admin_cycle_runner_v1.ps1") "RETRY_AUTHORIZATION_RUNNER_PATH_MISMATCH"
  Assert-True ($retryAuthorization.preflight_sha256 -eq $candidatePreflightHash) "RETRY_AUTHORIZATION_PREFLIGHT_HASH_MISMATCH"
  Assert-True ($retryAuthorization.incident_head -eq "e473036fb2c5ab98e003a2254485f8697d798df3") "RETRY_AUTHORIZATION_INCIDENT_MISMATCH"
}

Assert-True ($runner.Contains("verificar_tata_reader_admin_authorized_v1.ps1")) "RUNNER_VERIFIER_MISSING"
Assert-True ($runner.Contains("tata_reader_admin_apply_authorized_20261002.ps1")) "RUNNER_APPLY_MISSING"
Assert-True ($runner.Contains("Read-AdministrativeState")) "RUNNER_FINAL_STATE_CHECK_MISSING"
Assert-True ($runner.Contains("FAILED_ROLLED_BACK_PROVEN_CLEAN")) "RUNNER_CLEAN_ROLLBACK_CLASSIFICATION_MISSING"
Assert-True ($runner.Contains("BLOCKED_BEFORE_EFFECT")) "RUNNER_FAIL_CLOSED_CLASSIFICATION_MISSING"
Assert-True ($runner.Contains('order_row_read = $false')) "RUNNER_ORDER_BOUNDARY_MISSING"
Assert-True ($runner.Contains('print = $false')) "RUNNER_PRINT_BOUNDARY_MISSING"
Assert-True ($runner.Contains('fiscal_action = $false')) "RUNNER_FISCAL_BOUNDARY_MISSING"
Assert-True ($runner.Contains('cutover = $false')) "RUNNER_CUTOVER_BOUNDARY_MISSING"
Assert-True ($runner.Contains("specific_login_impersonation_targets")) "RUNNER_IMPERSONATION_TARGET_OUTPUT_MISSING"
Assert-True ($runner.Contains("effective_login_impersonation_evidence")) "RUNNER_IMPERSONATION_EVIDENCE_OUTPUT_MISSING"
Assert-True ($runner.Contains("non_impersonable_server_group_targets")) "RUNNER_SERVER_GROUP_OUTPUT_MISSING"
Assert-True ($runner.Contains("non_impersonable_database_group_targets")) "RUNNER_DATABASE_GROUP_OUTPUT_MISSING"
Assert-True ($runner.Contains("specific_user_impersonation_targets")) "RUNNER_USER_IMPERSONATION_OUTPUT_MISSING"

foreach ($runnerForbidden in @(
  "sc.exe create",
  "CREATE LOGIN",
  "CREATE USER",
  "GRANT SELECT",
  "Start-Service",
  "DROP USER",
  "DROP LOGIN",
  "Out-Printer",
  "StartDocPrinter",
  "WritePrinter",
  "SEFAZ",
  "NFC-e",
  "NFCE"
)) {
  Assert-True (-not $runner.Contains($runnerForbidden)) ("RUNNER_DIRECT_EFFECT_SURFACE:" + $runnerForbidden)
}

Assert-True ($manifest.status -eq "REVIEW_ONLY_NOT_AUTHORIZED") "MANIFEST_STATUS_CHANGED"
Assert-True ($manifest.principal -eq "NT SERVICE\TataComandaReader") "MANIFEST_PRINCIPAL_MISMATCH"
Assert-True ([bool]$manifest.scope_policy.integrated_delivery_channels_only) "MANIFEST_SCOPE_NOT_INTEGRATED_ONLY"
Assert-True (-not [bool]$manifest.scope_policy.manual_pos_delivery) "MANUAL_POS_SCOPE_EXPANDED"
Assert-True (-not [bool]$manifest.scope_policy.dscomanda) "DSCOMANDA_SCOPE_EXPANDED"
Assert-True (-not [bool]$manifest.scope_policy.combo_structure_columns) "COMBO_SCOPE_EXPANDED"
Assert-True (-not [bool]$manifest.scope_policy.takeaway_origin_column) "TAKEAWAY_SCOPE_EXPANDED"

Assert-True ($apply.Contains($authId)) "APPLY_AUTH_ID_MISSING"
Assert-True ($apply.Contains($binaryHash)) "APPLY_BINARY_HASH_MISSING"
Assert-True ($apply.Contains($candidatePreflightHash)) "APPLY_CANDIDATE_PREFLIGHT_HASH_MISSING"
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
Assert-True ($apply.Contains("DIAGNOSTIC_COPY_OUTPUT_SUPPRESSED_V2")) "APPLY_DIAGNOSTIC_OUTPUT_SUPPRESSION_MISSING"
Assert-True ($apply.Contains('TATA_READER_PREFLIGHT_EXITCODE.txt") -Force | Out-Null')) "APPLY_EXITCODE_COPY_OUTPUT_NOT_SUPPRESSED"
Assert-True ($apply.Contains('TATA_READER_PREFLIGHT_DIAGNOSTIC.json") -Force | Out-Null')) "APPLY_JSON_COPY_OUTPUT_NOT_SUPPRESSED"
Assert-True ($apply.Contains('TATA_READER_PREFLIGHT_IDENTITY.txt") -Force | Out-Null')) "APPLY_IDENTITY_COPY_OUTPUT_NOT_SUPPRESSED"
Assert-True ($apply.Contains('TATA_READER_PREFLIGHT_STDERR.txt") -Force | Out-Null')) "APPLY_STDERR_COPY_OUTPUT_NOT_SUPPRESSED"
Assert-True ($apply.Contains("FAILURE_RESULT_PRIMITIVE_V2")) "APPLY_PRIMITIVE_FAILURE_RESULT_MISSING"
Assert-True ($apply.Contains("tata_reader_admin_retry_authorization_v6.json")) "APPLY_RETRY_V7_GATE_MISSING"
Assert-True ($apply.Contains("e473036fb2c5ab98e003a2254485f8697d798df3")) "APPLY_RETRY_V7_INCIDENT_MISMATCH"

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
  schema = "deliveryos.tata-reader-authorized-bundle-static.v9"
  passed = $true
  authorization_id = $authId
  administrative_effect = $false
  candidate_preflight_sha256 = $candidatePreflightHash
  runner_sha256 = $runnerHash
  retry_authorized = $retryAuthorized
  ready_for_authorized_admin_execution = $retryAuthorized
  ready_for_human_retry_authorization = (-not $retryAuthorized)
} | ConvertTo-Json -Depth 4
