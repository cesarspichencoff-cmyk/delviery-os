import {createHash} from "node:crypto";

/**
 * V7.36: read-only enrichment seam for an AUTHORIZED iFood Order API response.
 * It is NOT an API client or an adapter to private Electron browser/session
 * storage. It cannot confirm a live store binding or independent event snapshot.
 *
 * Invariants:
 * - raw iFood UUID, merchant UUID, display ID and Teknisa internal ID stay
 *   separate; a four-digit displayId does not establish unique identity.
 * - item names, customer metadata and notes are never silently merged;
 * - no missing-source, speculative ETA or API response ever authorizes paper.
 */
type Rec=Record<string,unknown>;
const isObject=(x:unknown):x is Rec=>
 x!==null&&typeof x==="object"&&!Array.isArray(x);
const txt=(x:unknown)=>typeof x==="string"?x.trim():"";
const uuid=(x:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(txt(x));
const localDate=(v:unknown)=>
 typeof v==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?$/.test(v) &&
 !Number.isNaN(Date.parse(v.slice(0,19)+"-03:00"));
function utcDate(v:unknown):number|null {
 if(typeof v!=="string"||
   !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?(?:Z|[+-]\d\d:\d\d)$/.test(v))return null;
 const t=Date.parse(v);
 return Number.isFinite(t)?t:null;
}
function spDate(t:number):string{
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",
   year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(t);
 const item=(name:string)=>parts.find(x=>x.type===name)?.value??"";
 return item("year")+"-"+item("month")+"-"+item("day");
}
export interface SourceBindingV736 {
 schema:"deliveryos.ifood-teknisa-merchant-binding.v736";
 store_id:string;
 shop_id:string;
 ifood_merchant_uuid:string|null; // UNKNOWN until independent authorization
 status:"UNVERIFIED_REVIEW_ONLY";
}
export interface TeknisaOrderForReconciliationV736 {
 CDFILIAL:string;CDLOJA:string;NRCOMANDA:string;NRCOMANDAEXT:string;
 IDORGCMDVENDA:string;DTHRABERMESA:string;
 snapshot_hash:string|null;
}
export interface IfoodSourceV736 {
 id:string;displayId:string;
 merchant:{id:string};
 orderType:string;orderTiming:string;createdAt:string;
 items?:unknown[];
 delivery?:{deliveryDateTime?:string|null};
 schedule?:{deliveryDateTimeStart?:string|null;deliveryDateTimeEnd?:string|null};
}
export interface IfoodTeknisaReviewV736 {
 schema:"deliveryos.ifood-teknisa-review.v736";
 status:"BOTH_PRESENT_REVIEW_ONLY"|"ONE_SOURCE_MISSING"|"BLOCKED";
 reasons:string[];
 source_presence:{ifood:boolean;teknisa:boolean};
 identifiers:{
   ifood_uuid_digest:string|null;display_id:string|null;
   teknisa_order:string|null;store_id:string|null;shop_id:string|null;
 };
 eta:{
   type:"IFOOD_ESTIMATED_DELIVERY"|"IFOOD_SCHEDULED_WINDOW"|"NOT_AVAILABLE";
   from_utc:string|null;until_utc:string|null;
   origin:"IFOOD_ORDER_API"|"NONE";dynamic_tracking_proven:false;
 };
 items:{
   ifood_item_lines:number|null;
   teknisa_quantities_unverified:true;
   item_parity_proven:false;
   observations_merged:false;
 };
 identity_independently_proven:false;
 store_binding_independently_proven:false;
 authorized_ifood_api_access_proven:false;
 print_authorized:false;
 effects:{api_call:false;sql_read:false;sql_write:false;print:false;spooler_write:false;
   service_write:false;sequence_write:false};
}
const EFFECTS=Object.freeze({api_call:false,sql_read:false,sql_write:false,
 print:false,spooler_write:false,service_write:false,sequence_write:false} as const);
const noEta=()=>({
 type:"NOT_AVAILABLE" as const,from_utc:null,until_utc:null,
 origin:"NONE" as const,dynamic_tracking_proven:false as const
});
export function reviewIfoodTeknisaV736(
 binding:unknown,ifood:unknown,teknisa:unknown,
):IfoodTeknisaReviewV736 {
 const b=(isObject(binding)?binding:{}) as Partial<SourceBindingV736>;
 const f=(isObject(ifood)?ifood:{}) as Partial<IfoodSourceV736>;
 const t=(isObject(teknisa)?teknisa:{}) as Partial<TeknisaOrderForReconciliationV736>;
 const hasF=ifood!==null&&ifood!==undefined;
 const hasT=teknisa!==null&&teknisa!==undefined;
 const errors=new Set<string>();
 let eta:IfoodTeknisaReviewV736["eta"]=noEta();
 if(b.schema!=="deliveryos.ifood-teknisa-merchant-binding.v736"||
   b.status!=="UNVERIFIED_REVIEW_ONLY"||
   !/^\d{4}$/.test(txt(b.store_id))||!/^\d{1,6}$/.test(txt(b.shop_id)))
   errors.add("STORE_REVIEW_BINDING_MALFORMED");
 if(hasT){
   if(!/^\d{4}$/.test(txt(t.CDFILIAL))||
      !/^\d{1,6}$/.test(txt(t.CDLOJA))||
      !/^\d{1,15}$/.test(txt(t.NRCOMANDA))||
      !/^\d{1,10}$/.test(txt(t.NRCOMANDAEXT))||
      t.IDORGCMDVENDA!=="DLV_IFO"||
      !localDate(t.DTHRABERMESA))
     errors.add("TEKNISA_ORDER_STRUCTURE_INVALID");
   if(t.CDFILIAL!==b.store_id||t.CDLOJA!==b.shop_id)
     errors.add("TEKNISA_STORE_OR_SHOP_MISMATCH");
   if(t.snapshot_hash!==null&&t.snapshot_hash!==undefined&&
      !/^[a-f0-9]{64}$/i.test(txt(t.snapshot_hash)))
     errors.add("TEKNISA_SNAPSHOT_FORMAT_INVALID");
 }
 let itemCount:number|null=null,ifoTime:number|null=null;
 if(hasF){
   if(!uuid(f.id)||!uuid(f.merchant?.id)||!/^[A-Za-z0-9-]{1,20}$/.test(txt(f.displayId))||
      !["DELIVERY","TAKEOUT","DINE_IN"].includes(txt(f.orderType))||
      !["IMMEDIATE","SCHEDULED"].includes(txt(f.orderTiming))||
      (ifoTime=utcDate(f.createdAt))===null)
     errors.add("IFOOD_OFFICIAL_ORDER_ENVELOPE_INVALID");
   if(f.items!==undefined&&!Array.isArray(f.items))
     errors.add("IFOOD_ITEMS_MALFORMED");
   else if(Array.isArray(f.items))itemCount=f.items.length;
   if(!uuid(b.ifood_merchant_uuid))
     errors.add("IFOOD_MERCHANT_BINDING_MISSING");
   else if(f.merchant?.id?.toLowerCase()!==b.ifood_merchant_uuid?.toLowerCase())
     errors.add("IFOOD_MERCHANT_MISMATCH");
   if(f.orderTiming==="SCHEDULED"){
     const from=utcDate(f.schedule?.deliveryDateTimeStart);
     const until=utcDate(f.schedule?.deliveryDateTimeEnd);
     if(from===null||until===null||until<=from)
       errors.add("IFOOD_SCHEDULE_WINDOW_MISSING_OR_INVALID");
     else{
       eta.type="IFOOD_SCHEDULED_WINDOW";
       eta.from_utc=new Date(from).toISOString();
       eta.until_utc=new Date(until).toISOString();
       eta.origin="IFOOD_ORDER_API";
     }
   }else if(f.orderTiming==="IMMEDIATE" && f.delivery?.deliveryDateTime!==undefined &&
            f.delivery.deliveryDateTime!==null){
     const when=utcDate(f.delivery.deliveryDateTime);
     if(when===null)errors.add("IFOOD_ESTIMATE_INVALID");
     else{
       eta.type="IFOOD_ESTIMATED_DELIVERY";
       eta.from_utc=new Date(when).toISOString();
       eta.until_utc=null;
       eta.origin="IFOOD_ORDER_API" as never;
     }
   }
 }
 if(hasF&&hasT) {
   if(txt(f.displayId)!==txt(t.NRCOMANDAEXT))
     errors.add("IFOOD_DISPLAY_ID_NOT_TEK_EXTERNAL_ID");
   if(ifoTime!==null&&localDate(t.DTHRABERMESA)){
     const dayMs=Date.parse(t.DTHRABERMESA!.slice(0,10)+"T00:00:00Z");
     const ifoodMs=Date.parse(spDate(ifoTime)+"T00:00:00Z");
     if(Math.abs(dayMs-ifoodMs)>86400000)
       errors.add("IFOOD_TEK_ORDER_DATES_TOO_FAR_APART");
   }
 }
 if(!hasF)errors.add("IFOOD_SOURCE_MISSING");
 if(!hasT)errors.add("TEKNISA_SOURCE_MISSING");
 const status:IfoodTeknisaReviewV736["status"]=
   [...errors].some(x=>x==="IFOOD_SOURCE_MISSING"||x==="TEKNISA_SOURCE_MISSING")&&
   errors.size===(!hasF&&!hasT?2:1)
     ?"ONE_SOURCE_MISSING":errors.size?"BLOCKED":"BOTH_PRESENT_REVIEW_ONLY";
 // A partial or contradictory input must never leak a plausible ETA to print.
 const validEta=status==="BOTH_PRESENT_REVIEW_ONLY"?eta:noEta();
 return {
   schema:"deliveryos.ifood-teknisa-review.v736",status,reasons:[...errors].sort(),
   source_presence:{ifood:hasF,teknisa:hasT},
   identifiers:{
     ifood_uuid_digest:uuid(f.id)?createHash("sha256").update(f.id!.toLowerCase()).digest("hex"):null,
     display_id:hasF?txt(f.displayId)||null:null,
     teknisa_order:hasT?txt(t.NRCOMANDA)||null:null,
     store_id:b.store_id??null,shop_id:b.shop_id??null
   },
   eta:validEta,
   items:{ifood_item_lines:itemCount,teknisa_quantities_unverified:true,
     item_parity_proven:false,observations_merged:false},
   identity_independently_proven:false,
   store_binding_independently_proven:false,
   authorized_ifood_api_access_proven:false,print_authorized:false,effects:EFFECTS
 };
}
