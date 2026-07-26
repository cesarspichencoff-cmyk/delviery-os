'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCanonicalCatalogs, HASHES } = require('../../src/conversation-crm/native/catalogs');
const { DeterministicClock, DeterministicIds, SeededRandom, canonicalJson } = require('../../src/conversation-crm/native/deterministic');
const { validateGatewayInput, validateCapabilityRequest, validateDriverManifest } = require('../../src/conversation-crm/native/contracts');
const { FLAG_NAMES, loadFeatureFlags, validateFeatureFlags } = require('../../src/conversation-crm/native/feature-flags');

test('catálogos canônicos preservam hashes e contagens aprovadas', () => {
  const catalogs = loadCanonicalCatalogs();
  assert.equal(catalogs.capabilities.capabilities.length, 39);
  assert.equal(catalogs.intents.intents.length, 51);
  assert.equal(catalogs.scenarios.scenarios.length, 200);
  assert.equal(catalogs.placeholders.placeholders.length, 47);
  assert.equal(Object.keys(HASHES).length, 6);
  assert.equal(catalogs.scenarios.scenarios.every((scenario) => scenario.synthetic === true), true);
});

test('relógio, IDs e pseudoaleatório são determinísticos', () => {
  const a = new DeterministicClock('2026-07-01T12:00:00-03:00');
  const b = new DeterministicClock('2026-07-01T12:00:00-03:00');
  assert.equal(a.iso(), b.iso());
  assert.equal(a.advance(60_000), b.advance(60_000));
  const idsA = new DeterministicIds('TATA-SIM-V1');
  const idsB = new DeterministicIds('TATA-SIM-V1');
  assert.deepEqual([idsA.next('msg'), idsA.next('msg')], [idsB.next('msg'), idsB.next('msg')]);
  const randomA = new SeededRandom('TATA-SIM-V1');
  const randomB = new SeededRandom('TATA-SIM-V1');
  assert.deepEqual([randomA.next(), randomA.next()], [randomB.next(), randomB.next()]);
  assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }));
});

test('flags padrão falham fechadas e flags simuladas nunca ativam driver real', () => {
  const disabled = loadFeatureFlags();
  assert.equal(FLAG_NAMES.every((name) => disabled.flags[name] === false), true);
  const simulator = loadFeatureFlags({ file: 'config/conversation-crm/native-flags.simulator.json' });
  assert.equal(simulator.environment, 'test');
  assert.equal(simulator.flags.simulatedDriversV1, true);
  assert.equal(simulator.flags.realDriversReadV1, false);
  assert.equal(simulator.flags.realDriversWriteV1, false);
});

test('configuração inválida ou driver real ativado é bloqueado', () => {
  const flags = Object.fromEntries(FLAG_NAMES.map((name) => [name, false]));
  flags.realDriversReadV1 = true;
  assert.throws(() => validateFeatureFlags({ schema_version: 'conversation-native-feature-flags-v1', environment: 'test', flags }), { code: 'REAL_DRIVER_FLAGS_PROHIBITED' });
});

test('contratos aceitam somente payload sintético completo', () => {
  const gateway = validateGatewayInput({ synthetic: true, content: 'Mensagem sintética', channel: 'synthetic', subject_id: 'SIM-SUBJECT-001', conversation_id: 'SIM-CONV-001', message_id: 'SIM-MSG-001', correlation_id: 'SIM-CORR-001', idempotency_key: 'msg:SIM-MSG-001', occurred_at: '2026-07-01T15:00:00.000Z', turn_order: 1 });
  assert.equal(gateway.synthetic, true);
  assert.throws(() => validateGatewayInput({ ...gateway, synthetic: false }), { code: 'REAL_DATA_NOT_ALLOWED' });
  const request = validateCapabilityRequest({ synthetic: true, request_id: 'SIM-REQ-001', capability_id: 'order.status.read', conversation_id: gateway.conversation_id, case_id: 'SIM-CASE-001', unit_id: 'SIM-UNIT-001', subject_id: gateway.subject_id, payload: {}, authority: 'A0', policy_id: 'POLICY-SIM-001', evidence_requirements: [], idempotency_key: 'cap:SIM-REQ-001', correlation_id: gateway.correlation_id, deadline: '2026-07-01T15:01:00.000Z' });
  assert.equal(request.capability_id, 'order.status.read');
});

test('manifesto de driver recusa modo real', () => {
  const base = { synthetic: true, id: 'simulated-order-driver', version: '1.0.0', type: 'order', capabilities: ['order.status.read'], read_mode: 'simulated', write_mode: 'simulated', availability: 'available', health: 'healthy', reversible: true, confirmation_mechanism: 'synthetic_event', timeout_ms: 100, retryable_operations: ['order.status.read'], risk_class: 'low', input_schema: 'deliveryos-capability-request-v1', output_schema: 'deliveryos-capability-result-v1' };
  assert.equal(validateDriverManifest(base).read_mode, 'simulated');
  assert.throws(() => validateDriverManifest({ ...base, read_mode: 'authorized' }), { code: 'REAL_DRIVER_MODE_PROHIBITED' });
});
