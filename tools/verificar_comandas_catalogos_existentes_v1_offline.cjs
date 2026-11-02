"use strict";
/**
 * Archived Itaim catalogue / routing reconciliation (01 Nov 2026).
 * This is an offline integrity gate over ALREADY VERSIONED historical data.
 * No database, network, printer, sequence, service or deployment access.
 * Never infer an active product, approved station or physical printing.
 * Public result contains aggregate counts only, not product IDs/routes/names.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ROOT=path.join(__dirname,"..","data");
const SCHEMA="tata.comandas.archived-catalog-routing-reconciliation.v1.review-only";
const NO_EFFECTS=Object.freeze({
  database_read:false,database_write:false,printer_read:false,print:false,
  spooler_write:false,service_change:false,sequence_write:false,deploy:false
});
const NO_AUTH=Object.freeze({
  current_catalog_attested:false,active_status_proven:false,
  current_routing_attested:false,station_approved:false,
  packaging_approved:false,first_native_dispatch_proven:false,
  physical_paper_proven:false,print_authorized:false
});
const read=name=>JSON.parse(fs.readFileSync(path.join(ROOT,name),"utf8"));
const canonical=s=>typeof s==="string"?s.replaceAll(".",""):null;
const plain=x=>x&&typeof x==="object"&&!Array.isArray(x);
const hold=reason=>({schema:SCHEMA,status:"HOLD",reason,counts:null,
  ...NO_AUTH,effects:NO_EFFECTS});
function reconcile(catalog,routing,comparison,identity){
  if(!plain(catalog)||!plain(routing)||!plain(comparison)||!plain(identity))
    return hold("MISSING_OR_INVALID_ARCHIVE");
  if(catalog.schema!=="deliveryos.tata-reader-cdarvprod-catalog-audit-result.v1"||
     catalog.provenance!=="USER_RETURNED_AUTHORIZED_CAIXA_PROBE_OUTPUT"||
     catalog.status!=="CDARVPROD_CATALOG_AGGREGATE_READ"||
     catalog.original_output_sha256!=="1A4A4DD8A409DA043B9DA08BD7D3057A1B3C046C2F73C6A4C19E59F93D882522"||
     !String(catalog.captured_at).startsWith("2026-10-04T")||
     !Array.isArray(catalog.values)||catalog.values.length!==554||
     catalog.summary?.total_product_rows!==554||
     catalog.summary?.null_or_blank_cdarvprod_rows!==0||
     catalog.summary?.distinct_nonblank_cdarvprod!==554)
    return hold("CATALOG_ARCHIVE_CONTRACT_DRIFT");
  const local=new Set();
  for(const row of catalog.values){
    if(!plain(row)||typeof row.CDARVPROD!=="string"||
       !/^[0-9A-Z]{8,10}$/.test(row.CDARVPROD)||
       row.product_rows!==1||local.has(row.CDARVPROD))
      return hold("CATALOG_VALUES_INVALID_OR_DUPLICATED");
    local.add(row.CDARVPROD);
  }
  if(routing.schema!=="deliveryos.odhen.product-routing.compact.v1"||
     routing.store!=="0001 - TATA ITAIM"||
     routing.captured_date!=="2026-09-30"||
     routing.counts?.products!==463||routing.counts?.one_target!==346||
     routing.counts?.two_targets!==117||!plain(routing.products)||
     Object.keys(routing.products).length!==463)
    return hold("ROUTING_ARCHIVE_CONTRACT_DRIFT");
  const routed=new Set();
  let single=0,double=0;
  for(const [key,targets] of Object.entries(routing.products)){
    const code=canonical(key);
    if(!code||!/^[0-9A-Z]{8,10}$/.test(code)||routed.has(code)||
       !Array.isArray(targets)||![1,2].includes(targets.length)||
       new Set(targets).size!==targets.length||
       targets.some(x=>typeof x!=="string"||!/^0000[0-9]$/.test(x)))
      return hold("ROUTING_CODES_OR_TARGETS_INVALID");
    routed.add(code);
    if(targets.length===1)single++;else double++;
  }
  if(single!==346||double!==117)
    return hold("ROUTING_TARGET_COUNTS_DRIFT");
  const missingLocal=[...routed].filter(x=>!local.has(x)).sort();
  const missingRoute=[...local].filter(x=>!routed.has(x)).sort();
  const overlap=routed.size-missingLocal.length;
  if(overlap!==391||missingLocal.length!==72||missingRoute.length!==163)
    return hold("ARCHIVED_CATALOG_ROUTING_SETS_DRIFT");
  const c=comparison.comparison;
  if(comparison.schema!=="deliveryos.tata-reader-cdarvprod-vs-routing-comparison.v1"||
     comparison.status!=="GLOBAL_EQUIVALENCE_NOT_PROVEN"||
     comparison.captured_date!=="2026-10-04"||!plain(c)||
     c.local_distinct!==554||c.routing_products!==463||
     c.exact_overlap!==overlap||
     c.routing_missing_from_local_count!==missingLocal.length||
     c.local_not_in_routing_count!==missingRoute.length||
     !Array.isArray(c.routing_missing_from_local)||
     !Array.isArray(c.local_not_in_routing)||
     JSON.stringify([...c.routing_missing_from_local].sort())!==JSON.stringify(missingLocal)||
     JSON.stringify([...c.local_not_in_routing].sort())!==JSON.stringify(missingRoute)||
     comparison.interpretation?.runtime_global_authority!==false)
    return hold("EXISTING_CROSSWALK_NOT_RECONCILED");
  if(identity.schema!=="tata.comandas.historical-native-product-identity-lineage.v1.review-only"||
     identity.source_records!==554||
     identity.source_product_status_available!==false||
     !String(identity.source_captured_at).startsWith("2026-10-05T")||
     identity.selected_rows!==14||identity.unique_codes!==14||
     identity.unique_native_product_ids!==14||
     identity.matching_observed_reader_labels!==14||
     identity.independent_live_catalog_attested!==false||
     identity.active_status_proven!==false||
     identity.print_authorized!==false||
     !Array.isArray(identity.entries)||identity.entries.length!==14)
    return hold("HISTORICAL_NATIVE_IDENTITY_CONTRACT_DRIFT");
  const unique=new Set();
  let matched=0,withRoute=0;
  for(const row of identity.entries){
    const code=canonical(row?.canonical_code);
    if(!code||unique.has(code)||!local.has(code)||
       row.historical_cache_code_matches!==1||
       row.historical_native_id_unique_within_14!==true||
       row.historical_label_matches_reader!==true||
       row.active_status!=="UNKNOWN"||
       row.current_source_join_proven!==false||
       row.current_classification_approved!==false||
       row.print_authorized!==false)
      return hold("FOURTEEN_PRODUCT_IDENTITY_NOT_SAFE");
    unique.add(code);
    matched++;
    if(routed.has(code))withRoute++;
  }
  if(matched!==14||withRoute!==13||
     !unique.has("8201100200")||routed.has("8201100200"))
    return hold("FOURTEEN_PRODUCT_HISTORICAL_COVERAGE_DRIFT");
  return {schema:SCHEMA,status:"HISTORICAL_SOURCES_RECONCILED_REVIEW_ONLY",
    reason:"ARCHIVED_SET_OVERLAP_IS_NOT_CURRENT_CATALOG_OR_PRINT_PROOF",
    counts:{catalog_codes:local.size,routing_codes:routed.size,overlap,
      routing_without_local_catalog:missingLocal.length,
      local_catalog_without_routing:missingRoute.length,
      historical_identity_matches:matched,historical_identity_with_route:withRoute,
      historical_conference_only_without_route:1},
    ...NO_AUTH,effects:NO_EFFECTS};
}
function inputs(){
  return [
    read("tata_reader_cdarvprod_catalog_audit_result_20261004_v1.json"),
    read("odhen_product_routing_compact_v1.json"),
    read("tata_reader_cdarvprod_vs_routing_comparison_20261004_v1.json"),
    read("comandas_historical_native_identity_lineage_20261005_review_only.json")
  ];
}
if(require.main===module){
  const source=inputs();
  const initial=JSON.stringify(source);
  let n=0;
  function test(label,mutate,expected){
    const copies=structuredClone(source);
    if(mutate)mutate(...copies);
    const before=JSON.stringify(copies);
    const result=reconcile(...copies);
    assert.equal(JSON.stringify(copies),before,"read-only");
    assert.equal(result.status,expected,label);
    for(const [k,v] of Object.entries(NO_AUTH))assert.equal(result[k],v,k);
    assert.deepEqual(result.effects,NO_EFFECTS);
    assert.equal(JSON.stringify(result).includes("CDPRODUTO"),false);
    assert.equal(JSON.stringify(result).includes("NRCOMANDA"),false);
    console.log("PASS "+(++n)+" "+label);
    return result;
  }
  const ok=test("existing 554 + 463 archives reconciled; 14/14 historical only",
    null,"HISTORICAL_SOURCES_RECONCILED_REVIEW_ONLY");
  assert.deepEqual(ok.counts,{catalog_codes:554,routing_codes:463,
    overlap:391,routing_without_local_catalog:72,
    local_catalog_without_routing:163,historical_identity_matches:14,
    historical_identity_with_route:13,historical_conference_only_without_route:1});
  test("missing archived catalog row does not silently pass",c=>c.values.pop(),"HOLD");
  test("duplicated CDARVPROD fails",c=>{c.values[1].CDARVPROD=c.values[0].CDARVPROD},"HOLD");
  test("altered existing comparison cannot replace source",(_c,_r,m)=>{m.comparison.exact_overlap=463},"HOLD");
  test("altered membership with unchanged totals fails",c=>{c.values[0].CDARVPROD="1234567890"},"HOLD");
  test("altered routing destination fails",(_c,r)=>{r.products[Object.keys(r.products)[0]]=["00003","00003"]},"HOLD");
  test("new product replacing one route requires re-review",(_c,r)=>{const k=Object.keys(r.products)[0];r.products["7.77.77.777.77"]=r.products[k];delete r.products[k]},"HOLD");
  test("invented active status is rejected",(_c,_r,_m,h)=>{h.entries[0].active_status=true},"HOLD");
  test("invented current source join is rejected",(_c,_r,_m,h)=>{h.entries[0].current_source_join_proven=true},"HOLD");
  test("missing one of 14 native IDs is rejected",(_c,_r,_m,h)=>{h.entries.pop()},"HOLD");
  test("cookie production route introduced silently is rejected",(_c,r)=>{r.products["8.20.11.002.00"]=["00002"]},"HOLD");
  test("rewriting provenance is rejected",c=>{c.provenance="USER_APPROVED_LIVE"},"HOLD");
  assert.equal(JSON.stringify(source),initial);
  console.log("CATALOG_ARCHIVE_RECONCILIATION="+n+"/"+n+
    " REVIEW_ONLY NO_ACTIVE_STATUS NO_LIVE_ROUTE NO_PRINT");
}
module.exports={SCHEMA,NO_EFFECTS,NO_AUTH,reconcile,inputs};
