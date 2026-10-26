"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "comandas_printservice_metadata_v885_ephemeral_windows.ps1"),
  "utf8",
);

function safe(script) {
  const required = [
    /\[CmdletBinding\(\)\]\s*param\(\)/,
    /V885_GITHUB_HOSTED_WINDOWS_REVIEW_ONLY/,
    /\$env:GITHUB_ACTIONS -cne 'true'/,
    /\$env:RUNNER_OS -cne 'Windows'/,
    /\$env:RUNNER_ENVIRONMENT -cne 'github-hosted'/,
    /\[string\]::IsNullOrWhiteSpace\(\$env:RUNNER_TEMP\)/,
    /\$channel='Microsoft-Windows-PrintService\/Operational'/,
    /\$jobTimeoutSeconds=10/,
    /Start-Job -ScriptBlock/,
    /Get-WinEvent -ListLog \$channel -ErrorAction Stop/,
    /Wait-Job -Job \$job -Timeout \$jobTimeoutSeconds/,
    /if\(\$job\.State -eq 'Completed'\)/,
    /elseif\(\$job\.State -in @\('Failed','Stopped','Disconnected'\)\)/,
    /Stop-Job -Job \$job -ErrorAction SilentlyContinue/,
    /Remove-Job -Job \$job -Force -ErrorAction SilentlyContinue/,
    /Security\.Cryptography\.SHA256/,
    /channel_security_descriptor_sha256=\$descriptorHash/,
    /raw_security_descriptor_exported=\$false/,
    /environment_guard_is_security_boundary=\$false/,
    /event_records_read=\$false/,
    /event_307_read=\$false/,
    /event_307_is_physical_paper_proof=\$false/,
    /channel_read_acl_semantics_proven=\$false/,
    /actual_operational_channel_proven=\$false/,
    /actual_collector_service_sid_proven=\$false/,
    /actual_effective_token_membership_proven=\$false/,
    /gp_teknisa_exclusion_proven=\$false/,
    /coexistence_under_operational_load_proven=\$false/,
    /authorizes_live_read=\$false/,
    /authorizes_print=\$false/,
    /authorizes_reprint=\$false/,
    /automatic_retry_allowed=\$false/,
    /event_record_read=\$false/,
    /event_log_change=\$false/,
    /spooler_read=\$false/,
    /spooler_write=\$false/,
    /^\s{2}print=\$false$/m,
    /^\s{2}reprint=\$false$/m,
    /service_change=\$false/,
    /filesystem_write=\$false/,
    /network=\$false/,
    /gp_teknisa_access=\$false/,
    /fiscal=\$false/,
    /sequence_write=\$false/,
    /install=\$false/,
    /deploy=\$false/,
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
    /Get-WinEvent\s+-(?:LogName|FilterHashtable|FilterXml|FilterXPath|Path)\b/i,
    /Get-WinEvent\s+-ListLog\s+['"]?\*/i,
    /Get-WinEvent[^\r\n]*-ComputerName\b/i,
    /\b(?:SaveChanges|Clear-EventLog|Limit-EventLog|New-EventLog|Remove-EventLog|Write-EventLog)\b/i,
    /\bwevtutil(?:\.exe)?\s+(?:sl|cl|im|um)\b/i,
    /\b(?:Get-PrintJob|Get-Printer|Get-PrinterPort|OpenPrinter|EnumJobs)\b/i,
    /\b(?:Set-Printer|Add-Printer|Remove-Printer|StartDocPrinter|WritePrinter)\b/i,
    /\b(?:Get-Service|Restart-Service|Start-Service|Stop-Service|Set-Service|New-Service)\b/i,
    /\bGet-CimInstance\b/i,
    /\b(?:Set-Content|Add-Content|Out-File|Export-Csv|New-Item|Remove-Item|Move-Item|Copy-Item)\b/i,
    /\b(?:Invoke-RestMethod|Invoke-WebRequest|Invoke-Command|Invoke-Expression|Start-Process)\b/i,
    /\b(?:SqlCommand|Invoke-Sqlcmd|sqlcmd(?:\.exe)?)\b/i,
    /\$env:(?:COMPUTERNAME|USERNAME|USERDOMAIN)\b/i,
    /\b(?:whoami|WindowsIdentity)\b/i,
    /Write-(?:Output|Host)[^\r\n]*security_descriptor/i,
    /security_descriptor_raw\s*=/i,
  ];
  return !banned.some((pattern) => pattern.test(script));
}

let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`PASS ${checks} ${name}`);
}

check("V8.85 reads channel metadata only on ephemeral hosted Windows", () => {
  assert.equal(safe(source), true);
});

const mutations = [
  ["accepts parameters", (s) => s.replace("param()", "param([string]$ComputerName)")],
  ["removes GitHub Actions guard", (s) => s.replace("$env:GITHUB_ACTIONS -cne 'true'", "$false")],
  ["removes Windows guard", (s) => s.replace("$env:RUNNER_OS -cne 'Windows'", "$false")],
  ["allows self-hosted runner", (s) => s.replace("$env:RUNNER_ENVIRONMENT -cne 'github-hosted'", "$false")],
  ["removes runner temp guard", (s) => s.replace("[string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)", "$false")],
  ["changes exact channel", (s) => s.replace("Microsoft-Windows-PrintService/Operational", "Application")],
  ["raises timeout", (s) => s.replace("$jobTimeoutSeconds=10", "$jobTimeoutSeconds=600")],
  ["removes bounded wait", (s) => s.replace("Wait-Job -Job $job -Timeout $jobTimeoutSeconds", "Wait-Job -Job $job")],
  ["collapses terminal failure into timeout", (s) => s.replace("elseif($job.State -in @('Failed','Stopped','Disconnected'))", "elseif($false)")],
  ["removes timeout stop", (s) => s.replace("Stop-Job -Job $job -ErrorAction SilentlyContinue", "$null=$job")],
  ["removes job cleanup", (s) => s.replace("Remove-Job -Job $job -Force -ErrorAction SilentlyContinue", "$null=$job")],
  ["reads event records by log name", (s) => `${s}\nGet-WinEvent -LogName Application\n`],
  ["reads event 307", (s) => `${s}\nGet-WinEvent -FilterHashtable @{LogName='x';Id=307}\n`],
  ["uses wildcard log inventory", (s) => s.replace("Get-WinEvent -ListLog $channel", "Get-WinEvent -ListLog *")],
  ["targets a remote computer", (s) => s.replace("Get-WinEvent -ListLog $channel", "Get-WinEvent -ListLog $channel -ComputerName x")],
  ["saves event-log changes", (s) => `${s}\n$log.SaveChanges()\n`],
  ["clears event log", (s) => `${s}\nClear-EventLog -LogName Application\n`],
  ["changes event log with wevtutil", (s) => `${s}\nwevtutil sl Application /e:true\n`],
  ["reads print jobs", (s) => `${s}\nGet-PrintJob -PrinterName x\n`],
  ["reads printer configuration", (s) => `${s}\nGet-Printer -Name x\n`],
  ["opens direct spooler handle", (s) => `${s}\nOpenPrinter\n`],
  ["writes printer bytes", (s) => `${s}\nWritePrinter\n`],
  ["reads a service", (s) => `${s}\nGet-Service Spooler\n`],
  ["controls a service", (s) => `${s}\nRestart-Service Spooler\n`],
  ["reads CIM", (s) => `${s}\nGet-CimInstance Win32_PrintJob\n`],
  ["writes a file", (s) => `${s}\nOut-File evidence.json\n`],
  ["uses network", (s) => `${s}\nInvoke-RestMethod https://invalid.example\n`],
  ["uses dynamic execution", (s) => `${s}\nInvoke-Expression x\n`],
  ["exports computer name", (s) => `${s}\nWrite-Output $env:COMPUTERNAME\n`],
  ["exports user name", (s) => `${s}\nWrite-Output $env:USERNAME\n`],
  ["exports raw security descriptor", (s) => `${s}\nWrite-Output $metadata.security_descriptor\n`],
  ["claims environment guard is security", (s) => s.replace("environment_guard_is_security_boundary=$false", "environment_guard_is_security_boundary=$true")],
  ["claims event records read", (s) => s.replace("event_records_read=$false", "event_records_read=$true")],
  ["claims event 307 read", (s) => s.replace("event_307_read=$false", "event_307_read=$true")],
  ["claims physical paper", (s) => s.replace("event_307_is_physical_paper_proof=$false", "event_307_is_physical_paper_proof=$true")],
  ["claims ACL semantics", (s) => s.replace("channel_read_acl_semantics_proven=$false", "channel_read_acl_semantics_proven=$true")],
  ["claims operational channel", (s) => s.replace("actual_operational_channel_proven=$false", "actual_operational_channel_proven=$true")],
  ["claims collector SID", (s) => s.replace("actual_collector_service_sid_proven=$false", "actual_collector_service_sid_proven=$true")],
  ["claims token membership", (s) => s.replace("actual_effective_token_membership_proven=$false", "actual_effective_token_membership_proven=$true")],
  ["claims GP/Teknisa exclusion", (s) => s.replace("gp_teknisa_exclusion_proven=$false", "gp_teknisa_exclusion_proven=$true")],
  ["claims load coexistence", (s) => s.replace("coexistence_under_operational_load_proven=$false", "coexistence_under_operational_load_proven=$true")],
  ["authorizes live read", (s) => s.replace("authorizes_live_read=$false", "authorizes_live_read=$true")],
  ["authorizes print", (s) => s.replace("authorizes_print=$false", "authorizes_print=$true")],
  ["authorizes reprint", (s) => s.replace("authorizes_reprint=$false", "authorizes_reprint=$true")],
  ["allows automatic retry", (s) => s.replace("automatic_retry_allowed=$false", "automatic_retry_allowed=$true")],
  ["claims event-record effect", (s) => s.replace("event_record_read=$false", "event_record_read=$true")],
  ["claims event-log mutation", (s) => s.replace("event_log_change=$false", "event_log_change=$true")],
  ["claims spooler read", (s) => s.replace("spooler_read=$false", "spooler_read=$true")],
  ["claims print effect", (s) => s.replace("print=$false", "print=$true")],
  ["claims GP/Teknisa access", (s) => s.replace("gp_teknisa_access=$false", "gp_teknisa_access=$true")],
  ["claims filesystem write", (s) => s.replace("filesystem_write=$false", "filesystem_write=$true")],
  ["claims network effect", (s) => s.replace("network=$false", "network=$true")],
  ["removes future event-read gate", (s) => s.replace("KEEP_EVENT_RECORD_READ_DISABLED_UNTIL_NEW_GATE", "READ_EVENTS_NOW")],
];

for (const [name, mutate] of mutations) {
  check(name, () => {
    const changed = mutate(source);
    assert.notEqual(changed, source, "mutation must change source");
    assert.equal(safe(changed), false);
  });
}

assert.equal(checks, 54, "V885_STATIC_CASE_COUNT_DRIFT");
console.log(
  `PRINTSERVICE_METADATA_V885_STATIC=${checks}/${checks} LISTLOG_ONLY BOUNDED EPHEMERAL NO_EVENTS NO_EFFECTS`,
);
