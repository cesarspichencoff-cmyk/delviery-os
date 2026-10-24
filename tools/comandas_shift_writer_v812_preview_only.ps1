# V8.12: offline, preview-only Windows PowerShell contract.
# Review of an explicit shift interval is NOT an authorized state update.
# No Get-Content, Set-Content, filesystem write, SQL, print, or service access.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Service,
  [Parameter(Mandatory=$true)][string]$OperationalDate,
  [Parameter(Mandatory=$true)][string]$ValidFromLocal,
  [Parameter(Mandatory=$true)][string]$ValidUntilLocal,
  [string]$StoreId = '0001'
)
$ErrorActionPreference = 'Stop'
$culture = [Globalization.CultureInfo]::InvariantCulture
$style = [Globalization.DateTimeStyles]::None

function Parse-LocalSecond([string]$Value, [ref]$Parsed) {
  if ($Value -cnotmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$') {
    return $false
  }
  return [datetime]::TryParseExact(
    $Value, 'yyyy-MM-ddTHH:mm:ss', $culture, $style, $Parsed)
}
function Parse-Day([string]$Value, [ref]$Parsed) {
  if ($Value -cnotmatch '^\d{4}-\d{2}-\d{2}$') { return $false }
  return [datetime]::TryParseExact(
    $Value, 'yyyy-MM-dd', $culture, $style, $Parsed)
}

$reasons = [Collections.Generic.List[string]]::new()
$day = [datetime]::MinValue
$start = [datetime]::MinValue
$end = [datetime]::MinValue
$dayOk = Parse-Day $OperationalDate ([ref]$day)
$startOk = Parse-LocalSecond $ValidFromLocal ([ref]$start)
$endOk = Parse-LocalSecond $ValidUntilLocal ([ref]$end)
if ($StoreId -cne '0001') { $reasons.Add('STORE_NOT_PINNED') }
if ($Service -cnotin @('LUNCH','DINNER')) { $reasons.Add('SERVICE_INVALID') }
if (-not $dayOk) { $reasons.Add('OPERATIONAL_DATE_INVALID') }
if (-not $startOk) { $reasons.Add('VALID_FROM_LOCAL_INVALID') }
if (-not $endOk) { $reasons.Add('VALID_UNTIL_LOCAL_INVALID') }
if ($startOk -and $endOk) {
  if ($start -ge $end) { $reasons.Add('WINDOW_NOT_INCREASING') }
  if ($dayOk -and ($start.Date -ne $day.Date -or $end.Date -ne $day.Date)) {
    $reasons.Add('WINDOW_NOT_SAME_OPERATIONAL_DATE')
  }
}

# These are *deliberately* not the installed watcher v2 state schema.
# No operator/source_ref is inferred and no human confirmation is forged.
$result = [ordered]@{
  schema = 'deliveryos.comandas.shift-writer-v812-preview-only'
  status = if ($reasons.Count -eq 0) {'REVIEW_REQUIRED_NO_AUTHORITY'} else {'HOLD'}
  blockers = @($reasons | Sort-Object -Unique)
  candidate = if ($reasons.Count -eq 0) {
    [ordered]@{
      schema = 'deliveryos.comandas.shift-window-draft.v812'
      store_id = $StoreId
      operational_date = $OperationalDate
      service = $Service
      valid_from_local = $ValidFromLocal
      valid_until_local = $ValidUntilLocal
      evidence = 'UNAUTHENTICATED_DRAFT'
      source_ref = $null
      clock_inference_used = $false
    }
  } else { $null }
  installed_writer_compatible = $false
  human_identity_authenticated = $false
  operational_shift_authorized = $false
  current_window_freshness_verified = $false
  sql_permissions_verified = $false
  effects = [ordered]@{
    file_read = $false
    file_write = $false
    history_append = $false
    windows_service = $false
    sql = $false
    printer = $false
    spooler = $false
    deployment = $false
  }
}
$result | ConvertTo-Json -Depth 6 -Compress
if ($reasons.Count -gt 0) { exit 2 }
exit 0
