"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {SCHEMA,EFFECTS,joinClassificationGapsToPinnedRouting:join}=
 require("./comandas_packaging_route_crosscheck_v1_offline.cjs");
const read=(n)=>fs.readFileSync(path.join(__dirname,"..","data",n));
const archive=JSON.parse(read("comandas_packaging_classification_gaps_20261026_v1.json"));
const routing=read("odhen_product_routing_compact_v1.json");
let n=0;const test=(label,f)=>{f();console.log("PASS "+(++n)+" "+label)};
function evaluate(snapshot,bytes,status,reason){
 const before=JSON.stringify(snapshot),b=Buffer.isBuffer(bytes)?Buffer.from(bytes):bytes;
 const out=join(snapshot,bytes);
 assert.equal(out.schema,SCHEMA);assert.deepEqual(out.effects,EFFECTS);
 assert.equal(JSON.stringify(snapshot),before);
 if(Buffer.isBuffer(bytes))assert.deepEqual(bytes,b);
 for(const k of ["classification_proven","packaging_proven","station_live_proven",
  "printer_power_proven","first_dispatch_proven","operational_ready",
  "physical_print_authorized"])assert.equal(out[k],false,k);
 assert.equal(out.status,status);
 if(reason)assert.equal(out.reason,reason);
 assert.ok(!JSON.stringify(out).includes("CUSTOMER_PRIVATE"));
 return out;
}
test("14 archival classification codes join 13 existing routes and 1 absent",()=>{
 const o=evaluate(archive,routing,"HISTORICAL_ROUTE_COVERAGE_REVIEW_ONLY");
 assert.equal(o.queue.length,14);assert.equal(o.present_in_archived_routing,13);
 assert.equal(o.absent_in_archived_routing,1);
 assert.ok(o.queue.every(x=>x.classification_status.startsWith("UNKNOWN")));
 assert.ok(o.queue.every(x=>x.packing_status.startsWith("UNKNOWN")));
});
test("cookie Pistache never borrows another product route",()=>{
 const o=evaluate(archive,routing,"HISTORICAL_ROUTE_COVERAGE_REVIEW_ONLY");
 const cookie=o.queue.find(x=>x.canonical_code==="8.20.11.002.00");
 assert.equal(cookie.historical_route_status,"NOT_IN_20260930_ROUTING_SNAPSHOT");
 assert.deepEqual(cookie.configured_target_codes_20260930,[]);
});
test("carpaccio has historical dual targets but no automatic classification",()=>{
 const o=evaluate(archive,routing,"HISTORICAL_ROUTE_COVERAGE_REVIEW_ONLY");
 const c=o.queue.find(x=>x.canonical_code==="9.10.05.000.00");
 assert.deepEqual(c.configured_target_codes_20260930,["00003","00009"]);
 assert.equal(c.classification_status,"UNKNOWN_REQUIRES_APPROVED_CROSSWALK");
});
test("route code is not product family or station proof",()=>{
 const o=evaluate(archive,routing,"HISTORICAL_ROUTE_COVERAGE_REVIEW_ONLY");
 assert.ok(o.queue.every(x=>x.route_is_not_physical_proof===true));
 assert.equal(o.physical_print_authorized,false);
});
test("archived 82 reason occurrences cannot be treated as unique orders",()=>{
 const o=evaluate(archive,routing,"HISTORICAL_ROUTE_COVERAGE_REVIEW_ONLY");
 assert.equal(o.queue.reduce((s,x)=>s+x.reason_occurrences,0),82);
 assert.equal(o.operational_ready,false);
});
test("byte tampering of archive route is rejected even if JSON valid",()=>{
 const s=Buffer.from(routing);
 const v=s.toString("utf8").replace('"00009"', '"00006"');
 assert.notEqual(v,s.toString("utf8"));
 evaluate(archive,Buffer.from(v),"HOLD","ARCHIVED_ROUTING_FILE_NOT_EXACTLY_PINNED");
});
test("no routing bytes are not silently replaced by active config",()=>{
 for(const x of [null,undefined,{},Buffer.alloc(0),Buffer.from("{}")])
  evaluate(archive,x,"HOLD","EXACT_ROUTING_BYTES_REQUIRED");
});
test("extra classification family cannot enter from manifest",()=>{
 const s=structuredClone(archive);s.entries[0].family="SASHIMI";
 evaluate(s,routing,"HOLD","CLASSIFICATION_SNAPSHOT_UNVERIFIED");
});
test("unknown product is not added via a fifteenth code",()=>{
 const s=structuredClone(archive);
 s.entries.push({canonical_code:"8.20.11.003.00",reason_occurrences:1});
 evaluate(s,routing,"HOLD","CLASSIFICATION_SNAPSHOT_UNVERIFIED");
});
test("wrong source revision cannot grant past routing proof",()=>{
 const s=structuredClone(archive);s.observed_on="2026-10-29";
 evaluate(s,routing,"HOLD","CLASSIFICATION_SNAPSHOT_UNVERIFIED");
});
test("missing manifest refuses output",()=>{
 evaluate(null,routing,"HOLD","CLASSIFICATION_SNAPSHOT_UNVERIFIED");
});
console.log("COMANDAS_PACKAGING_ROUTE_ARCHIVE="+n+"/"+n+
 " 13/14 HISTORICAL_SOURCE_ONLY NO_CLASSIFICATION NO_PRINT");
