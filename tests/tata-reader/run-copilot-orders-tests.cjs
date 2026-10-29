'use strict';
const assert = require('node:assert/strict');
const { projectTataOrdersForCopilotV1: project } = require('../../runtime/reporting/copiloto_tata_orders_v1.cjs');
function record(overrides = {}) {
  return { source_mode: 'control', identity: { unit_id: 'SOURCE-LAB', store_id: 'S1',
    nr_venda_rest: 'V1', nr_comanda: 'C1', origin: 'DLV_IFO', order_status: 'X',
    opened_at: '2026-10-26T19:00:00Z', snapshot_hash: 'synthetic-hash',
    customer_name: 'PRIVATE_SENTINEL', customer_phone: 'PRIVATE_SENTINEL' },
    revision: { source_observed_at: '2026-10-26T19:01:00Z', envelope_recorded_at: '2026-10-26T19:02:00Z' },
    items: [{ product_code: 'P1', quantity: 2, observation: 'PRIVATE_SENTINEL' }],
    lifecycle: { kds_started_at: '2026-10-26T19:00:10Z', kds_finished_at: '2026-10-26T19:01:00Z' },
    financial: { receipts: [{ code: 'CARD', label: 'PRIVATE_SENTINEL', amount_brl: 20 }] },
    raw_customer_payload: 'PRIVATE_SENTINEL', latitude: -23, ...overrides };
}
function read(revisions, extra = {}) { return project({ unitId: 'ITAIM', sourceUnitId: 'SOURCE-LAB',
  now: '2026-10-26T19:03:00Z', maxAgeMs: 180000, revisions, ...extra }); }
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS', name); }
test('motor output is scoped and does not leak customer, receipt or coordinates', () => {
  const r = read([record()]); assert.equal(r.orders[0].unit_id, 'ITAIM');
  assert.equal(r.orders[0].items[0].quantity, 2);
  assert.equal(JSON.stringify(r).includes('PRIVATE_SENTINEL'), false);
  assert.equal(JSON.stringify(r).includes('latitude'), false);
  assert.equal(r.live_source_verified, false); assert.equal(r.operational_order_total, null);
});
test('duplicates do not become two orders; late audit does not replace newer source', () => {
  const old = record({ revision: { source_observed_at: '2026-10-26T19:00:00Z', envelope_recorded_at: '2026-10-27T19:00:00Z' },
    items: [{ product_code: 'OLD', quantity: 99 }] });
  const r = read([record(), old, record()]); assert.equal(r.observed_order_records, 1);
  assert.equal(r.orders[0].items[0].quantity, 2);
  assert.deepEqual(r, read([old, record(), record()]));
});
test('same source time with different facts is conflict independent of input order', () => {
  const changed = record({ items: [{ product_code: 'OTHER', quantity: 8 }] });
  const a = read([record(), changed]); assert.equal(a.orders[0].state, 'conflict');
  assert.deepEqual(a.orders[0].items, []); assert.equal(a.orders[0].snapshot_ref, null);
  assert.deepEqual(a, read([changed, record()]));
});
test('source modes, stores and opening dates do not silently merge', () => {
  const b = record(); const rows = [b, record({ source_mode: 'simulated' }),
    record({ identity: { ...b.identity, store_id: 'S2' } }),
    record({ identity: { ...b.identity, opened_at: '2026-10-25T19:00:00Z' } })];
  assert.equal(read(rows).observed_order_records, 4);
});
test('other units are excluded before interpreting their incomplete payload', () => {
  assert.equal(read([record(), { identity: { unit_id: 'OTHER' } }]).observed_order_records, 1);
  assert.throws(() => read([{ items: [] }]), /SOURCE_UNIT_REQUIRED/);
  assert.throws(() => read([record({ source_mode: undefined })]), /EXPLICIT_SOURCE_MODE/);
});
test('unavailable and empty are distinct and neither means zero active orders', () => {
  assert.equal(read(null).observed_order_records, null);
  assert.equal(read([]).state, 'no_evidence'); assert.equal(read([]).operational_order_total, null);
});
test('old and future source timestamps cannot appear current', () => {
  assert.equal(read([record()], { now: '2026-10-27T19:03:00Z' }).orders[0].state, 'stale');
  assert.equal(read([record()], { now: '2026-10-26T19:00:00Z' }).orders[0].state, 'future_timestamp');
});
test('KDS never asserts dispatch, delivery, production timing or association with GPS', () => {
  const o = read([record()]).orders[0]; assert.equal(o.kds_cycle.semantics, 'LOCAL_KDS_CYCLE');
  for (const key of ['ready_for_dispatch','delivered','trip_id','production_time_minutes','delivery_time_minutes'])
    assert.equal(o[key], null);
});
test('mapping, clock, freshness and memory budget fail closed', () => {
  assert.throws(() => read([], { sourceUnitId: '' }), /MAPPING_REQUIRED/);
  assert.throws(() => read([], { now: 'invalid' }), /FRESHNESS/);
  assert.throws(() => read([], { maxAgeMs: 0 }), /FRESHNESS/);
  assert.throws(() => read(new Array(10001)), /BOUNDED/);
});
console.log(`COPILOT_TATA_ORDERS_PASS ${passed}`);
