"use strict";
/** V7.35: pre-lunch adversarial release simulation, NEVER an installed
 * printer/TeKnisa/iFood adapter. Checks what must be independently PROVEN.
 */
const assert=require("node:assert/strict");
const EFFECTS=Object.freeze({teknisa_write:false,ifood_write:false,print:false,spooler_write:false,sequence_write:false,service_change:false});
function assess(x){
 const reasons=[];
 const need=(ok,reason)=>{if(!ok)reasons.push(reason)};
 need(x.source==="SIGNED_IFOOD_PLUS_READONLY_TEK NISA".replace(" ",""),"UNVERIFIED_INTEGRATION_ORIGIN");
 need(typeof x.eventId==="string"&&x.eventId.length>0&&x.validSignature===true,"IFOOD_EVENT_AUTHENTICITY_UNPROVEN");
 need(x.seenEventIds instanceof Set&&!x.seenEventIds.has(x.eventId),"REDELIVERED_IFOOD_EVENT");
 need(x.eventOrderCorrect===true,"OUT_OF_ORDER_EVENT");
 need(x.canceled!==true&&x.orderStatus==="ACTIVE","ORDER_NOT_ACTIVE");
 need(typeof x.orderKey==="string"&&x.orderKey.split("|").length===4&&x.orderKeyBound===true,"RAW_TEKNISA_ORDER_ID_NOT_VERIFIED");
 need(x.orderSnapshotHashValid===true&&x.revisionCurrent===true,"STALE_ORDER_OR_MUTATED_SNAPSHOT");
 need(x.itemQuantitiesExact===true&&x.observationsExact===true,"ITEM_OR_OBSERVATION_DRIFT");
 need(x.printerMappingProven===true&&x.printerReady===true,"PRINTER_OR_STATION_NOT_PROVEN");
 need(x.queueReconciled===true&&x.oldJobsNotReleased===true,"UNRECONCILED_SPOOLER_BACKLOG");
 need(x.shiftApprovedCurrent===true&&x.eventFresh===true&&x.sqlHealthy===true,"STALE_SQL_EVENT_OR_SHIFT");
 need(x.packagingProven===true&&x.allergyReviewed===true,"PACKAGING_OR_ALLERGEN_UNPROVEN");
 need(x.durablePrintedLedgerVerified===true&&x.notAlreadyPrinted===true,"NO_DURABLE_EXACT_ONCE_PRINT_PROOF");
 need(x.threePaperViewsAccepted===true,"THREE_PHYSICAL_RECEIPTS_UNACCEPTED");
 return {schema:"tata.comandas.adversarial-lunch-simulation.v735",simulation_only:true,
  status:reasons.length?"HOLD":"ELIGIBLE_FOR_SINGLE_HUMAN_PILOT_REVIEW_ONLY",
  reasons,print_authorized:false,effects:EFFECTS};
}
const good={
 source:"SIGNED_IFOOD_PLUS_READONLY_TEKNISA",eventId:"evt-fake-1",validSignature:true,
 seenEventIds:new Set(),eventOrderCorrect:true,canceled:false,orderStatus:"ACTIVE",
 orderKey:"0001|01|0000000001|0000000001",orderKeyBound:true,
 orderSnapshotHashValid:true,revisionCurrent:true,itemQuantitiesExact:true,
 observationsExact:true,printerMappingProven:true,printerReady:true,
 queueReconciled:true,oldJobsNotReleased:true,shiftApprovedCurrent:true,
 eventFresh:true,sqlHealthy:true,packagingProven:true,allergyReviewed:true,
 durablePrintedLedgerVerified:true,notAlreadyPrinted:true,threePaperViewsAccepted:true};
let count=0;
function scenario(label,mutate,expected){
 const x={...good,seenEventIds:new Set(good.seenEventIds)};
 mutate(x);const p=assess(x);
 if(expected)assert.ok(p.reasons.includes(expected),label+": "+p.reasons);
 else assert.equal(p.status,"ELIGIBLE_FOR_SINGLE_HUMAN_PILOT_REVIEW_ONLY");
 assert.equal(p.print_authorized,false);
 assert.ok(Object.values(p.effects).every(v=>v===false));
 count++;console.log("PASS V735 "+count+" "+label);
}
scenario("positive simulated fixture permits human review but never print",()=>{},null);
scenario("iFood duplicate delivery",x=>x.seenEventIds.add(x.eventId),"REDELIVERED_IFOOD_EVENT");
scenario("out-of-order confirmation after cancellation",x=>x.eventOrderCorrect=false,"OUT_OF_ORDER_EVENT");
scenario("late canceled order",x=>x.canceled=true,"ORDER_NOT_ACTIVE");
scenario("unsigned/forged iFood event",x=>x.validSignature=false,"IFOOD_EVENT_AUTHENTICITY_UNPROVEN");
scenario("different internal Teknisa order",x=>x.orderKeyBound=false,"RAW_TEKNISA_ORDER_ID_NOT_VERIFIED");
scenario("same order but old revision",x=>x.revisionCurrent=false,"STALE_ORDER_OR_MUTATED_SNAPSHOT");
scenario("quantity changed after snapshot",x=>x.itemQuantitiesExact=false,"ITEM_OR_OBSERVATION_DRIFT");
scenario("allergy/customer note changed",x=>x.observationsExact=false,"ITEM_OR_OBSERVATION_DRIFT");
scenario("wrong station mapping",x=>x.printerMappingProven=false,"PRINTER_OR_STATION_NOT_PROVEN");
scenario("printer offline",x=>x.printerReady=false,"PRINTER_OR_STATION_NOT_PROVEN");
scenario("old accumulated jobs may flush",x=>x.oldJobsNotReleased=false,"UNRECONCILED_SPOOLER_BACKLOG");
scenario("SQL stops updating orders",x=>x.sqlHealthy=false,"STALE_SQL_EVENT_OR_SHIFT");
scenario("shift not approved for today's lunch",x=>x.shiftApprovedCurrent=false,"STALE_SQL_EVENT_OR_SHIFT");
scenario("event yesterday treated as today",x=>x.eventFresh=false,"STALE_SQL_EVENT_OR_SHIFT");
scenario("unverified packaging/kit",x=>x.packagingProven=false,"PACKAGING_OR_ALLERGEN_UNPROVEN");
scenario("unreviewed allergen",x=>x.allergyReviewed=false,"PACKAGING_OR_ALLERGEN_UNPROVEN");
scenario("no durable duplicate-print ledger",x=>x.durablePrintedLedgerVerified=false,"NO_DURABLE_EXACT_ONCE_PRINT_PROOF");
scenario("same revision already printed",x=>x.notAlreadyPrinted=false,"NO_DURABLE_EXACT_ONCE_PRINT_PROOF");
scenario("paper/Figma parity not physically accepted",x=>x.threePaperViewsAccepted=false,"THREE_PHYSICAL_RECEIPTS_UNACCEPTED");
scenario("no verified source sync to iFood and Teknisa",x=>x.source="UNVERIFIED","UNVERIFIED_INTEGRATION_ORIGIN");
assert.equal(count,21);
console.log("COMANDAS_LUNCH_ADVERSARIAL_V735="+count+"/"+count+" SIMULATION_ONLY NO_TEKNISA_WRITE NO_PRINT");
module.exports={assess,EFFECTS};
