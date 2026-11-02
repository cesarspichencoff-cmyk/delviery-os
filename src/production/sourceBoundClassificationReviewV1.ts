import {PACKAGING_SOURCE_BLOB_V63, type MotorEntryV63} from "./currentPackagingBridgeV63";
import type {SourceOrderItemV45} from "./operationalTicketsV45";

/**
 * First-stage, source-first classification join. This is NOT a trusted
 * approval registry: self-declared reviews never grant station_proof.
 * The 14 Oct-26 classification gaps remain HOLD pending a new verified
 * human/catalog crosswalk. The existing V6.3 motor is never repinned.
 */
export const CLASSIFICATION_REVIEW_SCHEMA_V1 =
 "tata.comandas.source-bound-classification-review.v1.offline" as const;
export const PENDING_20261026_CODES_V1 = Object.freeze([
 "9.10.05.000.00","9.75.00.020.00","9.10.05.060.00",
 "9.15.00.060.00","9.10.00.050.00","8.00.05.000.00",
 "8.20.00.061.00","9.10.05.040.00","9.10.05.070.00",
 "8.00.00.010.00","9.10.05.050.00","9.15.00.070.00",
 "9.99.00.007.00","8.20.11.002.00"
] as const);
const pending=new Set<string>(PENDING_20261026_CODES_V1);
const codePattern=/^[0-9]\.[0-9]{2}\.[0-9]{2}\.[0-9]{3}\.[0-9]{2}$/;
const nonproduction=new Set(["BEBIDA","NAO_PRODUCAO"]);
const text=(s:unknown):s is string=>typeof s==="string"&&
 s.length>0&&s.length<=160&&s.trim()===s;
const keys=(obj:unknown,expected:string[]):obj is Record<string,unknown>=>
 obj!==null&&typeof obj==="object"&&!Array.isArray(obj)&&
 Object.keys(obj).length===expected.length&&
 expected.every(k=>Object.prototype.hasOwnProperty.call(obj,k));
const normalized=(s:string)=>s.normalize("NFD")
 .replace(/[\u0300-\u036f]/g,"").trim().toUpperCase().replace(/\s+/g," ");
export interface ClassificationReviewClaimV1 {
 source_item_index:number;
 product_code:string;
 product_name:string;
 quantity:number;
 family:string;
 station:string|null;
 review_required:false;
 review_source_ref:string;
}
export interface SourceBoundClassificationReviewV1 {
 schema:typeof CLASSIFICATION_REVIEW_SCHEMA_V1;
 status:"HOLD"|"REVIEW_CANDIDATE_ONLY";
 reasons:string[];
 entries:MotorEntryV63[];
 exact_code_name_quantity_index_checked:boolean;
 current_catalog_homologation_proven:false;
 provenance_independently_attested:false;
 ready_for_automatic_operational_print:false;
 effects:{sql_read:false;network:false;print:false;spooler_write:false;
  source_update:false;catalog_update:false;deploy:false};
}
const effects={sql_read:false,network:false,print:false,spooler_write:false,
 source_update:false,catalog_update:false,deploy:false} as const;
const hold=(reason:string):SourceBoundClassificationReviewV1=>({
 schema:CLASSIFICATION_REVIEW_SCHEMA_V1,status:"HOLD",reasons:[reason],
 entries:[],exact_code_name_quantity_index_checked:false,
 current_catalog_homologation_proven:false,provenance_independently_attested:false,
 ready_for_automatic_operational_print:false,effects,
});
export function reviewSourceBoundClassificationV1(
 sources:SourceOrderItemV45[],
 claims:ClassificationReviewClaimV1[],
 motorBlobSha:string,
):SourceBoundClassificationReviewV1{
 if(motorBlobSha!==PACKAGING_SOURCE_BLOB_V63)
  return hold("PINNED_PACKAGING_MOTOR_SOURCE_DRIFT");
 if(!Array.isArray(sources)||!Array.isArray(claims)||!sources.length||
    sources.length>200||sources.length!==claims.length)
  return hold("SOURCE_CLAIM_COUNT_OR_SHAPE_INVALID");
 const byIndex=new Map<number,SourceOrderItemV45>(),identities=new Set<string>();
 for(const s of sources){
  if(!s||!Number.isSafeInteger(s.item_index)||s.item_index<0||
     byIndex.has(s.item_index)||!text(s.product_code)||
     !codePattern.test(s.product_code)||!text(s.product_name)||
     !Number.isSafeInteger(s.quantity)||s.quantity<1||s.quantity>1000)
   return hold("SOURCE_IDENTITY_INVALID_OR_DUPLICATE");
  const membership=normalized(s.product_name)+"|"+s.quantity;
  if(identities.has(membership))
   return hold("SOURCE_PACKAGING_MEMBERSHIP_COLLISION");
  identities.add(membership);byIndex.set(s.item_index,s);
 }
 const seen=new Set<number>(),entries:MotorEntryV63[]=[];
 for(const c of claims){
  if(!keys(c,["source_item_index","product_code","product_name",
    "quantity","family","station","review_required","review_source_ref"])||
    !Number.isSafeInteger(c.source_item_index)||c.source_item_index<0||
    seen.has(c.source_item_index)||c.review_required!==false||
    !text(c.review_source_ref)||!text(c.family)||
    !text(c.product_code)||!text(c.product_name)||
    !Number.isSafeInteger(c.quantity))
   return hold("REVIEW_CLAIM_SHAPE_OR_DUPLICATE_INVALID");
  seen.add(c.source_item_index);
  const s=byIndex.get(c.source_item_index);
  if(!s||s.product_code!==c.product_code||
     s.product_name!==c.product_name||s.quantity!==c.quantity)
   return hold("REVIEW_CLAIM_NOT_EXACT_SOURCE_IDENTITY");
  if(pending.has(c.product_code))
   return hold("HISTORICAL_CLASSIFICATION_GAP_REQUIRES_NEW_APPROVAL");
  const noStation=nonproduction.has(normalized(c.family));
  if((noStation&&c.station!==null)||(!noStation&&!text(c.station)))
   return hold("STATION_AND_NONPRODUCTION_FAMILY_CONFLICT");
  entries.push({
   source_item_index:c.source_item_index,quantity:c.quantity,
   station_proof:"UNKNOWN",
   product:{nome:c.product_name,
    classification:{station:c.station,family:c.family}}
  });
 }
 if(seen.size!==byIndex.size)
  return hold("REVIEW_CLAIM_ITEM_COVERAGE_INCOMPLETE");
 entries.sort((a,b)=>a.source_item_index-b.source_item_index);
 return {schema:CLASSIFICATION_REVIEW_SCHEMA_V1,status:"REVIEW_CANDIDATE_ONLY",
  reasons:["CLAIM_NOT_INDEPENDENT_HOMOLOGATION","MOTOR_STATION_PROOF_UNAVAILABLE"],
  entries,exact_code_name_quantity_index_checked:true,
  current_catalog_homologation_proven:false,provenance_independently_attested:false,
  ready_for_automatic_operational_print:false,effects};
}
