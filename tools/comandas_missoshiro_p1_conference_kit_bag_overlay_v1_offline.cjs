"use strict";
/**
 * A narrow isolated Conference kit/bag overlay on the existing pinned motor.
 * Accepts ONLY synthetic roles, never order/native/catalog/PII fields.
 * Demonstrates the explicit 2026-11-06 human rules while exposing what
 * the legacy motor would still compute incorrectly.
 * Does not alter the installed/pinned motor or authorize any operational use.
 */
const vm=require("node:vm");
const {INPUT,ROLES,reviewSyntheticConferenceRequirements:review}=
  require("./comandas_missoshiro_combinado_p1_requirements_review_only.cjs");
const {patchPinnedMotorInMemory:patch}=
  require("./comandas_missoshiro_motor_delta_candidate_v1_offline.cjs");
const SCHEMA="tata.comandas.missoshiro-p1-conference-overlay.v1.synthetic-only";
const EFFECTS=Object.freeze({
  filesystem_read:false,filesystem_write:false,database_read:false,database_write:false,
  catalog_write:false,sequence_write:false,network_call:false,print:false,
  reprint:false,spooler_write:false,odhen_write:false,fiscal_action:false,
  sefaz_call:false,service_change:false,deploy:false,cutover:false
});
const ALLOWED=new Set([ROLES.MISSOSHIRO,ROLES.SALMAO_ATUM_P1]);
function deny(reason){
  return {schema:SCHEMA,status:"HOLD",reason,per_item:[],kits:[],
    bag_groups:[],synthetic_bag_count:null,legacy_conflicts:[],
    native_product_codes_exposed:false,native_identity_independently_proven:false,
    iFood_identity_independently_proven:false,complete_order_proven:false,
    notes_disposition_proven:false,persisted_sequence_proven:false,
    motor_installed:false,ready_for_preview:false,ready_for_print:false,
    print_authorized:false,effects:EFFECTS};
}
function fixtureProduct(role){
  if(role===ROLES.MISSOSHIRO)
    return {nome:"MISSOSHIRO",classification:{
      family:"acompanhamento",station:"cozinha_quentes"}};
  if(role===ROLES.SALMAO_ATUM_P1)
    return {nome:"COMB SALMAO/ATUM 1 P",classification:{
      family:"combinado",station:"combinados"}};
  return null;
}
function projectSyntheticKitBagOverlay(input,pinnedSource){
  // This must not accept a real Reader event, order number, or any native ID.
  const validated=review(input);
  if(validated.status!=="SYNTHETIC_REQUIREMENTS_ONLY_NOT_MOTOR_PROOF")
    return deny("HUMAN_REQUIREMENTS_SCOPE_HOLD:"+validated.reason);
  if(!Array.isArray(input.items)||input.items.length>2||
     input.items.some(x=>!ALLOWED.has(x.role)||x.units!==1)||
     input.general_observation_present!==false)
    return deny("EXACT_ROLE_OR_OBSERVATION_SCOPE_HOLD");
  const delta=patch(pinnedSource);
  if(delta.status!=="ISOLATED_CATEGORY_CANDIDATE_ONLY")
    return deny("PINNED_MOTOR_SOURCE_HOLD:"+delta.reason);
  let motor;
  try{
    const realm=Object.create(null);
    vm.runInNewContext(delta.candidate_source,realm,{filename:"synthetic-missoshiro-motor.js",timeout:2500});
    motor=realm.TATAPackaging;
    if(!motor||typeof motor.packComanda!=="function"||
       typeof motor.kitVerdict!=="function"||
       typeof motor.categoryOf!=="function")return deny("MOTOR_API_INVALID");
  }catch{return deny("MOTOR_EVALUATION_FAILED");}
  const ordered=[...input.items].sort((a,b)=>a.role.localeCompare(b.role));
  const entries=ordered.map(x=>({product:fixtureProduct(x.role),quantity:1}));
  let packaging,kit;
  try{packaging=motor.packComanda(entries);kit=motor.kitVerdict(entries);}
  catch{return deny("PINNED_MOTOR_CALCULATION_FAILED");}
  if(!Array.isArray(packaging?.groups)||packaging.groups.length!==ordered.length||
     !Array.isArray(kit?.kits))return deny("PINNED_MOTOR_SHAPE_INVALID");
  const perItem=[];
  for(const x of ordered){
    const g=packaging.groups.find(v=>Array.isArray(v.products)&&
      v.products.length===1&&v.products[0].name===fixtureProduct(x.role).nome);
    if(!g||g.count!==1||g.boxes!==1)return deny("SYNTHETIC_MOTOR_GROUP_UNPROVEN");
    const expected=x.role===ROLES.MISSOSHIRO?"POTE_ISOPOR":"750";
    if(g.box!==expected)return deny("SYNTHETIC_CONTAINER_MISMATCH");
    perItem.push({role:x.role,individual_container:x.role===ROLES.MISSOSHIRO?
      "ISOPOR_POT":"BOX_750_ML",temperature:x.role===ROLES.MISSOSHIRO?
      "HOT":"COLD",box_motor_verified:true});
  }
  // These are exact human rules, not an inferred legacy-kit/bag computation.
  // The old kitVerdict/packComanda bag verdict remain visible as conflicts.
  const bags=[];
  const kits=[];
  if(ordered.some(x=>x.role===ROLES.MISSOSHIRO))
    bags.push({role:ROLES.MISSOSHIRO,size:"P",count:1,
      exclusive:true,never_co_bag_with_cold:true});
  if(ordered.some(x=>x.role===ROLES.SALMAO_ATUM_P1)){
    bags.push({role:ROLES.SALMAO_ATUM_P1,size:"M",count:1,
      exclusive:false,never_co_bag_with_cold:false});
    kits.push({type:"KIT_P1",count:1});
  }
  const conflicts=[];
  if(kit.kits.some(x=>x.kit==="Kit Quente"))
    conflicts.push("LEGACY_ENGINE_KIT_QUENTE_CONTRADICTS_MISSOHIRO_NO_KIT");
  if(packaging.bags?.size_status!=="FACT"||
     packaging.bags?.exact_bag_count_status!=="FACT"||
     packaging.bags?.exact_bag_count!==bags.length)
    conflicts.push("LEGACY_ENGINE_EXTERNAL_BAG_PLAN_NOT_USABLE_FOR_EXACT_HUMAN_RULE");
  return {...deny("HUMAN_EXACT_SYNTHETIC_RULES_ONLY_NOT_NATIVE_AUTHORITY"),
    status:"ISOLATED_SYNTHETIC_OVERLAY_VALIDATED_NOT_OPERATIONAL",
    per_item:perItem,kits,bag_groups:bags,synthetic_bag_count:bags.length,
    legacy_conflicts:conflicts,motor_installed:false};
}
module.exports={SCHEMA,INPUT,ROLES,EFFECTS,projectSyntheticKitBagOverlay};
