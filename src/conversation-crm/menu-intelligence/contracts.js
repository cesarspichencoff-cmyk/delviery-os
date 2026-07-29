'use strict';

const crypto = require('node:crypto');

const CHANNELS = Object.freeze(['dining_room', 'ifood', 'own_delivery']);
const REVIEW_STATES = Object.freeze(['confirmed', 'unconfirmed', 'conflicting', 'missing', 'deprecated']);
const AVAILABILITY_STATES = Object.freeze(['available', 'unavailable', 'unknown', 'stale']);
const ALLERGEN_ASSERTIONS = Object.freeze([
  'not_listed_in_recipe',
  'does_not_contain_approved_source',
  'cross_contact_possible',
  'contains',
  'unknown'
]);

function menuError(code, details = {}) {
  const error = new Error(String(code).toLowerCase());
  error.code = code;
  error.details = details;
  return error;
}

function stableHash(...parts) {
  return crypto.createHash('sha256').update(parts.map((part) => String(part ?? '')).join('\u0000')).digest('hex');
}

function requireEnum(value, allowed, code) {
  if (!allowed.includes(value)) throw menuError(code);
  return value;
}

function requireText(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw menuError(code);
  return value.trim();
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function cloneFrozen(value) {
  const output = structuredClone(value);
  const freeze = (item) => {
    if (!item || typeof item !== 'object' || Object.isFrozen(item)) return item;
    Object.values(item).forEach(freeze);
    return Object.freeze(item);
  };
  return freeze(output);
}

module.exports = {
  CHANNELS,
  REVIEW_STATES,
  AVAILABILITY_STATES,
  ALLERGEN_ASSERTIONS,
  menuError,
  stableHash,
  requireEnum,
  requireText,
  canonical,
  cloneFrozen
};
