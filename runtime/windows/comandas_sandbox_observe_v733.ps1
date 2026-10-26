# TATÁ Comandas v7.33 — Windows Sandbox ONLY. Do not run on CAIXA host.
# Sources mapped ReadOnly in the .wsb; guest scratch storage is disposable.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$status = [ordered]@{
 schema = 'tata.comandas.windows-sandbox-probe.v733'
 status = 'HOLD'
 source = 'LOCAL_WINDOWS_SANDBOX_GUEST_ONLY'
 reason_codes = @()
 print_authorized = $false
 service_changed = $false
 sequence_written = $false
 host_files_written = $false
 network_access_requested = $false
}
try {
 if ($env:USERNAME -ne 'WDAGUtilityAccount') { throw 'SANDBOX_IDENTITY_NOT_PRESENT' }
 # Delivery first: never start any one-shot attempt within 30 minutes of opening.
 # Freeze is absolute UTC, independent of the guest Windows timezone.
 if ([DateTimeOffset]::UtcNow -ge [DateTimeOffset]::Parse('2026-10-13T14:14:00+00:00')) {
  throw 'DELIVERY_OPENING_FREEZE_REACHED'
 }
 $base = 'C:\ComandasBundleRO'
 $node = 'C:\NodeRO\node.exe'
 $state = 'C:\TataStateRO'
 $rules = 'C:\TataShadowRO'
 foreach ($folder in @($base, $state, $rules)) {
  if (-not (Test-Path -LiteralPath $folder -PathType Container)) { throw 'READ_ONLY_MOUNT_MISSING' }
 }
 if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { throw 'GUEST_NODE_MISSING' }
 foreach ($f in @('auditar_eventos_watcher_v730_readonly.js',
                   'comandas_windows_sidecar_preflight_v731_readonly.js',
                   'live_shadow_consumer_v2_candidate_v714.cjs')) {
  if (-not (Test-Path -LiteralPath (Join-Path $base $f) -PathType Leaf)) {
   throw 'PINNED_BUNDLE_INCOMPLETE'
  }
 }
 $folder = Join-Path $state 'reader-events-v1'
 $mostRecent = Get-ChildItem -LiteralPath $folder -File -Filter '*.json' |
  Where-Object { $_.Name -cmatch '^[0-9]{10}_[a-fA-F0-9]{64}\.json$' } |
  Sort-Object Name -Descending | Select-Object -First 1
 if ($null -eq $mostRecent) { throw 'WATCHER_EVENT_MISSING' }
 $guest = Join-Path $env:TEMP ('tata-comandas-guest-' + [Guid]::NewGuid().ToString('N'))
 $guestState = Join-Path $guest 'state'
 $guestEvents = Join-Path $guestState 'reader-events-v1'
 $guestShadow = Join-Path $guest 'shadow'
 $guestTools = Join-Path $guest 'tools'
 foreach ($dir in @($guestEvents,$guestShadow,$guestTools)) {
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
 }
 Copy-Item -LiteralPath $mostRecent.FullName -Destination $guestEvents
 Copy-Item -LiteralPath (Join-Path $state 'production-service-state.json') -Destination $guestState
 foreach ($f in @('packaging-current.js','app-data.json','routing.json','printer-map.json',
                 'non-production.json','product-identity-cache-v1.json',
                 'product-aliases-v1.json','human-order-overrides-v1.json')) {
  Copy-Item -LiteralPath (Join-Path $rules $f) -Destination $guestShadow
 }
 Copy-Item -LiteralPath (Join-Path $base 'live_shadow_consumer_v2_candidate_v714.cjs') -Destination $guestShadow
 Copy-Item -LiteralPath (Join-Path $base 'auditar_eventos_watcher_v730_readonly.js') -Destination $guestTools
 Copy-Item -LiteralPath (Join-Path $base 'comandas_windows_sidecar_preflight_v731_readonly.js') -Destination $guestTools
 # Never run consumer V2 on host or guest. V7.31 only checks its pinned bytes.
 # This is intentionally a preflight, not an operational or printed cutover.
 Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
 Remove-Item Env:NODE_PATH -ErrorAction SilentlyContinue
 $result = & $node (Join-Path $guestTools 'comandas_windows_sidecar_preflight_v731_readonly.js') --root $guest --event $mostRecent.Name 2>$null | Select-Object -Last 1
 $guestReport = $result | ConvertFrom-Json
 $status.status = 'HOLD'
 $status.reason_codes = @($guestReport.blockers) + @('WINDOWS_SANDBOX_PREFLIGHT_ONLY_NO_V2_EXECUTION')
} catch {
 # Do not expose paths, customer notes or caller input in output.
 $status.status = 'HOLD'
 $status.reason_codes = @('SANDBOX_GUEST_PREFLIGHT_FAILED')
}
try {
 $report = $status | ConvertTo-Json -Depth 6
 $dest = Join-Path ([Environment]::GetFolderPath('Desktop')) 'COMANDAS_SANDBOX_RESULT.json'
 [IO.File]::WriteAllText($dest,$report,[Text.UTF8Encoding]::new($false))
 Write-Output $report
} catch { Write-Output '{"status":"HOLD","reason_codes":["GUEST_RESULT_SAVE_FAILED"]}' }
