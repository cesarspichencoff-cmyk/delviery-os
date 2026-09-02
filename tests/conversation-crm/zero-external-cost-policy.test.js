'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ZERO_EXTERNAL_COST_POLICY,
  validateCostPolicyContext,
  evaluateCostPolicy,
  evaluateWhatsAppPolicy
} = require('../../apps/deliveryos-ai-node');
const { buildApprovedResponseEnvelope } = require('../../src/conversation-crm/native');

function cost(overrides = {}) { return { ...ZERO_EXTERNAL_COST_POLICY, evidence: [...ZERO_EXTERNAL_COST_POLICY.evidence], unknowns: [], ...overrides }; }
function channel(overrides = {}) {
  return {
    schema_version: 'deliveryos-channel-policy-context-v1', channel: 'whatsapp_official', official_provider: true,
    sending_allowed: true, initiation: 'customer_initiated', consent_status: 'present', blocked_message_classes: [], unknowns: [],
    ...overrides
  };
}
function plan(overrides = {}) {
  return {
    direct_answer: [], explanation_needed: [], direction: [], verified_actions: [], mandatory_questions: [],
    tone_profile: 'tata_warm', gravity: 'informational', known_facts: [], new_facts: [], prohibited_claims: [],
    authorized_surface: { links: [], numbers: [] }, length: 'short', ...overrides
  };
}

test('01 política canônica declara custo externo máximo zero', () => {
  assert.equal(ZERO_EXTERNAL_COST_POLICY.financial_mode, 'ZERO_EXTERNAL_COST');
  assert.equal(ZERO_EXTERNAL_COST_POLICY.maximum_external_spend, 0);
});
test('02 política gratuita verificada é aceita', () => assert.equal(validateCostPolicyContext(cost()).accepted, true));
test('03 política gratuita verificada passa o gate', () => assert.equal(evaluateCostPolicy(cost()).allowed, true));
test('04 política ausente falha fechada', () => assert.equal(evaluateCostPolicy(null).reasons[0], 'COST_POLICY_MISSING'));
test('05 custo desconhecido é bloqueado', () => assert.equal(evaluateCostPolicy(cost({ verification_status: 'unknown' })).allowed, false));
test('06 serviço potencialmente tarifado é bloqueado', () => assert.equal(evaluateCostPolicy(cost({ verification_status: 'potentially_billable' })).allowed, false));
test('07 custo positivo é bloqueado', () => assert.ok(evaluateCostPolicy(cost({ estimated_external_cost: 0.01 })).reasons.includes('EXTERNAL_COST_ABOVE_ZERO')));
test('08 gatilho de cobrança é bloqueado', () => assert.ok(evaluateCostPolicy(cost({ billing_trigger_present: true })).reasons.includes('BILLING_TRIGGER_PRESENT')));
test('09 trial com cobrança automática é bloqueado', () => assert.ok(evaluateCostPolicy(cost({ trial_with_auto_billing: true })).reasons.includes('AUTO_BILLING_TRIAL_FORBIDDEN')));
test('10 provedor externo com risco de custo é bloqueado', () => assert.ok(evaluateCostPolicy(cost({ external_provider_required: true })).reasons.includes('EXTERNAL_PROVIDER_COST_RISK')));
test('11 desconhecidos financeiros impedem execução', () => assert.ok(evaluateCostPolicy(cost({ unknowns: ['provider_fee'] })).reasons.includes('COST_UNKNOWNS_PRESENT')));
test('12 WhatsApp oficial iniciado pelo cliente pode passar apenas com custo zero verificado', () => assert.equal(evaluateWhatsAppPolicy(channel(), cost()).allowed, true));
test('13 provedor não oficial é sempre bloqueado', () => assert.ok(evaluateWhatsAppPolicy(channel({ official_provider: false }), cost()).reasons.includes('UNOFFICIAL_PROVIDER_FORBIDDEN')));
test('14 mensagem iniciada pela empresa é bloqueada no modo custo zero', () => assert.ok(evaluateWhatsAppPolicy(channel({ initiation: 'business_initiated' }), cost()).reasons.includes('BUSINESS_INITIATED_BLOCKED_ZERO_COST')));
test('15 envelope remove ação externa quando a política financeira bloqueia', () => {
  const envelope = buildApprovedResponseEnvelope({ plan: plan({ verified_actions: ['whatsapp.message.send'] }), cost_policy: cost({ verification_status: 'unknown' }) });
  assert.equal(envelope.action_truth, null);
  assert.ok(envelope.prohibited_claims.includes('executar_acao_com_custo_externo'));
});
