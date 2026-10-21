"use strict";
/**
 * TATA Comanda V8.64 — synthetic iFood <-> Teknisa crossing campaigns.
 * Tests actual V8.57 projector plus a SIMULATION-ONLY correlation model.
 * This model does NOT implement an authenticated iFood integration, database
 * source adapter or operational print decision. Never executes any effect.
 */
const assert=require("node:assert/strict");
const {syntheticReaderPairV857:seedPair}=
 require("./verificar_tata_comanda_reader_native_v857_offline.cjs");
const {projectReaderEssentials,snapshotHash,decisionHash}=
 require("./tata_comanda_reader_native_essentials_v857_offline.cjs");

const EFFECTS=Object.freeze({
 ifood_write:false,teknisa_write:false,sql:false,print:false,
 spooler:false,sequence_allocate:false,sequence_write:false,
 service_change:false,network:false,fiscal:false,
});
const deep=x=>JSON.parse(JSON.stringify(x));
const base=()=>deep(seedPair());
const native=p=>projectReaderEssentials(p);
const rehash=p=>{
 p.event.snapshot_hash=snapshotHash(p.event.order);
 p.decision.snapshot_hash=p.event.snapshot_hash;
 p.decision.fingerprint=decisionHash(p.decision);
 return p;
};
let scenarios=0,properties=0;
function check(name,fn){
 fn();scenarios++;console.log("PASS V864 "+scenarios+" "+name);
}
function enforce(p,reason,{recompute=true,accepted=false}={}){
 if(recompute)rehash(p);
 const r=native(p);
 if(accepted){
  assert.equal(r.status,"SOURCE_NATIVE_ESSENTIAL_PREVIEW_HOLD",
   nameOf(reason,r));
  assert.equal(r.pair_snapshot_integrity_checked,true);
  assert.equal(r.decision_fingerprint_checked,true);
 }else{
  assert.equal(r.status,"HOLD",nameOf(reason,r));
  assert.equal(r.reason,reason);
  assert.equal(r.essential,null);assert.deepEqual(r.preview_lines,[]);
 }
 assert.equal(r.order_source_authenticated,false);
 assert.equal(r.ifood_gp_independently_observed,false);
 assert.equal(r.ready_for_operational_print,false);
 assert.equal(r.print_authorized,false);
 assert.deepEqual(r.bytes,[]);
 assert.ok(Object.values(r.effects).every(v=>v===false));
 return r;
}
function nameOf(want,r){return JSON.stringify({expected:want,status:r.status,reason:r.reason});}

check("same four-part order and persisted TATA seq give preview only",()=>{
 const r=enforce(base(),"baseline",{accepted:true});
 assert.equal(r.essential.ifood_short_id,"9627");
 assert.equal(r.essential.tata_sequence,"007");
 assert.equal(r.essential.NRCOMANDA,"0000348850");
});
check("recomputed local hashes cannot independently prove actual iFood source",()=>{
 const p=base();p.event.order.NRCOMANDAEXT="9628";
 p.decision.ifood_sequence="9628";
 const r=enforce(p,"simulated matching changed external short id",{accepted:true});
 assert.equal(r.ifood_gp_independently_observed,false);
});
check("iFood external short ID changed without corresponding decision",()=>{
 const p=base();p.event.order.NRCOMANDAEXT="9628";
 enforce(p,"SAME_ORDER_FOUR_FIELD_IDENTITY_NOT_PROVEN");
});
check("Teknisa order number differs from decision",()=>{
 const p=base();p.decision.teknisa_sequence="0000348899";
 enforce(p,"SAME_ORDER_FOUR_FIELD_IDENTITY_NOT_PROVEN");
});
check("store changes and old order key must not join",()=>{
 const p=base();p.event.order.CDFILIAL="0002";
 enforce(p,"SAME_ORDER_FOUR_FIELD_IDENTITY_NOT_PROVEN");
});
check("native four-part key collision by order field blocked",()=>{
 const p=base();p.event.order.NRVENDAREST="0000349299";
 enforce(p,"SAME_ORDER_FOUR_FIELD_IDENTITY_NOT_PROVEN");
});
check("revised matching key but wrong Teknisa decision identity blocked",()=>{
 const p=base();p.event.order.NRCOMANDA="0000348899";
 p.event.order_key="0001|01|0000349281|0000348899";
 p.decision.order_key=p.event.order_key;
 enforce(p,"SAME_ORDER_FOUR_FIELD_IDENTITY_NOT_PROVEN");
});
check("raw iFood order with invalid origin remains blocked",()=>{
 const p=base();p.event.order.IDORGCMDVENDA="OTHER_SOURCE";
 enforce(p,"SAME_ORDER_FOUR_FIELD_IDENTITY_NOT_PROVEN");
});
check("canceled source item cannot be treated as active",()=>{
 const p=base();p.event.order.items[0].IDSTPRCOMVEN="C";
 enforce(p,"ITEM_IDENTITY_NAME_OR_QUANTITY_MISMATCH");
});
check("two rows with the same native source item index blocked",()=>{
 const p=base();p.event.order.items[1].NRPRODCOMVEN=p.event.order.items[0].NRPRODCOMVEN;
 enforce(p,"ITEM_IDENTITY_NAME_OR_QUANTITY_MISMATCH");
});
check("quantity altered in decision only, with valid new fingerprint",()=>{
 const p=base();p.decision.items[0].quantity=3;
 enforce(p,"ITEM_IDENTITY_NAME_OR_QUANTITY_MISMATCH");
});
check("zero raw item quantity blocked",()=>{
 const p=base();p.event.order.items[0].QTPRODCOMVEN="0";
 enforce(p,"ITEM_IDENTITY_NAME_OR_QUANTITY_MISMATCH");
});
check("fractional source quantity blocked",()=>{
 const p=base();p.event.order.items[0].QTPRODCOMVEN="1.5";
 enforce(p,"ITEM_IDENTITY_NAME_OR_QUANTITY_MISMATCH");
});
check("scientific-notation quantity blocked",()=>{
 const p=base();p.event.order.items[0].QTPRODCOMVEN="2e0";
 enforce(p,"ITEM_IDENTITY_NAME_OR_QUANTITY_MISMATCH");
});
check("source product code different from decision",()=>{
 const p=base();p.decision.items[0].CDPRODUTO="WRONG";
 enforce(p,"ITEM_IDENTITY_NAME_OR_QUANTITY_MISMATCH");
});
check("canonical tree code mismatch blocked",()=>{
 const p=base();p.decision.items[0].canonical_code="9.20.00.999.00";
 enforce(p,"ITEM_IDENTITY_NAME_OR_QUANTITY_MISMATCH");
});
check("placeholder product name cannot be silently printed",()=>{
 const p=base();p.decision.items[0].product_name="A DEFINIR";
 enforce(p,"ITEM_IDENTITY_NAME_OR_QUANTITY_MISMATCH");
});
check("single item note dropped even with recomputed hashes",()=>{
 const p=base();p.decision.items[0].observations.shift();
 enforce(p,"ITEM_OBSERVATION_SOURCE_MISMATCH");
});
check("new item note invented in decision blocked",()=>{
 const p=base();p.decision.items[0].observations.push(
  {source_field:"TXPRODCOMVEN",value:"FAKE NOTE"});
 enforce(p,"ITEM_OBSERVATION_SOURCE_MISMATCH");
});
check("allergy note edited but hashes self-consistent still blocked",()=>{
 const p=base();p.decision.items[0].observations[1].value="FAKE EDITED ALLERGY";
 enforce(p,"ITEM_OBSERVATION_SOURCE_MISMATCH");
});
check("item note source field misattributed blocked",()=>{
 const p=base();p.decision.items[0].observations[1].source_field="DSOBSPEDDIGCMD";
 enforce(p,"ITEM_OBSERVATION_SOURCE_MISMATCH");
});
check("note linked to a different item despite identical texts blocked",()=>{
 const p=base();p.event.order.observation_rows[0].item_index=1;
 enforce(p,"ITEM_NOTE_LINK_NOT_PROVEN");
});
check("note with unknown source field blocked",()=>{
 const p=base();p.event.order.observation_rows[0].source_field="UNKNOWN_FIELD";
 p.decision.items[0].observations[0].source_field="UNKNOWN_FIELD";
 enforce(p,"ITEM_NOTE_LINK_NOT_PROVEN");
});
check("source note whose join_proven is false blocked",()=>{
 const p=base();p.event.order.observation_rows[0].join_proven=false;
 enforce(p,"UNPROVEN_OBSERVATION_ROW");
});
check("duplicated item-note source is not silently deduplicated",()=>{
 const p=base();p.event.order.observation_rows.push(
  deep(p.event.order.observation_rows[0]));
 enforce(p,"DUPLICATE_ITEM_NOTE_SOURCE");
});
check("general observation removed in decision blocked",()=>{
 const p=base();p.decision.order_observations=[];
 enforce(p,"GENERAL_OBSERVATIONS_NOT_IDENTICAL");
});
check("general observation changed only in decision blocked",()=>{
 const p=base();p.decision.order_observations[0].value="CHANGED DELIVERY TEXT";
 enforce(p,"GENERAL_OBSERVATIONS_NOT_IDENTICAL");
});
check("general note changed in event and decision is STILL not SQL authenticated",()=>{
 const p=base();
 p.event.order.observation_rows[2].value="NEW SYNTHETIC INSTRUCTION";
 p.decision.order_observations[0].value="NEW SYNTHETIC INSTRUCTION";
 const r=enforce(p,"synthetic altered upstream",{accepted:true});
 assert.equal(r.order_source_authenticated,false);
});
check("declared incomplete observation scan blocked",()=>{
 const p=base();p.event.order.observation_scan_complete=false;
 enforce(p,"V2_FULL_OBSERVATION_SCAN_NOT_PROVEN");
});
check("event snapshot tampered but mirrored into decision blocked",()=>{
 const p=base();p.event.snapshot_hash="a".repeat(64);
 p.decision.snapshot_hash=p.event.snapshot_hash;
 p.decision.fingerprint=decisionHash(p.decision);
 enforce(p,"WATCHER_V2_SNAPSHOT_HASH_MISMATCH",{recompute:false});
});
check("decision fingerprint tampered with valid event blocked",()=>{
 const p=base();p.decision.fingerprint="b".repeat(64);
 enforce(p,"DECISION_CONTENT_FINGERPRINT_MISMATCH",{recompute:false});
});
check("one source item removed from decision blocked",()=>{
 const p=base();p.decision.items.pop();
 enforce(p,"SOURCE_ITEM_COVERAGE_INVALID");
});
check("no source items blocked",()=>{
 const p=base();p.event.order.items=[];p.decision.items=[];
 enforce(p,"SOURCE_ITEM_COVERAGE_INVALID");
});
check("unpersisted TATA sequence never replaced by shadow candidate",()=>{
 const p=base();p.sequence_state.bindings=[];
 enforce(p,"TATA_SEQUENCE_NOT_UNIQUELY_PERSISTED_FOR_ORDER_DAY");
});
check("duplicate TATA sequence for another order in same store/day blocked",()=>{
 const p=base();
 p.sequence_state.bindings.push({scope_id:"STORE:0001|DATE:2026-10-20",
  teknisa_order_id:"0000348000",tata_sequence:"007"});
 enforce(p,"TATA_SEQUENCE_NOT_UNIQUELY_PERSISTED_FOR_ORDER_DAY");
});
check("TATA sequence bound only on prior day blocked",()=>{
 const p=base();
 p.sequence_state.bindings[0].scope_id="STORE:0001|DATE:2026-10-19";
 enforce(p,"TATA_SEQUENCE_NOT_UNIQUELY_PERSISTED_FOR_ORDER_DAY");
});
check("TATA sequence 000 forbidden",()=>{
 const p=base();p.sequence_state.bindings[0].tata_sequence="000";
 enforce(p,"TATA_SEQUENCE_NOT_UNIQUELY_PERSISTED_FOR_ORDER_DAY");
});
check("shadow proposes another number but persisted TATA number wins",()=>{
 const p=base();p.decision.sequence.shadow_candidate="998";
 const r=enforce(p,"persisted seq wins",{accepted:true});
 assert.equal(r.essential.tata_sequence,"007");
});

// This extra witness models correlation/lifecycle policy, NOT any iFood API.
// It deliberately cannot claim source authenticity, signature or GP receipts.
function crossing(ifo,teknisa,history={}){
 const reasons=[];
 const fail=c=>{if(!reasons.includes(c))reasons.push(c);};
 const matches=teknisa.filter(x=>x.event?.order?.NRCOMANDAEXT===ifo.short);
 if(!ifo.eventId||!/^evt_[a-z0-9_]{1,48}$/.test(ifo.eventId))
  fail("IFOOD_EVENT_ID_UNVERIFIED");
 if(ifo.transport==="WEBHOOK"){
  if(ifo.signatureVerified!==true)fail("WEBHOOK_SIGNATURE_NOT_VERIFIED");
 }else if(ifo.transport==="POLL"){
  if(ifo.authorizedPolling!==true)fail("POLLING_NOT_AUTHORIZED");
 }else fail("IFOOD_TRANSPORT_UNVERIFIED");
 if(ifo.status!=="ACTIVE"||ifo.canceled===true)
  fail("CANCELED_OR_INACTIVE_ORDER");
 if(ifo.orderOfEventsVerified!==true)fail("EVENT_ORDER_NOT_PROVEN");
 if(ifo.freshnessVerified!==true)fail("EVENT_STALE_OR_SOURCE_DELAYED");
 if(ifo.revisionCurrent!==true)fail("STALE_OR_UNCONFIRMED_REVISION");
 if((history.eventIds||[]).includes(ifo.eventId))fail("REDELIVERED_EVENT");
 if((history.revisions||[]).includes(ifo.revision))fail("REPLAYED_REVISION");
 if(matches.length!==1)fail(matches.length?"AMBIGUOUS_SHORT_ID":"NO_TEKNISA_SHORT_ID_MATCH");
 if(matches.length===1){
  const m=matches[0],o=m.event.order;
  const key=[o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].join("|");
  if(ifo.nativeFourKey!==key)fail("FOUR_PART_KEY_NOT_INDEPENDENTLY_BOUND");
  if(ifo.store!==o.CDFILIAL)fail("CROSS_STORE_COLLISION");
  if(ifo.nativeOrder!==o.NRCOMANDA)fail("TEKNISA_ORDER_MISMATCH");
  const assessment=native(m);
  if(assessment.status!=="SOURCE_NATIVE_ESSENTIAL_PREVIEW_HOLD")
   fail("READER_INTEGRITY_OR_SEQUENCE_HOLD");
 }
 // iFood full UUID and GP-origin truth are never authenticated in this
 // simulation: returning a candidate is never a print permission.
 return {status:reasons.length?"HOLD":"SIMULATION_ONLY_CANDIDATE",
  reasons,full_ifood_uuid_authenticated:false,
  ifood_to_teknisa_origin_authenticated:false,
  gp_receipt_authenticated:false,
  ready_for_operational_print:false,effects:EFFECTS};
}
const candidate=()=>({
 eventId:"evt_sim_001",transport:"WEBHOOK",signatureVerified:true,
 authorizedPolling:false,short:"9627",nativeFourKey:"0001|01|0000349281|0000348850",
 nativeOrder:"0000348850",store:"0001",revision:"r1",
 status:"ACTIVE",canceled:false,orderOfEventsVerified:true,
 freshnessVerified:true,revisionCurrent:true,
});
const walk=(label,edit,expected,history={})=>{
 check(label,()=>{
  const ctx={ifo:candidate(),rows:[base()],history:deep(history)};
  edit(ctx);
  const decision=crossing(ctx.ifo,ctx.rows,ctx.history);
  if(expected===null){
   assert.equal(decision.status,"SIMULATION_ONLY_CANDIDATE",
    JSON.stringify(decision.reasons));
  }else{
   assert.equal(decision.status,"HOLD");
   assert.ok(decision.reasons.includes(expected),JSON.stringify(decision.reasons));
  }
  assert.equal(decision.full_ifood_uuid_authenticated,false);
  assert.equal(decision.ifood_to_teknisa_origin_authenticated,false);
  assert.equal(decision.gp_receipt_authenticated,false);
  assert.equal(decision.ready_for_operational_print,false);
  assert.ok(Object.values(decision.effects).every(v=>v===false));
 });
};
walk("webhook-looking active event matches synthetic native order only",()=>{},null);
walk("authorized polling-looking match is still only a simulation",x=>{
 x.ifo.transport="POLL";x.ifo.authorizedPolling=true;
},null);
walk("webhook signature unverified blocked",x=>x.ifo.signatureVerified=false,
 "WEBHOOK_SIGNATURE_NOT_VERIFIED");
walk("polling without authorization blocked",x=>{
 x.ifo.transport="POLL";x.ifo.authorizedPolling=false;
},"POLLING_NOT_AUTHORIZED");
walk("unknown transport blocked",x=>x.ifo.transport="BRIDGE_SPOOF",
 "IFOOD_TRANSPORT_UNVERIFIED");
walk("missing event id blocked",x=>x.ifo.eventId="",
 "IFOOD_EVENT_ID_UNVERIFIED");
walk("duplicate redelivery of event id blocked",()=>{},
 "REDELIVERED_EVENT",{eventIds:["evt_sim_001"]});
walk("different event id replaying a revision blocked",x=>{
 x.ifo.eventId="evt_sim_retry_2";
},"REPLAYED_REVISION",{revisions:["r1"]});
walk("cancellation before production blocked",x=>x.ifo.canceled=true,
 "CANCELED_OR_INACTIVE_ORDER");
walk("cancelled order then late ACTIVE delivery blocked by ordering gate",x=>{
 x.ifo.orderOfEventsVerified=false;
},"EVENT_ORDER_NOT_PROVEN");
walk("inactive order status blocked",x=>x.ifo.status="CANCELLED",
 "CANCELED_OR_INACTIVE_ORDER");
walk("delayed event beyond freshness window blocked",x=>x.ifo.freshnessVerified=false,
 "EVENT_STALE_OR_SOURCE_DELAYED");
walk("stale snapshot after modification blocked",x=>x.ifo.revisionCurrent=false,
 "STALE_OR_UNCONFIRMED_REVISION");
walk("wrong store code despite same short order id blocked",x=>x.ifo.store="9999",
 "CROSS_STORE_COLLISION");
walk("wrong native order id despite same short id blocked",x=>{
 x.ifo.nativeOrder="0000348888";
},"TEKNISA_ORDER_MISMATCH");
walk("wrong four-part order key blocked",x=>{
 x.ifo.nativeFourKey="0001|01|0000349281|0000348999";
},"FOUR_PART_KEY_NOT_INDEPENDENTLY_BOUND");
walk("short iFood code absent from Teknisa records blocked",x=>x.ifo.short="9999",
 "NO_TEKNISA_SHORT_ID_MATCH");
walk("same short iFood id in two distinct native orders must not guess",x=>{
 const q=base();
 q.event.order.NRCOMANDA="0000348999";
 q.event.order_key="0001|01|0000349281|0000348999";
 q.decision.order_key=q.event.order_key;
 q.decision.teknisa_sequence="0000348999";
 q.sequence_state.bindings[0].teknisa_order_id="0000348999";
 rehash(q);x.rows.push(q);
},"AMBIGUOUS_SHORT_ID");
walk("reader quantity tampering blocks crossing even if iFood short id fits",x=>{
 x.rows[0].decision.items[0].quantity=44;
 rehash(x.rows[0]);
},"READER_INTEGRITY_OR_SEQUENCE_HOLD");
walk("reader note loss blocks crossing even if iFood short id fits",x=>{
 x.rows[0].decision.items[0].observations=[];
 rehash(x.rows[0]);
},"READER_INTEGRITY_OR_SEQUENCE_HOLD");
walk("missing persistent TATA binding blocks crossing",x=>{
 x.rows[0].sequence_state.bindings=[];
},"READER_INTEGRITY_OR_SEQUENCE_HOLD");

// Deterministic perturbations of synthetic native data, 160 distinct cases.
// Each must HOLD with no preview and no effect. A single surprising success
// fails the CI. This tests real V8.57 rather than mocked booleans.
let rng=0x6b4e1a;
function next(){rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng;}
for(let n=0;n<160;n++){
 const p=base();const kind=n%8;
 if(kind===0)p.decision.items[0].quantity=(n%37)+3;
 if(kind===1)p.decision.items[0].CDPRODUTO="FAKE"+String(next()).slice(0,8);
 if(kind===2)p.decision.items[1].canonical_code="9.99.99.999.99";
 if(kind===3)p.decision.items[0].observations[0].value="DIVERGENT_NOTE_"+next();
 if(kind===4)p.event.order.items[1].QTPRODCOMVEN=String((n%4)+1)+".5";
 if(kind===5)p.sequence_state.bindings[0].tata_sequence="000";
 if(kind===6)p.decision.order_observations[0].value="DIVERGENT_ORDER_NOTE_"+next();
 if(kind===7)p.event.order.observation_rows[0].join_proven=false;
 rehash(p);
 const r=native(p);
 assert.equal(r.status,"HOLD",JSON.stringify({n,kind,status:r.status}));
 assert.equal(r.ready_for_operational_print,false);
 assert.equal(r.order_source_authenticated,false);
 assert.equal(r.essential,null);
 properties++;
}
assert.equal(scenarios,59);
assert.equal(properties,160);
console.log("TATA_IFOOD_TEKNISA_CROSSING_V864="+scenarios+"/"+scenarios+
 " SCENARIOS REAL_V857_PLUS_SYNTHETIC_CORRELATION"+
 " PROPERTY_MUTATIONS="+properties+"/"+properties+
 " NO_LIVE_IFOOD NO_TEKNISA_SQL NO_PRINT NO_GP_NO_SOURCE_CLAIMS");
module.exports={crossing,EFFECTS};
