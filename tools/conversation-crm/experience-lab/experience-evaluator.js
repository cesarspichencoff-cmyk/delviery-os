'use strict';

const { similarity } = require('./hard-evaluator');

function evaluateExperience(transcript, allowedFacts = {}) {
  const issues = [];
  for (let index = 0; index < transcript.length; index += 1) {
    const turn = transcript[index];
    const response = String(turn.response || '');
    const prior = transcript[index - 1];
    if (prior && similarity(prior.response, response) > 0.82) issues.push({ turn: index + 1, dimension: 'repetition', reason: 'response_surface_nearly_repeated' });
    if (/vou (?:manter|registrar|considerar) essa prefer[eê]ncia/iu.test(response)) issues.push({ turn: index + 1, dimension: 'utility', reason: 'state_narration_without_help' });
    if (/setor respons[aá]vel/iu.test(response)) issues.push({ turn: index + 1, dimension: 'hospitality', reason: 'opaque_handoff' });
    if (response.length > 900) issues.push({ turn: index + 1, dimension: 'clarity', reason: 'response_too_long' });
  }
  return Object.freeze({
    schema_version: 'deliveryos-experience-evaluator-v1',
    independence: 'ADVISORY_NOT_INDEPENDENT',
    allowed_fact_keys: Object.keys(allowedFacts).sort(),
    passed: issues.length === 0,
    issues
  });
}

module.exports = { evaluateExperience };
