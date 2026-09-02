'use strict';

const { cloneFrozen } = require('./contracts');

function evaluateContactPermission(input = {}) {
  const purpose = input.purpose || 'service';
  const consentState = input.consent_state || 'unknown';
  const initiation = input.initiation || 'customer_initiated';
  const reasons = [];
  if (purpose === 'marketing' && consentState !== 'allowed') reasons.push('MARKETING_CONSENT_REQUIRED');
  if (['blocked', 'withdrawn', 'expired'].includes(consentState)) reasons.push('CONSENT_NOT_ACTIVE');
  if (purpose === 'marketing' && initiation !== 'customer_initiated' && input.cost_policy?.maximum_external_spend === 0) {
    reasons.push('BUSINESS_INITIATED_ZERO_COST_BLOCK');
  }
  return cloneFrozen({
    allowed: reasons.length === 0,
    purpose,
    consent_state: consentState,
    reasons: [...new Set(reasons)]
  });
}

module.exports = { evaluateContactPermission };

