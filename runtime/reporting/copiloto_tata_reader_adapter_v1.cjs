'use strict';

// Adapter for the installed reader's stable-order event. No IO or source mutation.
// The authenticated caller owns mapping/provenance approval; a string is not proof.
const {resolveNativeOpenedAt,explicitInstant}=require('./tata_source_time_v1.cjs');
const MODES = new Set(['real', 'simulated', 'control']);
function adaptStableTataOrderV1(event, scope) {
  const blocked = code => ({state: 'blocked', reason: code, revision: null});
  if (!scope || !['unitId','sourceUnitId','sourceStoreId','mappingEvidenceRef'].every(k =>
      typeof scope[k] === 'string' && scope[k].trim()) || !MODES.has(scope.sourceMode))
    return blocked('AUTHORIZED_SOURCE_MAPPING_REQUIRED');
  if (!event || event.schema !== 'deliveryos.tata-reader-stable-order-event.v1')
    return blocked('READER_EVENT_SCHEMA_INVALID');
  const order = event.order;
  if (!order || typeof order.CDFILIAL !== 'string' || typeof order.CDLOJA !== 'string')
    return blocked('READER_SCOPE_MISSING');
  if (order.CDFILIAL !== scope.sourceUnitId || order.CDLOJA !== scope.sourceStoreId)
    return {state: 'out_of_scope', reason: 'READER_SCOPE_MISMATCH', revision: null};
  const service = event.service_resolution;
  if (event.ready_for_downstream_shadow !== true || !Array.isArray(event.blockers) || event.blockers.length ||
      !service || !Array.isArray(service.blockers) || service.blockers.length ||
      !['LUNCH','DINNER'].includes(service.service) ||
      !['HUMAN_CONFIRMED_RULE','REAL_OBSERVED'].includes(service.evidence) ||
      typeof service.source_ref !== 'string' || !service.source_ref.trim())
    return blocked('READER_DOWNSTREAM_BLOCKED');
  const effects = event.effects;
  if (!effects || effects.database_read !== true ||
      ['database_write','network_call','odhen_write','print','spooler_write','fiscal_action','sefaz_call','cutover']
        .some(k => effects[k] !== false)) return blocked('READER_EFFECT_BOUNDARY_INVALID');
  const text = v => typeof v === 'string' && v.trim().length > 0;
  if (!explicitInstant(event.observed_at))return blocked('EXPLICIT_SOURCE_TIMEZONE_REQUIRED');
  const time=resolveNativeOpenedAt(order.DTHRABERMESA,scope);
  if(time.state!=='resolved')return blocked(time.reason);
  if (![order.NRVENDAREST,order.NRCOMANDA,order.IDORGCMDVENDA,event.snapshot_hash].every(text))
    return blocked('READER_IDENTITY_INVALID');
  if (!Array.isArray(order.items) || order.items.length === 0 || order.items.length > 5000)
    return blocked('READER_ITEMS_REQUIRED');
  const items = [];
  for (const item of order.items) {
    // Accept only explicit decimal syntax; no locale-dependent parseFloat truncation.
    const q = item?.QTPRODCOMVEN;
    if (!item || !text(item.CDPRODUTO) ||
        !((typeof q === 'number' && Number.isFinite(q)) ||
          (typeof q === 'string' && /^\d+(?:\.\d+)?$/.test(q))) || !Number.isFinite(Number(q)) || Number(q) < 0)
      return blocked('READER_ITEM_INVALID');
    items.push({line_no: text(item.NRPRODCOMVEN) ? item.NRPRODCOMVEN : String(items.length + 1),
      product_code: item.CDPRODUTO, route_code: text(item.CDARVPROD) ? item.CDARVPROD : null,
      quantity: Number(q)});
  }
  return {state: 'adapted', reason: null, time_resolution: time, revision: {
    source_mode: scope.sourceMode,
    identity: {unit_id: scope.sourceUnitId, store_id: scope.sourceStoreId,
      nr_venda_rest: order.NRVENDAREST, nr_comanda: order.NRCOMANDA,
      origin: order.IDORGCMDVENDA, order_status: text(order.IDSTCOMANDA) ? order.IDSTCOMANDA : null,
      opened_at: time.instant, snapshot_hash: event.snapshot_hash},
    revision: {source_observed_at: event.observed_at}, items,
    // Native item statuses and service selection do not imply readiness or KDS timestamps.
    lifecycle: {}, financial: {},
  }};
}
module.exports = {adaptStableTataOrderV1};
