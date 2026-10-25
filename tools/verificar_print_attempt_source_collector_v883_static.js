"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "comandas_print_attempt_source_collector_v883_review_only.ps1"),
  "utf8",
);

function safe(script) {
  const required = [
    /V883_GITHUB_HOSTED_WINDOWS_FIXTURE_ONLY/,
    /\$env:GITHUB_ACTIONS -cne 'true'/,
    /\[string\]::IsNullOrWhiteSpace\(\$env:RUNNER_TEMP\)/,
    /\[IO\.Path\]::GetFullPath\(\$env:RUNNER_TEMP\)/,
    /StartsWith\(\$base,\[StringComparison\]::OrdinalIgnoreCase\)/,
    /V883_FIXTURE_OUTSIDE_RUNNER_TEMP/,
    /\$file\.Length -gt 65536/,
    /\[IO\.File\]::ReadAllText/,
    /deliveryos\.print-attempt-collector-fixture\.v883/,
    /deliveryos\.print-attempt-source-collector\.v883\.review-only/,
    /CANDIDATE_REQUIRES_EXTERNAL_V882_SIGNATURE_AND_TRUST/,
    /function Integer-Primitive/,
    /source_read_succeeded -isnot \[bool\]/,
    /work_offline -isnot \[bool\]/,
    /V883_CONTEXT_STRING_TYPE_INVALID/,
    /\$source\.jobs -isnot \[array\]/,
    /Collections\.Generic\.HashSet\[int64\]/,
    /\$seenJobIds\.Add\(\$jobId\)/,
    /\[pscustomobject\]\[ordered\]@\{job_id=/,
    /UNRECOGNIZED_PRINTER_STATUS/,
    /UNRECOGNIZED_DETECTED_ERROR_STATE/,
    /source_channel='WINDOWS_SPOOLER_READONLY'/,
    /source_read_succeeded=\$readSucceeded/,
    /source_snapshot_sha256=\$snapshotHash/,
    /submission_rejected_before_job_creation=\$false/,
    /live_host_read_performed=\$false/,
    /fixture_only=\$true/,
    /signature_created=\$false/,
    /github_runner_identity_proven=\$false/,
    /collector_identity_effective_proven=\$false/,
    /collector_distinct_from_submitter_proven=\$false/,
    /independent_failure_domain_proven=\$false/,
    /physical_print_proven=\$false/,
    /proven_no_effect=\$false/,
    /fiscal_dispatch_ready=\$false/,
    /automatic_retry_allowed=\$false/,
    /authorize_print=\$false/,
    /authorize_reprint=\$false/,
    /document_titles_exported=\$false/,
    /account_names_exported=\$false/,
    /queue_names_exported=\$false/,
    /fixture_path_exported=\$false/,
    /print=\$false;reprint=\$false;spooler_write=\$false/,
    /service_change=\$false;file_write=\$false;network=\$false/,
    /ConvertTo-Json -Depth 10 -Compress/,
  ];
  if (required.some((pattern) => !pattern.test(script))) return false;
  const banned = [
    /\b(?:Get-PrintJob|Get-Printer|Get-PrinterPort|Get-WinEvent|Get-Service)\b/i,
    /\bGet-CimInstance\b/i,
    /\b(?:OpenPrinter|StartDocPrinter|WritePrinter|AddJob|ScheduleJob)\b/i,
    /\b(?:Set-Printer|Add-Printer|Remove-Printer|Set-PrinterPort|Add-PrinterPort)\b/i,
    /\b(?:Restart-Service|Start-Service|Stop-Service|Set-Service)\b/i,
    /\b(?:Set-Content|Add-Content|Out-File|Export-Csv|New-Item|Remove-Item|Move-Item|Copy-Item)\b/i,
    /\b(?:Invoke-RestMethod|Invoke-WebRequest|Invoke-Expression|Invoke-Command|Start-Process|Stop-Process)\b/i,
    /\b(?:SqlCommand|Invoke-Sqlcmd|sqlcmd(?:\.exe)?)\b/i,
    /\b(?:Get-Credential|ConvertTo-SecureString|Export-Clixml|Start-Transcript)\b/i,
    /\b(?:CreatePrivateKey|Import-PfxCertificate|SignData|RSACryptoServiceProvider)\b/i,
    /\b(?:Register-ScheduledTask|New-Service|sc\.exe|net\.exe)\b/i,
    /\.(?:DocumentPrinted\.)?Param[12345678]\b/,
  ];
  return !banned.some((pattern) => pattern.test(script));
}

let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`PASS ${checks} ${name}`);
}

check("V8.83 is fixture-only, bounded, unsigned and without host effects", () => {
  assert.equal(safe(source), true);
});

const mutations = [
  ["removes GitHub Actions guard", (s) => s.replace("$env:GITHUB_ACTIONS -cne 'true'", "$false")],
  ["removes RUNNER_TEMP scope", (s) => s.replaceAll("$env:RUNNER_TEMP", "$env:TEMP")],
  ["removes path containment", (s) => s.replace("StartsWith($base,[StringComparison]::OrdinalIgnoreCase)", "StartsWith($fixture,[StringComparison]::OrdinalIgnoreCase)")],
  ["raises fixture size without bound", (s) => s.replace("$file.Length -gt 65536", "$file.Length -gt 999999999")],
  ["adds live print-job read", (s) => `${s}\nGet-PrintJob -PrinterName x\n`],
  ["adds live printer read", (s) => `${s}\nGet-Printer -Name x\n`],
  ["adds live event read", (s) => `${s}\nGet-WinEvent -LogName x\n`],
  ["adds live CIM read", (s) => `${s}\nGet-CimInstance Win32_PrintJob\n`],
  ["adds raw printer transport", (s) => `${s}\nStartDocPrinter\n`],
  ["adds printer mutation", (s) => `${s}\nSet-Printer -Name x\n`],
  ["adds service restart", (s) => `${s}\nRestart-Service Spooler\n`],
  ["adds file output", (s) => `${s}\nOut-File evidence.json\n`],
  ["adds network call", (s) => `${s}\nInvoke-RestMethod -Uri https://invalid.example\n`],
  ["adds dynamic execution", (s) => `${s}\nInvoke-Expression x\n`],
  ["adds SQL", (s) => `${s}\nInvoke-Sqlcmd -Query 'SELECT 1'\n`],
  ["adds private-key signing", (s) => `${s}\nSignData($raw)\n`],
  ["reads document title", (s) => `${s}\n$x=$xml.Event.UserData.DocumentPrinted.Param2\n`],
  ["removes strict integer validation", (s) => s.replace("function Integer-Primitive", "function Coercive-Integer")],
  ["coerces source boolean", (s) => s.replace("$source.source_read_succeeded -isnot [bool]", "$false")],
  ["ignores unknown printer status", (s) => s.replaceAll("UNRECOGNIZED_PRINTER_STATUS", "PRINTING")],
  ["ignores unknown detected error", (s) => s.replaceAll("UNRECOGNIZED_DETECTED_ERROR_STATE", "PRINTING")],
  ["claims live host read", (s) => s.replace("live_host_read_performed=$false", "live_host_read_performed=$true")],
  ["claims non-fixture execution", (s) => s.replace("fixture_only=$true", "fixture_only=$false")],
  ["claims signature", (s) => s.replace("signature_created=$false", "signature_created=$true")],
  ["claims runner identity", (s) => s.replace("github_runner_identity_proven=$false", "github_runner_identity_proven=$true")],
  ["claims collector identity", (s) => s.replace("collector_identity_effective_proven=$false", "collector_identity_effective_proven=$true")],
  ["claims actor separation", (s) => s.replace("collector_distinct_from_submitter_proven=$false", "collector_distinct_from_submitter_proven=$true")],
  ["claims failure-domain separation", (s) => s.replace("independent_failure_domain_proven=$false", "independent_failure_domain_proven=$true")],
  ["claims physical paper", (s) => s.replace("physical_print_proven=$false", "physical_print_proven=$true")],
  ["claims no effect", (s) => s.replace("proven_no_effect=$false", "proven_no_effect=$true")],
  ["allows automatic retry", (s) => s.replace("automatic_retry_allowed=$false", "automatic_retry_allowed=$true")],
  ["authorizes print", (s) => s.replace("authorize_print=$false", "authorize_print=$true")],
  ["authorizes reprint", (s) => s.replace("authorize_reprint=$false", "authorize_reprint=$true")],
  ["claims submitter rejection", (s) => s.replace("submission_rejected_before_job_creation=$false", "submission_rejected_before_job_creation=$true")],
  ["exports document titles", (s) => s.replace("document_titles_exported=$false", "document_titles_exported=$true")],
  ["exports account names", (s) => s.replace("account_names_exported=$false", "account_names_exported=$true")],
  ["exports queue names", (s) => s.replace("queue_names_exported=$false", "queue_names_exported=$true")],
  ["enables spooler write", (s) => s.replace("spooler_write=$false", "spooler_write=$true")],
  ["enables network effect", (s) => s.replace("network=$false", "network=$true")],
];

for (const [name, mutate] of mutations) {
  check(name, () => {
    const changed = mutate(source);
    assert.notEqual(changed, source, "mutation must change source");
    assert.equal(safe(changed), false);
  });
}

console.log(
  `PRINT_ATTEMPT_SOURCE_COLLECTOR_V883_STATIC=${checks}/${checks} FIXTURE_ONLY NO_LIVE_SPOOLER NO_SIGNATURE NO_EFFECTS`,
);
