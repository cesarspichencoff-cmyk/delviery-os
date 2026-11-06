"use strict";
/**
 * CI-only tests on an exact pinned source snapshot. No native order data.
 * Any output is a synthetic rule test, NOT real-order validation.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {SCHEMA,INPUT,ROLES,EFFECTS,projectSyntheticKitBagOverlay:project}=
 require("./comandas_missoshiro_p1_conference_kit_bag_overlay_v1_offline.cjs");
const pinned=fs.readFileSync(path.join(__dirname,"fixtures",
 "canonical-packaging-v63-pinned.js"),"utf8");
const M={role:ROLES.MISSOSHIRO,units:1};
const C={role:ROLES.SALMAO_ATUM_P1,units:1};
let n=0;
function test(label,fn){fn();console.log("PASS "+(++n)+" "+label);}
const input=(items,notes=false)=>({schema:INPUT,items,general_observation_present:notes});
function evalCase(items,notes=false,src=pinned){
 const payload=input(items,notes),before=JSON.stringify(payload);
 const out=project(payload,src);
 assert.equal(JSON.stringify(payload),before);
 assert.equal(out.schema,SCHEMA);
 assert.deepEqual(out.effects,EFFECTS);
 assert.ok(Object.values(out.effects).every(x=>x===false));
 for(const key of ["native_product_codes_exposed","native_identity_independently_proven",
 "iFood_identity_independently_proven","complete_order_proven",
 "notes_disposition_proven","persisted_sequence_proven","motor_installed",
 "ready_for_preview","ready_for_print","print_authorized"])
   assert.equal(out[key],false,key);
 return out;
}
const ALLOWED="ISOLATED_SYNTHETIC_OVERLAY_VALIDATED_NOT_OPERATIONAL";
test("Missoshiro alone: isopor pot, P exclusive and never Kit Quente",()=>{
 const r=evalCase([M]);
 assert.equal(r.status,ALLOWED);assert.equal(r.synthetic_bag_count,1);
 assert.deepEqual(r.kits,[]);
 assert.deepEqual(r.bag_groups.map(x=>[x.role,x.size,x.exclusive,x.never_co_bag_with_cold]),
 [[ROLES.MISSOSHIRO,"P",true,true]]);
 assert.deepEqual(r.per_item.map(x=>x.individual_container),["ISOPOR_POT"]);
});
test("combined salmon tuna p1 alone: box 750, Kit p1 and bag M",()=>{
 const r=evalCase([C]);
 assert.equal(r.status,ALLOWED);assert.equal(r.synthetic_bag_count,1);
 assert.deepEqual(r.kits,[{type:"KIT_P1",count:1}]);
 assert.deepEqual(r.bag_groups.map(x=>[x.role,x.size]),[[ROLES.SALMAO_ATUM_P1,"M"]]);
 assert.deepEqual(r.per_item.map(x=>x.individual_container),["BOX_750_ML"]);
});
test("Missoshiro + cold combo: two separate external bags P and M, one kit",()=>{
 const r=evalCase([M,C]);assert.equal(r.status,ALLOWED);
 assert.equal(r.synthetic_bag_count,2);
 assert.deepEqual(r.bag_groups.map(x=>x.size),["P","M"]);
 assert.deepEqual(r.kits,[{type:"KIT_P1",count:1}]);
 assert.equal(r.bag_groups[0].exclusive,true);
});
test("same pair in reverse order projects identically",()=>{
 assert.deepEqual(evalCase([C,M]),evalCase([M,C]));
});
test("legacy motor conflict is explicitly reported, not silently hidden",()=>{
 const r=evalCase([M,C]);
 assert.ok(r.legacy_conflicts.includes("LEGACY_ENGINE_KIT_QUENTE_CONTRADICTS_MISSOHIRO_NO_KIT"));
 assert.ok(r.legacy_conflicts.includes("LEGACY_ENGINE_EXTERNAL_BAG_PLAN_NOT_USABLE_FOR_EXACT_HUMAN_RULE"));
});
test("Missoshiro alone also exposes legacy Kit Quente contradiction",()=>{
 const r=evalCase([M]);
 assert.ok(r.legacy_conflicts.includes("LEGACY_ENGINE_KIT_QUENTE_CONTRADICTS_MISSOHIRO_NO_KIT"));
});
test("unresolved general observation blocks before any bag or kit projection",()=>{
 const r=evalCase([M,C],true);assert.equal(r.status,"HOLD");
 assert.match(r.reason,/GENERAL_OBSERVATION_DISPOSITION_REQUIRED/);
 assert.deepEqual(r.kits,[]);assert.deepEqual(r.bag_groups,[]);
});
test("third unknown item blocks complete-order projection",()=>{
 const r=evalCase([M,C,{role:ROLES.UNKNOWN,units:1}]);
 assert.equal(r.status,"HOLD");assert.deepEqual(r.kits,[]);
});
test("other cold not silently grouped into combo bag",()=>{
 const r=evalCase([M,{role:ROLES.OTHER_COLD,units:1}]);
 assert.equal(r.status,"HOLD");assert.equal(r.synthetic_bag_count,null);
});
test("other hot keeps general hot-cold rules intact (no Missoshiro spread)",()=>{
 const r=evalCase([C,{role:ROLES.OTHER_HOT,units:1}]);
 assert.equal(r.status,"HOLD");assert.equal(r.synthetic_bag_count,null);
});
test("duplicate role blocks without aggregation or phantom kits",()=>{
 const r=evalCase([M,M]);assert.equal(r.status,"HOLD");
 assert.deepEqual(r.kits,[]);assert.deepEqual(r.bag_groups,[]);
});
test("multiple units remain unknown rather than multiplying P or M",()=>{
 for(const role of [ROLES.MISSOSHIRO,ROLES.SALMAO_ATUM_P1]){
   const r=evalCase([{role,units:2}]);assert.equal(r.status,"HOLD");
 }
});
test("typos, aliases, variants, and names without roles do not bind",()=>{
 for(const role of ["MISSOSHIRU","MISOSHIRO","MISSOSHIRO 2",
 "SALMAO/ATUM 1 PESSOA","COMBINADO P1","NASU_NO_MISSO"]){
   assert.equal(evalCase([{role,units:1}]).status,"HOLD");
 }
});
test("unexpected native IDs, names and customer data are rejected",()=>{
 for(const field of ["CDPRODUTO","native_order_id","product_name","customer_name"]){
   const x=input([M]);x[field]="PRIVATE";
   const r=project(x,pinned);assert.equal(r.status,"HOLD");
   assert.equal(JSON.stringify(r).includes("PRIVATE"),false);
 }
});
test("tampered source exact-blob check fails closed",()=>{
 const altered=pinned.replace('"guioza", "edamame", "missoshiro"',
                                '"guioza", "edamame", "other_word"');
 assert.notEqual(altered,pinned);
 const r=evalCase([M,C],false,altered);assert.equal(r.status,"HOLD");
 assert.match(r.reason,/PINNED_MOTOR_SOURCE_HOLD/);
});
test("source omitted/empty or extra input fields hold",()=>{
 for(const src of ["",null,undefined]){
  assert.equal(evalCase([M],false,src).status,"HOLD");
 }
 assert.equal(project(input([]),pinned).status,"HOLD");
 const m=input([M]);m.items[0]={role:ROLES.MISSOSHIRO,units:1,print:true};
 assert.equal(project(m,pinned).status,"HOLD");
});
test("source motor remains unchanged in separate vm even after projected overlay",()=>{
 const realm=Object.create(null);
 vm.runInNewContext(pinned,realm,{timeout:2500});
 const b=realm.TATAPackaging;
 const item={nome:"MISSOSHIRO",classification:{
  family:"acompanhamento",station:"cozinha_quentes"}};
 assert.equal(b.categoryOf(item).box,"650");
 evalCase([M,C]);
 assert.equal(b.categoryOf(item).box,"650");
 assert.equal(pinned.includes('"guioza", "edamame", "missoshiro"'),true);
});
test("no booking, order, machine or print authority appears in output",()=>{
 const r=evalCase([M,C]),json=JSON.stringify(r);
 assert.equal(r.status,ALLOWED);
 for(const marker of ["customer_name","order_key","NRCOMANDA",
  "CDPRODUTO","printer_ip","native_order_id"]){
    assert.equal(json.includes(marker),false);
 }
 assert.equal(r.print_authorized,false);
});
console.log("COMANDAS_MISSOHIRO_KIT_BAG_OVERLAY="+n+"/"+n+
 " SYNTHETIC_ROLE_ONLY LEGACY_CONFLICT_VISIBLE NO_NATIVE_ID NO_PRINT");
