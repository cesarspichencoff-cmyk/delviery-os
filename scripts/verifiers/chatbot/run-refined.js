'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { NativeConversationRuntime } = require('../../../src/conversation-crm/native/runtime');
const { sha256, canonicalJson } = require('../../../src/conversation-crm/native/deterministic');

const projectRoot = path.resolve(__dirname, '..', '..', '..');
const reviewRoot = path.join(projectRoot, 'evals', 'human-review');
const resultsRoot = path.join(reviewRoot, 'results');
const corpusFile = path.join(reviewRoot, 'baseline-conversations-v1.json');
const newCasesFile = path.join(reviewRoot, 'refined-new-conversations-v2.json');
const previousFile = path.join(resultsRoot, 'humanized-responses-v1.json');
const outputFile = path.join(resultsRoot, 'refined-responses-v2.json');
const metricsFile = path.join(resultsRoot, 'refined-metrics-v2.json');
const comparisonFile = path.join(resultsRoot, 'human-feedback-before-after-v2.json');
const SEED = 'TATA-SERVICE-REFINEMENT-V2';

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
    idempotency_key: `refined-review:${item.case_id}:${serial}`,
    occurred_at: runtime.clock.iso(),
    turn_order: turnIndex + 1,
    unit_id: 'SIM-UNIT-001',
    context: { synthetic: true, ...item.initial_context, ...(turn.context || {}) }
  };
}

function publicPlan(plan, response) {
  const fields = [
    'version', 'customer_need', 'direct_answer', 'knowledge_candidates',
    'knowledge_selected', 'knowledge_sources_used', 'knowledge_rejected',
    'rejection_reason', 'action_playbook', 'action_available', 'action_selected',
    'action_mode', 'channel_guidance', 'explanation_needed', 'direction',
    'optional_enrichment', 'humanity_requirements', 'response_goal',
    'conversation_stage', 'customer_state', 'gravity', 'known_facts', 'new_facts',
    'verified_actions', 'pending_actions', 'mandatory_questions',
    'deferred_questions', 'optional_information', 'prohibited_claims', 'length',
    'emoji_policy', 'tone_profile'
  ];
  return Object.fromEntries(fields.map((field) => [field, plan?.[field] ?? null]).concat([
    ['strategy_id', response.strategy_id],
    ['fallback_reason', response.fallback_reason]
  ]));
}

function publicResult(output, turn) {
  return {
    input_fingerprint: sha256(turn.content),
    response_text: output.response.text,
    response_status: output.response.status_reflected,
    result_status: output.result.status,
    intent: output.classification.intent,
    subintent: output.classification.subintent,
    entities: output.classification.entities || {},
    fields_missing: output.classification.fields_missing,
    capability_id: output.classification.capability_id,
    authority: output.classification.authority,
    escalation: output.classification.escalation,
    handoff_status: output.handoff?.status || null,
    closure: output.closure,
    response_plan: publicPlan(output.response.plan, output.response),
    variation_key: output.response.variation_key,
    validation: output.response.validation,
    raw_message_persisted: output.raw_message_persisted,
    external_system_accessed: output.external_system_accessed,
    real_driver_used: output.real_driver_used
  };
}

function runCases(corpus) {
  const results = [];
  for (const item of corpus) {
    const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-hrev-refined-'));
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
  return results;
}

function allTurns(results) {
  return results.flatMap((item) => item.results.map((turn) => ({ case_id: item.case_id, category: item.category, ...turn })));
}

function buildMetrics(artifact) {
  const turns = allTurns([...artifact.results, ...artifact.new_results]);
  const passed = turns.filter((turn) => turn.validation?.passed).length;
  const gateRows = turns.map((turn) => turn.validation?.checks?.service_quality).filter(Boolean);
  const knowledgeUsed = turns.filter((turn) => (turn.response_plan?.knowledge_selected || []).length > 0).length;
  const fallbackRows = turns.filter((turn) => turn.response_plan?.fallback_reason);
  const directions = turns.filter((turn) => (turn.response_plan?.direction || []).length > 0).length;
  const sourceTraceability = turns.filter((turn) => (turn.response_plan?.knowledge_sources_used || []).length > 0).length;
  const metrics = {
    schema_version: 'deliveryos-conversation-refined-metrics-v2',
    synthetic: true,
    seed: SEED,
    cases: artifact.results.length + artifact.new_results.length,
    turns: turns.length,
    validation: { passed, failed: turns.length - passed },
    gates: {
      available_knowledge_unused: {
        passed: gateRows.filter((row) => row.gates?.available_knowledge_unused?.passed).length,
        failed: gateRows.filter((row) => row.gates?.available_knowledge_unused?.passed === false).length
      },
      humanized_but_unhelpful: {
        passed: gateRows.filter((row) => row.gates?.humanized_but_unhelpful?.passed).length,
        failed: gateRows.filter((row) => row.gates?.humanized_but_unhelpful?.passed === false).length
      }
    },
    knowledge: {
      selected_turns: knowledgeUsed,
      source_traceable_turns: sourceTraceability,
      legitimate_fallback_turns: fallbackRows.filter((turn) => (
        turn.validation?.checks?.service_quality?.gates?.available_knowledge_unused?.passed === true
      )).length,
      suspect_fallback_turns: fallbackRows.filter((turn) => (
        turn.validation?.checks?.service_quality?.gates?.available_knowledge_unused?.passed === false
      )).length
    },
    actionability: { turns_with_direction: directions },
    safety: {
      external_system_accessed: turns.some((turn) => turn.external_system_accessed),
      real_driver_used: turns.some((turn) => turn.real_driver_used),
      raw_message_persisted: turns.some((turn) => turn.raw_message_persisted)
    }
  };
  metrics.canonical_hash = sha256(canonicalJson(metrics));
  return metrics;
}

function buildBeforeAfter(previous, artifact) {
  const previousByCase = new Map(previous.results.map((item) => [item.case_id, item]));
  const rows = artifact.results.map((item) => {
    const before = previousByCase.get(item.case_id);
    if (!before || before.results.length !== item.results.length) throw new Error(`BEFORE_AFTER_ALIGNMENT_INVALID:${item.case_id}`);
    return {
      case_id: item.case_id,
      category: item.category,
      turns: item.results.map((turn, index) => ({
        turn: index + 1,
        input_fingerprint: turn.input_fingerprint,
        before_response: before.results[index].response_text,
        after_response: turn.response_text,
        changed: before.results[index].response_text !== turn.response_text,
        knowledge_selected: turn.response_plan.knowledge_selected,
        action_playbook: turn.response_plan.action_playbook,
        action_mode: turn.response_plan.action_mode,
        service_quality_passed: turn.validation?.checks?.service_quality?.passed === true
      }))
    };
  });
  const comparison = {
    schema_version: 'deliveryos-conversation-human-feedback-before-after-v2',
    synthetic: true,
    source_artifact_hash: previous.canonical_hash,
    refined_artifact_hash: artifact.canonical_hash,
    cases: rows.length,
    changed_turns: rows.flatMap((item) => item.turns).filter((turn) => turn.changed).length,
    rows
  };
  comparison.canonical_hash = sha256(canonicalJson(comparison));
  return comparison;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function run() {
  const corpus = JSON.parse(fs.readFileSync(corpusFile, 'utf8'));
  const newCases = JSON.parse(fs.readFileSync(newCasesFile, 'utf8'));
  const previous = JSON.parse(fs.readFileSync(previousFile, 'utf8'));
  if (corpus.length !== 50 || newCases.length !== 8) throw new Error('REFINED_CORPUS_SIZE_INVALID');
  const artifact = {
    schema_version: 'deliveryos-conversation-refined-responses-v2',
    synthetic: true,
    corpus_size: corpus.length,
    new_case_count: newCases.length,
    runtime: {
      name: 'NativeConversationRuntime public processMessage API',
      composer_version: 'response-plan-v2'
    },
    oracle_injected: false,
    scenario_id_injected: false,
    seed: SEED,
    results: runCases(corpus),
    new_results: runCases(newCases)
  };
  artifact.canonical_hash = sha256(canonicalJson(artifact));
  const metrics = buildMetrics(artifact);
  const comparison = buildBeforeAfter(previous, artifact);
  writeJson(outputFile, artifact);
  writeJson(metricsFile, metrics);
  writeJson(comparisonFile, comparison);
  process.stdout.write(`${JSON.stringify({
    cases: artifact.corpus_size,
    new_cases: artifact.new_case_count,
    turns: allTurns([...artifact.results, ...artifact.new_results]).length,
    hash: artifact.canonical_hash,
    validation: metrics.validation,
    gates: metrics.gates
  })}\n`);
}

try {
  run();
} catch (error) {
  process.stderr.write(`${error.code || error.message || 'REFINED_RUN_FAILED'}\n`);
  process.exitCode = 1;
}
