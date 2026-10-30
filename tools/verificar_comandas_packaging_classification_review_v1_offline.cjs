"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {SCHEMA,EFFECTS,prioritizeClassificationGaps:review,
 CATALOG_SCHEMA,CATALOG_REVIEW_SCHEMA,compareCandidateCatalogCapture:compareCatalog}=
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
function catalog(){
 return {schema:CATALOG_SCHEMA,
  source_kind:"LOCAL_READ_ONLY_CAPTURE_CLAIM",
  source_ref:"SYNTHETIC_UNATTESTED_CAPTURE_NOT_A_LIVE_CATALOG",
  store_id:"0001",store_unit:"01",captured_local_date:"2026-10-30",
  entries:source.entries.map((row,i)=>({
   CDPRODUTO:String(i+1).padStart(10,"0"),
   canonical_code:row.canonical_code,
   product_name:"SYNTHETIC_PRODUCT_"+(i+1),active:true
  }))};
}
function compare(capture,snapshot=source){
 const b=JSON.stringify(capture),a=JSON.stringify(snapshot);
 const out=compareCatalog(snapshot,capture);
 assert.equal(JSON.stringify(capture),b);
 assert.equal(JSON.stringify(snapshot),a);
 assert.equal(out.schema,CATALOG_REVIEW_SCHEMA);
 assert.deepEqual(out.effects,EFFECTS);
 for(const key of ["independent_capture_attested",
  "current_catalog_freshness_proven","classification_approved",
  "packaging_approved","ready_for_operations","print_authorized"])
  assert.equal(out[key],false,key);
 const result=JSON.stringify(out);
 assert.equal(result.includes("SYNTHETIC_PRODUCT_"),false);
 assert.equal(result.includes("SYNTHETIC_UNATTESTED_CAPTURE"),false);
 return out;
}
test("14 matching synthetic identity rows are candidates only, never catalog facts",()=>{
 const out=compare(catalog());
 assert.equal(out.status,"CATALOG_COMPARISON_REVIEW_ONLY");
 assert.equal(out.found_exact_candidates,14);
 assert.equal(out.missing_codes,0);
 assert.equal(out.ambiguous_codes,0);
 assert.ok(out.queue.every(e=>e.status==="EXACT_IDENTITY_CANDIDATE_ONLY"));
 assert.ok(out.queue.every(e=>e.classification_status==="UNKNOWN_NOT_HOMOLOGATED"));
});
test("missing Cookie Pistache remains absent instead of inheriting another route",()=>{
 const c=catalog();c.entries=c.entries.filter(
  x=>x.canonical_code!=="8.20.11.002.00");
 const out=compare(c);
 assert.equal(out.found_exact_candidates,13);
 assert.equal(out.missing_codes,1);
 assert.equal(out.queue.find(x=>x.canonical_code==="8.20.11.002.00")
  .status,"CODE_ABSENT_IN_SUPPLIED_CAPTURE");
});
test("duplicate code with second product identity cannot be silently selected",()=>{
 const c=catalog();c.entries.push({...c.entries[0],
  CDPRODUTO:"0000019999",product_name:"DIFFERENT_SYNTHETIC"});
 const out=compare(c);
 assert.equal(out.ambiguous_codes,1);
 assert.equal(out.found_exact_candidates,13);
 assert.equal(out.queue.find(x=>x.canonical_code===c.entries[0].canonical_code)
  .status,"AMBIGUOUS_CODE_OR_NATIVE_PRODUCT_ID");
});
test("same CDPRODUTO reused by two different codes invalidates both candidates",()=>{
 const c=catalog();c.entries[1].CDPRODUTO=c.entries[0].CDPRODUTO;
 const out=compare(c);assert.equal(out.ambiguous_codes,2);
 assert.equal(out.found_exact_candidates,12);
});
test("inactive product is not counted as a validated identity candidate",()=>{
 const c=catalog();c.entries[0].active=false;
 const out=compare(c);
 assert.equal(out.found_exact_candidates,13);
 assert.equal(out.queue.find(x=>x.canonical_code===c.entries[0].canonical_code)
  .status,"INACTIVE_IN_SUPPLIED_CAPTURE");
 assert.equal(out.classification_approved,false);
});
test("fake current catalog approval and wrong store are rejected",()=>{
 for(const mutation of [
  c=>{c.store_unit="02";},c=>{c.source_kind="PROVEN_SQL_CATALOG";},
  c=>{c.classification_approved=true;},
  c=>{c.captured_local_date="2026-02-30";},
  c=>{delete c.source_ref;} ]){
  const c=catalog();mutation(c);
  const out=compare(c);
  assert.equal(out.status,"HOLD");
  assert.deepEqual(out.queue,[]);
 }
});
test("malformed identity rows and suspicious extra fields reject whole capture",()=>{
 for(const mutation of [
  c=>{c.entries[0].CDPRODUTO=1;},
  c=>{c.entries[0].canonical_code="9.00.WRONG";},
  c=>{c.entries[0].product_name="CUSTOMER_PRIVATE\nTEXT";},
  c=>{c.entries[0].station="SUSHI";},
  c=>{c.entries[0].active="true";} ]){
  const c=catalog();mutation(c);
  assert.equal(compare(c).status,"HOLD");
 }
});
test("corrupt historical source cannot be dressed up by a plausible capture",()=>{
 const s=structuredClone(source);
 s.sample.unit="PINHEIROS";
 const out=compare(catalog(),s);
 assert.equal(out.status,"HOLD");
 assert.equal(out.found_exact_candidates,null);
});
test("even empty catalog capture is a bounded review with all codes missing",()=>{
 const c=catalog();c.entries=[];
 const out=compare(c);
 assert.equal(out.status,"CATALOG_COMPARISON_REVIEW_ONLY");
 assert.equal(out.missing_codes,14);
 assert.equal(out.ready_for_operations,false);
});
console.log("COMANDAS_CLASSIFICATION_GAP_QUEUE="+n+"/"+n+
 " HISTORIC_ONLY NO_CATALOG_FACT NO_PRINT");
