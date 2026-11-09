"use strict";
/**
 * REVIEW-ONLY PRE-FLIGHT for the updated isolated V7.14 consumer candidate.
 * It does NOT mutate or execute the pinned consumer, and is NOT imported by
 * installed runtime. Matching identity is NEVER a print/dispatch attestation.
 */
const crypto=require("node:crypto");
const PINNED_V714_BLOB="f3c7cd4fcfeecaf212f8f867c668030b9c65a17d";
const SCHEMA="tata.comandas.v714-origin-preflight-review.v1";
const EFFECTS=Object.freeze({
 sql:false,files_read:false,files_write:false,network:false,
 service:false,spooler:false,printer:false,sequence:false,
 cutover:false,deploy:false
});
function hold(reason,scopeMatch=false){
 return Object.freeze({
  schema:SCHEMA,status:"HOLD",reason,
  exact_itaim_ifood_scope_syntactically_matching:scopeMatch,
  source_event_authenticated:false,source_revision_complete:false,
  native_status_semantics_proven:false,consumer_patched_or_executed:false,
  operational_ready:false,print_authorized:false,effects:EFFECTS
 });
}
function reviewLegacyV714Scope(event,pinnedSource){
 if(typeof pinnedSource!=="string"||pinnedSource.length<10000||pinnedSource.length>200000)
  return hold("PINNED_V714_SOURCE_UNAVAILABLE");
 const bytes=Buffer.from(pinnedSource,"utf8");
 const calculated=crypto.createHash("sha1").update(Buffer.concat([
  Buffer.from("blob "+bytes.length+"\0"),bytes])).digest("hex");
 if(calculated!==PINNED_V714_BLOB)
  return hold("PINNED_V714_BLOB_MISMATCH");
 if(!event||typeof event!=="object"||Array.isArray(event)||
    event.schema!=="deliveryos.tata-reader-stable-order-event.v1"||
    !event.order||typeof event.order!=="object"||Array.isArray(event.order))
  return hold("EVENT_ENVELOPE_NOT_TRUSTED");
 const o=event.order;
 if(o.CDFILIAL!=="0001"||o.CDLOJA!=="01")
  return hold("ITAIM_NATIVE_SCOPE_MISMATCH");
 if(o.IDORGCMDVENDA!=="DLV_IFO")
  return hold("NATIVE_IFOOD_ORIGIN_NOT_EXACT");
 const vals=[o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA];
 if(vals.some(x=>typeof x!=="string"||x.length<1||x.length>10||
    /[|\x00-\x1f\x7f]/.test(x))||
    event.order_key!==vals.join("|"))
  return hold("NATIVE_ORDER_KEY_NOT_BOUND_TO_HEADER");
 return hold("EXACT_SCOPE_IS_ONLY_UNATTESTED_CANDIDATE",true);
}
module.exports={SCHEMA,PINNED_V714_BLOB,EFFECTS,reviewLegacyV714Scope};
