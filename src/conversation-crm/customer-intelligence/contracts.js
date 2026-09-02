'use strict';

const crypto = require('node:crypto');

const MATCH_CLASSIFICATIONS = Object.freeze([
  'exact_match', 'probable_match', 'possible_match', 'conflict', 'new_customer'
]);
const FACT_STATES = Object.freeze([
  'confirmed', 'imported', 'inferred', 'employee_noted',
  'unconfirmed', 'stale', 'conflicting'
]);
const CONSENT_STATES = Object.freeze([
  'unknown', 'allowed', 'blocked', 'withdrawn', 'expired'
]);
const IMPORT_STATES = Object.freeze([
  'staged', 'previewed', 'approved', 'imported', 'rolled_back', 'rejected'
]);

function customerError(code, details = {}) {
  const error = new Error(String(code).toLowerCase());
  error.code = code;
  error.details = details;
  return error;
}

function requireText(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw customerError(code);
  return value.trim();
}

function requireEnum(value, allowed, code) {
  if (!allowed.includes(value)) throw customerError(code);
  return value;
}

function stableHash(...parts) {
  return crypto.createHash('sha256').update(parts.map((part) => String(part ?? '')).join('\u0000')).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function cloneFrozen(value) {
  const cloned = structuredClone(value);
  const freeze = (item) => {
    if (!item || typeof item !== 'object' || Object.isFrozen(item)) return item;
    Object.values(item).forEach(freeze);
    return Object.freeze(item);
  };
  return freeze(cloned);
}

module.exports = {
  MATCH_CLASSIFICATIONS,
  FACT_STATES,
  CONSENT_STATES,
  IMPORT_STATES,
  customerError,
  requireText,
  requireEnum,
  stableHash,
  canonical,
  cloneFrozen
};

