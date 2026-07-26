#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveProjectRelative, PROJECT_ROOT } = require('../../src/conversation-crm/config');
const { NativeConversationRuntime } = require('../../src/conversation-crm/native/runtime');
const { scanTree } = require('../../src/conversation-crm/native/privacy-scan');

function createProbe() {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-native-privacy-probe-'));
  const marker = `privacy-control-${process.pid}@example.test`;
  const runtime = new NativeConversationRuntime({ runtimeRoot });
  runtime.processMessage({
    synthetic: true,
    message_type: 'text',
    content: `Faltou a bebida ${marker}`,
    channel: 'synthetic',
    subject_id: 'SIM-SUBJECT-PRIVACY',
    conversation_id: 'SIM-CONV-PRIVACY',
    message_id: 'SIM-MSG-PRIVACY',
    correlation_id: 'SIM-CORR-PRIVACY',
    idempotency_key: 'privacy-probe-v1',
    occurred_at: runtime.clock.iso(),
    turn_order: 1,
    unit_id: 'SIM-UNIT-001',
    context: { synthetic: true }
  });
  return { runtimeRoot, markers: [marker] };
}

function run(argv = process.argv.slice(2)) {
  let target;
  let cleanup = false;
  if (argv[0]) {
    target = resolveProjectRelative(argv[0], { projectRoot: PROJECT_ROOT, label: 'privacy_scan_root' });
  } else {
    const probe = createProbe();
    target = { resolved: probe.runtimeRoot };
    target.markers = probe.markers;
    cleanup = true;
  }
  try {
    let positiveControlPassed = null;
    if (cleanup) {
      const controlFile = path.join(target.resolved, 'privacy-positive-control.txt');
      fs.writeFileSync(controlFile, target.markers[0], 'utf8');
      positiveControlPassed = scanTree(target.resolved, { markers: target.markers }).passed === false;
      fs.rmSync(controlFile, { force: true });
    }
    const result = scanTree(target.resolved, { markers: target.markers || [] });
    const output = { ...result, positive_control_detected: positiveControlPassed };
    process.stdout.write(`${JSON.stringify(output)}\n`);
    return result.passed && positiveControlPassed !== false ? 0 : 1;
  } finally {
    if (cleanup) fs.rmSync(target.resolved, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    process.exitCode = run();
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error_code: error.code || 'PRIVACY_SCAN_FAILED' })}\n`);
    process.exitCode = 1;
  }
}

module.exports = { createProbe, run };
