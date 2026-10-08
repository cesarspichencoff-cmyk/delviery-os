"use strict";
/**
 * Creates only OFFLINE ticket files in a temporary folder.
 * V4.8 proves that the historical real kitchen DISH intent gets replaced
 * by the dedicated PRATOS ticket without adding a speculative component job.
 */
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const assert=require("node:assert/strict");
const {createHash}=require("node:crypto");
const {archivedResult}=require("./verificar_real_order_tickets_v46.js");
const {splitTwoKitchenTicketsFromRulesV47}=
 require("../dist/src/production/twoKitchenTicketsV47.js");
const {buildKitchenSeparatedBundleV47}=
 require("../dist/src/production/kitchenSeparatedOfflineBundleV47.js");
const rules=require("../data/kitchen_dependency_rules_v1.json");
const route=require("../data/tata_reader_real_order_expected_route_cdarvprod_20261005_v1.json");
function actualSourceFromArchivedConference(ticket){
 const data=new Map();
 for(const box of ticket.conference.boxes){
  for(const item of box.items){
   const index=item.source_item_index;
   let current=data.get(index);
   if(!current){
    current={item_index:index,product_code:item.product_code,
      product_name:item.print_name,quantity:0,
      observations:[...item.observations],packaging_role:"UNKNOWN"};
    data.set(index,current);
   }else{
    assert.equal(current.product_code,item.product_code);
    assert.equal(current.product_name,item.print_name);
    assert.deepEqual(current.observations,item.observations);
   }
   current.quantity+=item.quantity;
  }
 }
 const source=[...data.values()].sort((a,b)=>a.item_index-b.item_index);
 assert.equal(source.length,route.items.length);
 for(const original of route.items){
  const matching=source.filter(s=>s.product_code===original.retail_product_code);
  assert.equal(matching.length,1);
  assert.equal(matching[0].quantity,Number(original.quantity));
 }
 assert.equal(source.reduce((sum,x)=>sum+x.quantity,0),6);
 return source;
}
function createBundle(){
 const real=archivedResult();
 const source=actualSourceFromArchivedConference(real);
 const split=splitTwoKitchenTicketsFromRulesV47(source,real,rules);
 const bundle=buildKitchenSeparatedBundleV47(real,split);
 const channels=bundle.jobs.map(job=>job.channel);
 assert.deepEqual(channels.slice().sort(),
   ["OTHER_PRODUCTION","KITCHEN_DISHES","CONFERENCE"].sort());
 assert.equal(bundle.jobs.filter(j=>j.channel==="KITCHEN_DISHES").length,1);
 assert.equal(bundle.jobs.filter(j=>j.channel==="KITCHEN_COMPONENTS").length,0);
 assert.equal(bundle.blocked_proofs.length,0);
 assert.equal(bundle.ready_for_automatic_operational_print,false);
 assert.equal(split.ready_for_complete_components,false);
 assert.ok(split.review_reasons.some(s=>s.includes("DEPENDENCY_RULES_NOT_COMPLETE")));
 const kitchen=bundle.jobs.find(j=>j.channel==="KITCHEN_DISHES").proof;
 assert.ok(kitchen.text_trace.includes("PRODUCAO COZINHA - PRATOS"));
 assert.ok(!kitchen.text_trace.includes("AGUARDAR COZINHA"));
 assert.ok(kitchen.text_trace.includes("EDAMAME"));
 assert.ok(kitchen.text_trace.includes("NASU NO MISSO"));
 const other=bundle.jobs.filter(j=>j.channel==="OTHER_PRODUCTION");
 assert.ok(other.every(j=>!j.proof.text_trace.includes("PRODUCAO COZINHA")));
 return {real,source,split,bundle};
}
function main(){
 const {split,bundle}=createBundle();
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),"tata-kitchen-v48-offline-"));
 const jobs=[];
 for(const [i,j] of bundle.jobs.entries()){
  const label=String(i+1).padStart(2,"0")+"_"+j.channel.toLowerCase();
  const binary=Buffer.from(j.proof.bytes);
  assert.ok(binary.length>0);
  fs.writeFileSync(path.join(folder,label+".escpos"),binary);
  fs.writeFileSync(path.join(folder,label+".txt"),j.proof.text_trace+"\n","utf8");
  jobs.push({channel:j.channel,bin:label+".escpos",text:label+".txt",
   sha256:createHash("sha256").update(binary).digest("hex"),bytes:binary.length,
   ready_for_operational_print:false});
 }
 const manifest={
  schema:"deliveryos.kitchen-separated-replay.v48.offline",
  archived_source_order:"04/10/2026; revalidated 05/10/2026",
  source_refs:[
   "data/tata_reader_real_order_expected_route_cdarvprod_20261005_v1.json",
   "data/tata_reader_real_order_packaging_reference_20261005_v3.json",
   "data/tata_reader_real_order_unified_replay_success_20261005_v2.json",
   "data/kitchen_dependency_rules_v1.json",
  ],
  preservation:"COZINHA_DISHES_REPLACES_OLD_KITCHEN_PRINT_NO_DUPLICATION",
  missing_prep_ticket_reason:"KITCHEN_DEPENDENCY_RULES_PARTIAL; ABSENCE_IS_NOT_ZERO",
  no_prep_work_claimed:false,
  source_coverage:"PARTIAL",
  review_reasons:split.review_reasons,
  jobs,
  printer_connected:false,job_submitted:false,cut_requested:false,
  effects:{print:false,spooler_write:false,odhen_write:false,stock_write:false},
 };
 fs.writeFileSync(path.join(folder,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
 console.log("KITCHEN_V48_OFFLINE_DIR="+folder);
 console.log("REPLAY_JOBS="+jobs.length);
 console.log("KITCHEN_COMPONENT_JOB=BLOCKED_NOT_PROVEN");
 console.log("KITCHEN_DISHES_JOB="+jobs.filter(j=>j.channel==="KITCHEN_DISHES").length);
 return manifest;
}
if(require.main===module)main();
module.exports={createBundle,main};
