"use strict";
/* TATÁ Delivery OS | read-only, in-memory candidate correlation.
 * NOT an iFood API, live feed, printer, item-progress tracker or production join.
 * No I/O. Caller must use authorized bounded inputs; never log raw arguments.
 */
const crypto=require("node:crypto");
const SCHEMA="tata.deliveryos.ifood-native-correlation.shadow.v0";
const EFFECTS=Object.freeze({
  print:false,spooler:false,sql_read:false,sql_write:false,network:false,
  delivery_create:false,dispatch:false,order_modify:false,
  automatic_ready:false,sequence_write:false
});
const SHORT=/^[0-9]{4}$/;
const KEY=/^0001\|01\|[0-9]{1,12}\|[0-9]{1,12}$/;
const SHA=/^[0-9a-f]{64}$/i;
const SKU=/^[A-Za-z0-9._-]{1,40}$/;
const CODE=/^[A-Z0-9_-]{1,20}$/;
const STATUS=/^[A-Za-zÀ-ÿ0-9 _/-]{1,36}$/;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const obj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const only=(o,allow)=>obj(o)&&Object.keys(o).every(k=>allow.includes(k));
const instant=x=>{
 if(typeof x!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(x))return null;
 const v=Date.parse(x);if(!Number.isFinite(v))return null;
 const rawDay=x.slice(0,10);
 const match=/^(\d{4})-(\d{2})-(\d{2})/.exec(rawDay);
 if(!match)return null;
 const [,y,m,d]=match.map(Number);
 const check=new Date(Date.UTC(y,m-1,d));
 if(check.getUTCFullYear()!==y||check.getUTCMonth()+1!==m||check.getUTCDate()!==d)return null;
 const hh=Number(x.slice(11,13)),mm=Number(x.slice(14,16)),ss=Number(x.slice(17,19));
 if(hh>23||mm>59||ss>59)return null;
 return v;
};
const validDay=x=>typeof x==="string"&&/^\d{4}-\d\d-\d\d$/.test(x)&&
 instant(x+"T12:00:00Z")!==null;
const group=(arr,key)=>{const m=new Map();for(const x of arr){const k=key(x);if(!m.has(k))m.set(k,[]);m.get(k).push(x)}return m};
const fail=(reason,extra={})=>Object.freeze({
 schema:SCHEMA,status:"HOLD",reasons:[reason],counts:{ifood:0,native:0,candidate:0,onlyIfood:0,onlyNative:0,
  collision:0,revisionHold:0,noItems:0},matches:[],
 merchantVerified:false,uuidJoinProven:false,physicalItemProgressProven:false,
 readyForCopilot:false,deliveryEventsEnabled:false,printAuthorized:false,effects:EFFECTS,...extra
});
function validIf(x,day){
 return only(x,["shortId","day","seenAt","status","uuid"])&&SHORT.test(x.shortId)&&x.day===day&&
 instant(x.seenAt)!==null&&typeof x.status==="string"&&STATUS.test(x.status)&&
 (x.uuid===undefined||/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(x.uuid));
}
function validNative(x,day){
 return only(x,["shortId","day","seenAt","nativeKey","revisionHash","origin","nativeStatus","items"])&&
 SHORT.test(x.shortId)&&x.day===day&&instant(x.seenAt)!==null&&
 KEY.test(x.nativeKey)&&SHA.test(x.revisionHash)&&x.origin==="DLV_IFO"&&
 typeof x.nativeStatus==="string"&&CODE.test(x.nativeStatus)&&Array.isArray(x.items)&&x.items.length<=100&&
 x.items.every((item,i)=>only(item,["index","productCode","quantity","nativeItemStatus"])&&
  item.index===i+1&&SKU.test(item.productCode)&&Number.isSafeInteger(item.quantity)&&
  item.quantity>0&&item.quantity<=100&&CODE.test(item.nativeItemStatus));
}
function reconcile(input){
 if(!only(input,["schema","scope","ifood","native","now","privateKey"])||
  input.schema!==SCHEMA)return fail("INVALID_INPUT_ENVELOPE");
 const {scope,ifood,native}=input;
 if(!only(scope,["unit","day","ifoodStore","nativeFilial","nativeLoja","mappingRef","mappingIndependentlyVerified"])||
  scope.unit!=="ITAIM"||!validDay(scope.day)||scope.ifoodStore!=="53069"||
  scope.nativeFilial!=="0001"||scope.nativeLoja!=="01"||
  typeof scope.mappingRef!=="string"||scope.mappingRef.length>120||
  typeof scope.mappingIndependentlyVerified!=="boolean")return fail("STORE_SCOPE_UNVERIFIED_OR_INVALID");
 if(!only(ifood,["source","mode","store","capturedAt","sourceAttested","orders"])||
  ifood.source!=="GESTOR_WEB"||!["LIVE_SHADOW","SIMULATED"].includes(ifood.mode)||
  ifood.store!==scope.ifoodStore||typeof ifood.sourceAttested!=="boolean"||
  !Array.isArray(ifood.orders)||ifood.orders.length>2000)return fail("IFOOD_SCOPE_OR_SOURCE_INVALID");
 if(!only(native,["source","mode","filial","loja","capturedAt","sourceAttested","orders"])||
  native.source!=="TEKNISA_READER_V2"||!["LIVE_SHADOW","SIMULATED"].includes(native.mode)||
  native.filial!==scope.nativeFilial||native.loja!==scope.nativeLoja||
  typeof native.sourceAttested!=="boolean"||!Array.isArray(native.orders)||
  native.orders.length>4000)return fail("NATIVE_SCOPE_OR_SOURCE_INVALID");
 const now=instant(input.now),ti=instant(ifood.capturedAt),tn=instant(native.capturedAt);
 if(now===null||ti===null||tn===null)return fail("CAPTURE_TIMESTAMPS_INVALID");
 if(Math.abs(ti-now)>30000||Math.abs(tn-now)>30000||
  ti>now+5000||tn>now+5000)return fail("SOURCE_STALE_OR_CLOCK_SKEW");
 if(ifood.mode!==native.mode)return fail("LIVE_SIMULATION_MIXED");
 if(ifood.orders.length===0||native.orders.length===0)
  return fail("INDIVIDUAL_ORDER_DATA_MISSING",{counts:{...fail("x").counts,
   ifood:ifood.orders.length,native:native.orders.length}});
 if(!ifood.orders.every(r=>validIf(r,scope.day)))return fail("IFOOD_ORDER_FIELD_OR_DAY_INVALID");
 if(!native.orders.every(r=>validNative(r,scope.day)))return fail("NATIVE_ORDER_FIELD_OR_DAY_INVALID");
 if(typeof input.privateKey!=="string"||!/^[a-f0-9]{64}$/i.test(input.privateKey))
  return fail("LOCAL_SHADOW_TOKEN_REQUIRED");
 // The result has opaque per-pair tokens; never export raw short ids or keys.
 const token=(short,key)=>crypto.createHmac("sha256",Buffer.from(input.privateKey,"hex"))
  .update(["ITAIM",scope.day,short,key].join("|")).digest("hex").slice(0,24);
 const i=group(ifood.orders,r=>r.shortId);
 const nByKey=group(native.orders,r=>r.nativeKey);
 const coherent=[],revisionHold=new Set();
 for(const [key,revisions] of nByKey){
  const ordered=revisions.slice().sort((a,b)=>instant(a.seenAt)-instant(b.seenAt));
  if(ordered.some(r=>r.shortId!==ordered[0].shortId)){
   revisionHold.add(ordered[0].shortId);continue;
  }
  // Same timestamp/different digest is not orderable.
  if(ordered.some((r,j)=>j>0&&r.seenAt===ordered[j-1].seenAt&&r.revisionHash!==ordered[j-1].revisionHash)){
   revisionHold.add(ordered[0].shortId);continue;
  }
  // A -> B -> A cannot be promoted by apparent later arrival.
  const compact=ordered.filter((r,j)=>j===0||r.revisionHash!==ordered[j-1].revisionHash);
  if(new Set(compact.map(r=>r.revisionHash)).size!==compact.length){
   revisionHold.add(ordered[0].shortId);continue;
  }
  coherent.push(ordered.at(-1));
 }
 const n=group(coherent,r=>r.shortId);
 const codes=new Set([...i.keys(),...n.keys(),...revisionHold]);
 const counts={ifood:ifood.orders.length,native:native.orders.length,candidate:0,
  onlyIfood:0,onlyNative:0,collision:0,revisionHold:0,noItems:0};
 const matches=[];
 for(const short of codes){
  if(revisionHold.has(short)){counts.revisionHold++;continue}
  const ia=i.get(short)||[],na=n.get(short)||[];
  if(ia.length>1||na.length>1){counts.collision++;continue}
  if(!ia.length){counts.onlyNative++;continue}
  if(!na.length){counts.onlyIfood++;continue}
  const r=na[0];
  counts.candidate++;
  if(!r.items.length)counts.noItems++;
  matches.push({
   opaqueRef:token(short,r.nativeKey),status:"CANDIDATE_REVIEW_ONLY",
   itemLines:r.items.length,itemUnits:r.items.reduce((sum,it)=>sum+it.quantity,0),
   itemRefs:r.items.map(it=>({
    opaqueItemRef:token(short,r.nativeKey+"|"+it.index+"|"+it.productCode),
    itemIndex:it.index,quantity:it.quantity,
    operationalState:"UNKNOWN",nativeItemStatusSemantics:"UNVERIFIED"
   })),
   itemProgress:"UNKNOWN",nativeStatusSemantics:"UNKNOWN",externalStatusSemantics:"UNVERIFIED",
   sourceRevisionSelfReported:true,uuidJoinProven:false,physicalReady:false,
   // No names, prices, phone, address, order number or real native key returned.
  });
 }
 const live=ifood.mode==="LIVE_SHADOW";
 return Object.freeze({
  schema:SCHEMA,status:live?"CANDIDATES_SHADOW_ONLY":"SIMULATION_ONLY",
  reasons:[
   "SHORT_ID_STORE_DAY_NOT_UUID",
   "ATTESTATION_FLAGS_ARE_UNBOUND_INPUT_CLAIMS",
   ...(scope.mappingIndependentlyVerified?[]:["STORE_MAPPING_NOT_INDEPENDENTLY_ATTESTED"]),
   ...(ifood.sourceAttested?[]:["IFOOD_SOURCE_NOT_INDEPENDENTLY_ATTESTED"]),
   ...(native.sourceAttested?[]:["NATIVE_SOURCE_NOT_INDEPENDENTLY_ATTESTED"]),
   ...(counts.collision?["SHORT_ID_COLLISION_HOLD"]:[]),
   ...(counts.revisionHold?["NATIVE_REVISION_AMBIGUOUS_HOLD"]:[]),
   ...(counts.onlyIfood||counts.onlyNative?["PRESENCE_MISMATCH_HOLD"]:[])
  ],
  counts,matches,
  // These booleans are self-reported input claims, not an authenticated
  // producer or independently bound merchant. Never elevate them to proof.
  merchantVerified:false,
  uuidJoinProven:false,physicalItemProgressProven:false,readyForCopilot:false,
  deliveryEventsEnabled:false,printAuthorized:false,effects:EFFECTS
 });
}
module.exports={SCHEMA,EFFECTS,reconcile};