'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  CustomerIntelligenceStore,
  normalizedIdentity,
  resolveIdentity,
  assertHumanMergeAllowed,
  evaluateContactPermission,
  CustomerImportPipeline
} = require('../../src/conversation-crm/customer-intelligence');

const SECRET = 'synthetic-customer-intelligence-secret-v1';
const clock = () => new Date('2026-07-01T15:00:00.000Z');

function setup() {
  return new CustomerIntelligenceStore({ clock });
}

function phoneIdentity(index = 1, source = 'neemo') {
  return normalizedIdentity({ type: 'phone', value: `1199000${String(index).padStart(4, '0')}`, source }, { secret: SECRET });
}

test('cliente desconhecido pode existir sem identidade e sem bloquear atendimento', () => {
  const store = setup();
  const customer = store.createCustomer({ customer_id: 'SIM-CUSTOMER-UNKNOWN', provenance: 'synthetic' });
  assert.equal(customer.identities.length, 0);
  assert.equal(store.consentState(customer.customer_id, 'all_marketing'), 'unknown');
});

test('telefone normalizado encontra identidade única sem expor o número', () => {
  const store = setup();
  const customer = store.createCustomer({ customer_id: 'SIM-CUSTOMER-001', provenance: 'synthetic' });
  const identity = phoneIdentity(1);
  store.addIdentity(customer.customer_id, identity);
  const matches = store.findByIdentity(identity);
  assert.equal(matches.length, 1);
  assert.equal(JSON.stringify(matches).includes('11990000001'), false);
});

test('uma identidade presente em dois clientes resulta em conflict', () => {
  const store = setup();
  const identity = phoneIdentity(2);
  for (const id of ['SIM-CUSTOMER-A', 'SIM-CUSTOMER-B']) {
    store.createCustomer({ customer_id: id, provenance: 'synthetic' });
    store.addIdentity(id, identity);
  }
  const resolution = resolveIdentity({ identities: [identity], candidates: store.findByIdentity(identity) });
  assert.equal(resolution.classification, 'conflict');
  assert.throws(() => assertHumanMergeAllowed(resolution), { code: 'IDENTITY_MERGE_REQUIRES_HUMAN_REVIEW' });
});

test('fontes diferentes permanecem na ficha', () => {
  const store = setup();
  store.createCustomer({ customer_id: 'SIM-CUSTOMER-SOURCES', provenance: 'synthetic' });
  store.addIdentity('SIM-CUSTOMER-SOURCES', phoneIdentity(3, 'neemo'));
  store.addIdentity('SIM-CUSTOMER-SOURCES', phoneIdentity(3, 'get_in'));
  assert.deepEqual(store.customer('SIM-CUSTOMER-SOURCES').identities.map((item) => item.source), ['neemo', 'get_in']);
});

test('preferência inferida nunca vira confirmada por flag', () => {
  const store = setup();
  store.createCustomer({ customer_id: 'SIM-CUSTOMER-FACT', provenance: 'synthetic' });
  assert.throws(() => store.recordFact('SIM-CUSTOMER-FACT', {
    field: 'preferred_item', value: 'SIM-ITEM', state: 'inferred', confirmed: true, source: 'system'
  }), { code: 'INFERENCE_CANNOT_BE_CONFIRMED' });
});

test('alergia declarada é preservada separadamente', () => {
  const store = setup();
  store.createCustomer({ customer_id: 'SIM-CUSTOMER-ALLERGY', provenance: 'synthetic' });
  const restriction = store.recordRestriction('SIM-CUSTOMER-ALLERGY', {
    type: 'allergy', value: 'crustacean', source: 'conversation'
  });
  assert.equal(restriction.status, 'declared');
  assert.equal(store.customer('SIM-CUSTOMER-ALLERGY').restrictions.length, 1);
});

test('opt-out prevalece e atendimento não depende de marketing', () => {
  const store = setup();
  store.createCustomer({ customer_id: 'SIM-CUSTOMER-CONSENT', provenance: 'synthetic' });
  store.recordConsent('SIM-CUSTOMER-CONSENT', {
    purpose: 'all_marketing', channel: 'all', state: 'allowed', source: 'synthetic'
  });
  store.recordConsent('SIM-CUSTOMER-CONSENT', {
    purpose: 'all_marketing', channel: 'all', state: 'withdrawn', source: 'customer_request'
  });
  assert.equal(store.consentState('SIM-CUSTOMER-CONSENT', 'all_marketing'), 'withdrawn');
  assert.equal(evaluateContactPermission({ purpose: 'marketing', consent_state: 'withdrawn' }).allowed, false);
  assert.equal(evaluateContactPermission({ purpose: 'service', consent_state: 'unknown' }).allowed, true);
});

test('histórico de pedido não autoriza marketing', () => {
  const store = setup();
  store.createCustomer({ customer_id: 'SIM-CUSTOMER-ORDER', provenance: 'synthetic' });
  store.recordRelated('SIM-CUSTOMER-ORDER', 'orders', { order_id: 'SIM-ORDER-001', source: 'synthetic' });
  assert.equal(store.consentState('SIM-CUSTOMER-ORDER', 'all_marketing'), 'unknown');
});

test('auditoria redige PII em profundidade', () => {
  const store = setup();
  store.createCustomer({ customer_id: 'SIM-CUSTOMER-PII', provenance: 'synthetic' });
  store.recordRelated('SIM-CUSTOMER-PII', 'notes', {
    detail: { contact: { email: 'marker@example.invalid', telefone: '11999999999' } }
  });
  const serialized = JSON.stringify(store.auditLog());
  assert.equal(serialized.includes('marker@example.invalid'), false);
  assert.equal(serialized.includes('11999999999'), false);
});

test('projeção pode ser reconstruída por hash de eventos', () => {
  const store = setup();
  store.createCustomer({ customer_id: 'SIM-CUSTOMER-REBUILD', provenance: 'synthetic' });
  const before = store.rebuild();
  const after = store.rebuild(store.auditLog());
  assert.deepEqual(after, before);
});

test('pipeline CSV exige prévia e aprovação humana', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-customer-import-'));
  try {
    const file = path.join(root, 'synthetic.csv');
    fs.writeFileSync(file, 'telefone,email,unidade,pedidos\n11990000011,synthetic11@example.invalid,SIM-UNIT,2\n', 'utf8');
    const store = setup();
    const pipeline = new CustomerImportPipeline({ store, secret: SECRET });
    const preview = pipeline.stage({ file_path: file, source: 'generic' });
    assert.equal(preview.preview.valid, 1);
    assert.equal(preview.state, 'previewed');
    assert.throws(() => pipeline.apply(preview.batch_id), { code: 'IMPORT_NOT_APPROVED' });
    pipeline.approve(preview.batch_id, { approved_by_human: 'SIM-OPERATOR' });
    const imported = pipeline.apply(preview.batch_id);
    assert.equal(imported.state, 'imported');
    assert.equal(store.list().length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('reenvio do mesmo arquivo é idempotente', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-customer-idempotency-'));
  try {
    const file = path.join(root, 'synthetic.csv');
    fs.writeFileSync(file, 'telefone,email\n11990000012,synthetic12@example.invalid\n', 'utf8');
    const pipeline = new CustomerImportPipeline({ store: setup(), secret: SECRET });
    const first = pipeline.stage({ file_path: file, source: 'neemo' });
    const second = pipeline.stage({ file_path: file, source: 'neemo' });
    assert.equal(second.batch_id, first.batch_id);
    assert.equal(second.duplicate_upload, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rollback por lote preserva dados anteriores', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-customer-rollback-'));
  try {
    const file = path.join(root, 'synthetic.csv');
    fs.writeFileSync(file, 'telefone,email\n11990000013,synthetic13@example.invalid\n', 'utf8');
    const store = setup();
    store.createCustomer({ customer_id: 'SIM-PRIOR', provenance: 'synthetic' });
    const pipeline = new CustomerImportPipeline({ store, secret: SECRET });
    const batch = pipeline.stage({ file_path: file, source: 'tagme' });
    pipeline.approve(batch.batch_id, { approved_by_human: 'SIM-OPERATOR' });
    pipeline.apply(batch.batch_id);
    const rolled = pipeline.rollback(batch.batch_id, { approved_by_human: 'SIM-OPERATOR' });
    assert.equal(rolled.rollback.preserves_prior_data, true);
    assert.equal(rolled.rollback.compensating_events_recorded, true);
    assert.ok(store.list().some((item) => item.customer_id === 'SIM-PRIOR'));
    assert.equal(store.customer('SIM-PRIOR').status, 'active');
    assert.equal(store.list().filter((item) => item.customer_id !== 'SIM-PRIOR').every((item) => item.status === 'rolled_back'), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('arquivo XLSX sintético usa adapter versionado', (t) => {
  const XLSX = require('xlsx');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-customer-xlsx-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'synthetic.xlsx');
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
    { telefone: '11990000014', email: 'synthetic14@example.invalid' }
  ]), 'Clientes');
  XLSX.writeFile(workbook, file);
  const pipeline = new CustomerImportPipeline({ store: setup(), secret: SECRET });
  const batch = pipeline.stage({ file_path: file, source: 'ifood_history', adapter_version: 'v1' });
  assert.equal(batch.format, 'xlsx');
  assert.equal(batch.adapter_version, 'v1');
});
