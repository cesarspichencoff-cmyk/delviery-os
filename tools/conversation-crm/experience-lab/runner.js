'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const { createNativeServer } = require('../native-server');
const { buildExperienceCatalog } = require('./catalog');
const { buildWaveCatalog, buildDirectedCatalog, buildConfirmationCatalog } = require('./wave-catalog');
const { SyntheticCustomer } = require('./synthetic-customer');
const { evaluateConversation } = require('./hard-evaluator');
const { evaluateExperience } = require('./experience-evaluator');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

async function request(base, endpoint, options = {}) {
  const response = await fetch(`${base}${endpoint}`, {
    method: options.method || 'GET',
    headers: options.body ? { 'content-type': 'application/json; charset=utf-8' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(`EXPERIENCE_LAB_HTTP_${response.status}`), { body });
  return body;
}

function summarize(conversations, hardResults, experienceResults, seed, mode) {
  const failures = hardResults.flatMap((result) => result.failures.map((item) => ({ conversation_id: result.conversation_id, ...item })));
  const byClass = Object.fromEntries([...new Set(failures.map((item) => item.failure_class))].sort().map((failureClass) => [failureClass, failures.filter((item) => item.failure_class === failureClass).length]));
  const severityCounts = Object.fromEntries(['critical', 'high', 'medium', 'low'].map((severity) => [severity, failures.filter((item) => item.severity === severity).length]));
  const scoreDimensions = ['comprehension', 'continuity', 'utility', 'hospitality', 'naturalness', 'concision', 'decision_support'];
  const experienceScores = Object.fromEntries(scoreDimensions.map((dimension) => [dimension, Number((experienceResults.reduce((sum, item) => sum + Number(item.scores?.[dimension] || 0), 0) / Math.max(1, experienceResults.length)).toFixed(2))]));
  const experienceAverage = Number((scoreDimensions.reduce((sum, dimension) => sum + experienceScores[dimension], 0) / scoreDimensions.length).toFixed(2));
  const metrics = {
    conversations_run: conversations.length,
    turns_run: conversations.reduce((sum, item) => sum + item.turns.length, 0),
    critical_failures: severityCounts.critical,
    high_failures: severityCounts.high,
    medium_failures: severityCounts.medium,
    total_failures: failures.length,
    new_failure_classes: Object.keys(byClass).length,
    response_loops: byClass.RESPONSE_LOOP || 0,
    lost_context: (byClass.LOST_CONTEXT || 0) + (byClass.SIDE_QUESTION_DESTROYS_JOURNEY || 0),
    wrong_channel: byClass.WRONG_CHANNEL || 0,
    unsupported_fact: byClass.UNSUPPORTED_FACT || 0,
    safety_failures: (byClass.ALLERGY_CONTEXT_LOST || 0) + (byClass.ALLERGY_INCOMPATIBLE_CANDIDATE || 0) + (byClass.UNSAFE_ALLERGY_CLAIM || 0),
    reference_failures: (byClass.VALID_REFERENCE_FAILURE || 0) + (byClass.FALSE_REFERENCE_RESOLUTION || 0),
    channel_failures: (byClass.WRONG_CHANNEL || 0) + (byClass.CHANNEL_SWITCH_FAILURE || 0),
    quantity_failures: byClass.QUANTITY_IGNORED || 0,
    decision_support_failures: byClass.DECISION_SUPPORT_FAILURE || 0,
    first_visit_failures: byClass.FIRST_VISIT_FAILURE || 0,
    internal_language_leaks: byClass.INTERNAL_LANGUAGE_LEAK || 0,
    experience_advisory_average: experienceAverage
  };
  const stable = { seed, mode, metrics, experience_scores: experienceScores, failure_classes: byClass, conversations, hard_results: hardResults, experience_results: experienceResults };
  return Object.freeze({ schema_version: 'deliveryos-autonomous-experience-lab-report-v1', ...stable, report_hash: sha256(stable) });
}

async function runExperienceLab(options = {}) {
  const seed = String(options.seed || 'TATA-EXPERIENCE-LAB-V1');
  const mode = options.mode || 'all';
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-experience-lab-'));
  const server = createNativeServer({
    runtimeRoot: path.join(root, 'runtime'), feedbackRoot: path.join(root, 'feedback'),
    chatRuntimeRoot: path.join(root, 'chat'), exportRoot: path.join(root, 'exports'),
    enableLocalWriter: options.enableLocalWriter === true,
    now: () => '2026-08-08T15:00:00.000Z'
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const bootstrap = await request(base, '/api/customer-menu/bootstrap');
    const menuIndex = new Map(bootstrap.menu.items.map((item) => [item.item_id, item]));
    const catalog = buildExperienceCatalog();
    const allScenarios = options.profile === 'fresh-confirmation'
      ? buildConfirmationCatalog({ seed })
      : (options.profile === 'directed-blockers'
        ? buildDirectedCatalog({ seed, countPerGroup: Number(options.countPerGroup || 50) })
      : (options.waveCount
        ? buildWaveCatalog({ count: Number(options.waveCount), seed, wave: Number(options.wave || 1) })
        : (mode === 'structured' ? catalog.structured : (mode === 'mutated' ? catalog.mutated : [...catalog.structured, ...catalog.mutated]))));
    const limit = Number(options.limit || 0);
    const scenarios = Number.isInteger(limit) && limit > 0 ? allScenarios.slice(0, limit) : allScenarios;
    const conversations = [];
    const hardResults = [];
    const experienceResults = [];
    for (const scenario of scenarios) {
      await request(base, '/api/homologation/chat/reset', { method: 'POST', body: {} });
      const customer = new SyntheticCustomer(scenario, seed);
      const turns = [];
      let customerTurn = customer.nextTurn();
      while (customerTurn) {
        const output = await request(base, '/api/homologation/chat', { method: 'POST', body: { message: customerTurn.message } });
        const turn = Object.freeze({
          index: turns.length + 1, action: customerTurn.action, input: customerTurn.message,
          response: output.turn.response, diagnostic: output.turn.diagnostic
        });
        turns.push(turn);
        customerTurn = customer.nextTurn(turn);
      }
      const conversation = Object.freeze({ conversation_id: scenario.scenario_id, family: scenario.family, mutated: scenario.mutated, turns });
      conversations.push(conversation);
      hardResults.push(evaluateConversation(conversation, menuIndex));
      experienceResults.push({ conversation_id: scenario.scenario_id, ...evaluateExperience(turns, { catalog: 'certified', synthetic: true }) });
    }
    return summarize(conversations, hardResults, experienceResults, seed, mode);
  } finally {
    server.close();
    await once(server, 'close');
    fs.rmSync(root, { recursive: true, force: true });
  }
}

module.exports = { canonical, sha256, request, summarize, runExperienceLab };
