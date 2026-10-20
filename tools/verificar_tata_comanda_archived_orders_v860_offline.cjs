"use strict";
const assert=require("node:assert/strict");
const {replayArchivedTataOrders}=require("./tata_comanda_archived_orders_replay_v860_offline.cjs");
const r=replayArchivedTataOrders();
let n=0;
function test(name,fn){fn();n++;console.log("PASS "+n+" "+name);}
const find=id=>r.cases.find(x=>x.ifood===id);
test("eight distinct archived order identities",()=>{
 assert.equal(r.unique_archived_orders,8);
 assert.equal(new Set(r.cases.map(x=>x.ifood)).size,8);
});
test("three complete archived compositions, not eight",()=>{
 assert.equal(r.archived_orders_with_reconciled_product_lines,3);
 assert.equal(r.archived_orders_with_id_only,5);
});
test("nine independent archived lines",()=>{
 assert.equal(r.verified_product_lines_in_archived_sources,9);
});
test("sixteen sold item units across complete archives",()=>{
 assert.equal(r.verified_item_quantity_sum,16);
});
test("historical 9092 two products four units",()=>{
 assert.equal(find("9092").product_lines,2);
 assert.equal(find("9092").quantity_sum,4);
});
test("historical 9627 four products six units",()=>{
 assert.equal(find("9627").product_lines,4);
 assert.equal(find("9627").quantity_sum,6);
});
test("historical 8332 three products six units",()=>{
 assert.equal(find("8332").product_lines,3);
 assert.equal(find("8332").quantity_sum,6);
});
test("five ID-only cannot claim a complete order",()=>{
 for(const id of ["6086","7810","8342","3245","7253"]){
  const c=find(id);
  assert.equal(c.historical_content,"INSUFFICIENT_ORDER_ONLY");
  assert.equal(c.reconstructed_test_result,"NOT_RUN_NO_ITEMS");
  assert.equal(c.product_lines,null);
  assert.equal(c.operational_print_ready,false);
 }
});
test("all three hypothetical live-shape previews passed real projection code",()=>{
 assert.equal(r.hypothetical_previews_passed,3);
 assert.equal(r.hypothetical_previews_failed,0);
 for(const id of ["9092","9627","8332"])
  assert.equal(find(id).reconstructed_test_result,
    "ESSENTIAL_PREVIEW_PASS_SYNTHETIC_RECONSTRUCTION");
});
test("without actual sequence all reconstructed cases demand bind",()=>{
 for(const id of ["9092","9627","8332"]){
  const c=find(id);assert.equal(c.without_binding,"AUTHORIZED_ATOMIC_BIND_REQUIRED");
  assert.equal(c.real_sequence_binding_available,false);
 }
});
test("hypothetical TATA 001 always disclosed as synthetic not live",()=>{
 for(const id of ["9092","9627","8332"]){
  const c=find(id);assert.equal(c.synthetic_binding_for_preview_only,"001");
  assert.equal(c.operational_print_ready,false);
  assert.ok(c.preview_lines_hypothetical.some(x=>x.includes("TATA 001")));
 }
});
test("unknown packing defaults to A DEFINIR only",()=>{
 for(const id of ["9092","9627","8332"]){
  const l=find(id).preview_lines_hypothetical;
  for(const key of ["CAIXA","SACOLA","KIT"])
   assert.ok(l.includes(key+": A DEFINIR"));
  assert.ok(!l.some(x=>/^\\d+ X A DEFINIR/.test(x)));
 }
});
test("archived 9627 has only evidence of absent item observations",()=>{
 assert.equal(find("9627").coverage,
   "ITEM_NOTES_ABSENT_IN_ARCHIVED_SCAN_GENERAL_NOTE_EXCLUDED");
});
test("archived 9092 notes not independently proven empty",()=>{
 assert.equal(find("9092").coverage,
  "ITEMS_PRODUCTS_QTY_VALIDATED_NOT_OBSERVATIONS");
});
test("archived 8332 notes not independently proven empty",()=>{
 assert.equal(find("8332").coverage,
  "ITEMS_PRODUCTS_QTY_VALIDATED_NOT_ITEM_NOTE_SCAN");
});
test("historical 9092 & 9627 closed, no reinterpretation as live",()=>{
 assert.equal(find("9092").historical_order_status,"X");
 assert.equal(find("9627").historical_order_status,"X");
});
test("reconstructed statuses are never represented as originals",()=>{
 for(const id of ["9092","9627","8332"])
  assert.equal(find(id).original_v2_pair_available,false);
});
test("only source real metadata names, no customer note texts leaked",()=>{
 assert.ok(r.sources.every(x=>x.startsWith("data/")));
 assert.ok(!JSON.stringify(r).includes("PAGO ONLINE"));
});
test("no actual orders printed, no state consumed",()=>{
 assert.equal(r.production_prints,0);
 assert.equal(r.sequence_writes,0);
 assert.equal(r.host_accesses,0);
});
test("synthetic output clearly not physical proof",()=>{
 assert.equal(r.status,"OFFLINE_SYNTHETIC_REPLAY_ONLY_NO_LIVE_OR_PRINT_PROOF");
 assert.equal(r.actual_reader_v2_raw_envelopes_available,0);
 assert.equal(r.real_persisted_sequence_bindings_in_archived_orders_proven,0);
});
console.log("TATA_COMANDA_ARCHIVED_REPLAY_V860="+n+"/"+n+
 " 8_ARCHIVED_3_RECONSTRUCTED_5_ID_ONLY_NO_PRINT_NO_HOST");
