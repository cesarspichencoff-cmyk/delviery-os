'use strict';

const { ZERO_EXTERNAL_COST_POLICY, evaluateCostPolicy } = require('../../../../apps/deliveryos-ai-node/dialogue/product-context-contracts');

function evaluatePublicationGate(input = {}) {
  const shadowMode = input.shadow_mode !== false;
  const costPolicy = input.cost_policy || ZERO_EXTERNAL_COST_POLICY;
  const cost = evaluateCostPolicy(costPolicy);
  const localChannel = String(input.channel || 'local_simulator') === 'local_simulator';
  const externalRequested = input.external_publication === true || input.external_action === true;
  const gate = {
    FINANCIAL_MODE: 'ZERO_EXTERNAL_COST',
    MAX_EXTERNAL_SPEND_BRL: 0,
    EXTERNAL_ACTION_ALLOWED: false,
    CHANNEL_AUTHORIZED: localChannel && !externalRequested,
    COST_AUTHORIZED: cost.allowed,
    SHADOW_MODE: shadowMode,
    LOCAL_PREVIEW_ALLOWED: localChannel && cost.allowed,
    EXTERNAL_PUBLICATION_ALLOWED: false,
    reasons: []
  };
  if (!localChannel) gate.reasons.push('LOCAL_SIMULATOR_CHANNEL_REQUIRED');
  if (!cost.allowed) gate.reasons.push(...cost.reasons);
  if (externalRequested) gate.reasons.push('EXTERNAL_ACTION_BLOCKED');
  if (!shadowMode) gate.reasons.push('SHADOW_MODE_REQUIRED');
  return Object.freeze({ ...gate, reasons: Object.freeze([...new Set(gate.reasons)]) });
}

module.exports = { evaluatePublicationGate };
