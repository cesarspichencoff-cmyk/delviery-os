"use strict";
/**
 * Two-source temporal guard for already archived IMP metadata (2026-10-04).
 * Offline only. This cannot identify an actual native DLV_IFO first dispatch,
 * prove a paper outcome, or attest completeness of live printing.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const SCHEMA="tata.comandas.archived-imp-temporal-eligibility.v1.review-only";
const NO_EFFECTS=Object.freeze({host_access:false,read_live_log:false,
  read_live_order:false,sql_read:false,sql_write:false,network:false,
  spooler_read:false,spooler_write:false,print:false,sequence_write:false,
  service_change:false,install:false,deploy:false});
const DENIAL=Object.freeze({native_first_dispatch_proven:false,
  printer_attempt_proven:false,physical_paper_proven:false,
  live_log_freshness_proven:false,operational_print_authorized:false,
  automatic_retry_allowed:false,source_claim_only:true});
function report(reason,stats=null){
  return {schema:SCHEMA,status:"HOLD",reason,stats,...DENIAL,effects:NO_EFFECTS};
}
const tzStamp=v=>typeof v==="string"&&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?-03:00$/.test(v)&&
  Number.isFinite(Date.parse(v))&&
  // For the observed Oct 2026 Itaim offset, convert to local clock
  // by subtracting three hours from UTC, rather than assuming host TZ.
  new Date(Date.parse(v)-3*3600*1000).toISOString().slice(0,19)===
  v.slice(0,19);
const plain=v=>v&&typeof v==="object"&&!Array.isArray(v);
function review(meta,source){
  if(!plain(meta)||!plain(source)||
    meta.schema!=="deliveryos.tata-reader-passive-print-metadata-observation.v1"||
    source.schema!=="deliveryos.tata-reader-passive-print-log-source-proof.v1"||
    meta.status!=="PASSIVE_SOURCE_EXISTS_SPECIFIC_ORDER_PRINT_NOT_PROVEN"||
    source.status!=="PASSIVE_SOURCE_EXISTS_IDENTITY_BRIDGE_UNPROVEN"||
    meta.captured_on!=="2026-10-05"||
    source.captured_date!=="2026-10-05"||
    meta.source?.metadata_only!==true||
    meta.source?.content_read!==false||
    source.source_exists!==true||
    source.observed_day!=="2026-10-04"||
    source.known_shadow_order?.temporal_coverage!==false||
    source.proof?.physical_paper_output!=="NOT_PROVEN"||
    source.effects?.print!==false||
    meta.effects?.print!==false)
    return report("ARCHIVED_PROVENANCE_OR_SCOPE_INVALID");
  const order=meta.reference_order,known=source.known_shadow_order;
  if(!plain(order)||!plain(known)||
    order.NRCOMANDA!==known.NRCOMANDA||
    order.NRCOMANDAEXT!==known.NRCOMANDAEXT||
    typeof known.opened_at!=="string"||
    !tzStamp(order.opened_at_local)||
    known.opened_at.slice(0,19)!==order.opened_at_local.slice(0,19)||
    !Array.isArray(meta.prior_day_files)||
    !Array.isArray(source.observed_files)||
    meta.prior_day_files.length!==7||source.observed_files.length!==7)
    return report("ORDER_IDENTITY_OR_FILE_COVERAGE_UNVERIFIED");
  const byName=new Map();
  for(const file of source.observed_files){
    if(!plain(file)||typeof file.file!=="string"||byName.has(file.file)||
      !/^\d{4}_\d{2}_\d{2}_IMP(?:_16_\d{1,3}(?:\.\d{1,3}){3})?\.txt$/.test(file.file)||
      file.file.slice(0,10)!=="2026_10_04"||
      !Number.isSafeInteger(file.size_bytes)||file.size_bytes<=0||
      !tzStamp(file.last_write_local))
      return report("LOG_FILE_METADATA_INVALID_OR_DUPLICATED");
    byName.set(file.file,file);
  }
  let latest=-Infinity;
  const observed=new Set();
  for(const file of meta.prior_day_files){
    if(!plain(file)||typeof file.name!=="string"||observed.has(file.name)||
       !tzStamp(file.last_write_local)||!byName.has(file.name))
      return report("ARCHIVED_SOURCE_FILES_NOT_BIJECTIVE");
    observed.add(file.name);
    const other=byName.get(file.name);
    if(Date.parse(other.last_write_local)!==Date.parse(file.last_write_local))
      return report("ARCHIVED_SOURCE_FILE_TIMES_CONTRADICT");
    latest=Math.max(latest,Date.parse(file.last_write_local));
  }
  if(observed.size!==byName.size)
    return report("ARCHIVED_SOURCE_FILES_NOT_BIJECTIVE");
  const opened=Date.parse(order.opened_at_local);
  if(!Number.isFinite(opened)||!Number.isFinite(latest))
    return report("ORDER_OR_LOG_DATE_UNPARSEABLE");
  const stats={archived_files_reconciled:observed.size,
    log_files_last_write_before_order:meta.prior_day_files
      .filter(x=>Date.parse(x.last_write_local)<opened).length,
    minutes_between_latest_log_and_order:
      Math.round((opened-latest)/60000*1000)/1000};
  if(latest<opened)
    return report("NO_TEMPORAL_COVERAGE_ARCHIVED_LOGS_PRECEDE_ORDER",stats);
  // A later LastWriteTime cannot attest a specific order or first dispatch.
  return report("TIME_OVERLAP_POSSIBLE_BUT_ORDER_ATTEMPT_UNLINKED",stats);
}
function sources(){
  const root=path.join(__dirname,"..","data");
  return [
    JSON.parse(fs.readFileSync(path.join(root,
      "tata_reader_passive_print_metadata_observation_20261005_v1.json"),"utf8")),
    JSON.parse(fs.readFileSync(path.join(root,
      "tata_reader_passive_print_log_source_proof_20261005_v1.json"),"utf8"))
  ];
}
if(require.main===module){
  const original=sources();
  const originalBytes=JSON.stringify(original);
  let n=0;
  function test(name,mutate,reason){
    const pair=structuredClone(original);
    if(mutate)mutate(...pair);
    const before=JSON.stringify(pair),out=review(...pair);
    assert.equal(JSON.stringify(pair),before,"pure review only");
    assert.equal(out.status,"HOLD");
    assert.equal(out.reason,reason);
    for(const [k,v] of Object.entries(DENIAL))assert.equal(out[k],v,k);
    assert.deepEqual(out.effects,NO_EFFECTS);
    const publicOutput=JSON.stringify(out);
    for(const sensitive of [
      "NRCOMANDA","NRCOMANDAEXT","192.168.","C:\\","IMP.txt",
      "0000348850","9627"
    ])assert.equal(publicOutput.includes(sensitive),false,sensitive);
    console.log("PASS "+(++n)+" "+name);
    return out;
  }
  const proof=test("seven historical log sources predate the reference order",
    null,"NO_TEMPORAL_COVERAGE_ARCHIVED_LOGS_PRECEDE_ORDER");
  assert.deepEqual(proof.stats?.archived_files_reconciled,7);
  assert.equal(proof.stats?.log_files_last_write_before_order,7);
  assert.ok(proof.stats.minutes_between_latest_log_and_order>0);
  test("metadata source deleted",(_m,s)=>{s.observed_files.pop()},
    "ORDER_IDENTITY_OR_FILE_COVERAGE_UNVERIFIED");
  test("cross-source file timestamp mismatch",(m)=>{m.prior_day_files[0].last_write_local="2026-10-04T21:00:00.0000000-03:00"},
    "ARCHIVED_SOURCE_FILE_TIMES_CONTRADICT");
  test("duplicate filename in archived source",(_m,s)=>{s.observed_files[1].file=s.observed_files[0].file},
    "LOG_FILE_METADATA_INVALID_OR_DUPLICATED");
  test("cross-order identifier cannot borrow print log",(m)=>{m.reference_order.NRCOMANDA="OTHER"},
    "ORDER_IDENTITY_OR_FILE_COVERAGE_UNVERIFIED");
  test("malformed order timestamp",(m)=>{m.reference_order.opened_at_local="2026-02-30T22:58:50-03:00"},
    "ORDER_IDENTITY_OR_FILE_COVERAGE_UNVERIFIED");
  test("archive source cannot declare paper success",(_m,s)=>{s.proof.physical_paper_output="PROVEN"},
    "ARCHIVED_PROVENANCE_OR_SCOPE_INVALID");
  test("archive metadata cannot claim content read",(m)=>{m.source.content_read=true},
    "ARCHIVED_PROVENANCE_OR_SCOPE_INVALID");
  test("later timestamp still does not prove native attempt",(m,s)=>{
    const next="2026-10-04T23:00:00.0000000-03:00";
    m.prior_day_files[0].last_write_local=next;
    s.observed_files.find(x=>x.file===m.prior_day_files[0].name).last_write_local=next;
  },"TIME_OVERLAP_POSSIBLE_BUT_ORDER_ATTEMPT_UNLINKED");
  assert.equal(JSON.stringify(original),originalBytes);
  console.log("COMANDAS_IMP_TEMPORAL_GUARD="+n+"/"+n+
    " ARCHIVED_ONLY NO_NATIVE_FIRST_DISPATCH NO_PAPER");
}
module.exports={SCHEMA,NO_EFFECTS,DENIAL,review,sources};
