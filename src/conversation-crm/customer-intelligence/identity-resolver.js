'use strict';

const {
  MATCH_CLASSIFICATIONS, customerError, stableHash, cloneFrozen
} = require('./contracts');
const { normalizePhone, normalizeEmail } = require('../importer/normalization');

function normalizedIdentity(input = {}, options = {}) {
  const secret = String(options.secret || '');
  if (secret.length < 32) throw customerError('IDENTITY_SECRET_INVALID');
  const source = String(input.source || 'unknown');
  if (input.type === 'phone') {
    const checked = normalizePhone(input.value);
    if (!checked.valid) return null;
    return cloneFrozen({
      type: 'phone',
      token: stableHash(secret, 'phone', checked.value),
      source,
      external_id: null
    });
  }
  if (input.type === 'email') {
    const checked = normalizeEmail(input.value);
    if (!checked.valid) return null;
    return cloneFrozen({
      type: 'email',
      token: stableHash(secret, 'email', checked.value),
      source,
      external_id: null
    });
  }
  if (input.type === 'external_id') {
    if (!input.value || !source || source === 'unknown') return null;
    return cloneFrozen({
      type: 'external_id',
      token: stableHash(secret, 'external', source, input.value),
      source,
      external_id: stableHash(secret, 'external-display', source, input.value).slice(0, 16)
    });
  }
  return null;
}

function identityKeys(customer = {}) {
  return new Set((customer.identities || []).map((identity) => `${identity.type}:${identity.token}`));
}

function resolveIdentity(input = {}) {
  const identities = (input.identities || []).filter(Boolean);
  const candidates = input.candidates || [];
  if (!identities.length) {
    return cloneFrozen({ classification: 'new_customer', candidates: [], reasons: ['no_valid_identity'] });
  }
  const requestedKeys = new Set(identities.map((item) => `${item.type}:${item.token}`));
  const scored = candidates.map((candidate) => {
    const keys = identityKeys(candidate);
    const exact = [...requestedKeys].filter((key) => keys.has(key));
    const sources = new Set((candidate.identities || []).map((item) => item.source));
    const sourceOverlap = identities.some((item) => sources.has(item.source));
    return {
      customer_id: candidate.customer_id,
      exact_identity_matches: exact.length,
      source_overlap: sourceOverlap,
      conflicting_identity: exact.length > 0 && [...requestedKeys].some((key) => !keys.has(key))
    };
  }).filter((item) => item.exact_identity_matches > 0);

  if (!scored.length) {
    return cloneFrozen({ classification: 'new_customer', candidates: [], reasons: ['identity_not_found'] });
  }
  const strongest = Math.max(...scored.map((item) => item.exact_identity_matches));
  const top = scored.filter((item) => item.exact_identity_matches === strongest);
  if (top.length > 1) {
    return cloneFrozen({ classification: 'conflict', candidates: top, reasons: ['same_identity_multiple_customers'] });
  }
  const winner = top[0];
  const allProvidedMatched = winner.exact_identity_matches === requestedKeys.size;
  if (allProvidedMatched && !winner.conflicting_identity) {
    return cloneFrozen({ classification: 'exact_match', candidates: [winner], reasons: ['all_identity_signals_match'] });
  }
  return cloneFrozen({
    classification: winner.source_overlap ? 'probable_match' : 'possible_match',
    candidates: [winner],
    reasons: [winner.source_overlap ? 'partial_identity_same_source' : 'partial_identity_cross_source']
  });
}

function assertHumanMergeAllowed(resolution) {
  if (!resolution || !MATCH_CLASSIFICATIONS.includes(resolution.classification)) {
    throw customerError('IDENTITY_RESOLUTION_INVALID');
  }
  if (resolution.classification !== 'exact_match') {
    throw customerError('IDENTITY_MERGE_REQUIRES_HUMAN_REVIEW', { classification: resolution.classification });
  }
  return true;
}

module.exports = {
  normalizedIdentity,
  identityKeys,
  resolveIdentity,
  assertHumanMergeAllowed
};

