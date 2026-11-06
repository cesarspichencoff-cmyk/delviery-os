"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {SCHEMA,INPUT,EFFECTS,ROLES,reviewSyntheticConferenceRequirements:review}=
  require("./comandas_missoshiro_combinado_p1_requirements_review_only.cjs");
let total=0;
function test(name,fn){fn();total++;console.log("PASS "+total+" "+name);}
function run(items,observation=false){
  const input={schema:INPUT,items,general_observation_present:observation};
  const serialized=JSON.stringify(input),r=review(input);
  assert.equal(JSON.stringify(input),serialized,"no input mutations");
  assert.equal(r.schema,SCHEMA);
  assert.deepEqual(r.effects,EFFECTS);
  assert.ok(Object.values(r.effects).every(x=>x===false));
  for(const k of ["independent_native_identity_proven","active_catalog_proven",
    "full_order_composition_proven","overall_bag_count_proven",
    "bag_fit_physically_verified","observation_disposition_proven",
    "academy_motor_integration_proven","ready_for_operational_preview",
    "print_authorized","production_station_change_authorized"])
    assert.equal(r[k],false,k);
  assert.equal(JSON.stringify(r).includes("CONFIDENTIAL_CUSTOMER"),false);
  return r;
}
const M={role:ROLES.MISSOSHIRO,units:1};
const C={role:ROLES.SALMAO_ATUM_P1,units:1};
test("isolated Missoshiro: isopor pot, no kit, P exclusive external bag",()=>{
  const r=run([M]);assert.equal(r.status,"SYNTHETIC_REQUIREMENTS_ONLY_NOT_MOTOR_PROOF");
  assert.deepEqual(r.requirements.map(x=>[x.role,x.individual_container,x.kit_count,x.bag_size,x.external_bag_exclusive]),
    [[ROLES.MISSOSHIRO,"ISOPOR_POT",0,"P",true]]);
  assert.equal(r.requirements[0].container_volume_ml,null);
});
test("isolated combined salmon tuna p1: 750 box, one P1 kit, M bag",()=>{
  const r=run([C]);assert.equal(r.status,"SYNTHETIC_REQUIREMENTS_ONLY_NOT_MOTOR_PROOF");
  assert.deepEqual(r.requirements.map(x=>[x.individual_container,x.container_volume_ml,x.kit_type,x.kit_count,x.bag_size]),
    [["BOX_750_ML",750,"KIT_P1",1,"M"]]);
});
test("Missoshiro plus cold combined: never one shared external bag",()=>{
  const r=run([M,C]);assert.equal(r.requirements.length,2);
  assert.deepEqual(r.requirements.map(x=>x.bag_size),["P","M"]);
  assert.ok(r.issues.includes("MISSOSHIRO_AND_COLD_REQUIRE_SEPARATE_EXTERNAL_BAGS"));
  assert.equal(r.requirements[0].never_with_cold,true);
  assert.equal(r.overall_bag_count_proven,false);
});
test("input order cannot change product-specific requirements",()=>{
  assert.deepEqual(run([M,C]),run([C,M]));
});
test("third unmatched cold item keeps all-order bags unknown",()=>{
  const r=run([M,C,{role:ROLES.OTHER_COLD,units:1}]);
  assert.equal(r.status,"HOLD");assert.equal(r.reason,"OTHER_ITEMS_REQUIRE_SEPARATE_EXACT_RULE");
  assert.equal(r.requirements.length,2);
  assert.ok(r.issues.includes("OVERALL_BAG_PLAN_UNKNOWN"));
});
test("other hot plus cold never inherits Missoshiro-only external exception",()=>{
  const r=run([{role:ROLES.OTHER_HOT,units:1},{role:ROLES.OTHER_COLD,units:1}]);
  assert.equal(r.status,"HOLD");assert.equal(r.requirements.length,0);
  assert.ok(r.issues.includes("NO_GENERIC_HOT_COLD_RULE_OVERRIDE"));
});
test("Missoshiro plus unknown food preserves exclusive P and blocks total",()=>{
  const r=run([M,{role:ROLES.UNKNOWN,units:1}]);
  assert.equal(r.status,"HOLD");assert.equal(r.requirements.length,1);
  assert.equal(r.requirements[0].external_bag_exclusive,true);
});
test("Missoshiro must not silently get generic hot kit or sealed 650 container",()=>{
  const r=run([M]);assert.equal(r.requirements[0].kit_count,0);
  assert.equal(r.requirements[0].individual_container,"ISOPOR_POT");
  assert.notEqual(r.requirements[0].container_volume_ml,650);
});
test("general observation unreviewed: HOLD even for exact pair",()=>{
  const r=run([M,C],true);assert.equal(r.status,"HOLD");
  assert.equal(r.reason,"GENERAL_OBSERVATION_DISPOSITION_REQUIRED");
  assert.deepEqual(r.requirements,[]);
});
test("duplicate role is not silently merged",()=>{
  const r=run([M,M]);assert.equal(r.status,"HOLD");
  assert.equal(r.reason,"DUPLICATE_ROLE_OR_MULTIPLE_UNIT_SCOPE_UNKNOWN");
});
test("quantity greater than one is not inferred from single-unit human rule",()=>{
  const r=run([{role:ROLES.MISSOSHIRO,units:2}]);
  assert.equal(r.status,"HOLD");assert.equal(r.reason,"ROLE_OR_SINGLE_UNIT_SCOPE_INVALID");
});
test("unknown input keys cannot smuggle native IDs, order notes or approval",()=>{
  const r=review({schema:INPUT,items:[M],general_observation_present:false,
    customer_name:"CONFIDENTIAL_CUSTOMER",print_authorized:true});
  assert.equal(r.status,"HOLD");assert.equal(r.reason,"SYNTHETIC_FIXTURE_SHAPE_INVALID");
  assert.equal(JSON.stringify(r).includes("CONFIDENTIAL_CUSTOMER"),false);
});
test("unknown item role and modified spelling cannot become exact identity",()=>{
  for(const role of ["MISSOHIRO", "SALMAO/ATUM 1 PESSOA", "NASU_NO_MISSO", "MISSOSHIRO "]){
    if(role===ROLES.MISSOSHIRO||role===ROLES.SALMAO_ATUM_P1)continue;
    const r=run([{role,units:1}]);assert.equal(r.status,"HOLD");
  }
});
test("empty and malformed claims fail closed",()=>{
  assert.equal(run([]).status,"HOLD");
  assert.equal(review(null).status,"HOLD");
  assert.equal(review({schema:INPUT,items:[M]}).status,"HOLD");
});
test("source document explicitly guards the exception, review-only and unknown extras",()=>{
  const doc=fs.readFileSync(path.join(__dirname,"..","docs","comandas",
    "REGRAS_HUMANAS_CONFERENCIA_MISSOHIRO_COMBINADO_P1_20261106.md"),"utf8");
  assert.ok(doc.includes("nunca compartilham a mesma sacola externa"));
  assert.ok(doc.includes("Pote de isopor"));
  assert.ok(doc.includes("Kit p/1"));
  assert.ok(doc.includes("Caixa 750 ml"));
  assert.ok(doc.includes("OUTRO_ITEM_DESCONHECIDO")||doc.includes("terceiros produtos"));
  assert.ok(doc.includes("PRINT=HOLD"));
});
console.log("COMANDAS_MISSOSHIRO_P1_REQUIREMENTS="+total+"/"+total+
  " SYNTHETIC_ONLY NO_NATIVE_ID NO_MOTOR_CHANGE NO_PRINT");
