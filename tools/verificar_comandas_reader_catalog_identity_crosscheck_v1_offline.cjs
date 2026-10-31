"use strict";
const assert=require("node:assert/strict");
const {syntheticReaderPairV857:fixture}=require("./verificar_tata_comanda_reader_native_v857_offline.cjs");
const {snapshotHash,decisionHash}=require("./tata_comanda_reader_native_essentials_v857_offline.cjs");
const {crosscheckReaderCatalogIdentity:check}=require("./comandas_reader_catalog_identity_crosscheck_v1_offline.cjs");
const {CATALOG_SCHEMA}=require("./comandas_packaging_classification_review_v1_offline.cjs");
let count=0;
function run(name,fn){fn();count++;console.log("PASS "+count+" "+name)}
function base(){
 const pair=fixture();pair.event.order.IDSTCOMANDA="3";
 pair.event.order.items.forEach(i=>i.IDSTPRCOMVEN="4");
 rehash(pair);
 const catalog={schema:CATALOG_SCHEMA,source_kind:"LOCAL_READ_ONLY_CAPTURE_CLAIM",
  source_ref:"SYNTHETIC_ONLY",store_id:"0001",store_unit:"01",
  captured_local_date:"2026-10-30",entries:pair.decision.items.map(i=>({
   CDPRODUTO:i.CDPRODUTO,canonical_code:i.canonical_code,
   product_name:i.product_name,active:true
  }))};
 return {pair,catalog};
}
function rehash(p){
 p.event.snapshot_hash=snapshotHash(p.event.order);
 p.decision.snapshot_hash=p.event.snapshot_hash;
 p.decision.fingerprint=decisionHash(p.decision);
}
function audit(x){
 const copy=JSON.stringify(x),r=check(x.pair,x.catalog);
 assert.equal(JSON.stringify(x),copy);
 for(const k of ["catalog_origin_independently_attested","catalog_freshness_proven",
  "approved_family_station","packaging_approved","ready_for_operational_print",
  "print_authorized"])assert.equal(r[k],false,k);
 assert.equal(JSON.stringify(r).includes("COMBINADO SUSHI"),false);
 assert.equal(JSON.stringify(r).includes("0000001111"),false);
 return r;
}
run("exact Reader item ID code and name only creates candidates",()=>{
 const r=audit(base());assert.equal(r.candidate_count,2);
 assert.equal(r.status,"IDENTITY_CANDIDATES_REVIEW_ONLY");
});
run("catalog capture missing one native ID remains unresolved",()=>{
 const x=base();x.catalog.entries.pop();
 const r=audit(x);assert.equal(r.candidate_count,1);
 assert.equal(r.unresolved_count,1);
});
run("same name but different native ID cannot match",()=>{
 const x=base();x.catalog.entries[0].CDPRODUTO="9999999999";
 const r=audit(x);assert.equal(r.candidate_count,1);
});
run("wrong code under native ID cannot inherit classification",()=>{
 const x=base();x.catalog.entries[0].canonical_code="9.99.00.000.00";
 const r=audit(x);assert.equal(r.line_states[0].status,"NATIVE_PRODUCT_CODE_CONFLICT");
});
run("duplicate catalog code or native ID causes ambiguity",()=>{
 for(const key of ["canonical_code","CDPRODUTO"]){
  const x=base();x.catalog.entries[1][key]=x.catalog.entries[0][key];
  const r=audit(x);assert.ok(r.unresolved_count>0);
 }
});
run("inactivated product cannot become a match",()=>{
 const x=base();x.catalog.entries[0].active=false;
 const r=audit(x);assert.equal(r.candidate_count,1);
 assert.equal(r.line_states[0].status,"INACTIVE_IN_SUPPLIED_CAPTURE");
});
run("wrong shop, self-approval and extra fields hold",()=>{
 for(const edit of [x=>x.catalog.store_unit="02",
  x=>x.catalog.approved=true,x=>x.catalog.entries[0].station="sushi"]){
  const x=base();edit(x);assert.equal(audit(x).status,"HOLD");
 }
});
run("cancelled native item cannot be matched even after rehash",()=>{
 const x=base();x.pair.event.order.items[0].IDSTPRCOMVEN="6";
 rehash(x.pair);assert.equal(audit(x).status,"HOLD");
});
run("invalid or absent native pair and catalog are denied",()=>{
 const x=base();
 assert.equal(check(null,x.catalog).status,"HOLD");
 assert.equal(check(x.pair,null).status,"HOLD");
});
console.log("READER_CATALOG_IDENTITY="+count+"/"+count+" REVIEW_ONLY");
