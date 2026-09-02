'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { NativeConversationRuntime } = require('./runtime');
const { loadCanonicalCatalogs } = require('./catalogs/oracle');
const { nativeError } = require('./errors');
const { sha256, canonicalJson } = require('./deterministic');

const EXECUTION_FIXTURES = Object.freeze({
  'TATA-SC-187': Object.freeze({ simulation_status: 'processing' })
});

function canonicalScenario(scenarioId) {
  const scenario = loadCanonicalCatalogs().scenarios.scenarios.find((item) => item.scenario_id === scenarioId);
  if (!scenario) throw nativeError('SCENARIO_NOT_FOUND');
  return scenario;
}

function scenarioInputFor(scenarioId, clock) {
  const scenario = canonicalScenario(scenarioId);
  return Object.freeze({
    synthetic: true,
    message_type: 'text',
    content: scenario.input,
    channel: 'synthetic',
    subject_id: `SIM-SUBJECT-${scenarioId.slice(-3)}`,
    conversation_id: `SIM-CONV-${scenarioId}`,
    message_id: `SIM-MSG-${scenarioId}`,
    correlation_id: `SIM-CORR-${scenarioId}`,
    idempotency_key: `scenario:${scenarioId}`,
    occurred_at: clock.iso(),
    turn_order: 1,
    unit_id: 'SIM-UNIT-001',
    report_scenario_id: scenarioId,
    context: Object.freeze({ synthetic: true, ...(EXECUTION_FIXTURES[scenarioId] || {}) })
  });
}

function runScenarioOnRuntime(runtime, scenarioId, options = {}) {
  return runtime.processMessage(scenarioInputFor(scenarioId, runtime.clock), { ...options, scenario_id: scenarioId });
}

function runScenarioIsolated(scenarioId, options = {}) {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-native-scenario-'));
  try {
    const runtime = new NativeConversationRuntime({ ...options, runtimeRoot });
    const canonical = canonicalScenario(scenarioId);
    const result = runScenarioOnRuntime(runtime, scenarioId);
    const snapshot = runtime.snapshot();
    const action = result.execution_action || result.classification.action;
    const passed = result.classification.intent === canonical.intent
      && result.classification.capability_id === canonical.capability_required
      && result.result.status === canonical.expected_result.status
      && result.classification.authority === canonical.authority
      && action === canonical.action
      && result.closure.expected_state === canonical.closure.expected_state;
    const report = {
      scenario_id: scenarioId,
      seed: runtime.seed,
      clock: runtime.clock.iso(),
      intent: result.classification.intent,
      capability: result.classification.capability_id,
      driver: result.route.driver_id,
      result: result.result.status,
      expected_result: canonical.expected_result.status,
      authority: result.classification.authority,
      action,
      crm_state: runtime.crm.projectCase(result.case_id).state,
      handoff: result.handoff?.status || null,
      closure: result.closure.expected_state,
      passed,
      external_system_accessed: false,
      real_driver_used: false,
      raw_message_persisted: false,
      snapshot_hash: snapshot.snapshot_hash,
      synthetic: true
    };
    return Object.freeze({ ...report, report_hash: sha256(canonicalJson(report)) });
  } finally {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
}

function runAllCanonicalScenarios(options = {}) {
  const ids = loadCanonicalCatalogs().scenarios.scenarios.map((item) => item.scenario_id);
  const reports = ids.map((id) => runScenarioIsolated(id, options));
  const failed = reports.filter((item) => !item.passed).length;
  const summary = {
    schema_version: 'conversation-native-scenario-run-v1',
    synthetic: true,
    seed: 'TATA-SIM-V1',
    total: reports.length,
    passed: reports.length - failed,
    failed,
    intents: new Set(reports.map((item) => item.intent)).size,
    capabilities: new Set(reports.map((item) => item.capability)).size,
    real_driver_used: reports.some((item) => item.real_driver_used),
    external_system_accessed: reports.some((item) => item.external_system_accessed),
    report_hash: sha256(canonicalJson(reports))
  };
  return Object.freeze({ summary, reports: Object.freeze(reports) });
}

module.exports = {
  EXECUTION_FIXTURES,
  canonicalScenario,
  scenarioInputFor,
  runScenarioOnRuntime,
  runScenarioIsolated,
  runAllCanonicalScenarios
};

