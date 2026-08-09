'use strict';

const { similarity, INTERNAL, GENERIC_FALLBACK } = require('./hard-evaluator');

const DIMENSIONS = Object.freeze(['comprehension', 'continuity', 'utility', 'hospitality', 'naturalness', 'concision', 'decision_support']);
const FLAGS = Object.freeze(['robotic', 'database_voice', 'repetitive', 'overexplaining', 'underhelpful', 'interrogative', 'lost_context', 'mechanism_visible', 'generic']);

function clamp(value) { return Math.max(0, Math.min(10, Number(value.toFixed(2)))); }

function evaluateExperience(transcript, allowedFacts = {}) {
  const scores = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, 10]));
  const flags = Object.fromEntries(FLAGS.map((flag) => [flag, false]));
  const issues = [];
  let questionTurns = 0;
  for (let index = 0; index < transcript.length; index += 1) {
    const turn = transcript[index];
    const response = String(turn.response || '');
    const prior = transcript[index - 1];
    if (response.includes('?')) questionTurns += 1;
    if (prior && similarity(prior.response, response) > 0.82) {
      flags.repetitive = true; scores.continuity -= 1.5; scores.naturalness -= 1; scores.concision -= 0.75;
      issues.push({ turn: index + 1, dimension: 'continuity', reason: 'response_surface_nearly_repeated' });
    }
    if (/vou (?:manter|registrar|considerar) essa prefer[eê]ncia/iu.test(response)) {
      flags.underhelpful = true; scores.utility -= 3.5; issues.push({ turn: index + 1, dimension: 'utility', reason: 'state_narration_without_help' });
    }
    if (/setor respons[aá]vel/iu.test(response)) {
      flags.robotic = true; scores.hospitality -= 1.5; issues.push({ turn: index + 1, dimension: 'hospitality', reason: 'opaque_handoff' });
    }
    if (GENERIC_FALLBACK.test(response)) {
      flags.generic = true; scores.comprehension -= 2; scores.utility -= 2; issues.push({ turn: index + 1, dimension: 'comprehension', reason: 'generic_fallback' });
    }
    if (INTERNAL.test(response)) {
      flags.mechanism_visible = true; flags.database_voice = true; scores.naturalness -= 3; scores.hospitality -= 2;
      issues.push({ turn: index + 1, dimension: 'naturalness', reason: 'mechanism_visible' });
    }
    if (response.length > 600) {
      flags.overexplaining = true; scores.concision -= 1.5; issues.push({ turn: index + 1, dimension: 'concision', reason: 'response_too_long' });
    }
    if (['decision', 'decision_short'].includes(turn.action?.type) && !/porque|por ter|por ser|pre[cç]o|preparo|faz mais sentido|n[aã]o escolheria|equipe|alerg/iu.test(response)) {
      flags.underhelpful = true; scores.decision_support -= 2; scores.utility -= 1;
      issues.push({ turn: index + 1, dimension: 'decision_support', reason: 'choice_without_useful_tradeoff' });
    }
  }
  if (transcript.length >= 4 && questionTurns / transcript.length > 0.75) {
    flags.interrogative = true; scores.naturalness -= 1; scores.hospitality -= 0.5;
    issues.push({ turn: null, dimension: 'naturalness', reason: 'conversation_overly_interrogative' });
  }
  for (const dimension of DIMENSIONS) scores[dimension] = clamp(scores[dimension]);
  const average = clamp(DIMENSIONS.reduce((sum, dimension) => sum + scores[dimension], 0) / DIMENSIONS.length);
  return Object.freeze({
    schema_version: 'deliveryos-experience-evaluator-v2',
    independence: 'ADVISORY_NOT_INDEPENDENT',
    allowed_fact_keys: Object.keys(allowedFacts).sort(),
    scores: Object.freeze(scores), average,
    flags: Object.freeze(flags),
    passed: average >= 8.5 && DIMENSIONS.every((dimension) => scores[dimension] >= 7),
    issues
  });
}

module.exports = { DIMENSIONS, FLAGS, evaluateExperience };
