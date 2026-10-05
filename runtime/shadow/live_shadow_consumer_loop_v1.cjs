"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const installRoot = "C:\\ProgramData\\TataComandaReader";
const eventDir = path.join(installRoot, "state", "reader-events-v1");
const decisionDir = path.join(installRoot, "state", "reader-shadow-decisions-v1");
const reportingDir = path.join(installRoot, "state", "reader-report-source-envelopes-v1");
const shadowDir = path.join(installRoot, "shadow");
const consumer = path.join(shadowDir, "live_shadow_consumer_v1.cjs");
const { buildReportSourceEnvelope } = require(path.join(shadowDir, "report_source_envelope_v1.cjs"));
const statusPath = path.join(installRoot, "evidence", "shadow-consumer-status.json");
const pollMs = Math.max(500, Number(process.env.TATA_SHADOW_POLL_MS || 2000));

let stopped = false;
let processed = 0;
let readyCount = 0;
let blockedCount = 0;
let reportingEnvelopeCount = 0;
let lastEvent = null;
let lastDecision = null;
let lastReportingEnvelope = null;
let lastError = null;

function writeAtomicJson(p, value) {
  const tmp = p + ".tmp." + process.pid + "." + Date.now();
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, p);
}
function status(state) {
  writeAtomicJson(statusPath, {
    schema: "deliveryos.live-shadow-consumer-status.v1",
    state,
    updated_at: new Date().toISOString(),
    pid: process.pid,
    processed,
    ready_count: readyCount,
    blocked_count: blockedCount,
    reporting_envelopes_written: reportingEnvelopeCount,
    last_event: lastEvent,
    last_decision: lastDecision,
    last_reporting_envelope: lastReportingEnvelope,
    last_error: lastError,
    effects: {
      database_read: false,
      database_write: false,
      sequence_binding_write: false,
      print: false,
      spooler_write: false,
      odhen_write: false,
      fiscal_action: false,
      sefaz_call: false
    }
  });
}

function decisionPathFor(file) {
  return path.join(decisionDir, file.replace(/\.json$/i, ".decision.json"));
}
function reportingEnvelopePathFor(file) {
  return path.join(reportingDir, file.replace(/\.json$/i, ".report-source.json"));
}
function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
}
function ensureReportingEnvelope(file, eventPath, decisionPath) {
  const envelopePath = reportingEnvelopePathFor(file);
  if (fs.existsSync(envelopePath)) return false;
  const event = readJson(eventPath);
  const decision = readJson(decisionPath);
  const envelope = buildReportSourceEnvelope(event, decision);
  writeAtomicJson(envelopePath, envelope);
  reportingEnvelopeCount += 1;
  lastReportingEnvelope = path.basename(envelopePath);
  return true;
}

function runOnce() {
  fs.mkdirSync(eventDir, {recursive:true});
  fs.mkdirSync(decisionDir, {recursive:true});
  fs.mkdirSync(reportingDir, {recursive:true});
  const files = fs.readdirSync(eventDir)
    .filter(f => f.toLowerCase().endsWith(".json"))
    .sort();

  for (const file of files) {
    const eventPath = path.join(eventDir, file);
    const outPath = decisionPathFor(file);
    lastEvent = file;

    if (!fs.existsSync(outPath)) {
      const child = spawnSync(process.execPath, [consumer, eventPath, outPath], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 15000
      });

      if (child.error) {
        lastError = "CONSUMER_PROCESS_ERROR:" + child.error.message;
        status("FAILED");
        throw child.error;
      }
      if (child.status !== 0 && child.status !== 5) {
        lastError = "CONSUMER_UNEXPECTED_EXIT:" + String(child.status) + ":" + String(child.stderr || "").slice(0,500);
        status("FAILED");
        throw new Error(lastError);
      }
      if (!fs.existsSync(outPath)) {
        lastError = "DECISION_FILE_MISSING:" + file;
        status("FAILED");
        throw new Error(lastError);
      }

      const decision = readJson(outPath);
      processed += 1;
      if (decision.ready) readyCount += 1;
      else blockedCount += 1;
      lastDecision = path.basename(outPath);
    }

    ensureReportingEnvelope(file, eventPath, outPath);
    lastError = null;
    status("RUNNING");
  }
}

function stop() {
  stopped = true;
  status("STOPPING");
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

fs.mkdirSync(path.dirname(statusPath), {recursive:true});
status("RUNNING");

(async function main(){
  while (!stopped) {
    runOnce();
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
  status("STOPPED");
})().catch(err => {
  lastError = String(err && err.stack || err);
  try { status("FAILED"); } catch {}
  process.exit(2);
});
