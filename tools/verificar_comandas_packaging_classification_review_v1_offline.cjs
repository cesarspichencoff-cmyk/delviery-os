"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {SCHEMA,EFFECTS,prioritizeClassificationGaps:review}=
 require("./comandas_packaging_classification_review_v1_offline.cjs");
const source=JSON.parse(fs.readFileSync(path.join(__dirname,"..",
 "data/comandas_packaging_classification_gaps_20261026_v1.json"),"utf8"));
let n=0;const test=(name,f)=>{f();console.log("PASS "+(++n)+" "+name);};
const run=x=>{
 const before=JSON.stringify(x),out=review(x);
 assert.equal(JSON.stringify(x),before);
 assert.equal(out.schema,SCHEMA);assert.deepEqual(out.effects,EFFECTS);
 for(const key of ["classification_fact","packaging_fact","ready_for_operations",
  "reader_current_attested","academia_candidate_promoted"])assert.equal(out[key],false);
 assert.ok(!JSON.stringify(out).includes("CUSTOMER_PRIVATE"));
 return out;
};
test("archived 14 exact codes produce bounded ordered REVIEW queue",()=>{
 const out=run(source);
 assert.equal(out.status,"HISTORICAL_PRIORITY_QUEUE_NOT_CLASSIFICATION");
 assert.equal(out.queue.length,14);
 assert.equal(out.total_reason_occurrences,82);
 assert.equal(out.queue[0].canonical_code,"9.10.05.000.00");
 assert.equal(out.queue[0].reason_occurrences,20);
 assert.equal(out.queue[1].reason_occurrences,12);
 assert.equal(out.queue[2].reason_occurrences,9);
 assert.ok(out.queue.every(e=>e.state.includes("NEED_INDEPENDENT_REVIEW")));
});
test("82 occurrences are not promoted to 82 distinct orders",()=>{
 const out=run(source);assert.ok(out.reason.includes("NO_AUTOMATIC_PRODUCT_MAPPING"));
 assert.equal(out.ready_for_operations,false);
});
const altered=(name,fn,reason)=>test(name,()=>{
 const x=structuredClone(source);fn(x);const out=run(x);
 assert.equal(out.status,"HOLD");assert.equal(out.reason,reason);
 assert.equal(out.queue.length,0);
});
altered("unapproved family injection fails schema",
 x=>{x.entries[0].family="combinado";},
 "CODE_FREQUENCY_OR_DUPLICATE_INVALID");
altered("unapproved item name injection fails schema",
 x=>{x.entries[0].name="CUSTOMER_PRIVATE";},
 "CODE_FREQUENCY_OR_DUPLICATE_INVALID");
altered("unapproved packing quantity injection fails schema",
 x=>{x.entries[0].bag_count=1;},
 "CODE_FREQUENCY_OR_DUPLICATE_INVALID");
altered("duplicate canonical code blocked",
 x=>{x.entries[1].canonical_code=x.entries[0].canonical_code;},
 "CODE_FREQUENCY_OR_DUPLICATE_INVALID");
altered("negative frequency rejected",
 x=>{x.entries[0].reason_occurrences=-1;},
 "CODE_FREQUENCY_OR_DUPLICATE_INVALID");
altered("zero frequency rejected",
 x=>{x.entries[0].reason_occurrences=0;},
 "CODE_FREQUENCY_OR_DUPLICATE_INVALID");
altered("tampered total rejected",
 x=>{x.entries[0].reason_occurrences=19;},
 "ARCHIVED_AGGREGATE_TOTAL_DRIFT");
altered("not unique order sample cannot become random",
 x=>{x.sample.selection="RANDOM_UNIQUE_ORDERS";},
 "SNAPSHOT_SOURCE_OR_SCOPE_UNVERIFIED");
altered("unit cannot leak to other stores",
 x=>{x.sample.unit="PINHEIROS";},
 "SNAPSHOT_SOURCE_OR_SCOPE_UNVERIFIED");
altered("newest order sample cannot be generalized",
 x=>{x.sample.decision_revisions=1000;},
 "SNAPSHOT_SOURCE_OR_SCOPE_UNVERIFIED");
altered("historical evidence cannot claim current catalog provenance",
 x=>{x.evidence_status="CURRENT_CATALOG_APPROVED";},
 "SNAPSHOT_SOURCE_OR_SCOPE_UNVERIFIED");
altered("cannot alter number of unknown decisions",
 x=>{x.sample.decisions_with_classification_unknown=82;},
 "SNAPSHOT_SOURCE_OR_SCOPE_UNVERIFIED");
altered("cannot hide missing codes",
 x=>{x.entries.pop();},
 "SNAPSHOT_SOURCE_OR_SCOPE_UNVERIFIED");
altered("cannot add suspected 15th code",
 x=>{x.entries.push({canonical_code:"9.00.00.001.00",reason_occurrences:1});},
 "SNAPSHOT_SOURCE_OR_SCOPE_UNVERIFIED");
test("empty and null fail closed",()=>{
 for(const x of [null,{},false,[]])assert.equal(run(x).status,"HOLD");
});
console.log("COMANDAS_CLASSIFICATION_GAP_QUEUE="+n+"/"+n+
 " HISTORIC_ONLY NO_CATALOG_FACT NO_PRINT");
