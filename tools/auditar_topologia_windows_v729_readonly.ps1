# V7.29 Windows runtime topology observation - READ ONLY, no order data.
# Queries CIM process metadata in memory; never exports command lines/PIDs/paths.
# Does not invoke any installed scripts, alter services, read SQL or print.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$serviceName = 'TataComandaReader'
$service = [ordered]@{
    lookup='UNKNOWN'
    state='UNKNOWN'
    start_mode='UNKNOWN'
    pid_present=$false
    image_mentions_reader=$false
}
$topology = [ordered]@{
    scan='UNKNOWN'
    watcher_child='UNKNOWN'
    legacy_shadow_loop_child='UNKNOWN'
    candidate_v2_child='UNKNOWN'
    direct_children_count=$null
}
try {
    $found = Get-CimInstance -ClassName Win32_Service -Filter "Name='TataComandaReader'"
    if ($null -eq $found) {
        $service.lookup = 'NOT_FOUND'
        $topology.scan = 'NOT_APPLICABLE_NO_SERVICE'
    } else {
        $service.lookup = 'FOUND'
        $service.state = [string]$found.State
        $service.start_mode = [string]$found.StartMode
        $service.pid_present = ([int64]$found.ProcessId -gt 0)
        $service.image_mentions_reader = ([string]$found.PathName -match 'TataComandaReader')
        if ($service.pid_present) {
            try {
                $parentPid = [int64]$found.ProcessId
                # Restrict query to direct children of the service PID.
                $children = @(Get-CimInstance -ClassName Win32_Process -Filter ("ParentProcessId=" + $parentPid))
                $topology.scan = 'DIRECT_CHILDREN_OBSERVED'
                $topology.direct_children_count = $children.Count
                $topology.watcher_child = 'NOT_OBSERVED'
                $topology.legacy_shadow_loop_child = 'NOT_OBSERVED'
                $topology.candidate_v2_child = 'NOT_OBSERVED'
                foreach ($child in $children) {
                    # Process command line is consulted in memory only.
                    # It may contain sensitive arguments: NEVER emit it or its hash.
                    $exe = [string]$child.Name
                    $cmd = [string]$child.CommandLine
                    if (($exe -ieq 'powershell.exe' -or $exe -ieq 'pwsh.exe') -and
                        $cmd.Contains('tata_reader_continuous_watch_candidate_v1.ps1')) {
                        $topology.watcher_child = 'OBSERVED'
                    }
                    if (($exe -ieq 'node.exe') -and
                        $cmd.Contains('live_shadow_consumer_loop_v1.cjs')) {
                        $topology.legacy_shadow_loop_child = 'OBSERVED'
                    }
                    if (($exe -ieq 'node.exe') -and
                        $cmd.Contains('live_shadow_consumer_v2_candidate_v714.cjs')) {
                        $topology.candidate_v2_child = 'OBSERVED'
                    }
                }
            } catch {
                $topology.scan = 'UNREADABLE'
                $topology.watcher_child = 'UNKNOWN'
                $topology.legacy_shadow_loop_child = 'UNKNOWN'
                $topology.candidate_v2_child = 'UNKNOWN'
                $topology.direct_children_count = $null
            }
        } else {
            $topology.scan = 'NO_RUNNING_SERVICE_PID'
        }
    }
} catch {
    # Never interpret permission failure as service absence.
    $service.lookup = 'UNREADABLE'
    $topology.scan = 'UNREADABLE'
}
# A process-name observation is only a transient topology sample.
# An ephemeral child may be missed; a process name cannot prove what code
# executes, mandatory V6.8 usage, privilege integrity, or print acceptance.
[ordered]@{
    schema='deliveryos.windows-process-topology-passive.v729'
    scope='LOCAL_CIM_READ_ONLY_NO_COMMANDLINES_EXPORTED'
    status='OBSERVATION_ONLY_NOT_RUNTIME_ATTESTATION'
    observed_utc=[DateTime]::UtcNow.ToString('o')
    service=$service
    topology=$topology
    mandatory_v68_gate='UNKNOWN_NOT_PROVEN_BY_PROCESS_SCAN'
    source_consistency='UNKNOWN_NOT_PROVEN_BY_PROCESS_SCAN'
    human_shift='UNKNOWN_NOT_INSPECTED'
    order_content_exposed=$false
    effects=[ordered]@{
        service_start=$false
        service_stop=$false
        service_restart=$false
        file_write=$false
        database_write=$false
        printer=$false
        spooler_write=$false
        sequence_write=$false
        deploy=$false
    }
    authorizes_cutover=$false
} | ConvertTo-Json -Depth 5 -Compress
