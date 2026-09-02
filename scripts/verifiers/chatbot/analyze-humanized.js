'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { sha256, canonicalJson } = require('../../../src/conversation-crm/native/deterministic');
const { normalize, questions, verifyConversation, summarize, BUREAUCRATIC } = require('./checks');

const projectRoot = path.resolve(__dirname, '..', '..', '..');
const resultsRoot = path.join(projectRoot, 'evals', 'human-review', 'results');
const baselineFile = path.join(resultsRoot, 'baseline-responses-v1.json');
const humanizedFile = path.join(resultsRoot, 'humanized-responses-v1.json');
const metricsFile = path.join(resultsRoot, 'humanized-metrics-v1.json');
const comparisonFile = path.join(resultsRoot, 'baseline-vs-humanized-v1.json');

function frequency(values) {
  return Object.entries(values.reduce((map, item) => ({ ...map, [item]: (map[item] || 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, count }));
}

function opening(text) {
  return normalize(text).split(' ').slice(0, 4).join(' ');
}

function isGenericFallback(turn) {
  const text = normalize(turn.response_text);
  return /^ainda nao tenho (?:uma )?confirmacao segura sobre (?:esse ponto|isso)/u.test(text)
    || /^quero entender bem antes de seguir/u.test(text);
}

function turnRows(artifact) {
  return artifact.results.flatMap((conversation) => conversation.results.map((turn, index) => ({
    ...turn,
    case_id: conversation.case_id,
    category: conversation.category,
    turn: index + 1
  })));
}

function run() {
  const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
  const humanized = JSON.parse(fs.readFileSync(humanizedFile, 'utf8'));
  const turns = turnRows(humanized);
  const checks = humanized.results.flatMap((conversation) => verifyConversation(conversation, { projectRoot }));
  const verifier = summarize(checks);
  const openings = frequency(turns.map((turn) => opening(turn.response_text)));
  const genericFallbacks = turns.filter(isGenericFallback);
  const continuationGreeting = turns.filter((turn) => (
    turn.response_plan.conversation_stage === 'continuation'
    && /^(?:olá|oi|bom dia|boa tarde|boa noite)\b/iu.test(turn.response_text)
  ));
  const repeatedQuestions = checks.filter((item) => item.check === 'repeated_question' && item.status === 'failed');
  const fallbackReasons = frequency(turns.map((turn) => turn.response_plan.fallback_reason || 'none'));
  const strategies = frequency(turns.map((turn) => turn.response_plan.strategy_id));
  const gapIds = new Set(['HREV-003', 'HREV-026', 'HREV-027', 'HREV-041', 'HREV-044']);
  const gapChecks = checks.filter((item) => gapIds.has(item.case_id) && item.check === 'must_include');
  const safety = {
    unknown_links: checks.filter((item) => item.check === 'unknown_links' && item.status === 'failed').length,
    unknown_values: checks.filter((item) => item.check === 'unknown_values' && item.status === 'failed').length,
    forbidden_promises: checks.filter((item) => item.check === 'forbidden_promises' && item.status === 'failed').length,
    automatic_compensation: checks.filter((item) => item.check === 'automatic_compensation' && item.status === 'failed').length,
    validator_rejections_unresolved: turns.filter((turn) => turn.validation?.passed !== true).length
  };
  const metrics = {
    schema_version: 'deliveryos-conversation-humanized-metrics-v1',
    synthetic: true,
    source_hash: humanized.canonical_hash,
    objective: {
      conversations: humanized.results.length,
      turns: turns.length,
      repeated_openings: openings.filter((item) => item.count > 1).slice(0, 20),
      dominant_opening_count: openings[0]?.count || 0,
      dominant_opening_limit: 11,
      generic_fallback_count: genericFallbacks.length,
      generic_fallback_limit: 7,
      fallback_reasons: fallbackReasons,
      strategies,
      continuation_greeting_failures: continuationGreeting.map((turn) => `${turn.case_id}#${turn.turn}`),
      repeated_question_failures: repeatedQuestions,
      five_contract_gaps: gapChecks,
      verifier: { total: verifier.total, passed: verifier.passed, failed: verifier.failed },
      verifier_failures: checks.filter((item) => item.status === 'failed'),
      safety
    },
    heuristic: {
      bureaucratic_patterns: BUREAUCRATIC.map((phrase) => ({
        phrase,
        count: turns.filter((turn) => normalize(turn.response_text).includes(normalize(phrase))).length
      })),
      note: 'Métricas estruturais não substituem a avaliação humana de César.'
    },
    human_review_required: true
  };
  metrics.gates = {
    dominant_opening: metrics.objective.dominant_opening_count <= 11,
    generic_fallback: metrics.objective.generic_fallback_count <= 7,
    contract_gaps: gapChecks.every((item) => item.status === 'passed'),
    continuity: continuationGreeting.length === 0 && repeatedQuestions.length === 0,
    safety: Object.values(safety).every((count) => count === 0),
    verifier: verifier.failed === 0
  };
  metrics.canonical_hash = sha256(canonicalJson(metrics));

  const baselineById = new Map(baseline.results.map((item) => [item.case_id, item]));
  const comparison = {
    schema_version: 'deliveryos-conversation-baseline-vs-humanized-v1',
    synthetic: true,
    baseline_hash: baseline.canonical_hash,
    humanized_hash: humanized.canonical_hash,
    rows: humanized.results.map((item) => {
      const prior = baselineById.get(item.case_id);
      return {
        case_id: item.case_id,
        category: item.category,
        turns: item.results.map((turn, index) => ({
          turn: index + 1,
          before: prior.results[index].response_text,
          after: turn.response_text,
          changed: prior.results[index].response_text !== turn.response_text,
          facts: item.expected_contract.facts,
          strategy: turn.response_plan.strategy_id,
          fallback_reason: turn.response_plan.fallback_reason,
          characters_before: prior.results[index].response_text.length,
          characters_after: turn.response_text.length,
          opening_before: opening(prior.results[index].response_text),
          opening_after: opening(turn.response_text),
          questions_after: questions(turn.response_text),
          checks: turn.validation?.checks || null,
          human_review: { rating: null, tags: [], comment: null }
        }))
      };
    })
  };
  comparison.canonical_hash = sha256(canonicalJson(comparison));
  fs.writeFileSync(metricsFile, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
  fs.writeFileSync(comparisonFile, `${JSON.stringify(comparison, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ turns: turns.length, verifier: metrics.objective.verifier, gates: metrics.gates, metrics_hash: metrics.canonical_hash, comparison_hash: comparison.canonical_hash })}\n`);
  if (!Object.values(metrics.gates).every(Boolean)) process.exitCode = 1;
}

try {
  run();
} catch (error) {
  process.stderr.write(`${error.code || error.message || 'HUMANIZED_ANALYSIS_FAILED'}\n`);
  process.exitCode = 1;
}
