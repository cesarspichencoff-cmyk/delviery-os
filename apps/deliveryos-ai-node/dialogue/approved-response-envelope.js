'use strict';

const { validateWriterInput, validateWriterOutput } = require('./writer-contract');

const APPROVED_RESPONSE_ENVELOPE_KEYS = Object.freeze([
  'schema_version',
  'social_acknowledgement',
  'direct_answer',
  'explanation',
  'journey_context',
  'customer_context_summary',
  'menu_context_summary',
  'recommendation_context',
  'channel_policy_summary',
  'cost_policy_summary',
  'facts',
  'action_truth',
  'question_to_ask',
  'tone',
  'gravity',
  'prohibited_claims',
  'recent_phrases_to_avoid',
  'authorized_links',
  'authorized_numbers',
  'maximum_length'
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value, maximum = 100) {
  return Array.isArray(value) && value.length <= maximum && value.every((item) => typeof item === 'string' && item.length <= 1000);
}

function validateApprovedResponseEnvelope(value) {
  if (!isPlainObject(value)) return { accepted: false, reason: 'APPROVED_ENVELOPE_NOT_OBJECT' };
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...APPROVED_RESPONSE_ENVELOPE_KEYS].sort())) return { accepted: false, reason: 'APPROVED_ENVELOPE_KEYS_INVALID' };
  if (value.schema_version !== 'deliveryos-approved-response-envelope-v1') return { accepted: false, reason: 'APPROVED_ENVELOPE_VERSION_INVALID' };
  if (![value.social_acknowledgement, value.question_to_ask].every((item) => item === null || typeof item === 'string')) return { accepted: false, reason: 'APPROVED_ENVELOPE_TEXT_INVALID' };
  if (!stringArray(value.direct_answer) || !stringArray(value.explanation) || !stringArray(value.prohibited_claims) || !stringArray(value.recent_phrases_to_avoid) || !stringArray(value.authorized_links) || !stringArray(value.authorized_numbers)) return { accepted: false, reason: 'APPROVED_ENVELOPE_ARRAY_INVALID' };
  if (![value.journey_context, value.customer_context_summary, value.menu_context_summary, value.recommendation_context, value.channel_policy_summary, value.cost_policy_summary].every((item) => item === null || isPlainObject(item))) return { accepted: false, reason: 'APPROVED_ENVELOPE_CONTEXT_INVALID' };
  if (!Array.isArray(value.facts) || value.facts.some((fact) => !isPlainObject(fact) || typeof fact.field !== 'string' || !['string', 'number', 'boolean'].includes(typeof fact.value))) return { accepted: false, reason: 'APPROVED_ENVELOPE_FACTS_INVALID' };
  if (value.action_truth !== null && typeof value.action_truth !== 'string') return { accepted: false, reason: 'APPROVED_ENVELOPE_ACTION_INVALID' };
  if (typeof value.tone !== 'string' || !['informational', 'operational', 'sensitive', 'critical'].includes(value.gravity)) return { accepted: false, reason: 'APPROVED_ENVELOPE_TONE_INVALID' };
  if (!Number.isInteger(value.maximum_length) || value.maximum_length < 40 || value.maximum_length > 900) return { accepted: false, reason: 'APPROVED_ENVELOPE_LENGTH_INVALID' };
  return { accepted: true, reason: null, envelope: Object.freeze(value) };
}

function contextSummaryLines(envelope) {
  const summaries = [
    envelope.journey_context,
    envelope.customer_context_summary,
    envelope.menu_context_summary,
    envelope.recommendation_context,
    envelope.channel_policy_summary,
    envelope.cost_policy_summary
  ].filter(Boolean);
  return summaries.map((summary) => JSON.stringify(summary));
}

function approvedEnvelopeToWriterInput(value) {
  const checked = validateApprovedResponseEnvelope(value);
  if (!checked.accepted) throw Object.assign(new Error(checked.reason), { code: checked.reason });
  const envelope = checked.envelope;
  const input = {
    direct_response: [envelope.social_acknowledgement, ...envelope.direct_answer].filter(Boolean),
    authorized_facts: envelope.facts.map(({ field, value }) => ({ field, value })),
    selected_knowledge: [...envelope.explanation],
    direction: contextSummaryLines(envelope),
    true_action: envelope.action_truth,
    required_question: envelope.question_to_ask,
    tone: envelope.tone,
    gravity: envelope.gravity,
    social_context: envelope.journey_context ? JSON.stringify(envelope.journey_context) : '',
    recent_phrases: [...envelope.recent_phrases_to_avoid],
    prohibited_claims: [...envelope.prohibited_claims],
    authorized_links: [...envelope.authorized_links],
    authorized_numbers: [...envelope.authorized_numbers],
    maximum_length: envelope.maximum_length
  };
  const validated = validateWriterInput(input);
  if (!validated.accepted) throw Object.assign(new Error(validated.reason), { code: validated.reason });
  return Object.freeze(input);
}

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/gu, ' ').trim();
}

const CONTROLLED_TOPIC_PATTERNS = Object.freeze([
  ['marketplace', /\bmarketplace\b/u],
  ['ifood', /\bifood\b/u],
  ['delivery', /\bdelivery\b/u],
  ['pedido', /\bpedid[oa]s?\b/u],
  ['reserva', /\breservas?\b/u],
  ['fila', /\bfilas?\b/u],
  ['cardapio', /\bcardapios?\b/u],
  ['bebida', /\bbebidas?\b/u],
  ['drink', /\bdrinks?\b/u],
  ['alergia', /\balergi(?:a|as|co|ca|cos|cas)\b/u],
  ['preco', /\bprecos?\b/u],
  ['promocao', /\bpromoc(?:ao|oes)\b/u]
]);

function unapprovedTopics(text, envelope) {
  const normalizedText = normalize(text);
  const authorized = normalize(JSON.stringify({
    direct_answer: envelope.direct_answer,
    explanation: envelope.explanation,
    facts: envelope.facts,
    action_truth: envelope.action_truth,
    question_to_ask: envelope.question_to_ask,
    menu_context_summary: envelope.menu_context_summary,
    recommendation_context: envelope.recommendation_context
  }));
  return CONTROLLED_TOPIC_PATTERNS.filter(([, pattern]) => pattern.test(normalizedText) && !pattern.test(authorized))
    .map(([topic]) => topic);
}

function validateApprovedWriterOutput(output, envelope) {
  const checked = validateApprovedResponseEnvelope(envelope);
  if (!checked.accepted) return { accepted: false, reason: checked.reason };
  const writerInput = approvedEnvelopeToWriterInput(checked.envelope);
  const base = validateWriterOutput(output, writerInput);
  if (!base.accepted) return base;
  const text = base.output.text;
  const approvedGreeting = checked.envelope.direct_answer.find((answer) => /^(?:ol[aá]|bom dia|boa tarde|boa noite)\b/iu.test(answer));
  if (approvedGreeting && !/^(?:ol[aá]|bom dia|boa tarde|boa noite)\b/iu.test(text)) {
    return { accepted: false, reason: 'WRITER_SOCIAL_ACKNOWLEDGEMENT_OMITTED' };
  }
  const topics = unapprovedTopics(text, checked.envelope);
  if (topics.length) return { accepted: false, reason: 'WRITER_UNAPPROVED_TOPIC', details: { topics } };
  if (checked.envelope.question_to_ask && !normalize(text).includes(normalize(checked.envelope.question_to_ask))) return { accepted: false, reason: 'WRITER_QUESTION_CHANGED' };
  for (const claim of checked.envelope.prohibited_claims) {
    if (claim && normalize(text).includes(normalize(claim))) return { accepted: false, reason: 'WRITER_PROHIBITED_CLAIM' };
  }
  if (checked.envelope.channel_policy_summary?.status === 'blocked' && /\b(?:enviei|enviado|disparei|mensagem enviada)\b/iu.test(text)) return { accepted: false, reason: 'WRITER_CHANNEL_POLICY_CHANGED' };
  if (checked.envelope.cost_policy_summary?.status === 'blocked' && /\b(?:contratei|ativei|assinei|cobran[cç]a autorizada)\b/iu.test(text)) return { accepted: false, reason: 'WRITER_COST_POLICY_CHANGED' };
  return base;
}

module.exports = {
  APPROVED_RESPONSE_ENVELOPE_KEYS,
  validateApprovedResponseEnvelope,
  approvedEnvelopeToWriterInput,
  validateApprovedWriterOutput,
  CONTROLLED_TOPIC_PATTERNS,
  unapprovedTopics
};
