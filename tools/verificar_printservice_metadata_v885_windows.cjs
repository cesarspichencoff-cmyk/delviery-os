"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

if (
  process.platform !== "win32" ||
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.RUNNER_OS !== "Windows" ||
  process.env.RUNNER_ENVIRONMENT !== "github-hosted"
) {
  throw new Error("V885_GITHUB_HOSTED_WINDOWS_ONLY");
}

const child = spawnSync(
  "pwsh.exe",
  [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "tools/comandas_printservice_metadata_v885_ephemeral_windows.ps1",
  ],
  {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  },
);

assert.equal(
  child.status,
  0,
  child.stderr || child.stdout || String(child.error || "NO_POWERSHELL_OUTPUT"),
);
const raw = child.stdout.trim();
assert.ok(raw.length > 0 && raw.length < 12_000, "V885_OUTPUT_BOUND_INVALID");
assert.ok(!raw.includes(process.env.RUNNER_TEMP || "__NO_RUNNER_TEMP__"));
assert.ok(!raw.includes(process.env.COMPUTERNAME || "__NO_COMPUTER__"));
assert.ok(!raw.includes(process.env.USERNAME || "__NO_USER__"));
assert.doesNotMatch(raw, /S-1-(?:\d+-)+\d+/i);
assert.doesNotMatch(raw, /(?:^|[,{])\s*"?security_descriptor"?\s*:/i);

const output = JSON.parse(raw);
assert.deepEqual(Object.keys(output).sort(), [
  "actual_collector_service_sid_proven",
  "actual_effective_token_membership_proven",
  "actual_operational_channel_proven",
  "authorizes_live_read",
  "authorizes_print",
  "authorizes_reprint",
  "automatic_retry_allowed",
  "channel_enabled_observed",
  "channel_name",
  "channel_presence_observed",
  "channel_read_acl_semantics_proven",
  "channel_security_descriptor_sha256",
  "coexistence_under_operational_load_proven",
  "effects",
  "environment",
  "environment_guard_is_security_boundary",
  "event_307_is_physical_paper_proof",
  "event_307_read",
  "event_records_read",
  "gp_teknisa_exclusion_proven",
  "next_gate",
  "raw_security_descriptor_exported",
  "reasons",
  "schema",
  "status",
].sort());

assert.equal(
  output.schema,
  "deliveryos.printservice-metadata.v885.ephemeral-review-only",
);
assert.equal(output.status, "HOLD_EPHEMERAL_METADATA_ONLY");
assert.equal(output.environment, "GITHUB_HOSTED_WINDOWS_EPHEMERAL");
assert.equal(output.environment_guard_is_security_boundary, false);
assert.equal(
  output.channel_name,
  "Microsoft-Windows-PrintService/Operational",
);
assert.equal(typeof output.channel_presence_observed, "boolean");
assert.ok(
  output.channel_enabled_observed === null ||
    typeof output.channel_enabled_observed === "boolean",
);
assert.ok(
  output.channel_security_descriptor_sha256 === null ||
    /^[0-9a-f]{64}$/.test(output.channel_security_descriptor_sha256),
);
assert.ok(
  output.reasons.includes("EPHEMERAL_RUNNER_METADATA_IS_NOT_OPERATIONAL_PROOF"),
);

for (const field of [
  "raw_security_descriptor_exported",
  "event_records_read",
  "event_307_read",
  "event_307_is_physical_paper_proof",
  "channel_read_acl_semantics_proven",
  "actual_operational_channel_proven",
  "actual_collector_service_sid_proven",
  "actual_effective_token_membership_proven",
  "gp_teknisa_exclusion_proven",
  "coexistence_under_operational_load_proven",
  "authorizes_live_read",
  "authorizes_print",
  "authorizes_reprint",
  "automatic_retry_allowed",
]) {
  assert.equal(output[field], false, field);
}
assert.ok(Object.values(output.effects).every((value) => value === false));
assert.deepEqual(output.next_gate, [
  "PIN_EXACT_OPERATIONAL_HOST_AND_STORE",
  "PIN_EXACT_COLLECTOR_ACCOUNT_AND_SERVICE_SID",
  "OBTAIN_SEPARATE_AUTHORIZATION_FOR_OPERATIONAL_METADATA_READ",
  "PROVE_CHANNEL_ALREADY_ENABLED_WITHOUT_CHANGE",
  "PROVE_CHANNEL_ACL_READ_WITHOUT_WRITE_OR_CLEAR",
  "PROVE_TOKEN_EXCLUDES_GP_TEKNISA_ACTORS",
  "KEEP_EVENT_RECORD_READ_DISABLED_UNTIL_NEW_GATE",
]);

console.log(
  `PRINTSERVICE_METADATA_V885_WINDOWS=1/1 channel_present=${output.channel_presence_observed} channel_enabled=${output.channel_enabled_observed} LISTLOG_ONLY HOLD NO_EVENTS NO_EFFECTS`,
);
