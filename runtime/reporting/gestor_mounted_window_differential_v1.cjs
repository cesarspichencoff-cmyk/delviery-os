'use strict';
/**
 * Mounted Gestor card window -> PRIVATE, IN-MEMORY differential.
 *
 * This is NOT the operational journal or a second engine. It detects changed
 * candidate facts so the existing event producers can be qualified later.
 * A card disappearing is NOT a cancellation, a state change is NOT physical
 * preparation, and a local DOM scan is NOT an upstream iFood heartbeat.
 * No I/O, navigator, provider API, SQL, write, network, or PII in results.
 */
const {createHash}=require('node:crypto');
const SCHEMA='deliveryos.gestor-mounted-window-differential.v1';
const SOURCE='deliveryos.gestor-mounted-order-review.v1';
const is=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const bounded=x=>typeof x==='string'&&x.length>0&&x.length<=256;
const positive=n=>Number.isSafeInteger(n)&&n>0&&n<=200;
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const deny=(reason,extra={})=>Object.freeze({
 schema:SCHEMA,state:'HOLD',reason,source:'MOUNTED_CARDS_ONLY',
 candidateOrders:null,candidateLines:null,candidateUnits:null,
 newlyObserved:null,contentRevised:null,unchanged:null,
 disappearedFromView:null,disappearanceMeansCancellation:false,
 fullCoverageVerified:false,merchantVerified:false,upstreamFreshnessVerified:false,
 nativeOrderJoinProven:false,physicalWorkProven:false,
 publishableEvents:0,ordersPublishable:0,homePublishAuthorized:false,
 printAuthorized:false,actionsExecuted:0,storageWrites:0,
 rawOrderIdsExported:0,rawProductNamesExported:0,rawNotesExported:0,
 customerDataExported:false,...extra
});
function createMountedWindowDifferential({maxLocalAgeMs=60000}={}){
 if(!Number.isSafeInteger(maxLocalAgeMs)||maxLocalAgeMs<1000||maxLocalAgeMs>120000)
  throw Error('INVALID_DIFFERENTIAL_TTL');
 let lastAt=null,previous=new Map(),merchantId=null,lastReport=null;
 function review(result,nowMs){
  if(!Number.isSafeInteger(nowMs)||nowMs<0)return deny('LOCAL_TIME_INVALID');
  if(lastAt!==null&&nowMs<lastAt)return deny('LOCAL_CLOCK_REGRESSION');
  if(!is(result)||result.schema!==SOURCE||
    result.state!=='PRIVATE_REVIEW_ONLY'||result.readOnly!==true||
    result.actionsExecuted!==0||result.ordersPublishable!==0||
    result.homePublishAuthorized!==false||result.merchantVerified!==false||
    result.coverage!=='MOUNTED_CARDS_ONLY'||
    !Number.isSafeInteger(result.visibleCards)||result.visibleCards<1||
    result.visibleCards>200||result.candidateOrders!==result.visibleCards||
    !Array.isArray(result.privateCandidates)||
    result.privateCandidates.length!==result.visibleCards)
    return deny('SOURCE_REVIEW_NOT_QUALIFIED');
  const now=new Map(),merchants=new Set(),shorts=new Set();
  let lineCount=0,units=0;
  try{
   for(const c of result.privateCandidates){
    if(!is(c)||!bounded(c.id)||!bounded(c.merchantId)||
      !/^\d{4}$/.test(c.shortCode)||!Array.isArray(c.items)||
      c.items.length<1||c.items.length>100||
      now.has(c.id)||shorts.has(c.shortCode))
     return deny('PRIVATE_CANDIDATE_MALFORMED_OR_DUPLICATED');
    shorts.add(c.shortCode);merchants.add(c.merchantId);
    const items=[];
    for(const i of c.items){
     if(!is(i)||!bounded(i.name)||!positive(i.quantity)||
      typeof i.observations!=='string'||i.observations.length>1200||
      !Array.isArray(i.options)||i.options.length>30||
      !(i.externalCode===null||typeof i.externalCode==='string'))
      return deny('PRIVATE_ITEM_SHAPE_UNVERIFIED');
     const opts=[];
     for(const op of i.options){
      if(!is(op)||!bounded(op.name)||!positive(op.quantity))
       return deny('PRIVATE_OPTION_SHAPE_UNVERIFIED');
      opts.push([op.name,op.quantity]);
     }
     items.push([i.name,i.quantity,i.observations,i.externalCode,opts]);
     lineCount++;units+=i.quantity;
    }
    const headerStatus=c.statusClaim??null;
    if(headerStatus!==null&&(typeof headerStatus!=="string"||
      !/^[A-Za-z0-9_-]{1,64}$/.test(headerStatus)))
      return deny('PRIVATE_STATUS_SHAPE_UNVERIFIED');
    now.set(c.id,digest([c.shortCode,c.merchantId,
      c.placedAt??null,headerStatus,items]));
   }
  }catch{return deny('PRIVATE_REVIEW_READ_EXCEPTION')}
  if(merchants.size!==1)return deny('MIXED_MERCHANT_SCOPE');
  const onlyMerchant=merchants.values().next().value;
  if(merchantId!==null&&merchantId!==onlyMerchant)
   return deny('MERCHANT_CHANGED_REQUIRES_NEW_REVIEW_CONTEXT');
  if(lineCount!==result.candidateLines||units!==result.candidateUnits)
   return deny('AGGREGATE_CONTRADICTION');
  let added=0,changed=0,unchanged=0,disappeared=0;
  for(const [k,h] of now){
   if(!previous.has(k))added++;
   else if(previous.get(k)!==h)changed++;
   else unchanged++;
  }
  for(const k of previous.keys())if(!now.has(k))disappeared++;
  // On any HOLD, previous remains intact. On success, replace atomically.
  previous=now;merchantId=onlyMerchant;lastAt=nowMs;
  lastReport=Object.freeze({
   schema:SCHEMA,state:'PRIVATE_DIFFERENTIAL_REVIEW_ONLY',
   source:'MOUNTED_CARDS_ONLY',candidateOrders:now.size,
   candidateLines:lineCount,candidateUnits:units,
   newlyObserved:added,contentRevised:changed,unchanged,
   disappearedFromView:disappeared,
   disappearanceMeansCancellation:false,fullCoverageVerified:false,
   merchantVerified:false,upstreamFreshnessVerified:false,
   nativeOrderJoinProven:false,physicalWorkProven:false,
   publishableEvents:0,ordersPublishable:0,homePublishAuthorized:false,
   printAuthorized:false,actionsExecuted:0,storageWrites:0,
   rawOrderIdsExported:0,rawProductNamesExported:0,rawNotesExported:0,
   customerDataExported:false
  });
  return lastReport;
 }
 function current(nowMs){
  if(!Number.isSafeInteger(nowMs)||nowMs<0||
     lastAt===null||nowMs<lastAt||
     nowMs-lastAt>maxLocalAgeMs)
   return deny('LOCAL_OBSERVATION_STALE_OR_ABSENT');
  return lastReport;
 }
 return Object.freeze({review,current});
}
module.exports=Object.freeze({SCHEMA,createMountedWindowDifferential});
