"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),os=require("node:os");
const {audit,resolveArgs,scrubReason,fingerprint}=
 require("./auditar_pares_leitor_v69_readonly.js");
let pass=0;
const check=(title,fn)=>{fn();pass++;console.log("PASS "+pass+" "+title)};
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"deliveryos-passive-audit-v69-"));
function fixture(opts={}){
 const root=fs.mkdtempSync(path.join(tmp,"case-")),events=path.join(root,"events"),
   decisions=path.join(root,"decisions"),shift=path.join(root,"shift.json");
 fs.mkdirSync(events);fs.mkdirSync(decisions);
 const hash="a".repeat(64),filename="0000350928_"+hash+".json";
 const service={service:null,evidence:"UNKNOWN",source_ref:null,
  blockers:["SERVICE_STATE_DATE_MISMATCH_ORDER_DATE","SERVICE_STATE_EXPIRED_FOR_ORDER"]};
 const event={schema:"deliveryos.tata-reader-stable-order-event.v1",
  order_key:"PRIVATE_NO_OUTPUT",snapshot_hash:hash,ready_for_downstream_shadow:false,
  blockers:service.blockers,service_resolution:service,order:{
   DTHRABERMESA:"2026-10-09T23:01:08.0000000",
   NRCOMANDA:"0000350928",NRCOMANDAEXT:"SECRET_DO_NOT_REPORT",
   items:[{NRPRODCOMVEN:"1",CDPRODUTO:"SECRET_ITEM",
     CDARVPROD:"9150001000",QTPRODCOMVEN:"1.000"}]}};
 const decision={schema:"deliveryos.live-shadow-decision.v1",
  order_key:event.order_key,snapshot_hash:hash,ifood_sequence:"SECRET_DO_NOT_REPORT",
  teknisa_sequence:"0000350928",service,ready:false,
  blocking_reasons:["UPSTREAM_SERVICE_STATE_DATE_MISMATCH_ORDER_DATE",
    "UPSTREAM_SERVICE_STATE_EXPIRED_FOR_ORDER",
    "SERVICE_REQUIRED_SUSHI1_9.15.00.010.00"],
  items:[{item_index:1,product_name:"SECRET_NAME",quantity:1}],
  packaging:{total_items:1},kits:{status:"FACT"},
  sequence:{shadow_candidate:"001",binding_written:false}};
 decision.fingerprint=fingerprint(decision);
 const shiftData={schema:"deliveryos.production-service-shift-state.v2",
  store_id:"0001",operational_date:opts.shiftDate||"2026-10-07",service:"DINNER",
  valid_until_local:opts.validUntil||"2026-10-07T23:59:59",
  clock_inference_used:false,evidence:"HUMAN_CONFIRMED_RULE",source_ref:"HUMAN_CONFIRMATION"};
 fs.writeFileSync(path.join(events,filename),JSON.stringify(event));
 if(!opts.missingDecision)
  fs.writeFileSync(path.join(decisions,filename.replace(".json",".decision.json")),
  JSON.stringify({...decision,...opts.decisionOverrides}));
 fs.writeFileSync(shift,JSON.stringify(shiftData));
 return {events,decisions,shift,filename,root,event,decision};
}
check("real-format blocked pair classified without leaking an order number",()=>{
 const f=fixture(),result=audit(f.events,f.decisions,f.shift);
 assert.equal(result.observed_file_count,1);
 assert.equal(result.paired,1);
 assert.equal(result.matching_revisions,1);
 assert.equal(result.content_fingerprints_valid,1);
 assert.equal(result.both_ready_for_existing_shadow,0);
 assert.equal(result.shift_control.mismatching_event_dates,1);
 assert.equal(result.shift_control.expired_for_event_count,1);
 assert.equal(result.shift_control.configured_operational_date,"2026-10-07");
 assert.equal(result.shift_control.automatic_shift_selection,false);
 const output=JSON.stringify(result);
 assert.ok(!output.includes("SECRET"));
 assert.ok(!output.includes("0000350928"));
 assert.ok(!output.includes("9.15.00.010.00"));
 assert.ok(output.includes("SERVICE_REQUIRED_SUSHI1"));
});
check("tampering with a decision after fingerprint creation is detected",()=>{
 const f=fixture({decisionOverrides:{ready:true,items:[
  {item_index:1,product_name:"SECRET_NAME",quantity:2}]}});
 const r=audit(f.events,f.decisions,f.shift);
 assert.equal(r.content_fingerprints_changed,1);
 assert.equal(r.decision_ready,1);
 assert.equal(r.both_ready_for_existing_shadow,0);
});
check("both ready flags with blockers are not a verified shadow pair",()=>{
 const f=fixture(),ep=path.join(f.events,f.filename),
   dp=path.join(f.decisions,f.filename.replace(".json",".decision.json"));
 const e=JSON.parse(fs.readFileSync(ep));
 e.ready_for_downstream_shadow=true;fs.writeFileSync(ep,JSON.stringify(e));
 const d=JSON.parse(fs.readFileSync(dp));
 d.ready=true;fs.writeFileSync(dp,JSON.stringify(d));
 const r=audit(f.events,f.decisions,f.shift);
 assert.equal(r.both_ready_flags_only,1);
 assert.equal(r.untrusted_ready_claims,1);
 assert.equal(r.both_ready_for_existing_shadow,0);
 assert.equal(r.latest_pair_summaries[0].status,"BLOCKED");
});
check("both ready flags with a tampered fingerprint are not a verified shadow pair",()=>{
 const f=fixture(),ep=path.join(f.events,f.filename),
   dp=path.join(f.decisions,f.filename.replace(".json",".decision.json"));
 const e=JSON.parse(fs.readFileSync(ep));
 const d=JSON.parse(fs.readFileSync(dp));
 const service={service:"DINNER",evidence:"HUMAN_CONFIRMED_RULE",
   source_ref:"FIXTURE:PROOF:NOT_LIVE",blockers:[]};
 e.ready_for_downstream_shadow=true;e.blockers=[];e.service_resolution=service;
 d.ready=true;d.blocking_reasons=[];d.service=service;
 d.fingerprint=fingerprint(d);
 fs.writeFileSync(ep,JSON.stringify(e));
 fs.writeFileSync(dp,JSON.stringify(d));
 const valid=audit(f.events,f.decisions,f.shift);
 assert.equal(valid.both_ready_flags_only,1);
 assert.equal(valid.both_ready_for_existing_shadow,1);
 d.items[0].quantity=99;
 fs.writeFileSync(dp,JSON.stringify(d));
 const altered=audit(f.events,f.decisions,f.shift);
 assert.equal(altered.both_ready_flags_only,1);
 assert.equal(altered.content_fingerprints_changed,1);
 assert.equal(altered.untrusted_ready_claims,1);
 assert.equal(altered.both_ready_for_existing_shadow,0);
});
check("missing decision is never paired by filename resemblance",()=>{
 const f=fixture({missingDecision:true}),r=audit(f.events,f.decisions,f.shift);
 assert.equal(r.paired,0);assert.equal(r.missing,1);
 assert.equal(r.both_ready_for_existing_shadow,0);
});
check("genuine date-specific shift is not flagged stale from filename alone",()=>{
 const f=fixture({shiftDate:"2026-10-09",validUntil:"2026-10-09T23:59:59"});
 const r=audit(f.events,f.decisions,f.shift);
 assert.equal(r.shift_control.mismatching_event_dates,0);
 assert.equal(r.shift_control.expired_for_event_count,0);
 assert.equal(r.both_ready_for_existing_shadow,0,"unproven event stays blocked");
});
check("read-only audit preserves input bytes and last-modified times",()=>{
 const f=fixture(),files=[
  path.join(f.events,f.filename),
  path.join(f.decisions,f.filename.replace(".json",".decision.json")),f.shift];
 const stat=()=>files.map(p=>({
  bytes:fs.readFileSync(p).toString("hex"),mtime:fs.statSync(p).mtimeMs}));
 const before=stat();audit(f.events,f.decisions,f.shift);
 assert.deepEqual(stat(),before);
});
check("one bad input schema cannot falsely produce a ready pair",()=>{
 const f=fixture(),p=path.join(f.events,f.filename);
 const d=JSON.parse(fs.readFileSync(p));d.schema="FAKE";
 fs.writeFileSync(p,JSON.stringify(d));
 const r=audit(f.events,f.decisions,f.shift);
 assert.equal(r.paired,1);
 assert.equal(r.unreadable,1);
 assert.equal(r.both_ready_for_existing_shadow,0);
});
check("path argument parser forbids missing and ambiguous sources",()=>{
 assert.throws(()=>resolveArgs([]),/REQUIRED_DISTINCT|REQUIRED_EXPLICIT/);
 const f=fixture();
 assert.throws(()=>resolveArgs(["--events",f.events,"--decisions",f.events,
 "--shift",f.shift]),/REQUIRED_DISTINCT/);
 assert.equal(resolveArgs(["--events",f.events,"--decisions",f.decisions,
 "--shift",f.shift])["--shift"],f.shift);
});
check("all free-form SQL/customer blocker text is collapsed to safe categories",()=>{
 assert.equal(scrubReason("SERVICE_REQUIRED_SUSHI1_9.15.00.010.00"),"SERVICE_REQUIRED_SUSHI1");
 assert.equal(scrubReason("ALERGIA: ANON-CUSTOMER-1"),"OTHER_REDACTED");
 assert.equal(scrubReason("UNEXPECTED_ORDER_0000350928"),"OTHER_REDACTED");
});

check("V7.3: watcher v1 contains zero note columns in archived real-format fixture",()=>{
 const f=fixture(),r=audit(f.events,f.decisions,f.shift),o=r.observation_source_coverage;
 assert.equal(o.native_event_item_records,1);
 assert.equal(o.native_items_with_any_observation_field,0);
 assert.equal(o.native_items_with_all_observation_fields,0);
 assert.equal(o.native_pairs_with_complete_observation_field_names,0);
 assert.equal(o.exact_revision_item_observation_proofs_verified,false);
 assert.equal(o.eligible_three_ticket_pairs_proven,0);
 assert.equal(r.latest_pair_summaries[0].three_ticket_preview_ready,false);
 assert.equal(r.latest_pair_summaries[0].native_event_observation_fields_all_present,false);
});
check("V7.3: all three native note field names do NOT imply revision proof or approval",()=>{
 const f=fixture(),file=path.join(f.events,f.filename);
 const event=JSON.parse(fs.readFileSync(file,"utf8"));
 Object.assign(event.order.items[0],{
  DSOBSDESCIT:"SECRET_NEVER_EMIT_SEM_CAMARAO",
  DSOBSPEDDIGCMD:"SECRET_NEVER_EMIT_ALERGIA",
  TXPRODCOMVEN:"SECRET_NEVER_EMIT_ITEM_123"
 });
 fs.writeFileSync(file,JSON.stringify(event));
 const result=audit(f.events,f.decisions,f.shift),o=result.observation_source_coverage;
 assert.equal(o.native_items_with_any_observation_field,1);
 assert.equal(o.native_items_with_all_observation_fields,1);
 assert.equal(o.native_pairs_with_complete_observation_field_names,1);
 assert.equal(o.independent_sql_or_production_notes_join_executed,false);
 assert.equal(o.exact_revision_item_observation_proofs_verified,false);
 assert.equal(o.eligible_three_ticket_pairs_proven,0);
 const out=JSON.stringify(result);
 assert.ok(!out.includes("SECRET_NEVER_EMIT"));
 assert.ok(!out.includes("SEM_CAMARAO")&&!out.includes("ALERGIA"));
});
check("V7.3: one incomplete field set must not count as complete coverage",()=>{
 const f=fixture(),file=path.join(f.events,f.filename);
 const event=JSON.parse(fs.readFileSync(file,"utf8"));
 event.order.items[0].DSOBSDESCIT="NO_EXPORT";
 event.order.items[0].TXPRODCOMVEN="NO_EXPORT";
 fs.writeFileSync(file,JSON.stringify(event));
 const o=audit(f.events,f.decisions,f.shift).observation_source_coverage;
 assert.equal(o.native_items_with_any_observation_field,1);
 assert.equal(o.native_items_with_all_observation_fields,0);
 assert.equal(o.native_pairs_with_complete_observation_field_names,0);
});
check("V7.3: empty fields count for schema presence only, never as proven NONE",()=>{
 const f=fixture(),file=path.join(f.events,f.filename);
 const event=JSON.parse(fs.readFileSync(file,"utf8"));
 for(const key of ["DSOBSDESCIT","DSOBSPEDDIGCMD","TXPRODCOMVEN"])
  event.order.items[0][key]="";
 fs.writeFileSync(file,JSON.stringify(event));
 const r=audit(f.events,f.decisions,f.shift);
 assert.equal(r.observation_source_coverage.native_items_with_all_observation_fields,1);
 assert.equal(r.observation_source_coverage.exact_revision_item_observation_proofs_verified,false);
 assert.equal(r.latest_pair_summaries[0].exact_revision_sql_observations_verified,false);
 assert.equal(r.latest_pair_summaries[0].three_ticket_preview_ready,false);
});
check("V7.3: even trusted-ready existing shadow does not grant three ticket preview",()=>{
 const f=fixture(),ep=path.join(f.events,f.filename),
  dp=path.join(f.decisions,f.filename.replace(".json",".decision.json"));
 const e=JSON.parse(fs.readFileSync(ep,"utf8"));
 const d=JSON.parse(fs.readFileSync(dp,"utf8"));
 const shiftService={service:"DINNER",evidence:"HUMAN_CONFIRMED_RULE",
   source_ref:"FICTIONAL_RULE_REFERENCE",blockers:[]};
 e.ready_for_downstream_shadow=true;e.blockers=[];e.service_resolution=shiftService;
 d.ready=true;d.blocking_reasons=[];d.service=shiftService;
 d.fingerprint=fingerprint(d);
 fs.writeFileSync(ep,JSON.stringify(e));fs.writeFileSync(dp,JSON.stringify(d));
 const r=audit(f.events,f.decisions,f.shift);
 assert.equal(r.both_ready_for_existing_shadow,1);
 assert.equal(r.observation_source_coverage.exact_revision_item_observation_proofs_verified,false);
 assert.equal(r.observation_source_coverage.eligible_three_ticket_pairs_proven,0);
 assert.equal(r.latest_pair_summaries[0].three_ticket_preview_ready,false);
});

console.log("PASSIVE_READER_AUDIT_V69="+pass+"/"+pass+" NO_WRITE_NO_PRINT");
