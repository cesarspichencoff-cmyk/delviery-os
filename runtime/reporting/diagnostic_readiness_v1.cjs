'use strict';
// Pure read-only readiness projection from ALREADY-SANITIZED aggregate diagnostics.
// Never reads files, polls APIs, controls browsers, writes data, joins/publishes orders
// or promotes self-reported source claims into independently proven merchant identity.
const SCHEMA='deliveryos.diagnostic-readiness-input.v1';
const OUT='deliveryos.diagnostic-readiness-output.v1';
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exactKeys=(x,keys)=>isObject(x)&&Object.keys(x).length===keys.length&&
  keys.every(k=>Object.prototype.hasOwnProperty.call(x,k));
const readerFields=['schema','observedAtUtc','host','unitId','scope','sourceMode',
 'liveSourceVerified','operationalOrderTotal','automated','noActionExecuted',
 'customerDataExported','schedule','state','reason','filesRead','ignoredHistorical',
 'projectedOrderCount'];
const edgeFields=['schema','observedAtUtc','host','mode','profile','processCount',
 'visibleWindow','action','loggedIn','merchantVerified','extensionCodeVerified',
 'extensionLaunchFlagSeen','extensionActive','orderCapture','writesPerformed',
 'desktopGestorUnchanged','currentUser'];
const uiFields=['schema','observedAtUtc','source','state','cardsFirst','cardsSecond',
 'cardsWithFinishedHint','cardsWithSingleFourDigitCandidate','uniqueFourDigitCandidates',
 'cardsWithAmbiguousCodes','finishedListConfirmed','stableAcrossSamples',
 'merchantVerified','completeCoverageVerified','nativeJoinProven','actualOrderIdVerified',
 'noClicksOrNavigation','noCustomerDataExported','noOrderIdsExported','noWriteToGestor'];
const v2Fields=['schema','source','mode','route','counts','classHints','patternCounts',
 'headerHints','identifiersCaptured','personalDataCaptured','verifiedMerchant',
 'verifiedCoverage','observedAt','receivedAt','classification'];
const nestedFields={
 counts:['buttons','roleButtons','lists','listItems','dataTestId','dataOrderId',
  'articles','timeTags','scrollable','largeScroll','examinedTextNodes','examinedClassNodes'],
 classHints:['order','pedido','card','item','virtual'],
 patternCounts:['clock','minute','shortOrder','tagDelay','courier'],
 headerHints:['hasHeader','tata','itaim']
};
function parseUtc(value){
 if(typeof value!=='string')return null;
 const m=/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,7}))?Z$/.exec(value);
 if(!m)return null;
 const parts=m.slice(1,7).map(Number);
 const [y,mo,d,h,mi,s]=parts;
 if(y<2020||y>2100||mo<1||mo>12||d<1||h>23||mi>59||s>59)return null;
 const date=new Date(Date.UTC(y,mo-1,d,h,mi,s));
 if(date.getUTCFullYear()!==y||date.getUTCMonth()!==mo-1||date.getUTCDate()!==d)return null;
 const ms=Date.parse(value);return Number.isFinite(ms)?ms:null;
}
const integerOrNull=(x,max)=>x===null||(Number.isSafeInteger(x)&&x>=0&&x<=max);
const state=(s,reason)=>Object.freeze({
 schema:OUT,state:s,reason,
 scope:'ITAIM',source:'AGGREGATE_DIAGNOSTICS_ONLY',clockBasis:'CALLER_SUPPLIED_UNVERIFIED',
 reader:'NOT_EVALUATED',edge:'NOT_EVALUATED',ui:'NOT_EVALUATED',v2:'NOT_EVALUATED',
 readerOperationalOrderCount:null,gestorMerchantProven:false,realOrderIdentityProven:false,
 readerJoinProven:false,realItemDetailsProven:false,gestorCoverageProven:false,
 pausedProductsProven:false,deliveryGpsProven:false,notificationAuthorized:false,
 canReadRealOrders:false,canNavigateGestor:false,ordersPublishable:0,
 orderIdsExported:0,customerFieldsExported:0,actionsExecuted:0,
 nextGate:'INDEPENDENT_AUTHENTICATED_GESTOR_AND_ORDER_IDENTITY'
});
function validReader(r){
 return exactKeys(r,readerFields)&&r.schema==='deliveryos.itaim.automatic-reader-status.v1'&&
 r.host==='CAIXA_MOOCA'&&r.unitId==='ITAIM'&&r.scope==='READ_ONLY_LOCAL'&&
 r.sourceMode==='CONTROL_DIAGNOSTIC_NOT_REAL_PROOF'&&
 r.liveSourceVerified===false&&r.operationalOrderTotal===null&&
 r.automated===true&&r.noActionExecuted===true&&r.customerDataExported===false&&
 typeof r.schedule==='string'&&r.schedule.length<=32&&
 typeof r.state==='string'&&r.state.length<=64&&
 (r.reason===null||(typeof r.reason==='string'&&r.reason.length<=120))&&
 integerOrNull(r.filesRead,100000)&&integerOrNull(r.ignoredHistorical,100000)&&
 integerOrNull(r.projectedOrderCount,100000)&&parseUtc(r.observedAtUtc)!==null;
}
function validEdge(e){
 return exactKeys(e,edgeFields)&&e.schema==='deliveryos.itaim.edge-gestor-window.v1'&&
 e.host==='CAIXA_MOOCA'&&e.mode==='READ_ONLY_WINDOW_KEEPALIVE'&&
 e.profile==='DEDICATED_USER_PROFILE'&&integerOrNull(e.processCount,100)&&
 typeof e.visibleWindow==='boolean'&&typeof e.action==='string'&&e.action.length<=40&&
 typeof e.loggedIn==='string'&&e.loggedIn.length<=40&&
 typeof e.merchantVerified==='boolean'&&typeof e.extensionCodeVerified==='boolean'&&
 typeof e.extensionLaunchFlagSeen==='boolean'&&
 typeof e.extensionActive==='string'&&e.extensionActive.length<=40&&
 typeof e.orderCapture==='boolean'&&typeof e.writesPerformed==='boolean'&&
 typeof e.desktopGestorUnchanged==='boolean'&&
 typeof e.currentUser==='string'&&e.currentUser.length<=100&&
 parseUtc(e.observedAtUtc)!==null;
}
function validUi(u){
 if(!exactKeys(u,uiFields)||u.schema!=='deliveryos.gestor.completed-visible-ui.v1'||
 u.source!=='ORIGINAL_EDGE_UIA_READ_ONLY'||typeof u.state!=='string'||u.state.length>64||
 parseUtc(u.observedAtUtc)===null)return false;
 for(const key of ['cardsFirst','cardsSecond','cardsWithFinishedHint',
  'cardsWithSingleFourDigitCandidate','uniqueFourDigitCandidates','cardsWithAmbiguousCodes']){
   if(!integerOrNull(u[key],10000))return false;
 }
 for(const key of ['finishedListConfirmed','merchantVerified','completeCoverageVerified',
  'nativeJoinProven','actualOrderIdVerified','noClicksOrNavigation',
  'noCustomerDataExported','noOrderIdsExported','noWriteToGestor']){
   if(typeof u[key]!=='boolean')return false;
 }
 return u.stableAcrossSamples===null||typeof u.stableAcrossSamples==='boolean';
}
function validV2(v){
 if(!exactKeys(v,v2Fields)||v.schema!=='tata.gestor.structure-v2'||
 v.source!=='ifood_gestor_web'||v.mode!=='SHADOW_READ_ONLY'||
 v.route!=='expedition'||v.classification!=='STRUCTURE_ONLY_UNVERIFIED'||
 parseUtc(v.observedAt)===null||parseUtc(v.receivedAt)===null)return false;
 for(const k of ['identifiersCaptured','personalDataCaptured','verifiedMerchant','verifiedCoverage']){
  if(typeof v[k]!=='boolean')return false;
 }
 for(const [key,keys] of Object.entries(nestedFields)){
  if(!exactKeys(v[key],keys))return false;
  for(const child of keys){
   if(key==='headerHints'){if(typeof v[key][child]!=='boolean')return false;}
   else if(!Number.isSafeInteger(v[key][child])||v[key][child]<0||v[key][child]>100000)return false;
  }
 }
 return true;
}
function project(input){
 if(!exactKeys(input,['schema','now','host','unit','reader','edge','ui','v2'])||
 input.schema!==SCHEMA||input.host!=='CAIXA_MOOCA'||input.unit!=='ITAIM')
  return state('HOLD','INVALID_ENVELOPE_OR_SCOPE');
 const now=parseUtc(input.now);
 if(now===null)return state('HOLD','INVALID_CALLER_CLOCK');
 if(!validReader(input.reader))return state('HOLD','INVALID_READER_DIAGNOSTIC');
 if(input.edge!==null&&!validEdge(input.edge))return state('HOLD','INVALID_EDGE_DIAGNOSTIC');
 if(input.ui!==null&&!validUi(input.ui))return state('HOLD','INVALID_UI_DIAGNOSTIC');
 if(input.v2!==null&&!validV2(input.v2))return state('HOLD','INVALID_V2_DIAGNOSTIC');
 const r=input.reader,e=input.edge,u=input.ui,v=input.v2;
 // Any flagged action/privacy concern is HOLD, even on old snapshots.
 if((e&&(e.writesPerformed||!e.desktopGestorUnchanged))||
    (u&&(!u.noClicksOrNavigation||!u.noCustomerDataExported||
          !u.noOrderIdsExported||!u.noWriteToGestor))||
    (v&&(v.identifiersCaptured||v.personalDataCaptured)))
   return state('HOLD','PRIVACY_OR_EFFECT_BOUNDARY');
 const fresh=(time,max)=>{
  if(time===null)return false;
  const age=now-parseUtc(time);
  return age>=-5000&&age<=max;
 };
 const readerFresh=fresh(r.observedAtUtc,480000);
 const edgeFresh=e&&fresh(e.observedAtUtc,420000);
 const uiFresh=u&&fresh(u.observedAtUtc,420000);
 const v2Fresh=v&&fresh(v.observedAt,120000)&&fresh(v.receivedAt,120000);
 const offShift=r.state==='OUTSIDE_SERVICE_WINDOW';
 const reader=readerFresh?(offShift?'OFF_SHIFT_DIAGNOSTIC':'FRESH_DIAGNOSTIC_NOT_REAL_PROOF'):'STALE_DIAGNOSTIC';
 // A recent relaunch is a cashier-UI safety event, NOT a source/order proof.
 const recentEdgeLaunch=Boolean(e&&edgeFresh&&e.action==='LAUNCHED');
 const edge=e?(recentEdgeLaunch?'FRESH_WINDOW_LAUNCH_SAFETY_HOLD':
  edgeFresh?'WINDOW_STATUS_ONLY_UNVERIFIED':'STALE_OR_PAUSED'):'MISSING';
 const ui=u?(uiFresh?'VISIBLE_CANDIDATES_NOT_ORDER_PROOF':'STALE_OR_PAUSED'):'MISSING';
 const v2Status=v?(v2Fresh?'STRUCTURE_ONLY_NOT_MERCHANT_PROOF':'STALE_OR_PAUSED'):'MISSING';
 const reason=recentEdgeLaunch?'EDGE_WINDOW_LAUNCH_NEEDS_SAFETY_REVIEW':
  !readerFresh?'READER_DIAGNOSTIC_STALE':offShift?'OUTSIDE_READER_SERVICE_WINDOW':
  (!v2Fresh?'GESTOR_V2_NOT_FRESH_OR_PAUSED':'MERCHANT_AND_ORDER_PROOF_MISSING');
 return Object.freeze({
  ...state('HOLD_NO_OPERATIONAL_JOIN',reason),
  reader,edge,ui,v2:v2Status,
  nextGate:'INDEPENDENT_AUTHENTICATED_GESTOR_AND_ORDER_IDENTITY'
 });
}
module.exports={SCHEMA,OUT,project};
