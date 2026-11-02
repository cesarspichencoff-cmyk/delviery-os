"use strict";
const assert=require("node:assert/strict");
const {reviewIfoRetailMapping:review,SCHEMA,EFFECTS,DENIAL}=
  require("./comandas_ifo_retail_mapping_v1_offline.cjs");
function baseline(){
 return {schema:SCHEMA,
  source:{kind:"RETAIL_UI_TRANSCRIPTION_NOT_ATTESTED",
   observed_date:"2026-11-01",read_only_claim:true},
  integration:{project:"IFO",filial:"0001",mapping_mode:"DEFAULT_SELLER"},
  mapping:{per_unit:[],
   default_seller:{filial:"0001",seller:"VENDEDOR_SINTETICO"},
   seller_cashboxes:[{filial:"0001",loja:"01",caixa:"CAIXA_SINTETICO",
    seller:"VENDEDOR_SINTETICO"}]},
  centralized:"NO"
 };
}
function perUnit(){
 const x=baseline();x.integration.mapping_mode="PER_UNIT";
 x.mapping={per_unit:[{filial:"0001",loja:"01",caixa:"SINTETICO"}],
  default_seller:null,seller_cashboxes:[]};return x;
}
let n=0;
function test(name,make,expected){
 const x=make(),before=JSON.stringify(x),r=review(x);
 assert.equal(JSON.stringify(x),before,"function may not mutate supplied data");
 assert.equal(r.schema,SCHEMA);assert.equal(r.status,expected.status,name);
 if(expected.reason)assert.equal(r.reason,expected.reason,name);
 assert.deepEqual(r.effects,EFFECTS);
 for(const [key,value] of Object.entries(DENIAL))assert.equal(r[key],value,key);
 const out=JSON.stringify(r);
 for(const marker of ["VENDEDOR_SINTETICO","CAIXA_SINTETICO",
   "SECRET_SENTINEL","0001|01","IFOOD_CUSTOMER"])
  assert.ok(!out.includes(marker),"potential operational identifier leak");
 assert.equal(r.can_print,false);assert.equal(r.live_native_first_dispatch_proven,false);
 console.log("PASS "+(++n)+" "+name);
 return r;
}
const candidate={status:"MAPPING_CANDIDATE_REVIEW_ONLY"};
const hold=(reason)=>({status:"HOLD",reason});
test("single default seller to cashier produces only an untrusted mapping candidate",
 baseline,candidate);
test("single explicit unit-store-cashier mapping produces only review candidate",
 perUnit,candidate);
test("centralized YES does not prove the dispatcher host",()=>{
 const x=baseline();x.centralized="YES";return x;},candidate);
test("unknown centralized setting still allows mapping-only review",()=>{
 const x=baseline();x.centralized="UNKNOWN";return x;
},candidate);
test("unknown centralized sync does not infer a live dispatcher or print",()=>{
 const x=perUnit();x.centralized="UNKNOWN";
 const r=review(x);
 assert.equal(r.status,"MAPPING_CANDIDATE_REVIEW_ONLY");
 assert.equal(r.centralized_delivery_flag_claim,"UNKNOWN");
 assert.equal(r.real_cashbox_or_dispatcher_host_identified,false);
 assert.equal(r.live_native_first_dispatch_proven,false);
 assert.equal(r.can_print,false);
 return x;
},candidate);
test("unknown mapping mode never chooses a branch",()=>{
 const x=baseline();x.integration.mapping_mode="UNKNOWN";return x;
},hold("IFO_MAPPING_MODE_NOT_OBSERVED"));
test("different seller association cannot be matched by same cashbox",()=>{
 const x=baseline();x.mapping.seller_cashboxes[0].seller="DIFFERENT";return x;
},hold("IFO_RETAIL_CASHBOX_ASSOCIATION_MISSING"));
test("same seller on two cashboxes is ambiguous",()=>{
 const x=baseline();x.mapping.seller_cashboxes.push({
  filial:"0001",loja:"01",caixa:"ANOTHER",seller:"VENDEDOR_SINTETICO"});return x;
},hold("IFO_RETAIL_CASHBOX_ASSOCIATION_AMBIGUOUS"));
test("duplicate same cashback association is ambiguous",()=>{
 const x=baseline();x.mapping.seller_cashboxes.push({
  ...x.mapping.seller_cashboxes[0]});return x;
},hold("IFO_RETAIL_CASHBOX_ASSOCIATION_AMBIGUOUS"));
test("second cashier linked to a different loja is not an Itaim-01 collision",()=>{
 const x=baseline();x.mapping.seller_cashboxes.push({
  filial:"0001",loja:"02",caixa:"OUTSIDE_TARGET_SHOP",seller:"VENDEDOR_SINTETICO"});
 return x;
},candidate);
test("per-unit alternate loja in same filial does not hide exact 0001/01",()=>{
 const x=perUnit();x.mapping.per_unit.push({
  filial:"0001",loja:"02",caixa:"OUTSIDE_TARGET_SHOP"});
 return x;
},candidate);
test("two cashboxes in exactly target loja remain ambiguous despite foreign shops",()=>{
 const x=baseline();x.mapping.seller_cashboxes.push({
  filial:"0001",loja:"02",caixa:"OTHER_SHOP",seller:"VENDEDOR_SINTETICO"});
 x.mapping.seller_cashboxes.push({
  filial:"0001",loja:"01",caixa:"DUPLICATE_TARGET",seller:"VENDEDOR_SINTETICO"});
 return x;
},hold("IFO_RETAIL_CASHBOX_ASSOCIATION_AMBIGUOUS"));
test("centralized status may be entirely omitted and remains UNKNOWN",()=>{
 const x=baseline();delete x.centralized;
 const r=review(x);
 assert.equal(r.status,"MAPPING_CANDIDATE_REVIEW_ONLY");
 assert.equal(r.centralized_delivery_flag_claim,"UNKNOWN");
 assert.equal(r.real_cashbox_or_dispatcher_host_identified,false);
 return x;
},candidate);
test("null centralized status is invalid, unlike omission",()=>{
 const x=baseline();x.centralized=null;return x;
},hold("CENTRAL_DELIVERY_SETTING_UNKNOWN_FORMAT"));
test("wrong loja relative to Reader remains HOLD",()=>{
 const x=baseline();x.mapping.seller_cashboxes[0].loja="02";return x;
},hold("IFO_RETAIL_LOJA_CONFLICTS_WITH_READER_NATIVE_SCOPE"));
test("explicit mapping for different filial cannot be borrowed",()=>{
 const x=perUnit();x.mapping.per_unit[0].filial="0002";return x;
},hold("IFO_RETAIL_CASHBOX_ASSOCIATION_MISSING"));
test("two explicit stores in same filial do not select by order",()=>{
 const x=perUnit();x.mapping.per_unit.push({
  filial:"0001",loja:"01",caixa:"ANOTHER"});return x;
},hold("IFO_RETAIL_CASHBOX_ASSOCIATION_AMBIGUOUS"));
test("wrong explicit loja is not silently accepted",()=>{
 const x=perUnit();x.mapping.per_unit[0].loja="99";return x;
},hold("IFO_RETAIL_LOJA_CONFLICTS_WITH_READER_NATIVE_SCOPE"));
test("mixed seller and per-unit branches cannot be treated as evidence",()=>{
 const x=baseline();x.mapping.per_unit.push({
  filial:"0001",loja:"01",caixa:"OTHER"});return x;
},hold("MAPPING_BRANCHES_CONTRADICT"));
test("per unit branch rejects unrelated seller mapping",()=>{
 const x=perUnit();x.mapping.default_seller={
  filial:"0001",seller:"VENDEDOR_SINTETICO"};return x;
},hold("MAPPING_BRANCHES_CONTRADICT"));
test("source lacking authorized read-only claim is HOLD",()=>{
 const x=baseline();x.source.read_only_claim=false;return x;
},hold("UNTRUSTED_SOURCE_ENVELOPE_OR_UNKNOWN_FIELDS"));
test("impossible calendar date cannot impersonate a visit",()=>{
 const x=baseline();x.source.observed_date="2026-02-30";return x;
},hold("UNTRUSTED_SOURCE_ENVELOPE_OR_UNKNOWN_FIELDS"));
test("unrecognized project cannot impersonate IFO",()=>{
 const x=baseline();x.integration.project="IFOOD_UNKNOWN";return x;
},hold("IFO_INTEGRATION_AND_ITAIM_SCOPE_UNKNOWN"));
test("wrong native store is never promoted",()=>{
 const x=baseline();x.integration.filial="0002";return x;
},hold("IFO_INTEGRATION_AND_ITAIM_SCOPE_UNKNOWN"));
test("unknown source secrets field rejected before evaluation",()=>{
 const x=baseline();x.source.token="SECRET_SENTINEL";return x;
},hold("UNTRUSTED_SOURCE_ENVELOPE_OR_UNKNOWN_FIELDS"));
test("an embedded token in seller mapping is rejected",()=>{
 const x=baseline();x.mapping.seller_cashboxes[0].token="SECRET_SENTINEL";return x;
},hold("IFO_MAPPING_ROW_INVALID"));
test("a caller's output authorization request is rejected",()=>{
 const x=baseline();x.can_print=true;return x;
},hold("UNTRUSTED_SOURCE_ENVELOPE_OR_UNKNOWN_FIELDS"));
test("missing vendor reference cannot select cashbox",()=>{
 const x=baseline();x.mapping.default_seller=null;return x;
},hold("DEFAULT_SELLER_NOT_SCOPED_OR_BRANCH_CONTRADICTED"));
test("empty default vendor list cannot prove a candidate",()=>{
 const x=baseline();x.mapping.seller_cashboxes=[];return x;
},hold("IFO_RETAIL_CASHBOX_ASSOCIATION_MISSING"));
test("malformed extra association poisons entire review",()=>{
 const x=baseline();x.mapping.seller_cashboxes.push({
  filial:"0003",loja:"01",caixa:"",seller:"VENDEDOR_SINTETICO"});return x;
},hold("IFO_MAPPING_ROW_INVALID"));
test("null, arrays, and empty inputs fail closed",()=>{
 return null;
},hold("UNTRUSTED_SOURCE_ENVELOPE_OR_UNKNOWN_FIELDS"));
for(const invalid of [[],{},true]){
 test("non-object/empty B0.5 input remains HOLD",()=>invalid,
  hold("UNTRUSTED_SOURCE_ENVELOPE_OR_UNKNOWN_FIELDS"));
}
console.log("COMANDAS_IFO_RETAIL_B05_MAPPING="+n+"/"+n+
 " OFFLINE_REVIEW_ONLY NO_RETAIL_ACCESS NO_NATIVE_FIRST_DISPATCH NO_PRINT");
