'use strict';

const { deepFreeze } = require('./catalogs/operational');

const STOP_WORDS = new Set([
  'a', 'ao', 'aos', 'as', 'com', 'como', 'da', 'das', 'de', 'do', 'dos',
  'e', 'em', 'esse', 'essa', 'esta', 'este', 'eu', 'foi', 'mais', 'na',
  'nas', 'no', 'nos', 'o', 'os', 'ou', 'para', 'pelo', 'pela', 'por',
  'que', 'se', 'sem', 'ser', 'sua', 'seu', 'um', 'uma', 'voce'
]);

function normalizeGateText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function significantTokens(value) {
  return [...new Set(normalizeGateText(value).split(' ').filter((token) => token.length >= 4 && !STOP_WORDS.has(token)))];
}

function coverageRatio(text, reference) {
  const tokens = significantTokens(reference);
  if (!tokens.length) return 1;
  const haystack = new Set(significantTokens(text));
  return tokens.filter((token) => haystack.has(token)).length / tokens.length;
}

function messageRepresented(text, reference) {
  const tokens = significantTokens(reference);
  if (!tokens.length) return true;
  const minimum = tokens.length <= 4 ? 0.5 : 0.25;
  return coverageRatio(text, reference) >= minimum;
}

function availableKnowledgeUnused(input = {}) {
  const text = String(input.text || '');
  const plan = input.plan || {};
  const direct = plan.direct_answer || [];
  const missing = direct.filter((message) => !messageRepresented(text, message));
  const falseFallback = direct.length > 0
    && /\b(?:n[aã]o (?:tenho|sei|possuo)|sem informa[cç][aã]o|falar com humano)\b/iu.test(text);
  return deepFreeze({
    gate: 'available_knowledge_unused',
    passed: missing.length === 0 && !falseFallback,
    missing_count: missing.length,
    false_fallback: falseFallback,
    missing_fingerprints: missing.map((message) => significantTokens(message).slice(0, 4).join('_'))
  });
}

function directionRepresented(text, plan) {
  const directions = plan.direction || [];
  if (!directions.length) return true;
  if (directions.some((message) => messageRepresented(text, message))) return true;
  if (plan.contextual_question && messageRepresented(text, plan.contextual_question)) return true;
  if ((plan.mandatory_questions || []).length && String(text).includes('?')) return true;
  return plan.action_available === true && plan.action_selected != null;
}

function channelRepresented(text, plan) {
  const guidance = plan.channel_guidance || [];
  if (!guidance.length) return true;
  const channels = {
    ifood: /\bifood|pedidos|ajuda\b/iu,
    reservation: /\bgetin|reservation\.getin\.app|link\b/iu,
    waitlist: /\bfila|reservation\.getin\.app|link\b/iu,
    own_delivery: /\bdelivery|canal|neemo\b/iu
  };
  const matcher = channels[plan.action_playbook];
  return matcher ? matcher.test(text) : true;
}

function humanizedButUnhelpful(input = {}) {
  const text = String(input.text || '');
  const plan = input.plan || {};
  const hasHumanOpening = /\b(?:sinto muito|entendi|obrigad|poxa|perfeito|claro|que bom)\b/iu.test(text);
  const knowledge = availableKnowledgeUnused({ text, plan });
  const hasDirection = directionRepresented(text, plan);
  const hasChannel = channelRepresented(text, plan);
  const needsAdvance = ['operational', 'sensitive', 'critical'].includes(plan.gravity)
    || (plan.direct_answer || []).length > 0
    || (plan.mandatory_questions || []).length > 0;
  const useful = knowledge.passed && hasDirection && hasChannel;
  return deepFreeze({
    gate: 'humanized_but_unhelpful',
    passed: !needsAdvance || useful || !hasHumanOpening,
    human_opening: hasHumanOpening,
    knowledge_used: knowledge.passed,
    direction_present: hasDirection,
    channel_present: hasChannel
  });
}

function runServiceQualityGates(input = {}) {
  const knowledge = availableKnowledgeUnused(input);
  const humanity = humanizedButUnhelpful(input);
  return deepFreeze({
    passed: knowledge.passed && humanity.passed,
    gates: {
      available_knowledge_unused: knowledge,
      humanized_but_unhelpful: humanity
    }
  });
}

module.exports = {
  normalizeGateText,
  significantTokens,
  coverageRatio,
  messageRepresented,
  availableKnowledgeUnused,
  directionRepresented,
  channelRepresented,
  humanizedButUnhelpful,
  runServiceQualityGates
};
