'use strict';
/**
 * Delivery OS: deterministic status bridge for existing read-only monitors.
 * No fs, browser, network, iFood API, client data or operational effects.
 * Reader and browser status are CLAIMS; never convert them to authenticated order facts.
 */
const SCHEMA='deliveryos.spore-status-bridge-input.v1';
const OUT='deliveryos.spore-status-bridge-output.v1';
const stamp=x=>{
 if(typeof x!=='string')return null;
 const m=/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,7}))?(Z|[+-]\d\d:\d\d)$/.exec(x);
 if(!m)return null;
 const [year,month,day,hour,minute,second]=m.slice(1,7).map(Number);
 const date=new Date(Date.UTC(year,month-1,day));
 if(year<2020||year>2100||month<1||month>12||day<1||
    date.getUTCFullYear()!==year||date.getUTCMonth()+1!==month||
    date.getUTCDate()!==day||hour>23||minute>59||second>59)return null;
 const tz=m[8];
 if(tz!=='Z'&&(Number(tz.slice(1,3))>23||Number(tz.slice(4,6))>59))return null;
 const n=Date.parse(x);return Number.isFinite(n)?n:null;
};
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const only=(x,keys)=>object(x)&&Object.keys(x).every(k=>keys.includes(k));
const result=(state,summary={})=>Object.freeze({schema:OUT,state,scope:'ITAIM',
  source:'LOCAL_AGGREGATE_DIAGNOSTICS_ONLY',shadowOnly:true,
  authenticatedMerchantProven:false,orderIdentityProven:false,readerJoinProven:false,
  detailItemsProven:false,pausedCatalogProven:false,navigationAuthorized:false,
  ordersPublishable:0,customerFieldsExported:0,orderIdsExported:0,
  noActionsExecuted:true,noExternalEffects:true,...summary});
const UI=['schema','observedAtUtc','source','state','cardsFirst','cardsSecond','cardsWithFinishedHint',
 'cardsWithSingleFourDigitCandidate','uniqueFourDigitCandidates','cardsWithAmbiguousCodes',
 'finishedListConfirmed','stableAcrossSamples','merchantVerified','completeCoverageVerified',
 'nativeJoinProven','actualOrderIdVerified','noClicksOrNavigation','noCustomerDataExported',
 'noOrderIdsExported','noWriteToGestor'];
const EDGE=['schema','observedAtUtc','host','mode','profile','processCount','visibleWindow','action',
 'loggedIn','merchantVerified','extensionCodeVerified','extensionLaunchFlagSeen',
 'extensionActive','orderCapture','writesPerformed','desktopGestorUnchanged','currentUser'];
const V2=['schema','source','mode','route','counts','classHints','patternCounts','headerHints',
 'identifiersCaptured','personalDataCaptured','verifiedMerchant','verifiedCoverage',
 'observedAt','receivedAt','classification'];
const READER=['schema','observedAtUtc','host','unitId','scope','sourceMode','liveSourceVerified',
 'operationalOrderTotal','automated','noActionExecuted','customerDataExported',
 'schedule','state','reason','filesRead','ignoredHistorical','projectedOrderCount'];
function evaluate(input){
 if(!only(input,['schema','now','host','unit','ui','edge','v2','reader'])||
   input.schema!==SCHEMA||input.host!=='CAIXA_MOOCA'||input.unit!=='ITAIM')
   return result('HOLD_SCOPE');
 const now=stamp(input.now);if(now===null)return result('HOLD_CLOCK');
 const ui=input.ui,edge=input.edge,rd=input.reader,v2=input.v2;
 if(!only(ui,UI)||ui.schema!=='deliveryos.gestor.completed-visible-ui.v1'||
   !only(edge,EDGE)||edge.schema!=='deliveryos.itaim.edge-gestor-window.v1'||
   edge.host!=='CAIXA_MOOCA'||
   (v2!==null&&v2!==undefined&&(!only(v2,V2)||v2.schema!=='tata.gestor.structure-v2'))||
   (rd!==null&&rd!==undefined&&(!only(rd,READER)||
    rd.schema!=='deliveryos.itaim.automatic-reader-status.v1'||rd.unitId!=='ITAIM')))
   return result('HOLD_SOURCE_SCHEMA');
 const age=(sourceTime,limit)=>{const t=stamp(sourceTime);return t===null||t>now+5000||now-t>limit?null:now-t};
 const ua=age(ui.observedAtUtc,420000),ea=age(edge.observedAtUtc,420000);
 if(ua===null||ea===null)return result('STALE_OR_FUTURE_UI', {uiRecent:ua!==null,edgeRecent:ea!==null});
 if(ui.noClicksOrNavigation!==true||ui.noCustomerDataExported!==true||
   ui.noOrderIdsExported!==true||ui.noWriteToGestor!==true||
   edge.writesPerformed!==false||edge.desktopGestorUnchanged!==true)
   return result('HOLD_EFFECT_BOUNDARY');
 if(ui.state!=='VISIBLE_CANDIDATES_STABLE'||ui.finishedListConfirmed!==true||
   ui.stableAcrossSamples!==true||edge.visibleWindow!==true)
   return result('NO_STABLE_VISIBLE_CARDS',{windowVisible:edge.visibleWindow===true});
 const n=ui.cardsSecond;
 if(!Number.isSafeInteger(n)||n<0||n>100||ui.cardsFirst!==n||
   ui.cardsWithSingleFourDigitCandidate!==n||ui.uniqueFourDigitCandidates!==n||
   ui.cardsWithAmbiguousCodes!==0)
   return result('HOLD_CARD_COUNTS');
 const freshV2=object(v2)&&age(v2.observedAt,120000)!==null&&
   v2.mode==='SHADOW_READ_ONLY'&&v2.route==='expedition'&&
   v2.identifiersCaptured===false&&v2.personalDataCaptured===false;
 const v2Cards=freshV2&&object(v2.classHints)&&Number.isSafeInteger(v2.classHints.card)
   ?v2.classHints.card:0;
 let reader='NOT_PROVEN';
 if(object(rd)&&age(rd.observedAtUtc,480000)!==null&&
   rd.sourceMode==='CONTROL_DIAGNOSTIC_NOT_REAL_PROOF'&&rd.noActionExecuted===true&&
   rd.customerDataExported===false)
   reader=rd.state==='OUTSIDE_SERVICE_WINDOW'?'OFF_SHIFT':
     rd.state==='NO_EVIDENCE'||rd.state==='no_evidence'?'NO_FRESH_EVENTS':'DIAGNOSTIC_ONLY';
 // Even a screen showing rich cards is not verified order data or an authenticated join.
 return result('VISIBLE_CARDS_SHADOW_ONLY',{
   uiRecent:true,edgeRecent:true,visibleCards:n,
   candidateShortCodes:n,coverage:'VISIBLE_ONLY',
   v2Recent:Boolean(freshV2),v2StructuralCards:v2Cards,
   v2DetailsReadable:false,readerDiagnostic:reader,
   nextGate:v2Cards>0?'VERIFY_DETAIL_CONTENT_IN_ISOLATED_SESSION':
     'ISOLATED_SESSION_MUST_RENDER_AUTHENTICATED_CARDS'
 });
}
module.exports={SCHEMA,OUT,evaluate};
