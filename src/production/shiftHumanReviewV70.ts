import type {ProductionServiceShiftState,ProductionShiftService} from "./serviceShiftState";

/**
 * Review-only helper for a future manual shift renewal.
 * No signatures or operator identity can be authenticated by this module;
 * returned proposals are NEVER executable approval or live reader state.
 */
export interface ShiftHumanReviewRequestV70 {
  schema:"deliveryos.human-shift-review-request.v70";
  store_id:string;
  operational_date:string;
  service:ProductionShiftService;
  valid_from_local:string;
  valid_until_local:string;
  human_claim:{
    operator_ref:string;
    confirmation_source_ref:string;
    confirmed_at_local:string;
    statement:"I_CONFIRM_STORE_DAY_SERVICE_AND_VALIDITY";
  };
}
export interface ShiftHumanReviewV70 {
  status:"REVIEWABLE_NOT_AUTHORIZED"|"BLOCKED";
  blockers:string[];
  declared_request:ShiftHumanReviewRequestV70|null;
  prior_state_status:"VALID_SCHEMA"|"UNTRUSTED_OR_ABSENT";
  safeguards:{
    authenticates_human_identity:false;
    valid_for_past_orders:false;
    writes_live_state:false;
    restarts_service:false;
    assigns_shift_from_clock:false;
    authorizes_print:false;
    requires_independent_human_effect_approval:true;
  };
}
const SAFEGUARDS={
 authenticates_human_identity:false,valid_for_past_orders:false,
 writes_live_state:false,restarts_service:false,assigns_shift_from_clock:false,
 authorizes_print:false,requires_independent_human_effect_approval:true,
} as const;
function isDate(s:unknown):s is string {
 if(typeof s!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
 const d=new Date(s+"T12:00:00.000Z");
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;
}
function isLocalSecond(s:unknown):s is string {
 if(typeof s!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s))return false;
 const [date,time]=s.split("T");
 const [h,m,sec]=time.split(":").map(Number);
 return isDate(date)&&h<24&&m<60&&sec<60;
}
const present=(s:unknown)=>typeof s==="string"&&!!s.trim()&&s.length<=256;

/** Validates only self-declared review data; never translates claim to authority. */
export function reviewHumanShiftRenewalV70(
 request:unknown,existingState:unknown,nowLocal:string,
):ShiftHumanReviewV70 {
 const issues=new Set<string>();
 const state=(existingState&&typeof existingState==="object"
   ?existingState:{}) as Partial<ProductionServiceShiftState>;
 const req=(request&&typeof request==="object"
   ?request:{}) as Partial<ShiftHumanReviewRequestV70>;
 const claim=(req.human_claim&&typeof req.human_claim==="object"
   ?req.human_claim:{}) as Partial<ShiftHumanReviewRequestV70["human_claim"]>;
 const previous:ShiftHumanReviewV70["prior_state_status"]=
   state.schema==="deliveryos.production-service-shift-state.v2"
     ?"VALID_SCHEMA":"UNTRUSTED_OR_ABSENT";
 if(req.schema!=="deliveryos.human-shift-review-request.v70")
    issues.add("SHIFT_REVIEW_SCHEMA_INVALID");
 if(req.store_id!=="0001"||state.store_id!=="0001")
    issues.add("SHIFT_REVIEW_STORE_MISMATCH");
 if(!isDate(req.operational_date))
    issues.add("SHIFT_REVIEW_OPERATIONAL_DATE_INVALID");
 if(!["LUNCH","DINNER"].includes(String(req.service)))
    issues.add("SHIFT_REVIEW_SERVICE_INVALID");
 if(!isLocalSecond(req.valid_from_local)||!isLocalSecond(req.valid_until_local)||
    (isLocalSecond(req.valid_from_local)&&isLocalSecond(req.valid_until_local)&&
      req.valid_from_local>=req.valid_until_local))
    issues.add("SHIFT_REVIEW_INTERVAL_INVALID");
 if(!isLocalSecond(nowLocal))
    issues.add("SHIFT_REVIEW_NOW_MUST_BE_EXPLICIT_LOCAL");
 if(!isLocalSecond(claim.confirmed_at_local)||
    !present(claim.operator_ref)||!present(claim.confirmation_source_ref)||
    claim.statement!=="I_CONFIRM_STORE_DAY_SERVICE_AND_VALIDITY")
    issues.add("SHIFT_REVIEW_HUMAN_CLAIM_INCOMPLETE");
 if(isDate(req.operational_date)&&isLocalSecond(req.valid_from_local)&&
    isLocalSecond(req.valid_until_local)&&
    (req.valid_from_local.slice(0,10)!==req.operational_date||
     req.valid_until_local.slice(0,10)!==req.operational_date))
    issues.add("SHIFT_REVIEW_CROSS_MIDNIGHT_UNSUPPORTED_BY_INSTALLED_WATCHER");
 if(isDate(req.operational_date)&&isLocalSecond(nowLocal)&&
    req.operational_date!==nowLocal.slice(0,10))
    issues.add("SHIFT_REVIEW_DATE_NOT_CURRENT");
 if(isLocalSecond(nowLocal)&&isLocalSecond(req.valid_from_local)&&
    req.valid_from_local<nowLocal)
    issues.add("SHIFT_REVIEW_RETROACTIVE_WINDOW_FORBIDDEN");
 if(isLocalSecond(nowLocal)&&isLocalSecond(req.valid_until_local)&&
    req.valid_until_local<=nowLocal)
    issues.add("SHIFT_REVIEW_WINDOW_ALREADY_EXPIRED");
 if(isLocalSecond(claim.confirmed_at_local)&&isLocalSecond(nowLocal)&&
    (claim.confirmed_at_local>nowLocal||
     claim.confirmed_at_local.slice(0,10)!==nowLocal.slice(0,10)))
    issues.add("SHIFT_REVIEW_CLAIM_CLOCK_INVALID");
 if(isLocalSecond(req.valid_from_local)&&isLocalSecond(claim.confirmed_at_local)&&
    req.valid_from_local<claim.confirmed_at_local)
    issues.add("SHIFT_REVIEW_BACKDATED_BEFORE_CLAIM");
 // No output in the installed state schema: it has no valid_from control.
 // Until the watcher supports exact windows, NEVER translate the review to
 // production-service-state.json, even if every human claim field is present.
 return {
   status:issues.size?"BLOCKED":"REVIEWABLE_NOT_AUTHORIZED",
   blockers:[...issues].sort(),
   declared_request:issues.size?null:JSON.parse(JSON.stringify(req)) as ShiftHumanReviewRequestV70,
   prior_state_status:previous,safeguards:SAFEGUARDS,
 };
}
