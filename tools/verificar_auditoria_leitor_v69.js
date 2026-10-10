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
 const f=fixture({decisionOverrides:{ready:true}});
 const r=audit(f.events,f.decisions,f.shift);
 assert.equal(r.content_fingerprints_changed,1);
 assert.equal(r.decision_ready,1);
 assert.equal(r.both_ready_for_existing_shadow,0);
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
console.log("PASSIVE_READER_AUDIT_V69="+pass+"/"+pass+" NO_WRITE_NO_PRINT");
