# Delivery OS Itaim - L1 / review only. Do NOT install or schedule on CAIXA_MOOCA.
# No queries against order/customer tables; no SQL DML/DDL; no print.
# Intended as a one-shot read-only probe ONLY after contemporaneous authorization.
# Pilot of the SERIALIZABLE candidate remains forbidden by this script.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Emit-Hold([string]$reason, $samples=@()) {
  $out=[ordered]@{
    schema='deliveryos.reader-sql-dmv-baseline.v1'
    state='HOLD'
    reason=$reason
    serviceWindow='ITAIM'
    samples=@($samples)
    sqlOrderRowsRead=0
    databaseWrites=0
    serializablePilotExecuted=$false
    printingExecuted=$false
    homePublishAuthorized=$false
    writerImpactProven=$false
    atomicityProven=$false
    independentIfoodIdentityProven=$false
    orderEventsPublishable=0
  }
  Write-Output ($out | ConvertTo-Json -Depth 6 -Compress)
}
$conn=$null
$cmd=$null
$reader=$null
$samples=@()
try {
  if ($env:COMPUTERNAME -cne 'CAIXA_MOOCA') {
    Emit-Hold 'HOST_NOT_CAIXA_MOOCA'
    return
  }
  $tz=[TimeZoneInfo]::FindSystemTimeZoneById('E. South America Standard Time')
  $clock=[TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow,$tz)
  $minutes=($clock.Hour*60)+$clock.Minute
  $isWeekend=($clock.DayOfWeek -eq [DayOfWeek]::Saturday -or
              $clock.DayOfWeek -eq [DayOfWeek]::Sunday)
  $lunchEnd=900
  if($isWeekend){$lunchEnd=990}
  $lunch=($minutes -ge 660 -and $minutes -lt $lunchEnd)
  $dinner=($minutes -ge 1080 -and $minutes -lt 1380)
  if(-not ($lunch -or $dinner)){
    Emit-Hold 'OUTSIDE_SERVICE_WINDOW'
    return
  }
  $hbPath='C:\ProgramData\TataComandaReader\state\reader-heartbeat-v1.json'
  if(-not [IO.File]::Exists($hbPath)){
    Emit-Hold 'READER_HEARTBEAT_MISSING'
    return
  }
  $hb=Get-Content -LiteralPath $hbPath -Raw -Encoding UTF8 | ConvertFrom-Json
  # Do not infer an offset from the Windows host. The native Reader emits
  # fractional ISO-8601 timestamps WITH an explicit offset. Reject a malformed
  # calendar date, missing timezone, or unknown "-00:00" offset.
  # This is only a preflight diagnostic: last OK does not prove zero recent
  # failures, writer safety, or source/order completeness.
  $isoOffset='^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,7})?(?:Z|[+-](?:0\\d|1[0-3]):[0-5]\\d|[+-]14:00)
     $hb.last_batch.outcome -cne 'OK' -or
     [int]$hb.consecutive_failures -ne 0 -or
     [int]$hb.last_batch.poll_errors -ne 0 -or
     $hb.watcher.sha256_verified -ne $true -or
     $age -lt 0 -or $age -gt 60){
    Emit-Hold 'READER_NOT_HEALTHY_OR_HEARTBEAT_STALE'
    return
  }

  Add-Type -AssemblyName System.Data
  $cs='Server=(local)\SQLEXPRESS;Database=teknisa;Integrated Security=SSPI;Connect Timeout=3;' +
      'Application Name=DeliveryOSL1DmvOnly;Pooling=False;Encrypt=False;TrustServerCertificate=True'
  $conn=New-Object System.Data.SqlClient.SqlConnection($cs)
  $conn.Open()
  $cmd=$conn.CreateCommand()
  $cmd.CommandTimeout=4
  # SQL_SCOPE_BEGIN: Allowed objects are sys.* DMVs only. No user data tables.
  $cmd.CommandText=@'
SET NOCOUNT ON;
SET LOCK_TIMEOUT 300;
SET DEADLOCK_PRIORITY LOW;
SELECT
 CONVERT(varchar(40),SYSDATETIMEOFFSET(),126) AS sample_time,
 SUSER_SNAME() AS principal,
 DB_NAME() AS database_name,
 (SELECT COUNT_BIG(*) FROM sys.dm_exec_sessions s
  WHERE s.login_name=N'NT SERVICE\TataComandaReader'
    AND s.program_name=N'TataReaderContinuousWatchV1') AS reader_sessions,
 (SELECT COUNT_BIG(*) FROM sys.dm_exec_requests r
  WHERE r.database_id=DB_ID() AND r.session_id<>@@SPID) AS active_requests,
 (SELECT COUNT_BIG(*) FROM sys.dm_exec_requests r
  WHERE r.database_id=DB_ID() AND r.session_id<>@@SPID
    AND r.command IN(N'INSERT',N'UPDATE',N'DELETE',N'MERGE')) AS writer_requests,
 (SELECT COUNT_BIG(*) FROM sys.dm_exec_requests r
  WHERE r.database_id=DB_ID() AND r.session_id<>@@SPID
    AND r.blocking_session_id>0) AS blocked_requests,
 (SELECT COUNT_BIG(*) FROM sys.dm_os_waiting_tasks wt
  INNER JOIN sys.dm_exec_requests r ON r.session_id=wt.session_id
  WHERE r.database_id=DB_ID() AND r.session_id<>@@SPID
    AND wt.wait_type LIKE N'LCK[_]M[_]%') AS lock_waiting_tasks,
 (SELECT COUNT_BIG(*) FROM sys.dm_tran_locks l
  WHERE l.resource_database_id=DB_ID()
    AND l.request_status=N'WAIT') AS lock_requests_waiting,
 (SELECT COUNT_BIG(*) FROM sys.dm_tran_locks l
  INNER JOIN sys.dm_exec_sessions s ON s.session_id=l.request_session_id
  WHERE l.resource_database_id=DB_ID()
    AND s.login_name=N'NT SERVICE\TataComandaReader') AS reader_lock_entries,
 (SELECT COUNT_BIG(*) FROM sys.dm_tran_locks l
  INNER JOIN sys.dm_exec_sessions s ON s.session_id=l.request_session_id
  WHERE l.resource_database_id=DB_ID()
    AND s.login_name=N'NT SERVICE\TataComandaReader'
    AND l.request_mode LIKE N'Range%') AS reader_key_range_locks;
'@
  # SQL_SCOPE_END
  for($i=0;$i -lt 3;$i++){
    $reader=$cmd.ExecuteReader()
    if(-not $reader.Read()){throw 'METADATA_ROW_MISSING'}
    if([string]$reader['principal'] -cne 'CAIXA_MOOCA\Tata' -or
       [string]$reader['database_name'] -cne 'teknisa'){
      throw 'UNAUTHORIZED_SQL_IDENTITY'
    }
    $sample=[ordered]@{time=[string]$reader['sample_time']}
    foreach($key in @('reader_sessions','active_requests','writer_requests',
                     'blocked_requests','lock_waiting_tasks',
                     'lock_requests_waiting','reader_lock_entries',
                     'reader_key_range_locks')){
      $sample[$key]=[long]$reader[$key]
    }
    $reader.Dispose()
    $reader=$null
    $samples+=([pscustomobject]$sample)
    if([long]$sample.reader_sessions -ne 1){
      Emit-Hold 'READER_SESSION_COUNT_NOT_ONE' $samples
      return
    }
    if([long]$sample.blocked_requests -gt 0 -or
       [long]$sample.lock_waiting_tasks -gt 0 -or
       [long]$sample.lock_requests_waiting -gt 0){
      Emit-Hold 'BLOCKING_OR_LOCK_WAIT_OBSERVED' $samples
      return
    }
    if($i -lt 2){[Threading.Thread]::Sleep(300)}
  }
  # A clean DMV sample is NOT authorization to execute SERIALIZABLE.
  Emit-Hold 'SERVICE_WINDOW_DMV_BASELINE_COLLECTED_NOT_PILOT_AUTHORIZED' $samples
}catch{
  # No raw SQL errors, machine credentials or customer fields in output.
  Emit-Hold 'SQL_DMV_PROBE_ABORTED' $samples
}finally{
  if($reader){$reader.Dispose()}
  if($cmd){$cmd.Dispose()}
  if($conn){$conn.Dispose()}
}

  $writtenText=[string]$hb.written_at
  $successText=[string]$hb.last_success_at
  $written=[DateTimeOffset]::MinValue
  $success=[DateTimeOffset]::MinValue
  $culture=[Globalization.CultureInfo]::InvariantCulture
  $style=[Globalization.DateTimeStyles]::None
  if($writtenText -cnotmatch $isoOffset -or $successText -cnotmatch $isoOffset -or
     $writtenText -match '-00:00
     $hb.last_batch.outcome -cne 'OK' -or
     [int]$hb.consecutive_failures -ne 0 -or
     [int]$hb.last_batch.poll_errors -ne 0 -or
     $hb.watcher.sha256_verified -ne $true -or
     $age -lt 0 -or $age -gt 60){
    Emit-Hold 'READER_NOT_HEALTHY_OR_HEARTBEAT_STALE'
    return
  }

  Add-Type -AssemblyName System.Data
  $cs='Server=(local)\SQLEXPRESS;Database=teknisa;Integrated Security=SSPI;Connect Timeout=3;' +
      'Application Name=DeliveryOSL1DmvOnly;Pooling=False;Encrypt=False;TrustServerCertificate=True'
  $conn=New-Object System.Data.SqlClient.SqlConnection($cs)
  $conn.Open()
  $cmd=$conn.CreateCommand()
  $cmd.CommandTimeout=4
  # SQL_SCOPE_BEGIN: Allowed objects are sys.* DMVs only. No user data tables.
  $cmd.CommandText=@'
SET NOCOUNT ON;
SET LOCK_TIMEOUT 300;
SET DEADLOCK_PRIORITY LOW;
SELECT
 CONVERT(varchar(40),SYSDATETIMEOFFSET(),126) AS sample_time,
 SUSER_SNAME() AS principal,
 DB_NAME() AS database_name,
 (SELECT COUNT_BIG(*) FROM sys.dm_exec_sessions s
  WHERE s.login_name=N'NT SERVICE\TataComandaReader'
    AND s.program_name=N'TataReaderContinuousWatchV1') AS reader_sessions,
 (SELECT COUNT_BIG(*) FROM sys.dm_exec_requests r
  WHERE r.database_id=DB_ID() AND r.session_id<>@@SPID) AS active_requests,
 (SELECT COUNT_BIG(*) FROM sys.dm_exec_requests r
  WHERE r.database_id=DB_ID() AND r.session_id<>@@SPID
    AND r.command IN(N'INSERT',N'UPDATE',N'DELETE',N'MERGE')) AS writer_requests,
 (SELECT COUNT_BIG(*) FROM sys.dm_exec_requests r
  WHERE r.database_id=DB_ID() AND r.session_id<>@@SPID
    AND r.blocking_session_id>0) AS blocked_requests,
 (SELECT COUNT_BIG(*) FROM sys.dm_os_waiting_tasks wt
  INNER JOIN sys.dm_exec_requests r ON r.session_id=wt.session_id
  WHERE r.database_id=DB_ID() AND r.session_id<>@@SPID
    AND wt.wait_type LIKE N'LCK[_]M[_]%') AS lock_waiting_tasks,
 (SELECT COUNT_BIG(*) FROM sys.dm_tran_locks l
  WHERE l.resource_database_id=DB_ID()
    AND l.request_status=N'WAIT') AS lock_requests_waiting,
 (SELECT COUNT_BIG(*) FROM sys.dm_tran_locks l
  INNER JOIN sys.dm_exec_sessions s ON s.session_id=l.request_session_id
  WHERE l.resource_database_id=DB_ID()
    AND s.login_name=N'NT SERVICE\TataComandaReader') AS reader_lock_entries,
 (SELECT COUNT_BIG(*) FROM sys.dm_tran_locks l
  INNER JOIN sys.dm_exec_sessions s ON s.session_id=l.request_session_id
  WHERE l.resource_database_id=DB_ID()
    AND s.login_name=N'NT SERVICE\TataComandaReader'
    AND l.request_mode LIKE N'Range%') AS reader_key_range_locks;
'@
  # SQL_SCOPE_END
  for($i=0;$i -lt 3;$i++){
    $reader=$cmd.ExecuteReader()
    if(-not $reader.Read()){throw 'METADATA_ROW_MISSING'}
    if([string]$reader['principal'] -cne 'CAIXA_MOOCA\Tata' -or
       [string]$reader['database_name'] -cne 'teknisa'){
      throw 'UNAUTHORIZED_SQL_IDENTITY'
    }
    $sample=[ordered]@{time=[string]$reader['sample_time']}
    foreach($key in @('reader_sessions','active_requests','writer_requests',
                     'blocked_requests','lock_waiting_tasks',
                     'lock_requests_waiting','reader_lock_entries',
                     'reader_key_range_locks')){
      $sample[$key]=[long]$reader[$key]
    }
    $reader.Dispose()
    $reader=$null
    $samples+=([pscustomobject]$sample)
    if([long]$sample.reader_sessions -ne 1){
      Emit-Hold 'READER_SESSION_COUNT_NOT_ONE' $samples
      return
    }
    if([long]$sample.blocked_requests -gt 0 -or
       [long]$sample.lock_waiting_tasks -gt 0 -or
       [long]$sample.lock_requests_waiting -gt 0){
      Emit-Hold 'BLOCKING_OR_LOCK_WAIT_OBSERVED' $samples
      return
    }
    if($i -lt 2){[Threading.Thread]::Sleep(300)}
  }
  # A clean DMV sample is NOT authorization to execute SERIALIZABLE.
  Emit-Hold 'SERVICE_WINDOW_DMV_BASELINE_COLLECTED_NOT_PILOT_AUTHORIZED' $samples
}catch{
  # No raw SQL errors, machine credentials or customer fields in output.
  Emit-Hold 'SQL_DMV_PROBE_ABORTED' $samples
}finally{
  if($reader){$reader.Dispose()}
  if($cmd){$cmd.Dispose()}
  if($conn){$conn.Dispose()}
}
 -or $successText -match '-00:00
     $hb.last_batch.outcome -cne 'OK' -or
     [int]$hb.consecutive_failures -ne 0 -or
     [int]$hb.last_batch.poll_errors -ne 0 -or
     $hb.watcher.sha256_verified -ne $true -or
     $age -lt 0 -or $age -gt 60){
    Emit-Hold 'READER_NOT_HEALTHY_OR_HEARTBEAT_STALE'
    return
  }

  Add-Type -AssemblyName System.Data
  $cs='Server=(local)\SQLEXPRESS;Database=teknisa;Integrated Security=SSPI;Connect Timeout=3;' +
      'Application Name=DeliveryOSL1DmvOnly;Pooling=False;Encrypt=False;TrustServerCertificate=True'
  $conn=New-Object System.Data.SqlClient.SqlConnection($cs)
  $conn.Open()
  $cmd=$conn.CreateCommand()
  $cmd.CommandTimeout=4
  # SQL_SCOPE_BEGIN: Allowed objects are sys.* DMVs only. No user data tables.
  $cmd.CommandText=@'
SET NOCOUNT ON;
SET LOCK_TIMEOUT 300;
SET DEADLOCK_PRIORITY LOW;
SELECT
 CONVERT(varchar(40),SYSDATETIMEOFFSET(),126) AS sample_time,
 SUSER_SNAME() AS principal,
 DB_NAME() AS database_name,
 (SELECT COUNT_BIG(*) FROM sys.dm_exec_sessions s
  WHERE s.login_name=N'NT SERVICE\TataComandaReader'
    AND s.program_name=N'TataReaderContinuousWatchV1') AS reader_sessions,
 (SELECT COUNT_BIG(*) FROM sys.dm_exec_requests r
  WHERE r.database_id=DB_ID() AND r.session_id<>@@SPID) AS active_requests,
 (SELECT COUNT_BIG(*) FROM sys.dm_exec_requests r
  WHERE r.database_id=DB_ID() AND r.session_id<>@@SPID
    AND r.command IN(N'INSERT',N'UPDATE',N'DELETE',N'MERGE')) AS writer_requests,
 (SELECT COUNT_BIG(*) FROM sys.dm_exec_requests r
  WHERE r.database_id=DB_ID() AND r.session_id<>@@SPID
    AND r.blocking_session_id>0) AS blocked_requests,
 (SELECT COUNT_BIG(*) FROM sys.dm_os_waiting_tasks wt
  INNER JOIN sys.dm_exec_requests r ON r.session_id=wt.session_id
  WHERE r.database_id=DB_ID() AND r.session_id<>@@SPID
    AND wt.wait_type LIKE N'LCK[_]M[_]%') AS lock_waiting_tasks,
 (SELECT COUNT_BIG(*) FROM sys.dm_tran_locks l
  WHERE l.resource_database_id=DB_ID()
    AND l.request_status=N'WAIT') AS lock_requests_waiting,
 (SELECT COUNT_BIG(*) FROM sys.dm_tran_locks l
  INNER JOIN sys.dm_exec_sessions s ON s.session_id=l.request_session_id
  WHERE l.resource_database_id=DB_ID()
    AND s.login_name=N'NT SERVICE\TataComandaReader') AS reader_lock_entries,
 (SELECT COUNT_BIG(*) FROM sys.dm_tran_locks l
  INNER JOIN sys.dm_exec_sessions s ON s.session_id=l.request_session_id
  WHERE l.resource_database_id=DB_ID()
    AND s.login_name=N'NT SERVICE\TataComandaReader'
    AND l.request_mode LIKE N'Range%') AS reader_key_range_locks;
'@
  # SQL_SCOPE_END
  for($i=0;$i -lt 3;$i++){
    $reader=$cmd.ExecuteReader()
    if(-not $reader.Read()){throw 'METADATA_ROW_MISSING'}
    if([string]$reader['principal'] -cne 'CAIXA_MOOCA\Tata' -or
       [string]$reader['database_name'] -cne 'teknisa'){
      throw 'UNAUTHORIZED_SQL_IDENTITY'
    }
    $sample=[ordered]@{time=[string]$reader['sample_time']}
    foreach($key in @('reader_sessions','active_requests','writer_requests',
                     'blocked_requests','lock_waiting_tasks',
                     'lock_requests_waiting','reader_lock_entries',
                     'reader_key_range_locks')){
      $sample[$key]=[long]$reader[$key]
    }
    $reader.Dispose()
    $reader=$null
    $samples+=([pscustomobject]$sample)
    if([long]$sample.reader_sessions -ne 1){
      Emit-Hold 'READER_SESSION_COUNT_NOT_ONE' $samples
      return
    }
    if([long]$sample.blocked_requests -gt 0 -or
       [long]$sample.lock_waiting_tasks -gt 0 -or
       [long]$sample.lock_requests_waiting -gt 0){
      Emit-Hold 'BLOCKING_OR_LOCK_WAIT_OBSERVED' $samples
      return
    }
    if($i -lt 2){[Threading.Thread]::Sleep(300)}
  }
  # A clean DMV sample is NOT authorization to execute SERIALIZABLE.
  Emit-Hold 'SERVICE_WINDOW_DMV_BASELINE_COLLECTED_NOT_PILOT_AUTHORIZED' $samples
}catch{
  # No raw SQL errors, machine credentials or customer fields in output.
  Emit-Hold 'SQL_DMV_PROBE_ABORTED' $samples
}finally{
  if($reader){$reader.Dispose()}
  if($cmd){$cmd.Dispose()}
  if($conn){$conn.Dispose()}
}
 -or
     -not [DateTimeOffset]::TryParse($writtenText,$culture,$style,[ref]$written) -or
     -not [DateTimeOffset]::TryParse($successText,$culture,$style,[ref]$success)){
    Emit-Hold 'READER_HEARTBEAT_CLOCK_INVALID'
    return
  }
  $nowUtc=[DateTimeOffset]::UtcNow
  $age=($nowUtc-$written.ToUniversalTime()).TotalSeconds
  # A success cannot occur AFTER the heartbeat which claims to report it.
  # Only use the same monotonic ordering, never a fresh OK as SQL proof.
  if($success.ToUniversalTime() -gt $written.ToUniversalTime() -or
     $success.ToUniversalTime() -gt $nowUtc){
    Emit-Hold 'READER_LAST_SUCCESS_CLOCK_INCONSISTENT'
    return
  }
  if($hb.state -cne 'RUNNING' -or
     $hb.last_batch.outcome -cne 'OK' -or
     [int]$hb.consecutive_failures -ne 0 -or
     [int]$hb.last_batch.poll_errors -ne 0 -or
     $hb.watcher.sha256_verified -ne $true -or
     $age -lt 0 -or $age -gt 60){
    Emit-Hold 'READER_NOT_HEALTHY_OR_HEARTBEAT_STALE'
    return
  }

  Add-Type -AssemblyName System.Data
  $cs='Server=(local)\SQLEXPRESS;Database=teknisa;Integrated Security=SSPI;Connect Timeout=3;' +
      'Application Name=DeliveryOSL1DmvOnly;Pooling=False;Encrypt=False;TrustServerCertificate=True'
  $conn=New-Object System.Data.SqlClient.SqlConnection($cs)
  $conn.Open()
  $cmd=$conn.CreateCommand()
  $cmd.CommandTimeout=4
  # SQL_SCOPE_BEGIN: Allowed objects are sys.* DMVs only. No user data tables.
  $cmd.CommandText=@'
SET NOCOUNT ON;
SET LOCK_TIMEOUT 300;
SET DEADLOCK_PRIORITY LOW;
SELECT
 CONVERT(varchar(40),SYSDATETIMEOFFSET(),126) AS sample_time,
 SUSER_SNAME() AS principal,
 DB_NAME() AS database_name,
 (SELECT COUNT_BIG(*) FROM sys.dm_exec_sessions s
  WHERE s.login_name=N'NT SERVICE\TataComandaReader'
    AND s.program_name=N'TataReaderContinuousWatchV1') AS reader_sessions,
 (SELECT COUNT_BIG(*) FROM sys.dm_exec_requests r
  WHERE r.database_id=DB_ID() AND r.session_id<>@@SPID) AS active_requests,
 (SELECT COUNT_BIG(*) FROM sys.dm_exec_requests r
  WHERE r.database_id=DB_ID() AND r.session_id<>@@SPID
    AND r.command IN(N'INSERT',N'UPDATE',N'DELETE',N'MERGE')) AS writer_requests,
 (SELECT COUNT_BIG(*) FROM sys.dm_exec_requests r
  WHERE r.database_id=DB_ID() AND r.session_id<>@@SPID
    AND r.blocking_session_id>0) AS blocked_requests,
 (SELECT COUNT_BIG(*) FROM sys.dm_os_waiting_tasks wt
  INNER JOIN sys.dm_exec_requests r ON r.session_id=wt.session_id
  WHERE r.database_id=DB_ID() AND r.session_id<>@@SPID
    AND wt.wait_type LIKE N'LCK[_]M[_]%') AS lock_waiting_tasks,
 (SELECT COUNT_BIG(*) FROM sys.dm_tran_locks l
  WHERE l.resource_database_id=DB_ID()
    AND l.request_status=N'WAIT') AS lock_requests_waiting,
 (SELECT COUNT_BIG(*) FROM sys.dm_tran_locks l
  INNER JOIN sys.dm_exec_sessions s ON s.session_id=l.request_session_id
  WHERE l.resource_database_id=DB_ID()
    AND s.login_name=N'NT SERVICE\TataComandaReader') AS reader_lock_entries,
 (SELECT COUNT_BIG(*) FROM sys.dm_tran_locks l
  INNER JOIN sys.dm_exec_sessions s ON s.session_id=l.request_session_id
  WHERE l.resource_database_id=DB_ID()
    AND s.login_name=N'NT SERVICE\TataComandaReader'
    AND l.request_mode LIKE N'Range%') AS reader_key_range_locks;
'@
  # SQL_SCOPE_END
  for($i=0;$i -lt 3;$i++){
    $reader=$cmd.ExecuteReader()
    if(-not $reader.Read()){throw 'METADATA_ROW_MISSING'}
    if([string]$reader['principal'] -cne 'CAIXA_MOOCA\Tata' -or
       [string]$reader['database_name'] -cne 'teknisa'){
      throw 'UNAUTHORIZED_SQL_IDENTITY'
    }
    $sample=[ordered]@{time=[string]$reader['sample_time']}
    foreach($key in @('reader_sessions','active_requests','writer_requests',
                     'blocked_requests','lock_waiting_tasks',
                     'lock_requests_waiting','reader_lock_entries',
                     'reader_key_range_locks')){
      $sample[$key]=[long]$reader[$key]
    }
    $reader.Dispose()
    $reader=$null
    $samples+=([pscustomobject]$sample)
    if([long]$sample.reader_sessions -ne 1){
      Emit-Hold 'READER_SESSION_COUNT_NOT_ONE' $samples
      return
    }
    if([long]$sample.blocked_requests -gt 0 -or
       [long]$sample.lock_waiting_tasks -gt 0 -or
       [long]$sample.lock_requests_waiting -gt 0){
      Emit-Hold 'BLOCKING_OR_LOCK_WAIT_OBSERVED' $samples
      return
    }
    if($i -lt 2){[Threading.Thread]::Sleep(300)}
  }
  # A clean DMV sample is NOT authorization to execute SERIALIZABLE.
  Emit-Hold 'SERVICE_WINDOW_DMV_BASELINE_COLLECTED_NOT_PILOT_AUTHORIZED' $samples
}catch{
  # No raw SQL errors, machine credentials or customer fields in output.
  Emit-Hold 'SQL_DMV_PROBE_ABORTED' $samples
}finally{
  if($reader){$reader.Dispose()}
  if($cmd){$cmd.Dispose()}
  if($conn){$conn.Dispose()}
}
