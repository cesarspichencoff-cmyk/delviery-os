"use strict";
/**
 * Read-only application boundary for six explicit Itaim human clarifications.
 * It does NOT authorize current classification, a first native print, station
 * routing changes, packaging allocation or suppression of legacy print.
 * The output contains no customer, native CDPRODUTO or source observation data.
 */
const evidence=require("../data/comandas_cesar_clarificacoes_20261101_review_only.json");
const SCHEMA="tata.comandas.human-rule-candidates.v1.review-only";
const NO_EFFECTS=Object.freeze({print:false,spooler_write:false,
 sql_write:false,service_change:false,sequence_write:false,deploy:false});
const normalize=s=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toUpperCase().trim().replace(/\s+/g," ");
const valid=x=>typeof x==="string"&&x.length>0&&x.length<=160&&
 !/[\x00-\x1f\x7f]/.test(x);
function hold(reason){return {schema:SCHEMA,status:"HOLD",reason,
 rule_code:null,stated_area:null,stated_item_temperature:null,
 stated_container:null,stated_reference:null,
 proposed_conference_only:false,catalog_identity_proven:false,
 active_product_proven:false,physical_route_proven:false,
 packaging_proven:false,print_authorized:false,effects:NO_EFFECTS};}
function reviewHumanRuleItem(item){
 if(!item||typeof item!=="object"||Array.isArray(item)||
    !valid(item.canonical_code)||!valid(item.product_name))
  return hold("ITEM_SHAPE_INVALID");
 const candidates=evidence.product_rules.filter(r=>
   r.code===item.canonical_code);
 if(candidates.length!==1)return hold("NO_EXACT_HUMAN_RULE_FOR_CODE");
 const rule=candidates[0];
 if(normalize(item.product_name)!==normalize(rule.label))
  return hold("HISTORICAL_LABEL_NOT_EXACT_TO_HUMAN_RULE");
 return {schema:SCHEMA,status:"HUMAN_RULE_CAPTURED_CATALOG_PENDING",
  reason:"REQUIRES_CURRENT_NATIVE_ID_ACTIVE_STATION_ROUTING_AND_MOTOR_PROOF",
  rule_code:rule.code,stated_area:rule.stated_area,
  stated_item_temperature:rule.stated_item_temperature,
  stated_container:rule.stated_container,
  stated_reference:rule.stated_reference,
  proposed_conference_only:rule.new_production_ticket_policy===
   "NO_NEW_PRODUCTION_TICKET",
  catalog_identity_proven:false,active_product_proven:false,
  physical_route_proven:false,packaging_proven:false,
  print_authorized:false,effects:NO_EFFECTS};
}
module.exports={SCHEMA,NO_EFFECTS,reviewHumanRuleItem};
