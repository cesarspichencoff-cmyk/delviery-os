/**
 * V7.35: Itaim reader-event -> verified store-hours REVIEW adapter.
 *
 * The Windows hostname CAIXA_MOOCA was identified as Itaim equipment by
 * the operator in a previous operational discussion; this is not itself
 * proof of any CDFILIAL/CDLOJA binding. Never guess a shop ID or copy an
 * event's shop ID into the trusted side of a comparison.
 *
 * This pure function does not refresh expired shift state, modify a reader
 * event, run the V2 consumer, allow printing or certify source snapshots.
 */
import {reviewStoreServiceWindowsV733,
  type StoreServiceRuleV733} from "./storeServiceWindowsV733";

interface CandidateReaderBindingV735 {
  schema:"deliveryos.itaim-reader-binding-candidate.v735";
  unit:"ITAIM";
  windows_host:"CAIXA_MOOCA";
  expected_store_id:string|null;
  expected_shop_id:string|null;
  state:"CANDIDATE_READ_ONLY_NOT_INSTALLED";
  source_ref:string;
}
interface ItaimHoursTemplateV734 {
  schema:"deliveryos.itaim-unbound-service-hours-template.v734";
  unit:"ITAIM";
  store_id:null;
  binding_state:"UNBOUND_REQUIRES_ITAIM_LOCAL_STORE_VERIFICATION";
  revision:string;
  source_ref:string;
  evidence:"CURRENT_OPERATING_RULE_CONFIRMED";
  effective_from_local_date:string;
  windows:StoreServiceRuleV733["windows"];
  holiday_calendar:StoreServiceRuleV733["holiday_calendar"];
  holiday_windows:StoreServiceRuleV733["holiday_windows"];
}
interface ReaderEventV735 {
  schema:"deliveryos.tata-reader-stable-order-event.v1";
  order_key:string;
  snapshot_hash:string;
  ready_for_downstream_shadow:boolean;
  blockers:string[];
  order:{CDFILIAL:string;CDLOJA:string;NRVENDAREST:string;NRCOMANDA:string;
    DTHRABERMESA:string;items:unknown[]};
}
export interface ItaimEventServiceReviewV735 {
  schema:"deliveryos.itaim-reader-service-review.v735";
  status:"BLOCKED"|"RULE_MATCH_REVIEW_ONLY";
  service:"LUNCH"|"DINNER"|null;
  reasons:string[];
  store_id:string|null;
  shop_id:string|null;
  event_order_key_consistent:boolean;
  upstream_watcher_blocked:boolean;
  event_snapshot_independently_reconciled:false;
  binding_independently_proven:false;
  original_event_unchanged:true;
  authorizes_print:false;
  authorizes_watcher_state:false;
  effects:{sql_read:false;sql_write:false;print:false;
    spooler_write:false;service_write:false;sequence_write:false};
}
const NO_EFFECTS=Object.freeze({sql_read:false,sql_write:false,
  print:false,spooler_write:false,service_write:false,
  sequence_write:false} as const);
const object=(v:unknown):v is Record<string,unknown> =>
  v!==null&&typeof v==="object"&&!Array.isArray(v);
const plain=(v:unknown)=>typeof v==="string"&&
  v.length>0&&v.length<=96&&!/[|\r\n]/.test(v);
const four=(v:unknown)=>typeof v==="string"&&/^\d{4}$/.test(v);
const shop=(v:unknown)=>typeof v==="string"&&/^\d{1,6}$/.test(v);
function fail(
  reasons:string[],snapshotOk:boolean,upstreamBlocked:boolean
):ItaimEventServiceReviewV735 {
  return {schema:"deliveryos.itaim-reader-service-review.v735",
    status:"BLOCKED",service:null,reasons:[...new Set(reasons)].sort(),
    store_id:null,shop_id:null,event_order_key_consistent:snapshotOk,
    upstream_watcher_blocked:upstreamBlocked,
    event_snapshot_independently_reconciled:false,
    binding_independently_proven:false,original_event_unchanged:true,
    authorizes_print:false,authorizes_watcher_state:false,effects:NO_EFFECTS};
}
export function reviewItaimReaderServiceV735(
 binding:unknown,template:unknown,event:unknown,
):ItaimEventServiceReviewV735 {
 const reasons:string[]=[];
 const b=(object(binding)?binding:{}) as Partial<CandidateReaderBindingV735>;
 const t=(object(template)?template:{}) as Partial<ItaimHoursTemplateV734>;
 const e=(object(event)?event:{}) as Partial<ReaderEventV735>;
 const o=(object(e.order)?e.order:{}) as Partial<ReaderEventV735["order"]>;
 const identity=plain(o.CDFILIAL)&&plain(o.CDLOJA)&&plain(o.NRVENDAREST)&&plain(o.NRCOMANDA)&&
  typeof e.order_key==="string"&&
  e.order_key===[o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].join("|");
 const blockedUpstream=e.ready_for_downstream_shadow!==true||
   !Array.isArray(e.blockers)||e.blockers.length!==0;
 if(b.schema!=="deliveryos.itaim-reader-binding-candidate.v735"||
    b.unit!=="ITAIM"||b.windows_host!=="CAIXA_MOOCA"||
    b.state!=="CANDIDATE_READ_ONLY_NOT_INSTALLED"||
    !plain(b.source_ref))reasons.push("TARGET_BINDING_CONTRACT_INVALID");
 if(!four(b.expected_store_id))reasons.push("TARGET_STORE_ID_UNVERIFIED");
 if(!shop(b.expected_shop_id))reasons.push("TARGET_SHOP_ID_UNVERIFIED");
 if(e.schema!=="deliveryos.tata-reader-stable-order-event.v1"||
    !identity||!Array.isArray(o.items)||!o.items.length||
    !/^[a-fA-F0-9]{64}$/.test(String(e.snapshot_hash??"")))
   reasons.push("ORDER_IDENTITY_OR_REVISION_ENVELOPE_INVALID");
 if(o.CDFILIAL!==b.expected_store_id)reasons.push("TARGET_STORE_ID_MISMATCH");
 if(o.CDLOJA!==b.expected_shop_id)reasons.push("TARGET_SHOP_ID_MISMATCH");
 if(t.schema!=="deliveryos.itaim-unbound-service-hours-template.v734"||
    t.unit!=="ITAIM"||t.store_id!==null||
    t.binding_state!=="UNBOUND_REQUIRES_ITAIM_LOCAL_STORE_VERIFICATION"||
    t.evidence!=="CURRENT_OPERATING_RULE_CONFIRMED"||
    !plain(t.revision)||!plain(t.source_ref))
   reasons.push("ITAIM_CONFIRMED_HOURS_TEMPLATE_INVALID");
 if(!identity||reasons.length)
   return fail(reasons,!!identity,blockedUpstream);
 const rule:StoreServiceRuleV733={
   schema:"deliveryos.store-service-windows.v733",
   store_id:b.expected_store_id!,
   revision:t.revision!,
   source_ref:t.source_ref!,
   evidence:"CURRENT_OPERATING_RULE_CONFIRMED",
   effective_from_local_date:t.effective_from_local_date!,
   windows:t.windows!,
   holiday_calendar:t.holiday_calendar,
   holiday_windows:t.holiday_windows
 };
 const result=reviewStoreServiceWindowsV733(rule,{
   store_id:o.CDFILIAL!,
   opened_at_local:String(o.DTHRABERMESA??"")
 });
 if(result.status!=="RULE_MATCH_REVIEW_ONLY"||!result.service)
   return fail(result.reasons,!!identity,blockedUpstream);
 // This result is diagnostic, not a replacement for watcher-ready status.
 // If old state expired, report the prospective match but keep its blockers.
 return {schema:"deliveryos.itaim-reader-service-review.v735",
   status:"RULE_MATCH_REVIEW_ONLY",service:result.service,reasons:[],
   store_id:b.expected_store_id!,shop_id:b.expected_shop_id!,
   event_order_key_consistent:true,upstream_watcher_blocked:blockedUpstream,
   event_snapshot_independently_reconciled:false,
   binding_independently_proven:false,original_event_unchanged:true,
   authorizes_print:false,authorizes_watcher_state:false,effects:NO_EFFECTS};
}
