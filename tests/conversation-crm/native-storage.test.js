'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DeterministicClock, DeterministicIds } = require('../../src/conversation-crm/native/deterministic');
const { loadFeatureFlags } = require('../../src/conversation-crm/native/feature-flags');
const { sanitize } = require('../../src/conversation-crm/native/privacy');
const { NativeEventStore } = require('../../src/conversation-crm/native/event-store');
const { ConversationGateway } = require('../../src/conversation-crm/native/gateway');
const { ConversationCrmV1 } = require('../../src/conversation-crm/native/crm');
const { HumanQueue } = require('../../src/conversation-crm/native/human-queue');

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-native-storage-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const clock = new DeterministicClock('2026-07-01T12:00:00-03:00');
  const ids = new DeterministicIds('TATA-SIM-V1');
  const flags = loadFeatureFlags({ file: 'config/conversation-crm/native-flags.simulator.json' });
  const store = new NativeEventStore({ runtimeRoot: root, clock });
  return { root, clock, ids, flags, store };
}

test('sanitização recursiva remove PII de objetos, arrays, URLs e erros', () => {
  const markers = ['marcador@example.test', '529.982.247-25', '(11) 99999-8877', 'SEGREDO-UNICO-XYZ'];
  const input = { payload: { customer_name: 'SEGREDO-UNICO-XYZ', items: [{ meta: { telefone: markers[2], note: `email ${markers[0]}` } }], url: 'https://user:pass@sub.example.test:8443/path?token=abcdef123456', error: `falha para ${markers[1]}` } };
  const result = sanitize(input);
  const output = JSON.stringify(result);
  assert.equal(result.detected, true);
  for (const marker of markers) assert.equal(output.includes(marker), false);
  assert.ok(result.removed_fields.some((field) => field.endsWith('customer_name')));
  assert.ok(result.removed_fields.some((field) => field.endsWith('telefone')));
});

test('event store sanitiza antes do append e não grava marcadores originais', (t) => {
  const { root, store } = setup(t);
  const markers = ['nested@example.test', '11988887777', 'TOKEN-ORIGINAL-123'];
  const result = store.append({ event_id: 'evt-1', idempotency_key: 'fact-1', type: 'test.accepted', payload: { nested: [{ email: markers[0], meta: { telefone: markers[1], token: markers[2] } }] } });
  assert.equal(result.status, 'accepted');
  const persisted = fs.readdirSync(root).map((name) => fs.readFileSync(path.join(root, name), 'utf8')).join('\n');
  for (const marker of markers) assert.equal(persisted.includes(marker), false);
});

test('deduplicação ocorre antes do append e divergência vai para quarentena', (t) => {
  const { root, store } = setup(t);
  const event = { event_id: 'evt-1', idempotency_key: 'fact-1', type: 'test.fact', payload: { state: 'one' } };
  assert.equal(store.append(event).status, 'accepted');
  assert.equal(store.append(event).status, 'duplicate');
  const eventLines = fs.readFileSync(path.join(root, 'conversation-native-events.runtime.jsonl'), 'utf8').trim().split(/\r?\n/);
  assert.equal(eventLines.length, 1);
  assert.equal(store.append({ ...event, payload: { state: 'two' } }).status, 'quarantined');
  assert.equal(store.snapshot().events, 1);
  assert.equal(store.snapshot().quarantine, 1);
});

test('replay reconstrói índices e tolera linha JSONL corrompida sem interromper eventos válidos', (t) => {
  const { root, clock, store } = setup(t);
  store.append({ event_id: 'evt-1', idempotency_key: 'fact-1', type: 'test.fact', payload: { value: 1 } });
  fs.appendFileSync(path.join(root, 'conversation-native-events.runtime.jsonl'), '{corrupt\n');
  const restored = new NativeEventStore({ runtimeRoot: root, clock });
  assert.equal(restored.snapshot().events, 1);
  assert.equal(restored.snapshot().quarantine, 1);
  assert.equal(restored.append({ event_id: 'evt-2', idempotency_key: 'fact-1', type: 'test.fact', payload: { value: 1 } }).status, 'duplicate');
});

test('gateway valida, deduplica e projeta turnos fora de ordem', (t) => {
  const { store, clock, flags } = setup(t);
  const gateway = new ConversationGateway({ store, clock, flags });
  const base = { synthetic: true, message_type: 'text', channel: 'synthetic', subject_id: 'SIM-SUBJECT-001', conversation_id: 'SIM-CONV-001', correlation_id: 'SIM-CORR-001', occurred_at: clock.iso(), unit_id: 'SIM-UNIT-001' };
  gateway.receive({ ...base, message_id: 'SIM-MSG-002', idempotency_key: 'SIM-MSG-002', turn_order: 2, content: 'Segundo turno' });
  const first = gateway.receive({ ...base, message_id: 'SIM-MSG-001', idempotency_key: 'SIM-MSG-001', turn_order: 1, content: 'Primeiro turno' });
  assert.equal(first.out_of_order, true);
  assert.deepEqual(gateway.conversationMessages(base.conversation_id).map((message) => message.turn_order), [1,2]);
  assert.equal(gateway.receive({ ...base, message_id: 'SIM-MSG-001', idempotency_key: 'SIM-MSG-001', turn_order: 1, content: 'Primeiro turno' }).status, 'duplicate');
  assert.equal(store.eventsOfType('gateway.message_received').length, 2);
});

test('CRM preserva correção append-only e fila humana confirmada', (t) => {
  const { store, clock, flags, ids } = setup(t);
  const crm = new ConversationCrmV1({ store, clock, flags, ids });
  crm.openCase({ case_id: 'SIM-CASE-001', conversation_id: 'SIM-CONV-001', subject_id: 'SIM-SUBJECT-001' });
  crm.recordCorrection({ case_id: 'SIM-CASE-001', field: 'party_size', value: 9, revision: 1, provenance: 'provided' });
  crm.recordCorrection({ case_id: 'SIM-CASE-001', field: 'party_size', value: 10, revision: 2, provenance: 'provided' });
  const projection = crm.projectCase('SIM-CASE-001');
  assert.equal(projection.data.party_size.value, 10);
  assert.equal(projection.timeline.filter((event) => event.type === 'crm.data_corrected').length, 2);
  const queue = new HumanQueue({ store, clock, flags, ids });
  const handoff = queue.create({ case_id: 'SIM-CASE-001', conversation_id: 'SIM-CONV-001', escalation: 'E2', reason: 'missing_item', idempotency_key: 'handoff:SIM-CASE-001' });
  assert.equal(handoff.status, 'confirmed');
  assert.equal(queue.snapshot()[0].queue_id, 'Q_COMMERCIAL_OPS');
});
