"use strict";
/**
 * TATÁ Comanda V8.60 — replay of ALL eight distinct order references in the
 * pinned historical batch (05-Oct/03-Oct archived evidence). NO host data.
 * Historical projections are reconstructed/simulated and must never be
 * described as the original V2 Reader events or legitimate TATA bindings.
 */
const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");
const {projectReaderEssentials,snapshotHash,decisionHash}=
 require("./tata_comanda_reader_native_essentials_v857_offline.cjs");
const {inspectTataSequencePreflight}=
 require("./tata_comanda_sequence_preflight_v858_offline.cjs");
const ROOT=path.join(__dirname,"..","data");
const file=name=>JSON.parse(fs.readFileSync(path.join(ROOT,name),"utf8"));
const UNKNOWN="A DEFINIR";
const normalize=x=>String(x).trim().normalize("NFD")
 .replace(/[\u0300-\u036f]/g,"").toUpperCase();
const toCanon=x=>{
 const v=String(x??"").replace(/\./g,"");
 assert.match(v,/^[0-9]{10}$/);
 return v.slice(0,1)+"."+v.slice(1,3)+"."+v.slice(3,5)+"."+
  v.slice(5,8)+"."+v.slice(8,10);
};
function qty(q){assert.match(String(q),/^[1-9][0-9]*(?:\.0+)?$/);
 const n=Number(q);assert.ok(Number.isSafeInteger(n)&&n>0);return n;}
function identity(a,b){
 for(const k of ["CDFILIAL","CDLOJA","NRCOMANDA","NRVENDAREST","NRCOMANDAEXT"])
  assert.equal(a[k],b[k],"ARCHIVED_INDEPENDENT_IDENTITY_MISMATCH:"+k);
}
function extract(){
 const sources={};
 const read9092=file("tata_reader_real_read_success_20261003_v1.json");
 const id9092=file("tata_reader_real_order_identity_bridge_candidate_20261004_v1.json");
 const route9092=file("tata_reader_real_order_expected_route_direct_identity_20261004_v1.json");
 const r9092=read9092.observed_order;
 identity(r9092,route9092.order);
 assert.equal(id9092.real_order.NRCOMANDA,r9092.NRCOMANDA);
 const items9092=read9092.observed_items.map((raw,i)=>{
  const r=route9092.items.find(v=>v.sql_cdproduto===raw.CDPRODUTO);
  const n=id9092.items.find(v=>v.sql_cdproduto===raw.CDPRODUTO);
  assert.ok(r&&n,"9092 archived product crosswalk missing");
  assert.equal(qty(raw.QTPRODCOMVEN),qty(r.quantity));
  assert.equal(qty(raw.QTPRODCOMVEN),qty(n.quantity));
  assert.equal(toCanon(r.cdarvprod_raw),n.candidate_retail_canonical_code);
  return {NRPRODCOMVEN:raw.NRPRODCOMVEN,
   CDPRODUTO:raw.CDPRODUTO,CDARVPROD:r.cdarvprod_raw,
   name:n.normalized_name,quantity:qty(raw.QTPRODCOMVEN),
   historical_item_status:raw.IDSTPRCOMVEN};
 });
 sources["9092"]={order:r9092,items:items9092,independent_sources:3,
  coverage:"ITEMS_PRODUCTS_QTY_VALIDATED_NOT_OBSERVATIONS",
  source_files:["tata_reader_real_read_success_20261003_v1.json",
   "tata_reader_real_order_identity_bridge_candidate_20261004_v1.json",
   "tata_reader_real_order_expected_route_direct_identity_20261004_v1.json"]};
 const read9627=file("tata_reader_real_read_cdarvprod_success_20261005_v1.json");
 const route9627=file("tata_reader_real_order_expected_route_cdarvprod_20261005_v1.json");
 const replay9627=file("tata_reader_real_order_unified_replay_success_20261005_v2.json");
 const note9627=file("tata_reader_real_order_observation_sanitized_20261005_v1.json");
 const r9627=read9627.observed_order;identity(r9627,route9627.order);
 assert.equal(replay9627.order.NRCOMANDA,r9627.NRCOMANDA);
 const replayLines=replay9627.production.flatMap(p=>p.lines);
 const items9627=read9627.observed_items.map(raw=>{
  const r=route9627.items.find(v=>v.CDPRODUTO===raw.CDPRODUTO);
  const name=replayLines.filter(v=>v.product_code===toCanon(raw.CDARVPROD));
  assert.ok(r&&name.length===1,"9627 archived product identity ambiguous");
  assert.equal(r.CDARVPROD,raw.CDARVPROD);
  assert.equal(qty(raw.QTPRODCOMVEN),qty(r.quantity));
  assert.equal(qty(raw.QTPRODCOMVEN),name[0].quantity);
  const observations=note9627.item_observations.find(n=>n.CDPRODUTO===raw.CDPRODUTO);
  assert.ok(observations);
  assert.equal(observations.DSOBSDESCIT_present,false);
  assert.equal(observations.DSOBSPEDDIGCMD_present,false);
  assert.equal(observations.TXPRODCOMVEN_present,false);
  return {NRPRODCOMVEN:raw.NRPRODCOMVEN,CDPRODUTO:raw.CDPRODUTO,
   CDARVPROD:raw.CDARVPROD,name:name[0].product_name,
   quantity:qty(raw.QTPRODCOMVEN),
   historical_item_status:raw.IDSTPRCOMVEN};
 });
 sources["9627"]={order:r9627,items:items9627,independent_sources:4,
  coverage:"ITEM_NOTES_ABSENT_IN_ARCHIVED_SCAN_GENERAL_NOTE_EXCLUDED",
  source_files:["tata_reader_real_read_cdarvprod_success_20261005_v1.json",
   "tata_reader_real_order_expected_route_cdarvprod_20261005_v1.json",
   "tata_reader_real_order_unified_replay_success_20261005_v2.json",
   "tata_reader_real_order_observation_sanitized_20261005_v1.json"]};
 const raw8332=file("tata_reader_post_cutover_first_live_order_20261005_v1.json");
 const decision8332=file("tata_reader_post_cutover_first_live_order_shadow_decision_20261005_v1.json");
 const fiscal8332=file("native_fiscal_real_reconciliation_8332_20261005_v1.json");
 const r8332=raw8332.order;
 identity(r8332,decision8332.order);
 assert.equal(fiscal8332.order.NRCOMANDA,r8332.NRCOMANDA);
 assert.equal(fiscal8332.order.NRVENDAREST,r8332.NRVENDAREST);
 const items8332=r8332.items.map((raw,i)=>{
  const d=decision8332.routing.find(v=>v.canonical_code===raw.canonical);
  assert.ok(d&&d.name===raw.name&&d.quantity===raw.quantity);
  assert.equal(toCanon(raw.CDARVPROD_RAW),raw.canonical);
  return {NRPRODCOMVEN:String(i+1).padStart(6,"0"),
   CDPRODUTO:raw.CDPRODUTO,CDARVPROD:raw.CDARVPROD_RAW,
   name:raw.name,quantity:raw.quantity,
   historical_item_status:"NOT_ARCHIVED"};
 });
 sources["8332"]={order:r8332,items:items8332,independent_sources:3,
  coverage:"ITEMS_PRODUCTS_QTY_VALIDATED_NOT_ITEM_NOTE_SCAN",
  fiscal_linked:true,
  source_files:["tata_reader_post_cutover_first_live_order_20261005_v1.json",
   "tata_reader_post_cutover_first_live_order_shadow_decision_20261005_v1.json",
   "native_fiscal_real_reconciliation_8332_20261005_v1.json"]};
 const five=file("tata_reader_passive_log_candidate_orders_result_20261005_v1.json");
 assert.equal(five.orders.length,5,"EXACT_PINNED_PASSIVE_SAMPLE_EXPECTED");
 for(const o of five.orders){
  const short=o.NRCOMANDAEXT;
  assert.ok(!sources[short],"DUPLICATED_HISTORICAL_ORDER");
  sources[short]={order:o,items:null,independent_sources:1,
   coverage:"ORDER_IDENTIFIERS_ONLY_NO_ARCHIVED_ITEMS",
   source_files:["tata_reader_passive_log_candidate_orders_result_20261005_v1.json"]};
 }
 assert.equal(Object.keys(sources).length,8,"HISTORICAL_UNIQUE_ORDER_COUNT");
 return sources;
}
function simulateOne(entry){
 const {order:o,items}=entry;
 if(!items||!items.length){
  return {ifood:o.NRCOMANDAEXT,day:o.DTHRABERMESA.slice(0,10),
   historical_content:"INSUFFICIENT_ORDER_ONLY",
   product_lines:null,quantity_sum:null,
   missing:["PRODUCT_NAMES","ITEM_QUANTITIES","ITEM_OBSERVATIONS",
    "ORIGINAL_READER_V2_PAIR","PERSISTED_TATA_BINDING"],
   reconstructed_test_result:"NOT_RUN_NO_ITEMS",
   operational_print_ready:false};
 }
 const day=o.DTHRABERMESA.slice(0,10),orderKey=[
  o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].join("|");
 // SIMULATION ONLY: original archived statuses may be closed X/4, and no
 // original V2 event+decision snapshot or TATA binding was archived.
 // Reconstruct an imagined *new active* order using the EXACT historical
 // identifiers/products/quantities to exercise the production algorithm.
 const order={CDFILIAL:o.CDFILIAL,CDLOJA:o.CDLOJA,
  NRVENDAREST:o.NRVENDAREST,NRCOMANDA:o.NRCOMANDA,
  NRCOMANDAEXT:o.NRCOMANDAEXT,IDORGCMDVENDA:"DLV_IFO",
  IDSTCOMANDA:"A",DTHRABERMESA:o.DTHRABERMESA,
  items:items.map(v=>({NRPRODCOMVEN:v.NRPRODCOMVEN,
   CDPRODUTO:v.CDPRODUTO,CDARVPROD:v.CDARVPROD,
   QTPRODCOMVEN:v.quantity+".000",IDSTPRCOMVEN:"A"})),
  observation_scan_complete:true,observation_rows:[]};
 const hash=snapshotHash(order);
 const event={schema:"deliveryos.tata-reader-stable-order-event.v1",
  order_key:orderKey,snapshot_hash:hash,order,
  ready_for_downstream_shadow:false,blockers:["SIMULATED_HISTORICAL_REPLAY"],
  service_resolution:{service:null,evidence:"UNKNOWN",
   source_ref:null,blockers:["SIMULATED_HISTORICAL_REPLAY"]}};
 const decision={schema:"deliveryos.live-shadow-decision.v1",
  order_key:orderKey,snapshot_hash:hash,
  ifood_sequence:o.NRCOMANDAEXT,teknisa_sequence:o.NRCOMANDA,
  ready:false,blocking_reasons:["SIMULATED_HISTORICAL_REPLAY"],
  service:event.service_resolution,
  items:items.map((v,i)=>({item_index:i+1,CDPRODUTO:v.CDPRODUTO,
   canonical_code:toCanon(v.CDARVPROD),product_name:v.name,
   quantity:v.quantity,observations:[]})),
  order_observations:[],observation_scan_complete:true,
  packaging:{has_unknown:true,total_items:items.reduce((s,x)=>s+x.quantity,0)},
  kits:{status:"UNKNOWN"},sequence:{shadow_candidate:"001",binding_written:false}};
 decision.fingerprint=decisionHash(decision);
 const base={event,decision,sequence_state:{
  schema:"deliveryos.tata-sequence-state.v1",
  policy:{width:3,min_value:1,max_value:999},next_value:1,bindings:[]}};
 const requiresBinding=inspectTataSequencePreflight(base);
 assert.equal(requiresBinding.status,"AUTHORIZED_ATOMIC_BIND_REQUIRED",
  "HISTORICAL_ARCHIVED_CASE_NO_SEQUENCE_BINDING");
 const hypothetical={...base,sequence_state:{
  ...base.sequence_state,bindings:[{scope_id:"STORE:"+o.CDFILIAL+"|DATE:"+day,
   teknisa_order_id:o.NRCOMANDA,tata_sequence:"001"}]}};
 const preview=projectReaderEssentials(hypothetical);
 assert.equal(preview.status,"SOURCE_NATIVE_ESSENTIAL_PREVIEW_HOLD");
 assert.equal(preview.ready_for_operational_print,false);
 assert.equal(preview.essential.items.length,items.length);
 assert.deepEqual(preview.essential.items.map(z=>z.quantity),items.map(z=>z.quantity));
 assert.ok(preview.preview_lines.some(s=>s.includes("IFOOD "+o.NRCOMANDAEXT)));
 assert.equal(preview.optional.caixa,null);
 assert.equal(preview.optional.sacola,null);
 assert.equal(preview.optional.kit,null);
 assert.equal(preview.motor_packaging_status,"NOT_EVALUATED");
 return {ifood:o.NRCOMANDAEXT,day,product_lines:items.length,
  quantity_sum:items.reduce((s,x)=>s+x.quantity,0),
  historical_content:"ARCHIVED_CONTENT_RECONCILED",
  coverage:entry.coverage,source_files:entry.source_files,
  historical_order_status:o.IDSTCOMANDA??"NOT_ARCHIVED",
  historical_item_statuses:[...new Set(items.map(x=>x.historical_item_status))],
  notes_reconstructed_as_empty_for_simulation_only:true,
  original_v2_pair_available:false,
  real_sequence_binding_available:false,
  synthetic_binding_for_preview_only:"001",
  without_binding:"AUTHORIZED_ATOMIC_BIND_REQUIRED",
  reconstructed_test_result:"ESSENTIAL_PREVIEW_PASS_SYNTHETIC_RECONSTRUCTION",
  packaging_motor_not_evaluated_in_historical_reconstruction:true,
  preview_lines_hypothetical:preview.preview_lines,
  operational_print_ready:false};
}
function replayArchivedTataOrders(){
 const all=extract();
 const cases=Object.values(all).map(simulateOne);
 const full=cases.filter(x=>x.historical_content==="ARCHIVED_CONTENT_RECONCILED");
 const partial=cases.filter(x=>x.historical_content==="INSUFFICIENT_ORDER_ONLY");
 const distinct=new Set(cases.map(x=>x.ifood));
 assert.equal(distinct.size,8);
 assert.equal(full.length,3);assert.equal(partial.length,5);
 assert.equal(full.reduce((n,x)=>n+x.product_lines,0),9);
 assert.equal(full.reduce((n,x)=>n+x.quantity_sum,0),16);
 return {schema:"tata.comanda.archived-real-order-replay.v860",
  status:"OFFLINE_SYNTHETIC_REPLAY_ONLY_NO_LIVE_OR_PRINT_PROOF",
  unique_archived_orders:8,archived_orders_with_reconciled_product_lines:3,
  archived_orders_with_id_only:5,verified_product_lines_in_archived_sources:9,
  verified_item_quantity_sum:16,
  actual_reader_v2_raw_envelopes_available:0,
  real_persisted_sequence_bindings_in_archived_orders_proven:0,
  hypothetical_previews_passed:full.length,
  hypothetical_previews_failed:0,
  production_prints:0,sequence_writes:0,host_accesses:0,
  sources:["data/tata_reader_real_read_success_20261003_v1.json",
   "data/tata_reader_real_order_identity_bridge_candidate_20261004_v1.json",
   "data/tata_reader_real_order_expected_route_direct_identity_20261004_v1.json",
   "data/tata_reader_real_read_cdarvprod_success_20261005_v1.json",
   "data/tata_reader_real_order_expected_route_cdarvprod_20261005_v1.json",
   "data/tata_reader_real_order_unified_replay_success_20261005_v2.json",
   "data/tata_reader_real_order_observation_sanitized_20261005_v1.json",
   "data/tata_reader_post_cutover_first_live_order_20261005_v1.json",
   "data/tata_reader_post_cutover_first_live_order_shadow_decision_20261005_v1.json",
   "data/native_fiscal_real_reconciliation_8332_20261005_v1.json",
   "data/tata_reader_passive_log_candidate_orders_result_20261005_v1.json"],
  cases};
}
if(require.main===module){
 const report=replayArchivedTataOrders();
 // CI logs intentionally omit any order IDs, order texts, notes and previews.
 console.log("TATA_COMANDA_ARCHIVED_V860="+report.unique_archived_orders+
  " TOTAL | "+report.archived_orders_with_reconciled_product_lines+
  " RECONSTRUCTED | "+report.archived_orders_with_id_only+
  " ID_ONLY | "+report.verified_product_lines_in_archived_sources+
  " LINES | "+report.verified_item_quantity_sum+
  " QUANTITY | NO_PRINT NO_BIND NO_HOST");
}
module.exports={replayArchivedTataOrders};
