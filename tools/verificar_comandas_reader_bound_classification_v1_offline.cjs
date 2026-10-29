"use strict";
const assert=require("node:assert/strict");
const {syntheticReaderPairV857:fixture}=
 require("./verificar_tata_comanda_reader_native_v857_offline.cjs");
const {snapshotHash,decisionHash}=
 require("./tata_comanda_reader_native_essentials_v857_offline.cjs");
const {SCHEMA,EFFECTS,bindNativeReview:bind}=
 require("./comandas_reader_bound_classification_v1_offline.cjs");
const {bridgeCurrentPackagingV63,PACKAGING_SOURCE_BLOB_V63:BLOB}=
 require("../dist/src/production/currentPackagingBridgeV63.js");
let n=0;
const test=(label,fn)=>{fn();console.log("PASS "+(++n)+" "+label)};
const refresh=p=>{
 p.event.snapshot_hash=snapshotHash(p.event.order);
 p.decision.snapshot_hash=p.event.snapshot_hash;
 p.decision.fingerprint=decisionHash(p.decision);
};
function sample(){
 const pair=fixture();
 pair.event.order.IDSTCOMANDA="3";
 pair.event.order.items.forEach(x=>x.IDSTPRCOMVEN="4");
 refresh(pair);
 const claims=pair.decision.items.map((x,i)=>({
  source_item_index:i,product_code:x.canonical_code,
  product_name:x.product_name,quantity:x.quantity,
  family:"dupla",station:"sushi",review_required:false,
  review_source_ref:"SELF_DECLARED_SYNTHETIC_ONLY"
 }));
 return {pair,claims};
}
function call(d,blob=BLOB){
 const before=JSON.stringify(d);
 const out=bind(d.pair,d.claims,blob);
 assert.equal(JSON.stringify(d),before);
 assert.equal(out.schema,SCHEMA);assert.deepEqual(out.effects,EFFECTS);
 for(const k of ["independent_source_attested","classification_approved",
  "packaging_approved","first_native_dispatch_proven","production_ready",
  "print_authorized"])assert.equal(out[k],false,k);
 if(out.review)
  assert.ok(out.review.entries.every(x=>x.station_proof==="UNKNOWN"));
 return out;
}
function held(name,mut,expected){
 test(name,()=>{const d=sample();mut(d);const out=call(d);
  assert.equal(out.status,"HOLD");
  assert.ok(out.reasons.includes(expected),out.reasons.join(","));
  assert.equal(out.review,null);
 });
}
test("synthetic Reader V2 exact revision binds two code-index-quantity claims ONLY for review",()=>{
 const out=call(sample());assert.equal(out.status,"REVIEW_CANDIDATE_ONLY");
 assert.equal(out.item_count,2);
 assert.equal(out.native_pair_self_consistency_checked,true);
 assert.equal(out.exact_native_items_bound,true);
});
test("bound review cannot invoke motor to infer boxes and kits",()=>{
 const out=call(sample());let calls=0;
 const motor={packComanda(){calls++;throw Error("never");},
  kitVerdict(){calls++;throw Error("never");}};
 const sources=out.review.entries.map((x,i)=>({
  item_index:i,product_code:sample().claims[i].product_code,
  product_name:x.product.nome,quantity:x.quantity,observations:[]
 }));
 const b=bridgeCurrentPackagingV63(sources,out.review.entries,motor,BLOB);
 assert.equal(b.status,"BLOCKED");assert.equal(b.packaging,null);
 assert.equal(b.kits,null);assert.equal(calls,0);
});
held("modified product name from same code does not inherit classification",
 d=>{d.claims[0].product_name="OUTRO PRODUTO"},
 "CLASSIFICATION_REVIEW_NOT_APPROVED");
held("modified canonical product code fails exact claim join",
 d=>{d.claims[0].product_code="9.20.00.010.01"},
 "CLASSIFICATION_REVIEW_NOT_APPROVED");
held("swapped item order cannot steal station",
 d=>{d.claims.reverse()},
 "CLASSIFICATION_REVIEW_NOT_APPROVED");
held("changed quantity from same product fails",
 d=>{d.claims[0].quantity=3},
 "CLASSIFICATION_REVIEW_NOT_APPROVED");
held("tampered native quantity without hash fails",
 d=>{d.pair.event.order.items[0].QTPRODCOMVEN="3.000"},
 "READER_PAIR_NOT_SELF_CONSISTENT");
held("native observation changed without hash fails",
 d=>{d.pair.event.order.observation_rows[0].value="TAMPERED"},
 "READER_PAIR_NOT_SELF_CONSISTENT");
held("order state 4 is refused despite recomputed self-consistent hashes",
 d=>{d.pair.event.order.IDSTCOMANDA="4";refresh(d.pair)},
 "READER_PAIR_NOT_SELF_CONSISTENT");
held("item state 6 is refused despite recomputed self-consistent hashes",
 d=>{d.pair.event.order.items[0].IDSTPRCOMVEN="6";refresh(d.pair)},
 "READER_PAIR_NOT_SELF_CONSISTENT");
held("different store is rejected independently of pair fingerprints",
 d=>{
  d.pair.event.order.CDLOJA="02";
  d.pair.event.order_key=["0001","02","0000349281","0000348850"].join("|");
  d.pair.decision.order_key=d.pair.event.order_key;
  refresh(d.pair);
 },"NOT_APPROVED_ITAIM_STORE_SCOPE");
held("archived 14 classification-unknown codes cannot borrow claimed approved status",
 d=>{
  d.pair.event.order.items[0].CDARVPROD="9100500000";
  d.pair.decision.items[0].canonical_code="9.10.05.000.00";
  d.claims[0].product_code="9.10.05.000.00";refresh(d.pair);
 },"CLASSIFICATION_REVIEW_NOT_APPROVED");
held("wrong iFood sequence in decision cannot pair",
 d=>{d.pair.decision.ifood_sequence="000000";d.pair.decision.fingerprint=decisionHash(d.pair.decision)},
 "READER_PAIR_NOT_SELF_CONSISTENT");
test("missing source, missing claim and source SHA drift hold without any printing",()=>{
 const d=sample();
 for(const x of [bind(null,d.claims,BLOB),bind(d.pair,null,BLOB),
   bind(d.pair,d.claims,"a".repeat(40))]){
  assert.equal(x.status,"HOLD");assert.equal(x.print_authorized,false);
 }
});
console.log("COMANDAS_READER_CLASSIFICATION_BINDING="+n+"/"+n+
 " NATIVE_PAIR_SELF_CONSISTENCY_ONLY NO_PRINT NO_LIVE_ATTESTATION");
