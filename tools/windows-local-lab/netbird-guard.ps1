param([ValidateSet('Plan','Apply','Verify','Commit','Rollback','Watchdog')][string]$Mode='Plan')
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$statePath=Join-Path $root 'netbird-guard-state.json'
$commitPath=Join-Path $root 'netbird-guard-committed.json'
$nb='C:\Program Files\NetBird\netbird.exe'
$group='DeliveryOS isolated lab mesh 20261026'
$taskName='DeliveryOS-Lab-Netbird-Rollback-20261026'
$hostAddress='100.107.78.202'

function Get-LocalPlan {
  $adapters=@(Get-NetAdapter)
  if ($adapters.Count -ne 2 -or @($adapters | Where-Object {$_.Name -notin @('Ethernet','wt0')}).Count) {
    throw 'Unexpected adapters: no network changes authorized by this host-specific plan'
  }
  if ((Get-NetAdapter -Name wt0).InterfaceDescription -ne 'WireGuard Tunnel' -or
      (Get-NetAdapter -Name Ethernet).Status -ne 'Up') {throw 'Unexpected interfaces'}
  $ip=Get-NetIPAddress -InterfaceAlias wt0 -AddressFamily IPv4
  if ($ip.IPAddress -ne $hostAddress) {throw 'Unexpected NetBird address'}
  # CLI connection completion can precede the first management peer sync.
  for ($attempt=0;$attempt -lt 10;$attempt++) {
    $s=& $nb status --json | ConvertFrom-Json
    $peers=@($s.peers.details | Where-Object {$_})
    if ($LASTEXITCODE -eq 0 -and $s.management.connected -and $peers.Count -ge 2) {break}
    Start-Sleep -Milliseconds 700
  }
  if (!$s.management.connected) {throw 'NetBird management unavailable'}
  if ($peers.Count -ne 2 -or @($peers | Where-Object {
      $_.fqdn -notmatch '^proxy-[a-z0-9-]+\.netbird\.cloud$' -or
      $_.netbirdIp -notmatch '^100\.107\.\d{1,3}\.\d{1,3}$'
    }).Count) {throw "Only the two observed managed proxy peers are eligible; observed count=$($peers.Count)"}
  $addresses=@($peers | ForEach-Object {$_.netbirdIp} | Sort-Object -Unique)
  if ($addresses.Count -ne 2) {throw 'Duplicate proxy address'}
  [pscustomobject]@{hostAddress=$hostAddress;meshInterface='wt0';excludedInterface='Ethernet';
    port=5193;proxyAddresses=$addresses;profiles=@(Get-NetFirewallProfile | ForEach-Object {
      [pscustomobject]@{Name=$_.Name;Enabled=$_.Enabled.ToString();DisabledInterfaceAliases=@($_.DisabledInterfaceAliases)}
    })}
}
function Restore-Guard {
  if (!(Test-Path $statePath)) {throw 'No rollback snapshot'}
  & $nb down
  if ($LASTEXITCODE -ne 0) {throw 'VPN disconnect failed; retaining firewall protection'}
  $cfg=Get-Content 'C:\ProgramData\Netbird\default.json' -Raw | ConvertFrom-Json
  if (!$cfg.BlockInbound) {
    & $nb up --block-inbound
    if ($LASTEXITCODE -ne 0) {throw 'Inbound lockdown failed; retaining firewall protection'}
  }
  & $nb down
  if ($LASTEXITCODE -ne 0) {throw 'VPN disconnect failed; retaining firewall protection'}
  $cfg=Get-Content 'C:\ProgramData\Netbird\default.json' -Raw | ConvertFrom-Json
  if (!$cfg.BlockInbound) {throw 'Inbound lockdown unconfirmed; retaining firewall protection'}
  $record=Get-Content (Join-Path $root 'runtime-pids.json') -Raw | ConvertFrom-Json
  if ($record.pilotMode -eq 'remote-lab') {& (Join-Path $root 'switch-pilot.ps1') -Mode Local}
  $state=Get-Content $statePath -Raw | ConvertFrom-Json
  foreach($p in $state.plan.profiles) {
    # All original profiles must have been off. Restore that before exclusions.
    Set-NetFirewallProfile -Name $p.Name -Enabled False
    $aliases=@($p.DisabledInterfaceAliases | Where-Object {$_ -ne 'NotConfigured'})
    Set-NetFirewallProfile -Name $p.Name -DisabledInterfaceAliases $aliases
  }
  Get-NetFirewallRule -Group $group -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Remove-Item $commitPath -ErrorAction SilentlyContinue
  'NETBIRD_GUARD_ROLLED_BACK_VPN_DISCONNECTED_PILOT_LOCAL'
}
function Get-RuleDigest {
  $policy=New-Object -ComObject HNetCfg.FwPolicy2
  $projection=@($policy.Rules | Where-Object {$_.Grouping -eq $group} | Sort-Object Name | ForEach-Object {
    [ordered]@{name=$_.Name;protocol=$_.Protocol;action=$_.Action;enabled=$_.Enabled;
      interfaces=@($_.Interfaces);profiles=$_.Profiles;direction=$_.Direction;
      ports=$(if ($_.Protocol -in @(6,17)) {$_.LocalPorts} else {''});remote=$_.RemoteAddresses;local=$_.LocalAddresses;program=$_.ApplicationName}
  }) | ConvertTo-Json -Depth 5 -Compress
  $hash=[Security.Cryptography.SHA256]::Create()
  try {([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($projection)))).Replace('-','').ToLowerInvariant()}
  finally {$hash.Dispose()}
}
function Assert-Guard {
  $state=Get-Content $statePath -Raw | ConvertFrom-Json
  $plan=Get-LocalPlan
  if (($plan.proxyAddresses -join ',') -ne ($state.plan.proxyAddresses -join ',')) {throw 'Proxy set changed'}
  foreach($p in Get-NetFirewallProfile -PolicyStore ActiveStore) {
    if ($p.Enabled.ToString() -ne 'True' -or (@($p.DisabledInterfaceAliases) -join ',') -ne 'Ethernet') {
      throw 'Effective profile must protect mesh and exclude Ethernet'
    }
  }
  $rules=@(Get-NetFirewallRule -PolicyStore ActiveStore -Group $group)
  if ($rules.Count -ne 258 -or @($rules | Where-Object {$_.Enabled.ToString() -ne 'True' -or $_.Direction.ToString() -ne 'Inbound'}).Count) {
    throw 'Effective rule set incomplete'
  }
  if (!$state.ruleDigest -or (Get-RuleDigest) -ne $state.ruleDigest) {throw 'Rule integrity mismatch'}
  $policy=New-Object -ComObject HNetCfg.FwPolicy2
  foreach($proto in 0..255) {
    if ($proto -eq 6) {continue}
    $r=$policy.Rules.Item("DeliveryOS-Lab-BlockProtocol-$proto")
    if ($r.Protocol -ne $proto -or $r.Action -ne 0 -or (@($r.Interfaces) -join ',') -ne 'wt0') {throw 'Non-TCP block mismatch'}
  }
  foreach($name in @('OtherTCP','Untrusted5193','Allow5193')) {
    $r=$policy.Rules.Item("DeliveryOS-Lab-$name")
    if ($r.Protocol -ne 6 -or (@($r.Interfaces) -join ',') -ne 'wt0') {throw 'TCP scope mismatch'}
  }
  $allow=$policy.Rules.Item('DeliveryOS-Lab-Allow5193')
  if ($allow.Action -ne 1 -or $allow.LocalPorts -ne '5193' -or $allow.LocalAddresses -notin @($hostAddress,"$hostAddress/255.255.255.255","$hostAddress/32") -or
      $allow.ApplicationName -ne 'C:\Program Files\nodejs\node.exe') {throw 'Application allow mismatch'}
  $cfg=Get-Content 'C:\ProgramData\Netbird\default.json' -Raw | ConvertFrom-Json
  if ($cfg.BlockInbound -or !$cfg.DisableDNS -or !$cfg.DisableClientRoutes -or !$cfg.DisableServerRoutes) {throw 'Client settings mismatch'}
  $listeners=@(Get-NetTCPConnection -State Listen -LocalPort 5193,8080,55436)
  if (@($listeners | Where-Object {($_.LocalPort -eq 5193 -and $_.LocalAddress -ne $hostAddress) -or
      ($_.LocalPort -in @(8080,55436) -and $_.LocalAddress -ne '127.0.0.1')}).Count -or $listeners.Count -ne 3) {throw 'Unexpected app/database exposure'}
  $record=Get-Content (Join-Path $root 'runtime-pids.json') -Raw | ConvertFrom-Json
  if (@($listeners | Where-Object {$_.LocalPort -eq 5193 -and $_.OwningProcess -eq $record.pilot}).Count -ne 1) {throw 'Pilot listener owner mismatch'}
  $checks=@()
  foreach($u in @('http://127.0.0.1:8080/ready')) {
    $response=Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 8
    if ($response.StatusCode -ne 200) {throw 'Application health failed'}
    $checks+=@{url=$u;status=200}
  }
  # The host itself is intentionally absent from the two-proxy source allowlist.
  # A self-request may be denied by Windows; do not confuse it with proxy reachability.
  $probe=& curl.exe --noproxy '*' --silent --max-time 2 --output NUL --write-out '%{http_code}' "http://${hostAddress}:5193/api/health"
  $probeExit=$LASTEXITCODE
  [pscustomobject]@{observedAtUtc=[DateTime]::UtcNow.ToString('o');scope='REMOTE_LAB_NOT_FIELD_READY';
    firewallRuleCount=$rules.Count;ethernetExcluded=$true;inboundBlocked=$false;
    proxyAddresses=$plan.proxyAddresses;health=$checks;pilotListenerOwnerVerified=$true;
    hostToMeshProbe=@{curlExit=$probeExit;httpStatus=$probe};authenticatedProxyReachability='NOT_YET_PROVEN'}
}

if ($Mode -eq 'Plan') {Get-LocalPlan | ConvertTo-Json -Depth 6;exit}
if ($Mode -eq 'Watchdog') {if (!(Test-Path $commitPath)) {Restore-Guard};exit}
if ($Mode -eq 'Rollback') {Restore-Guard;exit}
if ($Mode -eq 'Verify') {Assert-Guard | ConvertTo-Json -Depth 6;exit}
if ($Mode -eq 'Commit') {
  $proof=Assert-Guard
  $proof | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 (Join-Path $root 'netbird-guard-proof.json')
  @{committedAtUtc=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -Encoding UTF8 $commitPath
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  'NETBIRD_GUARD_COMMITTED_AUTHENTICATED_PROXY_TEST_PENDING';exit
}

# Apply is fail-closed and covered by an independent SYSTEM rollback task.
$plan=Get-LocalPlan
if (@($plan.profiles | Where-Object {$_.Enabled -ne 'False'}).Count) {throw 'Initial firewall state drift'}
$cfg=Get-Content 'C:\ProgramData\Netbird\default.json' -Raw | ConvertFrom-Json
if (!$cfg.BlockInbound) {throw 'Inbound must remain blocked during preparation'}
if ((Test-Path $statePath) -or (Test-Path $commitPath)) {throw 'Existing transaction: review before retry'}
if (@(Get-NetFirewallRule -Group $group -ErrorAction SilentlyContinue).Count) {throw 'Existing guard rules'}
@{plan=$plan;createdAtUtc=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Depth 7 | Set-Content -Encoding UTF8 $statePath
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -File `"$PSCommandPath`" -Mode Watchdog"
$trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(10)
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 3)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -User SYSTEM -RunLevel Highest | Out-Null
try {
  $policy=New-Object -ComObject HNetCfg.FwPolicy2
  function Add-Rule($name,$protocol,$action,$ports='',$remote='*',$local='*',$program='') {
    try {
    $r=New-Object -ComObject HNetCfg.FWRule
    $r.Name="DeliveryOS-Lab-$name";$r.Grouping=$group;$r.Description='Isolated test service only; mesh interface only'
    $r.Direction=1;$r.Action=$action;$r.Protocol=$protocol;$r.Profiles=2147483647
    $r.Interfaces=[object[]]@('wt0');$r.LocalAddresses=$local;$r.RemoteAddresses=$remote
    if ($ports) {$r.LocalPorts=$ports}
    if ($program) {$r.ApplicationName=$program}
    $r.Enabled=$true;$policy.Rules.Add($r)
    } catch {throw "Rule $name rejected: $($_.Exception.Message)"}
  }
  foreach($proto in 0..255) {if ($proto -ne 6) {Add-Rule "BlockProtocol-$proto" $proto 0}}
  Add-Rule 'OtherTCP' 6 0 '1-5192,5194-65535'
  # Complement of the two currently observed managed-proxy IPv4 addresses.
  function To-Number($ip) { $b=([Net.IPAddress]::Parse($ip)).GetAddressBytes();[uint64]$b[0]*16777216+[uint64]$b[1]*65536+[uint64]$b[2]*256+[uint64]$b[3] }
  function To-IP([uint64]$n) { "$(($n -shr 24) -band 255).$(($n -shr 16) -band 255).$(($n -shr 8) -band 255).$($n -band 255)" }
  $numbers=@($plan.proxyAddresses | ForEach-Object {To-Number $_} | Sort-Object)
  # The Windows COM API rejects ::/0 mixed with IPv4 ranges; use its full IPv6 range.
  $ranges=@("0.0.0.0-$(To-IP ($numbers[0]-1))", "$(To-IP ($numbers[0]+1))-$(To-IP ($numbers[1]-1))", "$(To-IP ($numbers[1]+1))-255.255.255.255",'::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff')
  Add-Rule 'Untrusted5193' 6 0 '5193' ($ranges -join ',')
  Add-Rule 'Allow5193' 6 1 '5193' ($plan.proxyAddresses -join ',') $hostAddress 'C:\Program Files\nodejs\node.exe'
  $state=Get-Content $statePath -Raw | ConvertFrom-Json
  $state | Add-Member -NotePropertyName ruleDigest -NotePropertyValue (Get-RuleDigest)
  $state | ConvertTo-Json -Depth 7 | Set-Content -Encoding UTF8 $statePath
  Set-NetFirewallProfile -All -DisabledInterfaceAliases @('Ethernet')
  Set-NetFirewallProfile -All -Enabled True
  foreach($p in Get-NetFirewallProfile -PolicyStore ActiveStore) {
    if ($p.Enabled.ToString() -ne 'True' -or (@($p.DisabledInterfaceAliases) -join ',') -ne 'Ethernet') {throw 'Profile scope not effective'}
  }
  # v0.81.4 returns before applying flags when already connected (client/cmd/up.go).
  # Reconnect only after the mesh-only firewall protection is effective.
  & $nb down
  if ($LASTEXITCODE -ne 0) {throw 'NetBird controlled disconnect failed'}
  & $nb up --block-inbound=false --disable-dns --disable-client-routes --disable-server-routes --allow-remote-jobs=false --allow-server-ssh=false
  if ($LASTEXITCODE -ne 0) {throw 'NetBird activation failed'}
  Assert-Guard | ConvertTo-Json -Depth 6
  'NETBIRD_GUARD_APPLIED_PENDING_COMMIT_AUTO_ROLLBACK_10_MINUTES'
} catch {
  $reason=$_.Exception.Message
  Restore-Guard
  throw "Guard apply reverted: $reason"
}
