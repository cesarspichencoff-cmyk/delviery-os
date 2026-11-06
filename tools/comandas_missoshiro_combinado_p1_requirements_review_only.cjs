"use strict";
/**
 * Human-confirmed requirements for a SYNTHETIC conference fixture only.
 * No canonical CDPRODUTO, Reader event, order/PII, Academy catalog, SKU match,
 * bag capacity measurement, GP/SQL, printer, service or physical output.
 *
 * DO NOT use as production classifier or for printing. The source of truth
 * for these human requirements is the PR #135 document dated 2026-11-06.
 */
const SCHEMA = "tata.comandas.missoshiro-p1-requirements-review.v1";
const INPUT = "tata.comandas.synthetic-conference-components.v1";
const EFFECTS = Object.freeze({
  sql_read:false,sql_write:false,filesystem_read:false,filesystem_write:false,
  catalog_write:false,sequence_write:false,network:false,print:false,
  spooler_write:false,service_change:false,deploy:false,cutover:false
});
const ROLES = Object.freeze({
  MISSOSHIRO:"MISSOSHIRO",SALMAO_ATUM_P1:"SALMAO_ATUM_P1",
  OTHER_COLD:"OTHER_COLD",OTHER_HOT:"OTHER_HOT",UNKNOWN:"UNKNOWN"
});
const KNOWN = new Set([ROLES.MISSOSHIRO,ROLES.SALMAO_ATUM_P1]);
const ALLOWED = new Set(Object.values(ROLES));
const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
const exactKeys=(o,keys)=>o!==null&&typeof o==="object"&&!Array.isArray(o)&&
  Object.keys(o).length===keys.length&&keys.every(k=>own(o,k));
function result(status,reason,requirements=[],issues=[]){
  return {schema:SCHEMA,status,reason,requirements,issues,
    independent_native_identity_proven:false,active_catalog_proven:false,
    full_order_composition_proven:false,overall_bag_count_proven:false,
    bag_fit_physically_verified:false,observation_disposition_proven:false,
    academy_motor_integration_proven:false,ready_for_operational_preview:false,
    print_authorized:false,production_station_change_authorized:false,effects:EFFECTS};
}
function reviewSyntheticConferenceRequirements(input){
  if(!exactKeys(input,["schema","items","general_observation_present"])||
     input.schema!==INPUT||typeof input.general_observation_present!=="boolean"||
     !Array.isArray(input.items)||input.items.length<1||input.items.length>8)
    return result("HOLD","SYNTHETIC_FIXTURE_SHAPE_INVALID");
  if(input.items.some(x=>!exactKeys(x,["role","units"])||
      !ALLOWED.has(x.role)||!Number.isSafeInteger(x.units)||x.units!==1))
    return result("HOLD","ROLE_OR_SINGLE_UNIT_SCOPE_INVALID");
  const seen=new Set();
  for(const x of input.items){
    if(seen.has(x.role))return result("HOLD","DUPLICATE_ROLE_OR_MULTIPLE_UNIT_SCOPE_UNKNOWN");
    seen.add(x.role);
  }
  // A general note might be a food safety instruction, payment metadata, etc.
  // We do not know its content and do not classify, discard, or print it.
  if(input.general_observation_present)
    return result("HOLD","GENERAL_OBSERVATION_DISPOSITION_REQUIRED");
  const requirements=[];
  if(seen.has(ROLES.MISSOSHIRO))requirements.push({
    role:ROLES.MISSOSHIRO,temperature:"HOT",station_human:"COZINHA",
    individual_container:"ISOPOR_POT",container_volume_ml:null,
    kit_count:0,kit_type:null,bag_size:"P",bag_count_for_this_unit:1,
    external_bag_exclusive:true,never_with_cold:true
  });
  if(seen.has(ROLES.SALMAO_ATUM_P1))requirements.push({
    role:ROLES.SALMAO_ATUM_P1,temperature:"COLD",
    individual_container:"BOX_750_ML",container_volume_ml:750,
    kit_count:1,kit_type:"KIT_P1",bag_size:"M",bag_count_for_this_unit:1,
    external_bag_exclusive:false,never_with_cold:false
  });
  const unknown=[...seen].filter(x=>!KNOWN.has(x));
  if(unknown.length)return result("HOLD","OTHER_ITEMS_REQUIRE_SEPARATE_EXACT_RULE",
    requirements,["OVERALL_BAG_PLAN_UNKNOWN", "NO_GENERIC_HOT_COLD_RULE_OVERRIDE"]);
  if(!requirements.length)return result("HOLD","NO_EXACT_HUMAN_REQUIREMENTS");
  return result("SYNTHETIC_REQUIREMENTS_ONLY_NOT_MOTOR_PROOF",
    "HUMAN_RULES_RECORDED_BUT_NATIVE_BINDING_AND_OPERATIONAL_GATES_MISSING",
    requirements,requirements.length===2?["MISSOSHIRO_AND_COLD_REQUIRE_SEPARATE_EXTERNAL_BAGS"]:[]);
}
module.exports={SCHEMA,INPUT,EFFECTS,ROLES,reviewSyntheticConferenceRequirements};
