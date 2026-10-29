# Embedded into the installed watcher; no clock-based shift renewal or SQL effects.
function Read-ServiceState([datetime]$OrderOpenedAt) {
  $denied = [ordered]@{service=$null;evidence='UNKNOWN';source_ref=$null;blockers=@('SERVICE_WEEKLY_POLICY_INVALID')}
  try {
    $installRoot = [IO.Path]::GetDirectoryName([IO.Path]::GetDirectoryName($ServiceStatePath))
    $policyPath = Join-Path $installRoot 'bin\production-service-weekly-policy.json'
    if (-not (Test-Path -LiteralPath $policyPath -PathType Leaf)) {
      $denied.blockers=@('SERVICE_WEEKLY_POLICY_MISSING');return $denied
    }
    $info=Get-Item -LiteralPath $policyPath
    if ($info.Length -gt 65536 -or ($info.Attributes -band [IO.FileAttributes]::ReparsePoint)) {return $denied}
    $p=Get-Content -LiteralPath $policyPath -Raw -Encoding UTF8|ConvertFrom-Json
    if ($p.schema -cne 'deliveryos.production-service-weekly-policy.v1' -or
        $p.enabled -isnot [bool] -or -not $p.enabled -or
        $p.clock_inference_used -isnot [bool] -or $p.clock_inference_used -or
        $p.unit_id -cne 'ITAIM' -or $p.source_unit_id -cne '0001' -or $p.source_store_id -cne '01' -or
        $p.host_name -cne $env:COMPUTERNAME -or $p.timezone -cne 'America/Sao_Paulo' -or
        $p.order_time_basis -cne 'NATIVE_DTHRABERMESA_LOCAL' -or
        $p.boundary -cne 'START_INCLUSIVE_END_EXCLUSIVE' -or
        $p.evidence -cne 'HUMAN_CONFIRMED_RULE' -or
        [string]::IsNullOrWhiteSpace([string]$p.source_ref) -or
        [string]::IsNullOrWhiteSpace([string]$p.policy_version) -or @($p.week).Count -ne 7) {return $denied}
    $from=[datetime]::MinValue
    if (-not [datetime]::TryParseExact([string]$p.effective_from,'yyyy-MM-dd',
        [Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::None,[ref]$from)) {return $denied}
    if ($null -ne $p.effective_until) {return $denied}
    # Native SQL wall time is compared without converting it with the consumer's clock/zone.
    if ($OrderOpenedAt.Kind -ne [DateTimeKind]::Unspecified) {
      $denied.blockers=@('SERVICE_NATIVE_LOCAL_TIME_REQUIRED');return $denied
    }
    if ($OrderOpenedAt.Date -lt $from.Date) {
      $denied.blockers=@('SERVICE_WEEKLY_POLICY_NOT_EFFECTIVE');return $denied
    }
    $seen=@{};$selected=$null
    foreach ($day in @($p.week)) {
      if ($day.day_of_week -isnot [int] -or $day.day_of_week -lt 0 -or $day.day_of_week -gt 6 -or
          $seen.ContainsKey($day.day_of_week) -or @($day.windows).Count -ne 2) {return $denied}
      $seen[$day.day_of_week]=$true;$previousEnd=-1;$services=@{}
      foreach ($w in @($day.windows)) {
        if ($w.service -cnotin @('LUNCH','DINNER') -or $services.ContainsKey([string]$w.service) -or
            [string]$w.start -cnotmatch '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' -or
            [string]$w.end -cnotmatch '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$') {return $denied}
        $start=[timespan]::ParseExact([string]$w.start,'hh\:mm',[Globalization.CultureInfo]::InvariantCulture)
        $end=[timespan]::ParseExact([string]$w.end,'hh\:mm',[Globalization.CultureInfo]::InvariantCulture)
        if ($start -ge $end -or $start.TotalSeconds -lt $previousEnd) {return $denied}
        $previousEnd=$end.TotalSeconds;$services[[string]$w.service]=$true
        if ($day.day_of_week -eq [int]$OrderOpenedAt.DayOfWeek -and
            $OrderOpenedAt.TimeOfDay -ge $start -and $OrderOpenedAt.TimeOfDay -lt $end) {
          if ($null -ne $selected) {return $denied}
          $selected=[ordered]@{service=[string]$w.service;evidence=[string]$p.evidence;source_ref=[string]$p.source_ref;
            policy_version=[string]$p.policy_version;operational_date=$OrderOpenedAt.ToString('yyyy-MM-dd');
            valid_from_local=$OrderOpenedAt.Date.Add($start).ToString('yyyy-MM-ddTHH:mm:ss');
            valid_until_local=$OrderOpenedAt.Date.Add($end).ToString('yyyy-MM-ddTHH:mm:ss');
            clock_inference_used=$false;blockers=@()}
        }
      }
    }
    if ($null -ne $selected) {return $selected}
    $denied.blockers=@('SERVICE_HOURS_OUTSIDE_WINDOW');return $denied
  } catch {return $denied}
}
