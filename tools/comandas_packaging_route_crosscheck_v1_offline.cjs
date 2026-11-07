"use strict";
/**
 * Immutable, exact-byte JOIN of historic classification gaps to the 2026-09-30
 * configured Itaim printer routing snapshot. Presence of a routing code
 * is NOT approval of classification, family, physical station, packaging,
 * native dispatch, printing or catalog/current-version attestation.
 */
const crypto=require("node:crypto");
const {prioritizeClassificationGaps}=
 require("./comandas_packaging_classification_review_v1_offline.cjs");
const SCHEMA="tata.comandas.classification-route-gap-join.v1.offline";
const PINNED_ROUTING_BLOB="d7d4d25bcb882370a37cf748d2d79139b07159a0";
const CODES=new Set(["00002","00003","00004","00006","00007","00009"]);
const EFFECTS=Object.freeze({read_live_orders:false,read_live_sql:false,
 source_repin:false,write_catalog:false,change_printers:false,
 print:false,service_change:false,sequence_write:false,deploy:false});
function hold(reason){return {schema:SCHEMA,status:"HOLD",reason,queue:[],
  present_in_archived_routing:null,absent_in_archived_routing:null,
  classification_proven:false,packaging_proven:false,station_live_proven:false,
  printer_power_proven:false,first_dispatch_proven:false,
  operational_ready:false,physical_print_authorized:false,effects:EFFECTS};}
function joinClassificationGapsToPinnedRouting(snapshot,routingFileBytes){
 const queue=prioritizeClassificationGaps(snapshot);
 if(queue.status!=="HISTORICAL_PRIORITY_QUEUE_NOT_CLASSIFICATION")
  return hold("CLASSIFICATION_SNAPSHOT_UNVERIFIED");
 if(!Buffer.isBuffer(routingFileBytes)||routingFileBytes.length<100||
    routingFileBytes.length>262144)return hold("EXACT_ROUTING_BYTES_REQUIRED");
 const blob=crypto.createHash("sha1")
  .update(Buffer.from("blob "+routingFileBytes.length+"\0"))
  .update(routingFileBytes).digest("hex");
 if(blob!==PINNED_ROUTING_BLOB)
  return hold("ARCHIVED_ROUTING_FILE_NOT_EXACTLY_PINNED");
 let src;
 try{src=JSON.parse(routingFileBytes.toString("utf8"));}
 catch{return hold("ROUTING_DOCUMENT_UNPARSEABLE")}
 if(!src||Array.isArray(src)||
    src.schema!=="deliveryos.odhen.product-routing.compact.v1"||
    src.store!=="0001 - TATA ITAIM"||
    src.captured_date!=="2026-09-30"||
    src.counts?.products!==463||
    !src.products||typeof src.products!=="object"||
    Array.isArray(src.products)||
    Object.keys(src.products).length!==463)
  return hold("ARCHIVED_ROUTING_SCHEMA_OR_SCOPE_INVALID");
 const list=[];
 for(const q of queue.queue){
  const targets=src.products[q.canonical_code];
  if(targets!==undefined&&(!Array.isArray(targets)||
     targets.length<1||targets.length>2||
     new Set(targets).size!==targets.length||
     targets.some(t=>!CODES.has(t))))
   return hold("ROUTING_TARGET_DATA_INVALID");
  list.push({
   canonical_code:q.canonical_code,
   reason_occurrences:q.reason_occurrences,
   historical_route_status:targets?"CONFIGURED_IN_20260930_SNAPSHOT":
    "NOT_IN_20260930_ROUTING_SNAPSHOT",
   configured_target_codes_20260930:targets?[...targets].sort():[],
   classification_status:"UNKNOWN_REQUIRES_APPROVED_CROSSWALK",
   packing_status:"UNKNOWN_DO_NOT_INFER_BOX_BAG_OR_KIT",
   route_is_not_physical_proof:true
  });
 }
 const present=list.filter(x=>x.historical_route_status==="CONFIGURED_IN_20260930_SNAPSHOT").length;
 const absent=list.length-present;
 // This archived two-source join is deterministic. It cannot repair a
 // missing route and it MUST NOT classify a product from its printer code.
 if(present!==13||absent!==1||
    list.find(x=>x.canonical_code==="8.20.11.002.00")?.historical_route_status!==
      "NOT_IN_20260930_ROUTING_SNAPSHOT")
  return hold("EXPECTED_ARCHIVED_COVERAGE_DRIFT");
 return {schema:SCHEMA,status:"HISTORICAL_ROUTE_COVERAGE_REVIEW_ONLY",
  reason:"ROUTING_PRESENCE_DOES_NOT_PROVE_PRODUCT_CLASSIFICATION",
  queue:list,present_in_archived_routing:present,absent_in_archived_routing:absent,
  classification_proven:false,packaging_proven:false,station_live_proven:false,
  printer_power_proven:false,first_dispatch_proven:false,
  operational_ready:false,physical_print_authorized:false,effects:EFFECTS};
}
module.exports={SCHEMA,EFFECTS,PINNED_ROUTING_BLOB,joinClassificationGapsToPinnedRouting};
