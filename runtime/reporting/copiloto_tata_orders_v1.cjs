"use strict";

// Pure read model. Caller must authenticate and resolve the source-unit mapping.
// No SQL, watcher, command, recommendation or automatic order/trip association.
const { buildTataComandaOrderTruthV1, selectLatestTataComandaOrderTruthRevisionV1 } =
  require('./tata_comanda_order_truth_v1.cjs');
const MODES = new Set(['real', 'simulated', 'control']);

function projectTataOrdersForCopilotV1({ unitId, sourceUnitId, revisions, now, maxAgeMs }) {
  if (typeof unitId !== 'string' || !unitId.trim() || typeof sourceUnitId !== 'string' || !sourceUnitId.trim())
    throw Error('EXPLICIT_UNIT_MAPPING_REQUIRED');
  const clock = Date.parse(now);
  if (!Number.isFinite(clock) || !Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0)
    throw Error('EXPLICIT_FRESHNESS_POLICY_REQUIRED');
  const common = { schema: 'deliveryos.copiloto-tata-orders.v1', unit_id: unitId,
    source_unit_id: sourceUnitId, read_at: now, live_source_verified: false,
    operational_order_total: null, no_action_executed: true };
  if (revisions === null) return { ...common, state: 'unavailable', observed_order_records: null, orders: [] };
  if (!Array.isArray(revisions) || revisions.length > 10000) throw Error('BOUNDED_REVISION_ARRAY_REQUIRED');
  const groups = new Map();
  for (const input of revisions) {
    // Reject an ambiguous scope; ignore other units before decoding their payload.
    if (!input || typeof input.identity?.unit_id !== 'string') throw Error('SOURCE_UNIT_REQUIRED');
    if (input.identity.unit_id !== sourceUnitId) continue;
    if (!MODES.has(input.source_mode)) throw Error('EXPLICIT_SOURCE_MODE_REQUIRED');
    const truth = buildTataComandaOrderTruthV1(input);
    const key = JSON.stringify([input.source_mode, truth.identity.store_id,
      truth.identity.nr_venda_rest, truth.identity.nr_comanda, truth.identity.opened_at]);
    const list = groups.get(key) || [];
    list.push({ mode: input.source_mode, truth }); groups.set(key, list);
  }
  const orders = [];
  for (const list of groups.values()) {
    const latest = selectLatestTataComandaOrderTruthRevisionV1(list.map(r => r.truth));
    const sourceTime = Date.parse(latest.revision.source_observed_at);
    const sameTime = list.filter(r => Date.parse(r.truth.revision.source_observed_at) === sourceTime);
    // Audit recording time and input order cannot arbitrate conflicting source facts.
    const variants = new Set(sameTime.map(({ truth }) => JSON.stringify({
      identity: truth.identity, items: truth.items, lifecycle: truth.lifecycle, financial: truth.financial,
    })));
    const conflict = variants.size > 1;
    const state = conflict ? 'conflict' : sourceTime > clock ? 'future_timestamp'
      : clock - sourceTime > maxAgeMs ? 'stale' : 'observed';
    orders.push({ unit_id: unitId, source_unit_id: sourceUnitId, source_mode: list[0].mode,
      store_id: latest.identity.store_id, sale_ref: latest.identity.nr_venda_rest,
      order_ref: latest.identity.nr_comanda, opened_at: latest.identity.opened_at,
      source_observed_at: latest.revision.source_observed_at,
      snapshot_ref: conflict ? null : latest.identity.snapshot_hash,
      state, source_status: conflict ? null : latest.identity.order_status,
      items: conflict ? [] : latest.items.map(i => ({ product_code: i.product_code, quantity: i.quantity })),
      kds_cycle: conflict ? null : { state: latest.lifecycle.kds_cycle.state,
        semantics: latest.lifecycle.kds_cycle.semantics,
        started_at: latest.lifecycle.kds_cycle.started_at, finished_at: latest.lifecycle.kds_cycle.finished_at },
      ready_for_dispatch: null, delivered: null, trip_id: null,
      production_time_minutes: null, delivery_time_minutes: null });
  }
  orders.sort((a, b) => JSON.stringify([a.source_mode,a.store_id,a.sale_ref,a.order_ref,a.opened_at])
    .localeCompare(JSON.stringify([b.source_mode,b.store_id,b.sale_ref,b.order_ref,b.opened_at])));
  return { ...common, state: orders.length ? 'observed_records' : 'no_evidence',
    observed_order_records: orders.length, orders };
}

module.exports = { projectTataOrdersForCopilotV1 };
