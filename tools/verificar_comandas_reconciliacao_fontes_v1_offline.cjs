"use strict";
const assert=require("node:assert/strict");
const {SCHEMA,EFFECTS,reconcilePresence:run}=
 require("./comandas_reconciliacao_fontes_v1_offline.cjs");
const clone=x=>JSON.parse(JSON.stringify(x));
const uuid=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const source={
 day:"2026-10-25",ifood_store:"53069",native_store:"0001/01",
 ifood:[
  {day:"2026-10-25",store:"53069",uuid:uuid(1),short_id:"0006",final_status:"CONCLUIDO"},
  {day:"2026-10-25",store:"53069",uuid:uuid(2),short_id:"0130",final_status:"CONCLUIDO"},
  {day:"2026-10-25",store:"53069",uuid:uuid(3),short_id:"2003",final_status:"CONCLUIDO"}
 ],
 native:[
  {day:"2026-10-25",store:"0001/01",short_id:"0006",origin:"DLV_IFO",status_code:"X"},
  {day:"2026-10-25",store:"0001/01",short_id:"2003",origin:"DLV_IFO",status_code:"P"},
  {day:"2026-10-25",store:"0001/01",short_id:"9999",origin:"DLV_IFO",status_code:"4"}
 ]
};
let total=0;
function test(name,fn){fn();total++;console.log("PASS "+total+" "+name);}
const review=x=>{
 const before=JSON.stringify(x),r=run(x);
 assert.equal(JSON.stringify(x),before,"must not mutate input");
 assert.equal(r.schema,SCHEMA);
 assert.deepEqual(r.effects,EFFECTS);
 for(const key of ["ready_for_operational_print","uuid_to_native_proven",
  "item_content_proven","independent_source_attestation_proven",
  "source_store_mapping_attested","physical_print_proven"])
   assert.equal(r[key],false,key);
 assert.equal(r.differences_without_personal_ids,true);
 const serialized=JSON.stringify(r);
 for(const row of source.ifood){
  assert.ok(!serialized.includes(row.uuid),"must not export UUID");
 }
 return r;
};
test("bounded independent set: 2 matched / 1 only each",()=>{
 const r=review(source);assert.equal(r.status,"DISCREPANCIES_REVIEW");
 assert.deepEqual(r.counts,{ifood_rows:3,native_rows:3,
 matched_short_ids:2,only_ifood:1,only_native:1,ambiguous_short_ids:0});
 assert.deepEqual(r.native_matched_status_codes,{P:1,X:1});
 assert.deepEqual(r.native_unmatched_status_codes,{"4":1});
});
test("numeric equality cannot imply all identities matched",()=>{
 const r=review(source);
 assert.equal(r.counts.ifood_rows,r.counts.native_rows);
 assert.equal(r.counts.matched_short_ids,2);
});
test("status code X in matched records not inferred cancelled",()=>{
 const r=review(source);
 assert.equal(r.counts.matched_short_ids,2);
 assert.equal(r.native_matched_status_codes.X,1);
});
test("short with leading zero remains distinct",()=>{
 const x=clone(source);x.ifood[0].short_id="0060";
 assert.equal(review(x).counts.matched_short_ids,1);
});
test("duplicate iFood short id blocks batch",()=>{
 const x=clone(source);x.ifood[1].short_id="0006";
 assert.deepEqual(review(x).reasons,["DUPLICATE_SHORT_ID_WITHIN_STORE_DAY"]);
});
test("duplicate native short id blocks batch",()=>{
 const x=clone(source);x.native.push({...x.native[0],status_code:"P"});
 assert.equal(review(x).status,"HOLD");
});
test("duplicate UUID blocks even with different short id",()=>{
 const x=clone(source);x.ifood[2].uuid=x.ifood[0].uuid;
 assert.deepEqual(review(x).reasons,["IFOOD_UUID_REPEATED"]);
});
test("invalid UUID is not treated as full ID",()=>{
 const x=clone(source);x.ifood[0].uuid="0006";
 assert.deepEqual(review(x).reasons,["IFOOD_REQUIRED_FIELD_INVALID"]);
});
test("invalid day (Feb 30) blocked",()=>{
 const x=clone(source);x.day="2026-02-30";
 assert.deepEqual(review(x).reasons,["INVALID_BATCH_SCOPE"]);
});
test("mismatched iFood day blocked",()=>{
 const x=clone(source);x.ifood[0].day="2026-10-24";
 assert.deepEqual(review(x).reasons,["IFOOD_ROW_SCOPE_MISMATCH"]);
});
test("mismatched native day blocked",()=>{
 const x=clone(source);x.native[0].day="2026-10-24";
 assert.deepEqual(review(x).reasons,["NATIVE_ROW_SCOPE_MISMATCH"]);
});
test("mismatched iFood store blocked",()=>{
 const x=clone(source);x.ifood[0].store="99999";
 assert.deepEqual(review(x).reasons,["IFOOD_ROW_SCOPE_MISMATCH"]);
});
test("mismatched native store blocked",()=>{
 const x=clone(source);x.native[0].store="0002/01";
 assert.deepEqual(review(x).reasons,["NATIVE_ROW_SCOPE_MISMATCH"]);
});
test("other channel DLV_NMO not misclassified iFood",()=>{
 const x=clone(source);x.native[0].origin="DLV_NMO";
 assert.deepEqual(review(x).reasons,["NATIVE_REQUIRED_FIELD_INVALID"]);
});
test("no native rows cannot imply lost orders",()=>{
 const x=clone(source);x.native=[];
 assert.deepEqual(review(x).reasons,["EMPTY_SOURCE_BATCH"]);
});
test("missing source status fails closed",()=>{
 const x=clone(source);delete x.native[0].status_code;
 assert.deepEqual(review(x).reasons,["NATIVE_REQUIRED_FIELD_INVALID"]);
});
test("exact set remains review, not ready",()=>{
 const x=clone(source);x.ifood.splice(1,1);x.native.splice(2,1);
 const r=review(x);assert.equal(r.status,"CANDIDATE_SET_REVIEW");
 assert.equal(r.counts.matched_short_ids,2);
 assert.equal(r.ready_for_operational_print,false);
});
test("empty or null input never authorizes action",()=>{
 assert.equal(review(null).status,"HOLD");
 assert.equal(review({}).status,"HOLD");
});
test("314 vs 317 synthetic volume proves 311/3/6 reconciliation without identity promotion",()=>{
 const x=clone(source);
 x.ifood=Array.from({length:314},(_,n)=>({
  day:x.day,store:x.ifood_store,uuid:uuid(n+1),
  short_id:String(n).padStart(4,"0"),final_status:"CONCLUIDO"
 }));
 x.native=[
  ...Array.from({length:311},(_,n)=>({day:x.day,store:x.native_store,
    short_id:String(n).padStart(4,"0"),origin:"DLV_IFO",status_code:n%5?"P":"X"})),
  ...Array.from({length:6},(_,n)=>({day:x.day,store:x.native_store,
    short_id:String(n+8000),origin:"DLV_IFO",
    status_code:n<4?"4":(n===4?"P":"X")}))
 ];
 const r=review(x);
 assert.deepEqual(r.counts,{ifood_rows:314,native_rows:317,
  matched_short_ids:311,only_ifood:3,only_native:6,ambiguous_short_ids:0});
 assert.deepEqual(r.native_unmatched_status_codes,{"4":4,P:1,X:1});
 assert.equal(r.uuid_to_native_proven,false);
 assert.equal(r.ready_for_operational_print,false);
});
test("short collision in 314/317 input fails closed, not first-wins",()=>{
 const x=clone(source);
 x.ifood=Array.from({length:314},(_,n)=>({
  day:x.day,store:x.ifood_store,uuid:uuid(n+1),
  short_id:String(n).padStart(4,"0"),final_status:"CONCLUIDO"
 }));
 x.native=x.ifood.map((r)=>({day:r.day,store:x.native_store,
   short_id:r.short_id,origin:"DLV_IFO",status_code:"P"}));
 x.native[313].short_id=x.native[0].short_id;
 assert.deepEqual(review(x).reasons,["DUPLICATE_SHORT_ID_WITHIN_STORE_DAY"]);
});
console.log("COMANDAS_INDEPENDENT_PRESENCE_V1="+total+"/"+total+
 " NO_AUTO_UUID_JOIN NO_PRINT NO_DB NO_SEQUENCE NO_CUSTOMER_IDENTIFIERS");