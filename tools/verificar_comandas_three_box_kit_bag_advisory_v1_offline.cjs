"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),crypto=require("node:crypto");
const {SCHEMA,INPUT,EFFECTS,PINNED_MOTOR_GIT_BLOB,
 adviseSyntheticThreeBoxComposition:advise}=
 require("./comandas_three_box_kit_bag_advisory_v1_offline.cjs");
let count=0;
function test(label,fn){fn();count++;console.log("PASS "+count+" "+label);}
const input=(combo_people=1,same_station_compatibility="UNKNOWN")=>({schema:INPUT,
 combo_people,combo_units:1,hot_roll_units:1,cold_roll_units:2,
 reported_physical_boxes:3,same_station_compatibility});
function result(x){const before=JSON.stringify(x);const r=advise(x);
 assert.equal(JSON.stringify(x),before);
 assert.equal(r.schema,SCHEMA);assert.deepEqual(r.effects,EFFECTS);
 assert.ok(Object.values(r.effects).every(x=>x===false));
 for(const key of ["baseline_motor_executed","operational_rule_approved",
 "reader_semantic_commit_proven","print_authorized","ready_for_preview"])
   assert.equal(r[key],false);
 return r;}
test("1P combo + three rolls suggests p/2 but never approves it",()=>{
 const r=result(input(1));assert.equal(r.status,"INFERENCE_ONLY_HOLD");
 assert.equal(r.kit_status,"INFERENCE_NOT_FACT");
 assert.deepEqual(r.kit_suggestion,[{kit:"Kit p/2",quantidade:1}]);
});
test("2P combo + three rolls suggests p/2 + p/1 but never approves it",()=>{
 const r=result(input(2));assert.deepEqual(r.kit_suggestion,
 [{kit:"Kit p/2",quantidade:1},{kit:"Kit p/1",quantidade:1}]);
 assert.equal(r.kit_status,"INFERENCE_NOT_FACT");
});
test("neither M nor G nor bag count is authorized for three boxes",()=>{
 for(const p of [1,2])for(const s of ["SAME","DIFFERENT","UNKNOWN"]){
   const r=result(input(p,s));assert.equal(r.bag_suggestion,null);
   assert.equal(r.bag_count,null);assert.equal(r.bag_status,"UNKNOWN_PHYSICAL_FIT_AND_SIZE");
   assert.equal(r.box_count_status,"THREE_BOXES_REPORTED_NOT_INDEPENDENTLY_ATTESTED");
 }
});
test("one extra/removed roll or multiple combos cannot inherit exact scope",()=>{
 for(const [k,v] of [["combo_units",2],["hot_roll_units",0],
   ["hot_roll_units",2],["cold_roll_units",1],["cold_roll_units",3],
   ["reported_physical_boxes",2],["reported_physical_boxes",4]]){
   const x=input();x[k]=v;assert.equal(result(x).status,"HOLD");
 }
});
test("unknown combo, malformed station compatibility and booleans hold",()=>{
 for(const people of [0,3,"1",null])assert.equal(result(input(people)).status,"HOLD");
 for(const s of [null,"different","SAME_PLAZA",true])
   assert.equal(result(input(1,s)).status,"HOLD");
});
test("native IDs, free notes, names and effect flags rejected",()=>{
 for(const key of ["CDPRODUTO","order_id","customer_name","product_name",
    "general_observation","print","ready","box_size"]){
   const x=input();x[key]="SHOULD_NOT_LEAK";const r=result(x);
   assert.equal(r.status,"HOLD");assert.ok(!JSON.stringify(r).includes("SHOULD_NOT_LEAK"));
 }
});
test("missing fields and malformed schemas hold",()=>{
 assert.equal(result({}).status,"HOLD");assert.equal(result(null).status,"HOLD");
 const x=input();delete x.reported_physical_boxes;assert.equal(result(x).status,"HOLD");
 const y=input();y.schema="other";assert.equal(result(y).status,"HOLD");
});
test("station compatibility does not authorize packaging",()=>{
 for(const s of ["SAME","DIFFERENT","UNKNOWN"]){
  const r=result(input(1,s));assert.equal(r.status,"INFERENCE_ONLY_HOLD");
  assert.equal(r.ready_for_preview,false);
 }
});
test("motor blob pointer is not motor execution proof",()=>{
 const r=result(input());assert.equal(r.baseline_motor_git_blob,PINNED_MOTOR_GIT_BLOB);
 assert.equal(r.baseline_motor_executed,false);
});
// In CI the exact pinned motor fixture MUST exist. Without it, fail closed.
const fixture=path.join(__dirname,"fixtures","canonical-packaging-v63-pinned.js");
if(!fs.existsSync(fixture))throw new Error("PINNED_MOTOR_FIXTURE_MISSING");
const source=fs.readFileSync(fixture,"utf8"),buf=Buffer.from(source,"utf8");
const sha=crypto.createHash("sha1").update(Buffer.concat([
 Buffer.from("blob "+buf.length+"\\0"),buf])).digest("hex");
test("fixture matches exact pinned Academy blob",()=>assert.equal(sha,PINNED_MOTOR_GIT_BLOB));
const realm=Object.create(null);vm.runInNewContext(source,realm,{timeout:2500});
const motor=realm.TATAPackaging;
const combo=people=>({nome:"COMB SUSHI ESPECIAL "+people+" P",
 classification:{family:"combinado",station:"combinados"}});
const hot=station=>({nome:"HOT ROLL",classification:{family:"enrolado",station}});
const cold1={nome:"URAMAKI SALMAO",classification:{family:"enrolado",station:"enrolados_frios"}};
const cold2={nome:"HOSSOMAKI PEPINO",classification:{family:"enrolado",station:"enrolados_frios"}};
const entries=(people,station)=>[combo(people),hot(station),cold1,cold2]
 .map(product=>({product,quantity:1}));
test("pinned motor currently leaves combo plus three rolls UNKNOWN",()=>{
 for(const people of [1,2])
  assert.equal(motor.kitVerdict(entries(people,"enrolados_quentes")).status,motor.UNKNOWN);
});
test("Hot Roll classified as enrolled sushi, not automatically hot kit",()=>{
 assert.equal(motor.categoryOf(hot("enrolados_quentes")).category,"enrolado");
});
test("station identity changes grouping: three physical boxes not inferable from item counts",()=>{
 const separated=motor.packComanda(entries(1,"enrolados_quentes"));
 const grouped=motor.packComanda(entries(1,"enrolados_frios"));
 assert.equal(separated.total_boxes,3);assert.equal(grouped.total_boxes,2);
});
test("legacy G suggestion for 2P does not prove all boxes fit",()=>{
 const pack=motor.packComanda(entries(2,"enrolados_quentes"));
 assert.equal(pack.bags.size,"G");
 assert.equal(result(input(2,"DIFFERENT")).bag_suggestion,null);
});
console.log("COMANDAS_THREE_BOX_ADVISORY="+count+"/"+count+
 " SYNTHETIC_ONLY PINNED_MOTOR_DIFFERENTIAL INFERENCE_NOT_FACT NO_PRINT");
