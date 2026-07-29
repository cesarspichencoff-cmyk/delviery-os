'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { NativeConversationRuntime } = require('../../../src/conversation-crm/native/runtime');
const { sha256, canonicalJson } = require('../../../src/conversation-crm/native/deterministic');

const projectRoot = path.resolve(__dirname, '..', '..', '..');
const corpusFile = path.join(projectRoot, 'evals', 'human-review', 'baseline-conversations-v1.json');
const outputFile = process.env.DELIVERYOS_HUMANIZED_OUTPUT_FILE
  ? path.resolve(process.env.DELIVERYOS_HUMANIZED_OUTPUT_FILE)
  : path.join(projectRoot, 'evals', 'human-review', 'results', 'humanized-responses-v1.json');

function inputFor(runtime, item, turn, turnIndex) {
  const serial = String(turnIndex + 1).padStart(2, '0');
  return {
    synthetic: true,
    message_type: 'text',
    content: turn.content,
    channel: 'synthetic',
    subject_id: `SIM-SUBJECT-${item.case_id}`,
    conversation_id: `SIM-CONV-${item.case_id}`,
    message_id: `SIM-MSG-${item.case_id}-${serial}`,
    correlation_id: `SIM-CORR-${item.case_id}-${serial}`,
    idempotency_key: `human-review:${item.case_id}:${serial}`,
    occurred_at: runtime.clock.iso(),
    turn_order: turnIndex + 1,
    unit_id: 'SIM-UNIT-001',
    context: { synthetic: true, ...item.initial_context, ...(turn.context || {}) }
  };
}

function publicResult(output, turn) {
  const plan = output.response.plan;
  return {
    input_fingerprint: sha256(turn.content),
    response_text: output.response.text,
    response_status: output.response.status_reflected,
    result_status: output.result.status,
    intent: output.classification.intent,
    subintent: output.classification.subintent,
    fields_missing: output.classification.fields_missing,
    capability_id: output.classification.capability_id,
    authority: output.classification.authority,
    escalation: output.classification.escalation,
    handoff_status: output.handoff?.status || null,
    closure: output.closure,
    response_plan: {
      version: plan?.version || null,
      strategy_id: output.response.strategy_id,
      fallback_reason: output.response.fallback_reason,
      conversation_stage: plan?.conversation_stage || null,
      customer_state: plan?.customer_state || null,
      gravity: plan?.gravity || null,
      known_facts: plan?.known_facts || [],
      new_facts: plan?.new_facts || [],
      verified_actions: plan?.verified_actions || [],
      pending_actions: plan?.pending_actions || [],
      mandatory_questions: plan?.mandatory_questions || [],
      prohibited_claims: plan?.prohibited_claims || [],
      emoji_policy: plan?.emoji_policy || null
    },
    variation_key: output.response.variation_key,
    validation: output.response.validation,
    raw_message_persisted: output.raw_message_persisted,
    external_system_accessed: output.external_system_accessed,
    real_driver_used: output.real_driver_used,
    human_review: { rating: null, tags: [], comment: null }
  };
}

function run() {
  const corpus = JSON.parse(fs.readFileSync(corpusFile, 'utf8'));
  if (corpus.length !== 50) throw new Error(`CORPUS_SIZE_INVALID:${corpus.length}`);
  const results = [];
  for (const item of corpus) {
    const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-hrev-humanized-'));
    try {
      const runtime = new NativeConversationRuntime({ projectRoot, runtimeRoot });
      const turns = [];
      for (const [turnIndex, turn] of item.turns.entries()) {
        if (turnIndex > 0) runtime.clock.advance(1000);
        turns.push(publicResult(runtime.processMessage(inputFor(runtime, item, turn, turnIndex)), turn));
      }
      results.push({
        case_id: item.case_id,
        category: item.category,
        synthetic: true,
        expected_contract: item.expected_contract,
        results: turns
      });
    } finally {
      fs.rmSync(runtimeRoot, { recursive: true, force: true });
    }
  }
  const artifact = {
    schema_version: 'deliveryos-conversation-humanized-responses-v1',
    synthetic: true,
    corpus_size: results.length,
    runtime: 'NativeConversationRuntime public processMessage API',
    oracle_injected: false,
    scenario_id_injected: false,
    seed: 'TATA-SIM-V1',
    results
  };
  artifact.canonical_hash = sha256(canonicalJson(artifact));
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ cases: results.length, turns: results.reduce((total, item) => total + item.results.length, 0), hash: artifact.canonical_hash, output: path.relative(projectRoot, outputFile) })}\n`);
}

try {
  run();
} catch (error) {
  process.stderr.write(`${error.code || error.message || 'HUMANIZED_RUN_FAILED'}\n`);
  process.exitCode = 1;
}
