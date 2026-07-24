'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CrmStore } = require('../../src/conversation-crm/crm');
const { deterministicOptions } = require('./helpers');

function setup() {
  const store = new CrmStore(deterministicOptions());
  const profile = store.createProfile({ tenant_id: 'tenant_a', provenance: 'synthetic' });
  return { store, profile };
}

test('cria perfil com ID interno e timeline append-only', () => {
  const { store, profile } = setup();
  const snapshot = store.snapshot('tenant_a', profile.profile_id);
  assert.equal(snapshot.profile.entity_type, 'CustomerProfile');
  assert.equal(snapshot.timeline.length, 1);
  assert.equal(snapshot.timeline[0].event_type, 'profile_created');
});

test('adiciona identidade somente por token', () => {
  const { store, profile } = setup();
  const identity = store.addIdentity({ tenant_id: 'tenant_a', profile_id: profile.profile_id, identity_type: 'phone_token', value_token: 'tel_synthetic_token', source: 'synthetic' });
  assert.equal(identity.entity_type, 'CustomerIdentity');
  assert.equal('phone' in identity, false);
});

test('adiciona referência de pedido tokenizada', () => {
  const { store, profile } = setup();
  const reference = store.addOrderReference({ tenant_id: 'tenant_a', profile_id: profile.profile_id, order_token: 'ord_synthetic_token', source: 'synthetic' });
  assert.equal(reference.entity_type, 'CustomerOrderReference');
});

test('cria ocorrência codificada', () => {
  const { store, profile } = setup();
  const occurrence = store.addOccurrence({ tenant_id: 'tenant_a', profile_id: profile.profile_id, intent: 'occurrence', origin: 'delivery', severity: 'medium', summary_code: 'synthetic_issue' });
  assert.equal(occurrence.entity_type, 'CustomerOccurrence');
  assert.equal(occurrence.status, 'open');
});

test('promessa sem autorização humana é bloqueada', () => {
  const { store, profile } = setup();
  const occurrence = store.addOccurrence({ tenant_id: 'tenant_a', profile_id: profile.profile_id, intent: 'prior_promise', origin: 'unknown', severity: 'high', summary_code: 'prior_promise' });
  assert.throws(() => store.addPromise({ tenant_id: 'tenant_a', profile_id: profile.profile_id, occurrence_id: occurrence.occurrence_id, promise_type: 'human_follow_up' }), { code: 'PROMESSA_EXIGE_AUTORIZACAO_HUMANA' });
});

test('promessa autorizada por humano é registrada', () => {
  const { store, profile } = setup();
  const occurrence = store.addOccurrence({ tenant_id: 'tenant_a', profile_id: profile.profile_id, intent: 'occurrence', origin: 'delivery', severity: 'medium', summary_code: 'synthetic_issue' });
  const promise = store.addPromise({ tenant_id: 'tenant_a', profile_id: profile.profile_id, occurrence_id: occurrence.occurrence_id, promise_type: 'human_follow_up', authorized_by_human_id: 'operator_synthetic' });
  assert.equal(promise.entity_type, 'CustomerPromise');
  assert.equal(promise.authorized_by_human_id, 'operator_synthetic');
});

test('benefício autorizado exige humano', () => {
  const { store, profile } = setup();
  assert.throws(() => store.addBenefit({ tenant_id: 'tenant_a', profile_id: profile.profile_id, benefit_type: 'synthetic_benefit', status: 'authorized' }), { code: 'BENEFICIO_EXIGE_AUTORIZACAO_HUMANA' });
});

test('benefício pendente não representa decisão financeira', () => {
  const { store, profile } = setup();
  const benefit = store.addBenefit({ tenant_id: 'tenant_a', profile_id: profile.profile_id, benefit_type: 'synthetic_benefit' });
  assert.equal(benefit.status, 'pending_human');
  assert.equal(benefit.authorized_by_human_id, null);
});

test('opt-out prevalece como consentimento mais recente', () => {
  const { store, profile } = setup();
  store.recordConsent({ tenant_id: 'tenant_a', profile_id: profile.profile_id, channel: 'all_marketing', status: 'unknown', source: 'synthetic' });
  store.recordConsent({ tenant_id: 'tenant_a', profile_id: profile.profile_id, channel: 'all_marketing', status: 'opt_out', source: 'explicit_request' });
  assert.equal(store.consentState('tenant_a', profile.profile_id, 'all_marketing'), 'opt_out');
});

test('timeline rejeita campo pessoal explícito', () => {
  const { store, profile } = setup();
  assert.throws(() => store.timeline('tenant_a', profile.profile_id, 'unsafe', { email: 'marker' }), { code: 'PAYLOAD_CAMPO_PROIBIDO' });
});

test('timeline rejeita conteúdo semelhante a contato', () => {
  const { store, profile } = setup();
  assert.throws(() => store.timeline('tenant_a', profile.profile_id, 'unsafe', { detail: 'marker@example.invalid' }), { code: 'PAYLOAD_PODE_CONTER_PII' });
});

test('isolamento impede leitura cruzada entre unidades', () => {
  const { store, profile } = setup();
  store.createProfile({ tenant_id: 'tenant_b', provenance: 'synthetic' });
  assert.throws(() => store.snapshot('tenant_b', profile.profile_id), { code: 'PROFILE_NAO_ENCONTRADO' });
});

test('snapshot é imutável', () => {
  const { store, profile } = setup();
  const snapshot = store.snapshot('tenant_a', profile.profile_id);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.throws(() => { snapshot.timeline.push({}); }, TypeError);
});

