"use strict";
const assert=require("node:assert/strict");
const {reviewIfoodTeknisaV736:review}=require(
  "../dist/src/production/ifoodTeknisaReconciliationV736.js");
const merchant="b6eb79f2-0000-4444-8888-29afa4a96bf2";
const orderId="947f93eb-aaa1-4bb8-9888-20ee8a9123c1";
const binding={schema:"deliveryos.ifood-teknisa-merchant-binding.v736",
 store_id:"0001",shop_id:"01",ifood_merchant_uuid:merchant,
 status:"UNVERIFIED_REVIEW_ONLY"};
const ifood={id:orderId,displayId:"7599",merchant:{id:merchant},orderType:"DELIVERY",
 orderTiming:"IMMEDIATE",createdAt:"2026-10-12T22:00:00.000Z",
 delivery:{deliveryDateTime:"2026-10-12T23:30:00.000Z"},
 items:[{id:"x",name:"example",quantity:2,observations:"SEM SHOYU"}],
 customer:{name:"DO_NOT_COPY_PRIVATE_NAME",phone:"SECRET"},
 extraInfo:"DO_NOT_COPY_GENERAL_NOTE"};
const tek={CDFILIAL:"0001",CDLOJA:"01",NRCOMANDA:"0000000057",
 NRCOMANDAEXT:"7599",IDORGCMDVENDA:"DLV_IFO",
 DTHRABERMESA:"2026-10-12T19:00:15",snapshot_hash:"a".repeat(64)};
let tests=0;
const check=(label,fn)=>{fn();tests++;console.log("PASS V736 "+tests+" "+label);};
const blocked=(code,r)=>{
 assert.equal(r.status,"BLOCKED");
 assert.ok(r.reasons.includes(code),JSON.stringify(r.reasons));
 assert.equal(r.print_authorized,false);
 assert.equal(r.eta.type,"NOT_AVAILABLE");
};
const safe=r=>{
 assert.equal(r.print_authorized,false);
 assert.equal(r.authorized_ifood_api_access_proven,false);
 assert.equal(r.identity_independently_proven,false);
 assert.equal(r.store_binding_independently_proven,false);
 assert.equal(r.items.item_parity_proven,false);
 assert.equal(r.items.observations_merged,false);
 assert.ok(Object.values(r.effects).every(x=>x===false));
 assert.equal(JSON.stringify(r).includes("DO_NOT_COPY_PRIVATE_NAME"),false);
 assert.equal(JSON.stringify(r).includes("DO_NOT_COPY_GENERAL_NOTE"),false);
 assert.equal(JSON.stringify(r).includes("SECRET"),false);
};
check("same explicit display id and SQL store produces review only",()=>{
 const r=review(binding,ifood,tek);
 assert.equal(r.status,"BOTH_PRESENT_REVIEW_ONLY");
 assert.equal(r.identifiers.display_id,"7599");
 assert.equal(r.identifiers.teknisa_order,"0000000057");
 assert.equal(r.identifiers.ifood_uuid_digest.length,64);
 assert.equal(r.items.ifood_item_lines,1);
 safe(r);
});
check("estimated delivery included only as iFood-sourced non-dynamic context",()=>{
 const r=review(binding,ifood,tek);
 assert.equal(r.eta.type,"IFOOD_ESTIMATED_DELIVERY");
 assert.equal(r.eta.from_utc,"2026-10-12T23:30:00.000Z");
 assert.equal(r.eta.dynamic_tracking_proven,false);
});
check("with scheduled window use interval, not a single guessed time",()=>{
 const f={...ifood,orderTiming:"SCHEDULED",
 schedule:{deliveryDateTimeStart:"2026-10-12T22:20:00Z",
 deliveryDateTimeEnd:"2026-10-13T00:00:00Z"}};
 const r=review(binding,f,tek);
 assert.equal(r.status,"BOTH_PRESENT_REVIEW_ONLY");
 assert.equal(r.eta.type,"IFOOD_SCHEDULED_WINDOW");
 assert.equal(r.eta.from_utc,"2026-10-12T22:20:00.000Z");
 assert.equal(r.eta.until_utc,"2026-10-13T00:00:00.000Z");
 safe(r);
});
check("no estimate is invented for immediate unpopulated delivery",()=>{
 const f={...ifood,delivery:{}};
 const r=review(binding,f,tek);
 assert.equal(r.eta.type,"NOT_AVAILABLE");safe(r);
});
check("invalid estimate blocks instead of guessing",()=>{
 blocked("IFOOD_ESTIMATE_INVALID",
  review(binding,{...ifood,delivery:{deliveryDateTime:"18:30"}},tek));
});
check("scheduled order without range blocks",()=>{
 blocked("IFOOD_SCHEDULE_WINDOW_MISSING_OR_INVALID",
  review(binding,{...ifood,orderTiming:"SCHEDULED",schedule:null},tek));
});
check("backwards scheduled interval blocks",()=>{
 blocked("IFOOD_SCHEDULE_WINDOW_MISSING_OR_INVALID",
  review(binding,{...ifood,orderTiming:"SCHEDULED",schedule:{
   deliveryDateTimeStart:"2026-10-13T00:00:00Z",
   deliveryDateTimeEnd:"2026-10-12T22:20:00Z"}},tek));
});
check("different four-digit display ID stops any merge",()=>{
 blocked("IFOOD_DISPLAY_ID_NOT_TEK_EXTERNAL_ID",
  review(binding,{...ifood,displayId:"8862"},tek));
});
check("wrong merchant cannot inherit store identity",()=>{
 blocked("IFOOD_MERCHANT_MISMATCH",
  review(binding,{...ifood,merchant:{id:"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"}},tek));
});
check("unverified merchant UUID never inferred from SQL or displayId",()=>{
 blocked("IFOOD_MERCHANT_BINDING_MISSING",
  review({...binding,ifood_merchant_uuid:null},ifood,tek));
});
check("wrong Teknisa shop refuses join",()=>{
 blocked("TEKNISA_STORE_OR_SHOP_MISMATCH",
  review(binding,ifood,{...tek,CDLOJA:"02"}));
});
check("wrong Teknisa filial refuses join",()=>{
 blocked("TEKNISA_STORE_OR_SHOP_MISMATCH",
  review(binding,ifood,{...tek,CDFILIAL:"0002"}));
});
check("other origin cannot masquerade as iFood",()=>{
 blocked("TEKNISA_ORDER_STRUCTURE_INVALID",
  review(binding,ifood,{...tek,IDORGCMDVENDA:"DLV_NMO"}));
});
check("iFood source missing yields visible pending alert",()=>{
 const r=review(binding,null,tek);
 assert.equal(r.status,"ONE_SOURCE_MISSING");
 assert.ok(r.reasons.includes("IFOOD_SOURCE_MISSING"));
 safe(r);
});
check("Teknisa source missing yields visible pending alert",()=>{
 const r=review(binding,ifood,null);
 assert.equal(r.status,"ONE_SOURCE_MISSING");
 assert.ok(r.reasons.includes("TEKNISA_SOURCE_MISSING"));
 safe(r);
});
check("both sources missing remains pending, never creates order",()=>{
 const r=review(binding,null,null);
 assert.equal(r.status,"ONE_SOURCE_MISSING");safe(r);
});
check("old iFood UUID/date with recycled 4-digit label blocks",()=>{
 blocked("IFOOD_TEK_ORDER_DATES_TOO_FAR_APART",
  review(binding,{...ifood,createdAt:"2026-10-05T22:00:00Z"},tek));
});
check("without valid UUID never accept display ID alone",()=>{
 blocked("IFOOD_OFFICIAL_ORDER_ENVELOPE_INVALID",
  review(binding,{...ifood,id:"7599"},tek));
});
check("bad Teknisa snapshot shape blocks",()=>{
 blocked("TEKNISA_SNAPSHOT_FORMAT_INVALID",
  review(binding,ifood,{...tek,snapshot_hash:"a"}));
});
check("iFood items non-array must never silently fall back",()=>{
 blocked("IFOOD_ITEMS_MALFORMED",
  review(binding,{...ifood,items:"raw-text"},tek));
});
check("malformed mapping is refused",()=>{
 blocked("STORE_REVIEW_BINDING_MALFORMED",
  review({...binding,status:"INSTALLED"},ifood,tek));
});
check("raw notes names payment details do not appear in output",()=>{
 const r=review(binding,ifood,tek);
 safe(r);assert.equal(JSON.stringify(r).includes("SEM SHOYU"),false);
});
check("input snapshots are never mutated",()=>{
 const before=JSON.stringify([binding,ifood,tek]);
 review(binding,ifood,tek);
 assert.equal(JSON.stringify([binding,ifood,tek]),before);
});
console.log("THERMAL_IFOOD_TEKNISA_ENRICHMENT_V736="+tests+"/"+tests+
 " API_NOT_CONNECTED_NO_PRINT_NO_DB_WRITE_NO_CREDENTIALS");
