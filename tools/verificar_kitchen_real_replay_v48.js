"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {getAudit,run}=require("./auditar_candidatos_cozinha_v48.js");
const {createBundle}=require("./gerar_replay_cozinha_separada_v48.js");
const rulesPath=path.join(__dirname,"../data/kitchen_dependency_rules_v1.json");
const before=crypto.createHash("sha256").update(fs.readFileSync(rulesPath)).digest("hex");
const checks=[];
function check(name,fn){fn();checks.push(name);}
const audit=getAudit();
const {real,source,split,bundle}=createBundle();
check("01 historical source is 199 canonical products",()=>{
 assert.equal(audit.catalogued_products,199);
 assert.equal(audit.catalogue_is_historical,true);
 assert.equal(audit.catalogue_date,"2026-07-01");
});
check("02 human-approved rule is unchanged and coverage stays partial",()=>{
 assert.equal(audit.confirmed_rules,1);
 assert.equal(audit.rules_coverage,"PARTIAL");
 assert.equal(audit.catalogue_rule_exact_matches,1);
 assert.deepEqual(audit.duplicate_confirmed_rule_names,[]);
});
check("03 candidates are a manual review queue, never auto-approved",()=>{
 assert.equal(audit.candidate_count,7);
 assert.ok(audit.candidates.every(x=>x.proposed_yields===null));
 const unknown=audit.candidates.filter(x=>x.confirmation!=="HUMAN_CONFIRMED_EXACT_RULE");
 assert.equal(unknown.length,6);
 assert.ok(unknown.some(x=>/HOT ROLL/i.test(x.product_name)));
 assert.ok(unknown.some(x=>/TUNA SHIS/i.test(x.product_name)));
 assert.ok(unknown.some(x=>/URAMAKI EBITEN$/i.test(x.product_name)));
});
check("04 only the exact approved Ebiten Especial rule has one unit EBITEN",()=>{
 const known=audit.candidates.filter(x=>x.confirmation==="HUMAN_CONFIRMED_EXACT_RULE");
 assert.equal(known.length,1);
 assert.equal(known[0].product_name,"Uramaki Ebiten Especial");
 assert.deepEqual(known[0].proven_yields,{EBITEN:1});
});
check("05 read-only triage does not change the production rules",()=>{
 const again=run({writeArtifacts:false});
 assert.equal(again.policy.no_rules_changed,true);
 const after=crypto.createHash("sha256").update(fs.readFileSync(rulesPath)).digest("hex");
 assert.equal(after,before);
});
check("06 source order recovered only from proven conference boxes",()=>{
 assert.equal(source.length,4);
 assert.equal(source.reduce((sum,x)=>sum+x.quantity,0),6);
 assert.equal(real.conference.boxes.length,6);
});
check("07 real kitchen dishes replace the legacy kitchen receipt",()=>{
 const channels=bundle.jobs.map(x=>x.channel).sort();
 assert.deepEqual(channels,["OTHER_PRODUCTION","KITCHEN_DISHES","CONFERENCE"].sort());
 assert.ok(!bundle.jobs.some(x=>x.channel==="KITCHEN_COMPONENTS"));
 assert.ok(bundle.jobs.every(x=>x.proof.ready_for_operational_print===false));
});
check("08 kitchen preparation unknown is not interpreted as ZERO",()=>{
 assert.ok(split.review_reasons.some(x=>x.includes("DEPENDENCY_RULES_NOT_COMPLETE")));
 assert.equal(split.ready_for_complete_components,false);
 assert.equal(split.components,null);
});
check("09 dishes ticket contains the historical cooking lines without duplication",()=>{
 const d=bundle.jobs.find(x=>x.channel==="KITCHEN_DISHES").proof.text_trace;
 assert.ok(d.includes("EDAMAME")&&d.includes("NASU NO MISSO"));
 assert.ok(!d.includes("AGUARDAR COZINHA:"));
 assert.equal((d.match(/1  EDAMAME/g)||[]).length,1);
 const other=bundle.jobs.filter(x=>x.channel==="OTHER_PRODUCTION");
 assert.ok(other.every(x=>!x.proof.text_trace.includes("EDAMAME")));
});
check("10 all proof jobs have safe bytes and cannot print or cut",()=>{
 assert.equal(bundle.ready_for_automatic_operational_print,false);
 assert.deepEqual(bundle.effects,{print:false,spooler_write:false,odhen_write:false,stock_write:false});
 for(const j of bundle.jobs){
  assert.ok(j.proof.byte_count>0);
  assert.equal(j.proof.effects.cut,false);
  const bytes=j.proof.bytes;
  for(let k=0;k<bytes.length-1;k++)assert.ok(!(bytes[k]===0x1d && bytes[k+1]===0x56));
 }
});
console.log("kitchen-real-replay-v48: "+checks.length+"/"+checks.length+" archive/triage tests PASS");
for(const name of checks)console.log(" PASS "+name);
