'use strict';

const ENTITY_TYPES = Object.freeze({
  PROFILE: 'CustomerProfile',
  IDENTITY: 'CustomerIdentity',
  ORDER_REFERENCE: 'CustomerOrderReference',
  OCCURRENCE: 'CustomerOccurrence',
  PROMISE: 'CustomerPromise',
  BENEFIT: 'CustomerBenefit',
  CONSENT: 'CustomerConsent',
  TIMELINE_EVENT: 'CustomerTimelineEvent'
});

const CONSENT_STATUS = Object.freeze(['unknown', 'opt_in', 'opt_out']);
const SEVERITY = Object.freeze(['low', 'medium', 'high', 'critical', 'unknown']);
const OCCURRENCE_STATUS = Object.freeze(['open', 'waiting_human', 'in_progress', 'resolved', 'closed']);
const PROMISE_STATUS = Object.freeze(['registered', 'fulfilled', 'expired', 'cancelled']);
const BENEFIT_STATUS = Object.freeze(['pending_human', 'authorized', 'delivered', 'cancelled']);

function domainError(code) {
  const error = new Error(code.toLowerCase());
  error.code = code;
  return error;
}

function requireString(value, code) {
  if (typeof value !== 'string' || value.trim() === '') throw domainError(code);
  return value.trim();
}

function requireEnum(value, allowed, code) {
  if (!allowed.includes(value)) throw domainError(code);
  return value;
}

function optionalIso(value, code) {
  if (value === null || value === undefined) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw domainError(code);
  return date.toISOString();
}

function isoNow(clock) {
  return optionalIso(clock(), 'CLOCK_INVALIDO');
}

function cloneFrozen(value) {
  const cloned = structuredClone(value);
  return deepFreeze(cloned);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

const FORBIDDEN_PAYLOAD_KEY = /(^|_)(nome|name|telefone|phone|email|mail|endereco|address|cpf|documento|cookie|senha|password|token)($|_)/i;

function sanitizeTimelinePayload(value, depth = 0) {
  if (depth > 5) throw domainError('PAYLOAD_PROFUNDO_DEMAIS');
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (value.length > 160 || /@|\r|\n|(?:^|\D)\d{10,13}(?:\D|$)/.test(value)) throw domainError('PAYLOAD_PODE_CONTER_PII');
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeTimelinePayload(item, depth + 1));
  if (!value || typeof value !== 'object') throw domainError('PAYLOAD_INVALIDO');
  const output = {};
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_PAYLOAD_KEY.test(key)) throw domainError('PAYLOAD_CAMPO_PROIBIDO');
    output[key] = sanitizeTimelinePayload(nested, depth + 1);
  }
  return output;
}

module.exports = {
  ENTITY_TYPES,
  CONSENT_STATUS,
  SEVERITY,
  OCCURRENCE_STATUS,
  PROMISE_STATUS,
  BENEFIT_STATUS,
  domainError,
  requireString,
  requireEnum,
  optionalIso,
  isoNow,
  cloneFrozen,
  sanitizeTimelinePayload
};

