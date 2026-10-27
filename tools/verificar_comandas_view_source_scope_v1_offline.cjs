"use strict";
const assert=require("node:assert/strict");
const {assessViewSourceScopes:review,SCHEMA,EFFECTS}=
 require("./comandas_view_source_scope_v1_offline.cjs");
let count=0;
function check(label,fn){fn();count++;console.log("PASS "+count+" "+label);}
function fixture(){
 const sha="a".repeat(64);
 return {
  native:{schema:"tata.comandas.native-revision-claim.v1",origin:"DLV_IFO",
   store_id:"0001",store_unit:"01",operational_date:"2026-10-26",
   order_key:"0001|01|SYNTHETIC_SALE|SYNTHETIC_ORDER",
   snapshot_sha256:sha,short_id:"9627",
   item_rows_complete:true,observation_scan_complete:true},
  views:["PRODUCTION_1","PRODUCTION_2","CONFERENCE"].map(id=>({
   id,native_snapshot_sha256:sha,source_kind:"TEKNISA_READER_V2"
  })),
  ifood:{schema:"tata.comandas.ifood-export-claim.v1",
   source_kind:"OFFICIAL_IFOOD_EXPORT",source_fingerprint:"b".repeat(64),
   source_ref:"SYNTHETIC_OFFICIAL_EXPORT",store_id:"53069",
   operational_date:"2026-10-26",short_id:"9627",short_id_unique_for_day:true},
  store_mapping:{schema:"tata.comandas.cross-system-store-candidate.v1",
   source_kind:"HUMAN_RECONCILIATION_CANDIDATE",source_ref:"SYNTHETIC_MAP_NOT_ATTESTATION",
   ifood_store_id:"53069",native_store_id:"0001",native_store_unit:"01"}
 };
}
const clone=x=>structuredClone(x);
function safe(x){
 const before=JSON.stringify(x);
 const out=review(x);
 assert.equal(JSON.stringify(x),before,"must not mutate input");
 assert.equal(out.schema,SCHEMA);
 assert.deepEqual(out.effects,EFFECTS);
 assert.equal(out.effects.sql_read,false);assert.equal(out.effects.printer,undefined);
 assert.equal(out.physical_print_proven,false);
 assert.equal(out.independent_ifood_source_attested_here,false);
 assert.equal(out.source_store_mapping_attested_here,false);
 assert.equal(out.production.length,2);
 assert.deepEqual(out.production.map(z=>z.id),["PRODUCTION_1","PRODUCTION_2"]);
 assert.equal(out.conference.id,"CONFERENCE");
 for(const v of [...out.production,out.conference]){
  assert.equal(v.print_authorized,false);
  assert.equal(v.ready_for_operational_print,false);
  assert.equal(v.automatic_retry_allowed,false);
  assert.equal(v.ifood_source_authenticated_here,false);
  assert.deepEqual(v.bytes,[]);
 }
 assert.equal(out.production.every(z=>z.requires_ifood_teknisa_crosscheck===false),true);
 assert.equal(out.conference.requires_ifood_teknisa_crosscheck,true);
 assert.ok(!JSON.stringify(out).includes("SYNTHETIC_ORDER"),"aggregate leaks identity");
 return out;
}
if(require.main===module){
check("two production vias use Teknisa only; conference has candidate iFood short-ID match",()=>{
 const r=safe(fixture());
 assert.equal(r.status,"EVIDENCE_ONLY");
 assert.ok(r.production.every(z=>z.status==="NATIVE_ONLY_REVIEW"));
 assert.equal(r.conference.status,"IFOOD_TEK_CANDIDATE_MATCH_REVIEW_ONLY");
 assert.equal(r.conference.ifood_item_parity_proven,false);
});
const prodFingerprint=r=>JSON.stringify(r.production);
check("missing iFood source holds conference without poisoning native production",()=>{
 const a=safe(fixture()),x=fixture();delete x.ifood;
 const b=safe(x);
 assert.equal(prodFingerprint(a),prodFingerprint(b));
 assert.deepEqual(b.conference.reasons,["INDEPENDENT_IFOOD_CROSSCHECK_NOT_AVAILABLE"]);
});
check("iFood day mismatch affects conference only",()=>{
 const a=safe(fixture()),x=fixture();x.ifood.operational_date="2026-10-25";
 const b=safe(x);assert.equal(prodFingerprint(a),prodFingerprint(b));
 assert.equal(b.conference.status,"HOLD");
});
check("iFood short-ID mismatch affects conference only",()=>{
 const a=safe(fixture()),x=fixture();x.ifood.short_id="9999";
 const b=safe(x);assert.equal(prodFingerprint(a),prodFingerprint(b));
 assert.equal(b.conference.reasons[0],"IFood_TEK_DAY_OR_SHORT_ID_CONFLICT");
});
check("iFood store mismatch affects conference only",()=>{
 const a=safe(fixture()),x=fixture();x.ifood.store_id="002";
 const b=safe(x);assert.equal(prodFingerprint(a),prodFingerprint(b));
 assert.equal(b.conference.status,"HOLD");
});
check("iFood and native store IDs in different namespaces require explicit mapping",()=>{
 const x=fixture();delete x.store_mapping;
 const r=safe(x);
 assert.equal(r.conference.status,"HOLD");
 assert.equal(r.conference.reasons[0],"CROSS_SYSTEM_STORE_MAPPING_CANDIDATE_REQUIRED");
 assert.ok(r.production.every(v=>v.status==="NATIVE_ONLY_REVIEW"));
});
check("iFood merchant 53069 cannot masquerade as native 0001 through numeric equality",()=>{
 const x=fixture();x.ifood.store_id="0001";
 const r=safe(x);
 assert.equal(r.conference.status,"HOLD");
 assert.equal(r.conference.reasons[0],"CROSS_SYSTEM_STORE_MAPPING_CANDIDATE_REQUIRED");
});
check("store mapping with wrong native unit holds conference only",()=>{
 const x=fixture();x.store_mapping.native_store_unit="02";
 const r=safe(x);
 assert.equal(r.conference.status,"HOLD");
 assert.ok(r.production.every(v=>v.status==="NATIVE_ONLY_REVIEW"));
});
check("store map status cannot self-promote independent source attestation",()=>{
 const x=fixture();x.store_mapping.mapping_independently_attested=true;
 const r=safe(x);
 assert.equal(r.conference.status,"IFOOD_TEK_CANDIDATE_MATCH_REVIEW_ONLY");
 assert.equal(r.source_store_mapping_attested_here,false);
});
check("unattested iFood export label blocks conference but leaves production independent",()=>{
 const a=safe(fixture()),x=fixture();x.ifood.source_kind="TEKNISA_READER_V2";
 const b=safe(x);assert.equal(prodFingerprint(a),prodFingerprint(b));
 assert.equal(b.conference.reasons[0],"INDEPENDENT_IFOOD_CROSSCHECK_NOT_ATTESTED");
});
check("duplicate short ID in official iFood export blocks conference only",()=>{
 const a=safe(fixture()),x=fixture();x.ifood.short_id_unique_for_day=false;
 const b=safe(x);assert.equal(prodFingerprint(a),prodFingerprint(b));
 assert.equal(b.conference.status,"HOLD");
});
check("missing iFood export hash cannot claim independent crossing",()=>{
 const x=fixture();x.ifood.source_fingerprint="";
 assert.equal(safe(x).conference.status,"HOLD");
});
check("items unavailable in official export do not fabricate item parity",()=>{
 const x=fixture();x.ifood.items=null;
 const b=safe(x);
 assert.equal(b.conference.status,"IFOOD_TEK_CANDIDATE_MATCH_REVIEW_ONLY");
 assert.equal(b.conference.ifood_item_parity_proven,false);
});
check("self authorization rejected even if all fields appear correct",()=>{
 const x=fixture();x.print_authorized=true;
 const r=safe(x);assert.ok(r.production.every(z=>z.status==="HOLD"));
 assert.equal(r.conference.status,"HOLD");
});
check("another claimed live-ready flag cannot authorize physical effect",()=>{
 const x=fixture();x.ready_for_operational_print=true;
 assert.deepEqual(safe(x).conference.reasons,["SELF_AUTHORIZATION_FORBIDDEN"]);
});
check("changed native snapshot blocks BOTH views for native-integrity reasons",()=>{
 const x=fixture();x.views[1].native_snapshot_sha256="c".repeat(64);
 const r=safe(x);assert.ok(r.production.every(z=>z.status==="HOLD"));
 assert.equal(r.conference.reasons[0],"THREE_VIEWS_NATIVE_REVISION_NOT_IDENTICAL");
});
check("two production views are both mandatory",()=>{
 const x=fixture();x.views=x.views.slice(0,2);
 assert.equal(safe(x).production[0].status,"HOLD");
});
check("duplicate physical view label cannot masquerade as both production vias",()=>{
 const x=fixture();x.views[1].id="PRODUCTION_1";
 assert.equal(safe(x).conference.status,"HOLD");
});
check("missing native observations coverage prevents every review",()=>{
 const x=fixture();x.native.observation_scan_complete=false;
 assert.deepEqual(safe(x).production[0].reasons,
  ["NATIVE_REVISION_STRUCTURE_OR_COVERAGE_UNPROVEN"]);
});
check("iFood origin cannot substitute native DLV_IFO",()=>{
 const x=fixture();x.native.origin="DLV_NMO";
 assert.equal(safe(x).production[0].status,"HOLD");
});
check("wrong native store-to-key binding blocks all views",()=>{
 const x=fixture();x.native.store_id="0002";
 assert.equal(safe(x).conference.status,"HOLD");
});
check("invalid native day never becomes valid via matching export",()=>{
 const x=fixture();x.native.operational_date="2026-02-30";
 x.ifood.operational_date="2026-02-30";
 assert.equal(safe(x).production[0].status,"HOLD");
});
check("missing native iFood short ID blocks both because native identity incomplete",()=>{
 const x=fixture();x.native.short_id="";
 assert.equal(safe(x).production[0].status,"HOLD");
});
check("native item coverage gap blocks both; independent iFood cannot fix Teknisa",()=>{
 const x=fixture();x.native.item_rows_complete=false;
 assert.equal(safe(x).production[1].status,"HOLD");
});
check("null and arrays fail closed without effects",()=>{
 assert.equal(safe(null).production[0].status,"HOLD");
 assert.equal(safe([]).conference.status,"HOLD");
});
console.log("COMANDAS_VIEW_SOURCE_SCOPE_V1="+count+"/"+count+
 " PRODUCTION_NATIVE_ONLY CONFERENCE_IFOOD_TEKNISA_ONLY NO_PRINT NO_SQL NO_HOST");
}
module.exports={fixture};
