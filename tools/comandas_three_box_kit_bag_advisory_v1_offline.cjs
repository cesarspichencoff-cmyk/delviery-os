"use strict";
/**
 * Synthetic-only kit/bag advisory for the narrowly described composition:
 * one declared 1P or 2P combo + one Hot Roll + two cold rolls.
 *
 * Hypothesis generator, NOT a packaging motor patch or live order consumer.
 * No customer orders, product names, native IDs, notes or host I/O accepted.
 */
const SCHEMA="tata.comandas.three-box-kit-bag-advisory.v1.synthetic-only";
const INPUT="tata.comandas.three-box-composition.v1.synthetic-only";
const PINNED_MOTOR_GIT_BLOB="3167c309f02a0ad5a84fb43043b8866e3bee873c";
const EFFECTS=Object.freeze({sql_read:false,sql_write:false,file_read:false,
 file_write:false,network:false,spooler:false,print:false,
 sequence_write:false,service_change:false,deploy:false,merge:false});
const KEYS=["schema","combo_people","combo_units","hot_roll_units",
  "cold_roll_units","reported_physical_boxes","same_station_compatibility"];
function shape(x,keys){return x!==null&&typeof x==="object"&&!Array.isArray(x)&&
  Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));}
function hold(reason){return {schema:SCHEMA,status:"HOLD",reason,
 kit_suggestion:[],kit_status:"UNKNOWN",bag_suggestion:null,bag_status:"UNKNOWN",
 bag_count:null,box_count_status:"UNKNOWN",assumptions:[],
 baseline_motor_git_blob:PINNED_MOTOR_GIT_BLOB,
 baseline_motor_executed:false,operational_rule_approved:false,
 reader_semantic_commit_proven:false,print_authorized:false,
 ready_for_preview:false,effects:EFFECTS};}
function adviseSyntheticThreeBoxComposition(input){
 if(!shape(input,KEYS)||input.schema!==INPUT)return hold("SCHEMA_OR_FIELDS_NOT_SYNTHETIC_EXACT");
 if(input.combo_people!==1&&input.combo_people!==2)return hold("COMBO_1P_OR_2P_NOT_VERIFIED");
 if(input.combo_units!==1||input.hot_roll_units!==1||input.cold_roll_units!==2)
   return hold("COMPOSITION_DIFFERS_FROM_EXACT_SCOPE");
 if(input.reported_physical_boxes!==3)return hold("REPORTED_THREE_BOX_SCOPE_NOT_MET");
 if(!["SAME","DIFFERENT","UNKNOWN"].includes(input.same_station_compatibility))
   return hold("STATION_COMPATIBILITY_INVALID");
 const kits=input.combo_people===1
   ?[{kit:"Kit p/2",quantidade:1}]
   :[{kit:"Kit p/2",quantidade:1},{kit:"Kit p/1",quantidade:1}];
 // Human rule proves combo + TWO rolls, not combo + THREE rolls.
 // Box count does not independently prove dimensions, packing or stability.
 return {...hold("THIRD_ROLL_NOT_HUMAN_JUDGED_AND_EXTERNAL_FIT_UNPROVEN"),
   status:"INFERENCE_ONLY_HOLD",
   kit_suggestion:kits,kit_status:"INFERENCE_NOT_FACT",
   bag_status:"UNKNOWN_PHYSICAL_FIT_AND_SIZE",
   box_count_status:"THREE_BOXES_REPORTED_NOT_INDEPENDENTLY_ATTESTED",
   assumptions:[
     "KIT_EXTENSION_COMBO_PLUS_2_ROLLS_TO_PLUS_3_NOT_JUDGED",
     "HOT_ROLL_CLASSIFIED_AS_ROLL_NOT_KIT_QUENTE",
     "THREE_BOX_PHYSICAL_DISTRIBUTION_NOT_MOTOR_PROVEN",
     input.same_station_compatibility==="UNKNOWN"
       ?"STATION_COMPATIBILITY_UNCONFIRMED"
       :"STATION_COMPATIBILITY_SYNTHETIC_ONLY"
   ]};
}
module.exports={SCHEMA,INPUT,KEYS,EFFECTS,PINNED_MOTOR_GIT_BLOB,
 adviseSyntheticThreeBoxComposition};
