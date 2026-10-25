"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "comandas_printservice_metadata_v886_target_windows.ps1"),
  "utf8",
);

function safe(script) {
  const required = [
    /#Requires -Version 5\.1/,
    /\[ValidatePattern\('\^\[0-9a-f\]\{64\}\$'\)\]/,
    /\[string\]\$Challenge/,
    /\$expectedComputerName='CAIXA_MOOCA'/,
    /\$env:COMPUTERNAME -cne \$expectedComputerName/,
    /V886_EXACT_TARGET_HOST_REQUIRED/,
    /\$channel='Microsoft-Windows-PrintService\/Operational'/,
    /\$jobTimeoutSeconds=10/,
    /WindowsIdentity\]::GetCurrent\(\)/,
    /current_execution_sid_sha256=\$executionSidHash/,
    /current_token_group_set_sha256=\$tokenGroupSetHash/,
    /Start-Job -ScriptBlock/,
    /Get-WinEvent -ListLog \$channel -ErrorAction Stop/,
    /Wait-Job -Job \$job -Timeout \$jobTimeoutSeconds/,
    /if\(\$job\.State -eq 'Completed'\)/,
    /elseif\(\$job\.State -in @\('Failed','Stopped','Disconnected'\)\)/,
    /Stop-Job -Job \$job -ErrorAction SilentlyContinue/,
    /Remove-Job -Job \$job -Force -ErrorAction SilentlyContinue/,
    /freshness_challenge_sha256=Sha256-Text \$Challenge/,
    /target_host_exact_match=\$true/,
    /target_logical_store_identity_proven=\$false/,
    /connector_device_binding_required=\$true/,
    /connector_device_binding_proven_by_script=\$false/,
    /environment_guard_is_security_boundary=\$false/,
    /raw_host_name_exported=\$false/,
    /raw_execution_sid_exported=\$false/,
    /raw_group_sids_exported=\$false/,
    /raw_security_descriptor_exported=\$false/,
    /event_records_read=\$false/,
    /event_307_read=\$false/,
    /event_307_is_physical_paper_proof=\$false/,
    /channel_read_acl_semantics_proven=\$false/,
    /dedicated_collector_identity_proven=\$false/,
    /gp_teknisa_identity_exclusion_proven=\$false/,
    /coexistence_under_operational_load_proven=\$false/,
    /authorizes_event_record_read=\$false/,
    /authorizes_print=\$false/,
    /authorizes_reprint=\$false/,
    /automatic_retry_allowed=\$false/,
    /observer_process_execution=\$true/,
    /powershell_job_execution=\$true/,
    /host_identity_metadata_read=\$true/,
    /execution_token_metadata_read_attempted=\$true/,
    /event_channel_configuration_read_attempted=\$true/,
    /^\s{2}event_record_read=\$false$/m,
    /event_log_change=\$false/,
    /spooler_api_access=\$false/,
    /printer_configuration_read=\$false/,
    /print_job_read=\$false/,
    /^\s{2}print=\$false$/m,
    /^\s{2}reprint=\$false$/m,
    /process_inventory_read=\$false/,
    /service_configuration_read=\$false/,
    /service_change=\$false/,
    /application_file_read=\$false/,
    /application_file_write=\$false/,
    /script_network_call=\$false/,
    /gp_teknisa_access=\$false/,
    /fiscal_or_sefaz_access=\$false/,
    /sequence_read=\$false/,
    /sequence_write=\$false/,
    /install=\$false/,
    /deploy=\$false/,
    /status='HOLD_OPERATIONAL_METADATA_ONLY'/,
    /KEEP_EVENT_RECORD_READ_DISABLED_UNTIL_NEW_GATE/,
    /ConvertTo-Json -Depth 8 -Compress/,
  ];
  if (required.some((pattern) => !pattern.test(script))) return false;

  const eventReads = script.match(/^\s*\$log=Get-WinEvent[^\r\n]*$/gim) || [];
  if (
    eventReads.length !== 1 ||
    !/Get-WinEvent -ListLog \$channel -ErrorAction Stop/.test(eventReads[0])
  ) {
    return false;
  }

  const banned = [
    /\[string\]\$ComputerName/i,
    /Get-WinEvent\s+-(?:LogName|FilterHashtable|FilterXml|FilterXPath|Path)\b/i,
    /Get-WinEvent\s+-ListLog\s+['"]?\*/i,
    /Get-WinEvent[^\r\n]*-ComputerName\b/i,
    /\b(?:SaveChanges|Clear-EventLog|Limit-EventLog|New-EventLog|Remove-EventLog|Write-EventLog)\b/i,
    /\bwevtutil(?:\.exe)?\s+(?:sl|cl|im|um)\b/i,
    /\b(?:Get-PrintJob|Get-Printer|Get-PrinterPort|OpenPrinter|EnumJobs)\b/i,
    /\b(?:Set-Printer|Add-Printer|Remove-Printer|StartDocPrinter|WritePrinter)\b/i,
    /\b(?:Get-Service|Restart-Service|Start-Service|Stop-Service|Set-Service|New-Service)\b/i,
    /\bGet-(?:Process|CimInstance|WmiObject)\b/i,
    /\b(?:Get-Content|Set-Content|Add-Content|Out-File|Export-Csv|New-Item|Remove-Item|Move-Item|Copy-Item)\b/i,
    /\b(?:Invoke-RestMethod|Invoke-WebRequest|Invoke-Command|Invoke-Expression|Start-Process)\b/i,
    /\b(?:SqlCommand|Invoke-Sqlcmd|sqlcmd(?:\.exe)?)\b/i,
    /\$env:(?:USERNAME|USERDOMAIN)\b/i,
    /\bwhoami\b/i,
    /Write-(?:Output|Host)[^\r\n]*\$env:COMPUTERNAME/i,
    /Write-(?:Output|Host)[^\r\n]*(?:security_descriptor|identity\.User|groupSids)/i,
    /security_descriptor_raw\s*=/i,
    /(?:execution_sid|group_sids)_raw\s*=/i,
  ];
  return !banned.some((pattern) => pattern.test(script));
}

let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`PASS ${checks} ${name}`);
}

check("V8.86 is exact-target, challenge-bound, metadata-only and effect-honest", () => {
  assert.equal(safe(source), true);
});

const mutations = [
  ["accepts a host parameter", (s) => s.replace("[string]$Challenge", "[string]$Challenge,[string]$ComputerName")],
  ["weakens challenge length", (s) => s.replace("^[0-9a-f]{64}$", "^[0-9a-f]+$")],
  ["changes exact target", (s) => s.replace("CAIXA_MOOCA", "FOXYY")],
  ["removes exact target comparison", (s) => s.replace("$env:COMPUTERNAME -cne $expectedComputerName", "$false")],
  ["removes target refusal", (s) => s.replace("V886_EXACT_TARGET_HOST_REQUIRED", "V886_CONTINUE_ANYWHERE")],
  ["changes exact channel", (s) => s.replace("Microsoft-Windows-PrintService/Operational", "Application")],
  ["raises timeout", (s) => s.replace("$jobTimeoutSeconds=10", "$jobTimeoutSeconds=600")],
  ["removes bounded wait", (s) => s.replace("Wait-Job -Job $job -Timeout $jobTimeoutSeconds", "Wait-Job -Job $job")],
  ["collapses job failure into timeout", (s) => s.replace("elseif($job.State -in @('Failed','Stopped','Disconnected'))", "elseif($false)")],
  ["removes timeout stop", (s) => s.replace("Stop-Job -Job $job -ErrorAction SilentlyContinue", "$null=$job")],
  ["removes job cleanup", (s) => s.replace("Remove-Job -Job $job -Force -ErrorAction SilentlyContinue", "$null=$job")],
  ["reads records by log name", (s) => `${s}\nGet-WinEvent -LogName Application\n`],
  ["reads event 307", (s) => `${s}\nGet-WinEvent -FilterHashtable @{LogName='x';Id=307}\n`],
  ["uses wildcard channel inventory", (s) => s.replace("Get-WinEvent -ListLog $channel", "Get-WinEvent -ListLog *")],
  ["targets another computer", (s) => s.replace("Get-WinEvent -ListLog $channel", "Get-WinEvent -ListLog $channel -ComputerName x")],
  ["changes event log", (s) => `${s}\n$log.SaveChanges()\n`],
  ["clears event log", (s) => `${s}\nClear-EventLog -LogName Application\n`],
  ["changes event log with wevtutil", (s) => `${s}\nwevtutil sl Application /e:true\n`],
  ["reads print jobs", (s) => `${s}\nGet-PrintJob -PrinterName x\n`],
  ["reads printer configuration", (s) => `${s}\nGet-Printer -Name x\n`],
  ["opens spooler", (s) => `${s}\nOpenPrinter\n`],
  ["writes printer bytes", (s) => `${s}\nWritePrinter\n`],
  ["reads services", (s) => `${s}\nGet-Service Spooler\n`],
  ["controls services", (s) => `${s}\nRestart-Service Spooler\n`],
  ["reads process inventory", (s) => `${s}\nGet-Process\n`],
  ["reads CIM", (s) => `${s}\nGet-CimInstance Win32_PrintJob\n`],
  ["reads application files", (s) => `${s}\nGet-Content C:\\x\n`],
  ["writes files", (s) => `${s}\nOut-File evidence.json\n`],
  ["uses network", (s) => `${s}\nInvoke-RestMethod https://invalid.example\n`],
  ["uses remote execution", (s) => `${s}\nInvoke-Command -ComputerName x {}\n`],
  ["uses dynamic execution", (s) => `${s}\nInvoke-Expression x\n`],
  ["reads username environment", (s) => `${s}\n$env:USERNAME\n`],
  ["uses whoami", (s) => `${s}\nwhoami\n`],
  ["exports computer name", (s) => `${s}\nWrite-Output $env:COMPUTERNAME\n`],
  ["exports raw descriptor", (s) => `${s}\nWrite-Output $metadata.security_descriptor\n`],
  ["exports raw execution SID", (s) => `${s}\nWrite-Output $identity.User.Value\n`],
  ["exports raw group SIDs", (s) => `${s}\nWrite-Output $groupSids\n`],
  ["removes freshness hash", (s) => s.replace("freshness_challenge_sha256=Sha256-Text $Challenge", "freshness_challenge_sha256=$null")],
  ["claims different host match", (s) => s.replace("target_host_exact_match=$true", "target_host_exact_match=$false")],
  ["claims logical store identity", (s) => s.replace("target_logical_store_identity_proven=$false", "target_logical_store_identity_proven=$true")],
  ["removes connector requirement", (s) => s.replace("connector_device_binding_required=$true", "connector_device_binding_required=$false")],
  ["self-claims connector binding", (s) => s.replace("connector_device_binding_proven_by_script=$false", "connector_device_binding_proven_by_script=$true")],
  ["claims environment guard is security", (s) => s.replace("environment_guard_is_security_boundary=$false", "environment_guard_is_security_boundary=$true")],
  ["claims raw host export", (s) => s.replace("raw_host_name_exported=$false", "raw_host_name_exported=$true")],
  ["claims raw SID export", (s) => s.replace("raw_execution_sid_exported=$false", "raw_execution_sid_exported=$true")],
  ["claims raw groups export", (s) => s.replace("raw_group_sids_exported=$false", "raw_group_sids_exported=$true")],
  ["claims raw descriptor export", (s) => s.replace("raw_security_descriptor_exported=$false", "raw_security_descriptor_exported=$true")],
  ["claims records read", (s) => s.replace("event_records_read=$false", "event_records_read=$true")],
  ["claims event 307 read", (s) => s.replace("event_307_read=$false", "event_307_read=$true")],
  ["claims physical paper", (s) => s.replace("event_307_is_physical_paper_proof=$false", "event_307_is_physical_paper_proof=$true")],
  ["claims ACL semantics", (s) => s.replace("channel_read_acl_semantics_proven=$false", "channel_read_acl_semantics_proven=$true")],
  ["claims dedicated collector", (s) => s.replace("dedicated_collector_identity_proven=$false", "dedicated_collector_identity_proven=$true")],
  ["claims GP Teknisa exclusion", (s) => s.replace("gp_teknisa_identity_exclusion_proven=$false", "gp_teknisa_identity_exclusion_proven=$true")],
  ["claims load coexistence", (s) => s.replace("coexistence_under_operational_load_proven=$false", "coexistence_under_operational_load_proven=$true")],
  ["authorizes records", (s) => s.replace("authorizes_event_record_read=$false", "authorizes_event_record_read=$true")],
  ["authorizes print", (s) => s.replace("authorizes_print=$false", "authorizes_print=$true")],
  ["authorizes reprint", (s) => s.replace("authorizes_reprint=$false", "authorizes_reprint=$true")],
  ["allows retry", (s) => s.replace("automatic_retry_allowed=$false", "automatic_retry_allowed=$true")],
  ["hides observer process", (s) => s.replace("observer_process_execution=$true", "observer_process_execution=$false")],
  ["hides background job", (s) => s.replace("powershell_job_execution=$true", "powershell_job_execution=$false")],
  ["hides host identity read", (s) => s.replace("host_identity_metadata_read=$true", "host_identity_metadata_read=$false")],
  ["hides token read", (s) => s.replace("execution_token_metadata_read_attempted=$true", "execution_token_metadata_read_attempted=$false")],
  ["hides channel configuration read", (s) => s.replace("event_channel_configuration_read_attempted=$true", "event_channel_configuration_read_attempted=$false")],
  ["claims record-read effect", (s) => s.replace("event_record_read=$false", "event_record_read=$true")],
  ["claims event-log mutation", (s) => s.replace("event_log_change=$false", "event_log_change=$true")],
  ["claims spooler access", (s) => s.replace("spooler_api_access=$false", "spooler_api_access=$true")],
  ["claims printer config read", (s) => s.replace("printer_configuration_read=$false", "printer_configuration_read=$true")],
  ["claims print-job read", (s) => s.replace("print_job_read=$false", "print_job_read=$true")],
  ["claims print effect", (s) => s.replace(/^  print=\$false$/m, "  print=$true")],
  ["claims process inventory", (s) => s.replace("process_inventory_read=$false", "process_inventory_read=$true")],
  ["claims service read", (s) => s.replace("service_configuration_read=$false", "service_configuration_read=$true")],
  ["claims file read", (s) => s.replace("application_file_read=$false", "application_file_read=$true")],
  ["claims file write", (s) => s.replace("application_file_write=$false", "application_file_write=$true")],
  ["claims script network", (s) => s.replace("script_network_call=$false", "script_network_call=$true")],
  ["claims GP Teknisa access", (s) => s.replace("gp_teknisa_access=$false", "gp_teknisa_access=$true")],
  ["claims fiscal access", (s) => s.replace("fiscal_or_sefaz_access=$false", "fiscal_or_sefaz_access=$true")],
  ["claims sequence read", (s) => s.replace("sequence_read=$false", "sequence_read=$true")],
  ["claims sequence write", (s) => s.replace("sequence_write=$false", "sequence_write=$true")],
  ["promotes status", (s) => s.replace("HOLD_OPERATIONAL_METADATA_ONLY", "READY_FOR_EVENT_READ")],
  ["removes future event gate", (s) => s.replace("KEEP_EVENT_RECORD_READ_DISABLED_UNTIL_NEW_GATE", "READ_EVENTS_NOW")],
];

for (const [name, mutate] of mutations) {
  check(name, () => {
    const changed = mutate(source);
    assert.notEqual(changed, source, "mutation must change source");
    assert.equal(safe(changed), false);
  });
}

console.log(
  `PRINTSERVICE_METADATA_V886_STATIC=${checks}/${checks} EXACT_TARGET CHALLENGE_BOUND LISTLOG_ONLY EFFECT_HONEST HOLD NO_EVENTS NO_PRINT`,
);
