"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// This is an intentionally isolated, disposable LAB DERIVATIVE of the host code.
// It refuses every execution without a sentinel inside a dedicated sandbox.
const labRoot=process.env.DELIVERYOS_PROJECTOR_LAB_ROOT || "";
const marker="DELIVERYOS_PROJECTOR_LAB_ONLY_V1";
const host=require("node:os").hostname().toUpperCase();
if(host==="CAIXA_MOOCA" || !path.isAbsolute(labRoot) ||
   path.basename(labRoot)!=="deliveryos-projector-lab" ||
   !fs.existsSync(path.join(labRoot,"LAB_ONLY.txt")) ||
   fs.readFileSync(path.join(labRoot,"LAB_ONLY.txt"),"utf8").trim()!==marker ||
   fs.realpathSync(labRoot)!==path.resolve(labRoot))
  throw new Error("LAB_ONLY_OR_INVALID_SANDBOX");
const installRoot = path.resolve(labRoot);
const eventDir = path.join(installRoot, "state", "reader-events-v1");
const decisionDir = path.join(installRoot, "state", "reader-shadow-decisions-v1");
const reportingDir = path.join(installRoot, "state", "reader-report-source-envelopes-v1");
const shadowDir = path.join(installRoot, "shadow");
const consumer = path.join(shadowDir, "live_shadow_consumer_v1.cjs");
const projector = path.join(shadowDir, "continuous_reporting_projector_v1.cjs");
const { buildReportSourceEnvelope } = require(path.join(shadowDir, "report_source_envelope_v1.cjs"));
const statusPath = path.join(installRoot, "evidence", "shadow-consumer-status.json");
const pollMs = Math.max(500, Number(process.env.TATA_SHADOW_POLL_MS || 2000));

let stopped = false;
let processed = 0;
let readyCount = 0;
let blockedCount = 0;
let reportingEnvelopeCount = 0;
let projectionRuns = 0;
let lastEvent = null;
let lastDecision = null;
let lastReportingEnvelope = null;
let lastProjectionStatus = null;
let lastProjectionError = null;
let lastError = null;
let projectionBootstrapped = false;
let retryLockedAt = 0;
const retryLockedMs=1100; // LAB fixture ONLY; production retry policy NOT authorized.
const reproduceHostBaseline=process.env.DELIVERYOS_LAB_REPRODUCE_BASELINE==="1";

function sleep(ms) {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

function writeAtomicJson(p, value) {
  const tmp = p + ".tmp." + process.pid + "." + Date.now();
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  let last;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      fs.renameSync(tmp, p);
      return;
    } catch (err) {
      last = err;
      if (!["EPERM", "EBUSY", "EACCES", "EEXIST"].includes(err && err.code)) break;
      sleep(25 * (attempt + 1));
    }
  }
  try {
    fs.copyFileSync(tmp, p);
    fs.rmSync(tmp, { force: true });
  } catch (fallbackError) {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    throw fallbackError || last;
  }
}

function status(state) {
  try {
    writeAtomicJson(statusPath, {
      schema: "deliveryos.live-shadow-consumer-status.v2",
      state,
      updated_at: new Date().toISOString(),
      pid: process.pid,
      processed,
      ready_count: readyCount,
      blocked_count: blockedCount,
      reporting_envelopes_written: reportingEnvelopeCount,
      projection_runs: projectionRuns,
      last_event: lastEvent,
      last_decision: lastDecision,
      last_reporting_envelope: lastReportingEnvelope,
      last_projection_status: lastProjectionStatus,
      last_projection_error: lastProjectionError,
      last_error: lastError,
      effects: {
        database_read: false,
        database_write: false,
        sequence_binding_write: false,
        local_reporting_projection_write: true,
        print: false,
        spooler_write: false,
        odhen_write: false,
        fiscal_action: false,
        sefaz_call: false
      }
    });
  } catch (err) {
    lastError = "STATUS_WRITE_NONFATAL:" + String(err && err.message || err);
  }
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

function runProjector() {
  // Conservative LAB guard: the installed projector can remove age>120s locks
  // without proving ownership. Never launch it while a lock may be present.
  const lock=path.join(installRoot,"state","reporting-v1","projector.lock");
  try {
    if (fs.existsSync(lock)) {
      const st=fs.statSync(lock);
      const age=Date.now()-st.mtimeMs;
      lastProjectionStatus=(!st.isFile()||!Number.isFinite(age)||age<0||age>=90000)
        ? "HOLD_STALE_LOCK_UNVERIFIED" : "SKIPPED_LOCKED";
      lastProjectionError=null;
      return;
    }
  } catch {
    lastProjectionStatus="HOLD_LOCK_INSPECTION_FAILED";
    lastProjectionError=null;
    return;
  }
  projectionRuns += 1;
  if (!fs.existsSync(projector)) {
    lastProjectionStatus = "MISSING";
    lastProjectionError = "REPORTING_PROJECTOR_MISSING";
    return;
  }

  const child = spawnSync(process.execPath, [projector], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 60000
  });

  if (child.error) {
    lastProjectionStatus = "FAILED";
    lastProjectionError = "PROJECTOR_PROCESS_ERROR:" + child.error.message;
    return;
  }
  if (child.status !== 0) {
    lastProjectionStatus = "FAILED";
    lastProjectionError =
      "PROJECTOR_EXIT:" + String(child.status) + ":" + String(child.stderr || "").slice(0, 500);
    return;
  }

  // The actual installed projector emits exactly CURRENT, PROJECTED or
  // SKIPPED_LOCKED. A corrupt/unknown stdout must NEVER turn into false OK.
  try {
    const out=JSON.parse(String(child.stdout || ""));
    if(!out || typeof out!=="object" || Array.isArray(out) ||
       !["CURRENT","PROJECTED","SKIPPED_LOCKED"].includes(out.status)) {
      lastProjectionStatus="HOLD_PROJECTOR_RESULT_UNRECOGNIZED";
      lastProjectionError="PROJECTOR_RESULT_NOT_ATTESTED";
      return;
    }
    lastProjectionStatus=out.status;
    lastProjectionError=null;
  } catch {
    lastProjectionStatus="HOLD_PROJECTOR_OUTPUT_INVALID";
    lastProjectionError="PROJECTOR_STDOUT_INVALID_JSON";
  }
}

function runOnce() {
  fs.mkdirSync(eventDir, {recursive:true});
  fs.mkdirSync(decisionDir, {recursive:true});
  fs.mkdirSync(reportingDir, {recursive:true});
  const files = fs.readdirSync(eventDir)
    .filter(f => f.toLowerCase().endsWith(".json"))
    .sort();

  let envelopeChanged = false;

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

    if (ensureReportingEnvelope(file, eventPath, outPath)) {
      envelopeChanged = true;
    }
    lastError = null;
  }

  // Host baseline bug: SKIPPED_LOCKED sets bootstrapped and never retries
  // without a NEW envelope. This LAB variant permits a bounded retry.
  if (envelopeChanged || !projectionBootstrapped ||
      (!reproduceHostBaseline && lastProjectionStatus==="SKIPPED_LOCKED" && Date.now()>=retryLockedAt)) {
    runProjector();
    projectionBootstrapped = true;
    retryLockedAt = lastProjectionStatus==="SKIPPED_LOCKED" ? Date.now()+retryLockedMs : 0;
  }

  status("RUNNING");
}

function stop() {
  stopped = true;
  status("STOPPING");
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

fs.mkdirSync(path.dirname(statusPath), {recursive:true});
status("RUNNING");

// Hard limit: this derivative cannot run as an unlimited service.
const maxCycles=Number(process.env.DELIVERYOS_PROJECTOR_LAB_CYCLES || 0);
if (!Number.isInteger(maxCycles)||maxCycles<1||maxCycles>10)
  throw new Error("LAB_CYCLE_BOUND_REQUIRED");
(async function main(){
  for(let cycle=0;cycle<maxCycles&&!stopped;cycle++){
    runOnce();
    if(cycle+1<maxCycles)await new Promise(resolve=>setTimeout(resolve,pollMs));
  }
  status("STOPPED");
})().catch(err => {
  lastError = String(err && err.stack || err);
  try { status("FAILED"); } catch {}
  process.exit(2);
});
