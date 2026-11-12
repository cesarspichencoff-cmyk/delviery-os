"use strict";
const assert=require("node:assert/strict");
const {syntheticReaderPairV857:fixture}=require("./verificar_tata_comanda_reader_native_v857_offline.cjs");
const {snapshotHash,decisionHash}=require("./tata_comanda_reader_native_essentials_v857_offline.cjs");
const {crosscheckReaderCatalogIdentity:check,convergeReaderCatalogClassification:converge}=require("./comandas_reader_catalog_identity_crosscheck_v1_offline.cjs");
const {CATALOG_SCHEMA}=require("./comandas_packaging_classification_review_v1_offline.cjs");
let count=0;
function run(name,fn){fn();count++;console.log("PASS "+count+" "+name)}
function base(){
 const pair=fixture();
 pair.event.order.observation_rows=[];
 pair.decision.order_observations=[];
 pair.decision.items.forEach(x=>x.observations=[]);
 pair.event.order.IDSTCOMANDA="3";
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
function claims(p){
 return p.decision.items.map((i,j)=>({
  source_item_index:j,product_code:i.canonical_code,
  product_name:i.product_name,quantity:i.quantity,
  family:"dupla",station:"sushi",review_required:false,
  review_source_ref:"SYNTHETIC_REVIEW_CLAIM"
 }));
}
function integrated(x,cs=claims(x.pair)){
 const before=JSON.stringify(x),previous=JSON.stringify(cs);
 const result=converge(x.pair,x.catalog,cs);
 assert.equal(JSON.stringify(x),before);
 assert.equal(JSON.stringify(cs),previous);
 assert.equal(result.print_authorized,false);
 assert.equal(result.classification_approved,false);
 assert.equal(result.catalog_independently_attested,false);
 assert.equal(result.packaging_approved,false);
 assert.equal(result.ready_for_operational_print,false);
 assert.equal(JSON.stringify(result).includes("COMBINADO SUSHI"),false);
 assert.equal(JSON.stringify(result).includes("0000001111"),false);
 return result;
}
run("joint source identity and classification remain review only",()=>{
 const x=base(),r=integrated(x);
 assert.equal(r.status,"JOINT_SELF_CONSISTENCY_REVIEW_ONLY");
 assert.equal(r.identity_match_count,2);
 assert.match(r.receipt_sha256,/^[a-f0-9]{64}$/);
});
run("missing catalog row vetoes any otherwise valid classification receipt",()=>{
 const x=base();x.catalog.entries.pop();
 const r=integrated(x);
 assert.equal(r.status,"HOLD");
 assert.equal(r.receipt_sha256,null);
 assert.ok(r.reasons.includes("NATIVE_CATALOG_IDENTITY_COVERAGE_NOT_EXACT"));
});
run("name conflict on one product vetoes all joint revision promotion",()=>{
 const x=base();x.catalog.entries[0].product_name="OUTRO PRODUTO";
 const r=integrated(x);
 assert.equal(r.status,"HOLD");
 assert.equal(r.identity_match_count,0);
 assert.equal(r.receipt_sha256,null);
});
run("classification claim from another quantity fails despite complete catalog",()=>{
 const x=base(),cs=claims(x.pair);cs[0].quantity++;
 const r=integrated(x,cs);
 assert.equal(r.status,"HOLD");
 assert.ok(r.reasons.includes("CLASSIFICATION_CLAIMS_NOT_BOUND_TO_READER"));
 assert.equal(r.receipt_sha256,null);
});
run("observation-bearing revision cannot converge to classification",()=>{
 const x=base();
 x.pair.event.order.observation_rows.push({
  source_field:"DSOBSPEDDIGCMD",value:"SEM CEBOLINHA",
  scope_hint:"item",join_proven:true,item_index:0,
  CDPRODUTO:x.pair.event.order.items[0].CDPRODUTO
 });
 x.pair.decision.items[0].observations.push({
  source_field:"DSOBSPEDDIGCMD",value:"SEM CEBOLINHA"
 });
 rehash(x.pair);
 const r=integrated(x);
 assert.equal(r.status,"HOLD");
 assert.equal(r.receipt_sha256,null);
 assert.equal(r.print_authorized,false);
});
run("canceled native source remains HOLD despite catalog and signed-looking claims",()=>{
 const x=base();x.pair.event.order.items[0].IDSTPRCOMVEN="6";rehash(x.pair);
 const r=integrated(x);
 assert.equal(r.status,"HOLD");
 assert.equal(r.receipt_sha256,null);
});
run("catalog capture provenance change yields a distinct joint receipt",()=>{
 const x=base(),a=integrated(x);
 x.catalog.source_ref="SYNTHETIC_CAPTURE_REVISION_2";
 const b=integrated(x);
 assert.equal(b.status,"JOINT_SELF_CONSISTENCY_REVIEW_ONLY");
 assert.notEqual(a.catalog_capture_sha256,b.catalog_capture_sha256);
 assert.notEqual(a.receipt_sha256,b.receipt_sha256);
});
run("reordering identical catalog records leaves joint digest stable",()=>{
 const x=base(),a=integrated(x);
 x.catalog.entries.reverse();
 const b=integrated(x);
 assert.equal(b.status,"JOINT_SELF_CONSISTENCY_REVIEW_ONLY");
 assert.equal(a.catalog_capture_sha256,b.catalog_capture_sha256);
 assert.equal(a.receipt_sha256,b.receipt_sha256);
});
run("new capture date invalidates old joint receipt even if items match",()=>{
 const x=base(),a=integrated(x);
 x.catalog.captured_local_date="2026-10-31";
 const b=integrated(x);
 assert.equal(b.status,"JOINT_SELF_CONSISTENCY_REVIEW_ONLY");
 assert.notEqual(a.receipt_sha256,b.receipt_sha256);
 assert.equal(b.catalog_freshness_proven,undefined);
});
run("same catalog and claims for revised native state require distinct receipt",()=>{
 const x=base(),a=integrated(x);
 x.pair.event.order.IDSTCOMANDA="P";rehash(x.pair);
 const b=integrated(x);
 assert.equal(b.status,"JOINT_SELF_CONSISTENCY_REVIEW_ONLY");
 assert.notEqual(a.receipt_sha256,b.receipt_sha256);
});
console.log("READER_CATALOG_IDENTITY="+count+"/"+count+" REVIEW_ONLY");
