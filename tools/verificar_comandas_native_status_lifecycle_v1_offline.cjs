"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {SCHEMA,analyzeNativeLifecycle:analyze}=require("./comandas_native_status_lifecycle_review_v1_offline.cjs");
const hash=n=>crypto.createHash("sha256").update("fictitious-"+n).digest("hex");
const row=(id,status,n,sec)=>({
 order_key:"0001|01|FICTITIOUS|"+id,
 snapshot_hash:hash(id+"-"+n),status,origin:"DLV_IFO",
 observed_at:"2026-10-26T12:00:"+String(sec).padStart(2,"0")+"-03:00"
});
const test=(name,fn)=>{fn();count++;console.log("PASS "+count+" "+name)};
let count=0;
const safe=o=>{
 const s=JSON.stringify(o);
 assert.equal(o.schema,SCHEMA);
 assert.equal(o.print_authorized,false);
 assert.equal(o.sequence_authorized,false);
 assert.equal(o.status_semantics_proven,false);
 assert.equal(o.status_transition_is_delivery_proof,false);
 assert.equal(o.classification_authorized,false);
 assert.equal(o.effects.sql_write,false);
 assert.equal(o.effects.printer,false);
 assert.equal(o.effects.spooler,false);
 assert.equal(o.effects.network,false);
 assert.equal(o.privacy,"AGGREGATES_ONLY");
 assert.ok(!s.includes("FICTITIOUS"),"key cannot appear in aggregate");
 return o;
};
const data=[
 row("A","3",1,1),row("A","P",2,2),
 row("B","3",1,1),row("B","X",2,2),
 row("C","X",1,1),row("C","P",2,2),
 row("D","3",1,1),row("D","P",2,2),row("D","4",3,3)
];
test("three types of transitions and counts, no authority",()=>{
 const r=safe(analyze(data));
 assert.equal(r.status,"EVIDENCE_ONLY_REVIEW");
 assert.equal(r.observed_revisions,9);
 assert.equal(r.distinct_orders,4);
 assert.equal(r.changed_status_orders,4);
 assert.deepEqual(r.status_revisions,{"3":3,"4":1,P:3,X:2});
 assert.deepEqual(r.transitions,{"3 -> P":2,"3 -> X":1,"P -> 4":1,"X -> P":1});
});
test("unsorted events normalized to timestamp",()=>{
 const r=safe(analyze([...data].reverse()));
 assert.deepEqual(r.transitions,safe(analyze(data)).transitions);
});
test("same revision replay not double counted",()=>{
 const r=safe(analyze([...data,data[0]]));
 assert.equal(r.observed_revisions,10);
 assert.equal(r.repeated_snapshot_rows,1);
 assert.deepEqual(r.status_revisions,safe(analyze(data)).status_revisions);
});
test("different status on same fingerprint blocks",()=>{
 const corrupt={...data[0],status:"P"};
 assert.deepEqual(safe(analyze([...data,corrupt])).reasons,
  ["SNAPSHOT_HASH_CONTRADICTS_STATUS_OR_ORIGIN"]);
});
test("same order key with changing native origin blocks",()=>{
 const corrupt={...data[0],origin:"DLV_NMO",snapshot_hash:hash("origin-change")};
 assert.deepEqual(safe(analyze([...data,corrupt])).reasons,
  ["SAME_ORDER_KEY_MULTIPLE_ORIGINS"]);
});
test("no implicit terminal state even when last is P",()=>{
 const r=safe(analyze(data.filter(x=>x.order_key.endsWith("|A"))));
 assert.equal(r.status_revisions.P,1);
 assert.equal(r.status_semantics_proven,false);
});
test("X is not interpreted cancellation",()=>{
 const r=safe(analyze(data.filter(x=>x.status==="X")));
 assert.equal(r.status_semantics_proven,false);
 assert.equal(r.status_transition_is_delivery_proof,false);
});
test("4 is not interpreted fiscal or final",()=>{
 const r=safe(analyze(data.filter(x=>x.status==="4")));
 assert.equal(r.print_authorized,false);
});
test("missing key rejects full batch",()=>{
 const x={...data[0]};delete x.order_key;
 assert.deepEqual(safe(analyze([x])).reasons,["ROW_SCHEMA_INVALID"]);
});
test("partial composite identity rejected",()=>{
 const x={...data[0],order_key:"0001|01|A"};
 assert.deepEqual(safe(analyze([x])).reasons,["ROW_SCHEMA_INVALID"]);
});
test("invalid hash rejected",()=>{
 const x={...data[0],snapshot_hash:"replaced"};
 assert.deepEqual(safe(analyze([x])).reasons,["ROW_SCHEMA_INVALID"]);
});
test("date without timezone rejected",()=>{
 const x={...data[0],observed_at:"2026-10-26T12:00:00"};
 assert.deepEqual(safe(analyze([x])).reasons,["ROW_SCHEMA_INVALID"]);
});
test("non timestamp rejected",()=>{
 const x={...data[0],observed_at:"2026-10-26T12:00:invalid-03:00"};
 assert.deepEqual(safe(analyze([x])).reasons,["ROW_SCHEMA_INVALID"]);
});
test("empty and null rejected",()=>{
 assert.deepEqual(safe(analyze([])).reasons,["INPUT_EMPTY_OR_INVALID"]);
 assert.deepEqual(safe(analyze(null)).reasons,["INPUT_EMPTY_OR_INVALID"]);
});
test("large input fails budget before aggregation",()=>{
 assert.deepEqual(safe(analyze(Array(5001).fill(data[0]))).reasons,["INPUT_BUDGET_EXCEEDED"]);
});
test("input immutability: object values unchanged",()=>{
 const original=JSON.stringify(data);
 safe(analyze(data));
 assert.equal(JSON.stringify(data),original);
});
console.log("COMANDAS_NATIVE_LIFECYCLE_V1="+count+"/"+count+
 " NO_STATUS_PROMOTION NO_PRINT NO_SEQUENCE NO_SQL");
