function Read-ServiceState([datetime]$OrderOpenedAt) {
  $blockers = @()
  if (-not (Test-Path -LiteralPath $ServiceStatePath -PathType Leaf)) {
    return [ordered]@{ service=$null; evidence="UNKNOWN"; source_ref=$null; blockers=@("SERVICE_STATE_MISSING") }
  }
  try {
    $state = Get-Content -LiteralPath $ServiceStatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($state.schema -ne "deliveryos.production-service-shift-state.v2") { $blockers += "SERVICE_STATE_SCHEMA_MISMATCH" }
    if ([bool]$state.clock_inference_used) { $blockers += "SERVICE_STATE_CLOCK_INFERENCE_FORBIDDEN" }
    $orderDate = $OrderOpenedAt.ToString("yyyy-MM-dd")
    if ([string]$state.operational_date -ne $orderDate) { $blockers += "SERVICE_STATE_DATE_MISMATCH_ORDER_DATE" }
    if ([string]$state.store_id -ne "0001") { $blockers += "SERVICE_STATE_STORE_MISMATCH" }
    if ([string]$state.service -notin @("LUNCH","DINNER")) { $blockers += "SERVICE_STATE_SERVICE_INVALID" }
    if ([string]$state.evidence -notin @("HUMAN_CONFIRMED_RULE","REAL_OBSERVED")) { $blockers += "SERVICE_STATE_EVIDENCE_REQUIRED" }
    if ([string]::IsNullOrWhiteSpace([string]$state.source_ref)) { $blockers += "SERVICE_STATE_SOURCE_REF_REQUIRED" }
    $validUntilRaw = [string]$state.valid_until_local
    $validUntil = [datetime]::MinValue
    if (
      [string]::IsNullOrWhiteSpace($validUntilRaw) -or
      -not [datetime]::TryParseExact(
        $validUntilRaw,
        "yyyy-MM-ddTHH:mm:ss",
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::None,
        [ref]$validUntil
      )
    ) {
      $blockers += "SERVICE_STATE_VALID_UNTIL_REQUIRED"
    } elseif ($OrderOpenedAt -ge $validUntil) {
      $blockers += "SERVICE_STATE_EXPIRED_FOR_ORDER"
    }
    $validFromRaw = [string]$state.valid_from_local
    $validFrom = [datetime]::MinValue
    if (
      [string]::IsNullOrWhiteSpace($validFromRaw) -or
      -not [datetime]::TryParseExact(
        $validFromRaw,
        "yyyy-MM-ddTHH:mm:ss",
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::None,
        [ref]$validFrom
      )
    ) {
      $blockers += "SERVICE_STATE_VALID_FROM_REQUIRED"
    } elseif ($OrderOpenedAt -lt $validFrom) {
      $blockers += "SERVICE_STATE_NOT_YET_ACTIVE_FOR_ORDER"
    }
    if ($validFrom -ge $validUntil -or
        $validFrom.ToString("yyyy-MM-dd") -ne [string]$state.operational_date -or
        $validUntil.ToString("yyyy-MM-dd") -ne [string]$state.operational_date) {
      $blockers += "SERVICE_STATE_WINDOW_INVALID"
    }
    if ($blockers.Count -gt 0) {
      return [ordered]@{ service=$null; evidence="UNKNOWN"; source_ref=$null; blockers=$blockers }
    }
    return [ordered]@{ service=[string]$state.service; evidence=[string]$state.evidence; source_ref=[string]$state.source_ref; blockers=@() }
  } catch {
    return [ordered]@{ service=$null; evidence="UNKNOWN"; source_ref=$null; blockers=@("SERVICE_STATE_READ_FAILED") }
  }
}
