'use strict';
// Contract fixtures from the sanitised status schemas, without personal data.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {project,SCHEMA,OUT}=require('../../runtime/reporting/diagnostic_readiness_v1.cjs');
const moduleSource=fs.readFileSync(path.join(__dirname,'../../runtime/reporting/diagnostic_readiness_v1.cjs'),'utf8');
let passed=0;
const check=(name,condition)=>{assert.ok(condition,name);passed++;};
const reader={
 schema:'deliveryos.itaim.automatic-reader-status.v1',
 observedAtUtc:'2026-11-03T18:43:39.966Z',host:'CAIXA_MOOCA',unitId:'ITAIM',
 scope:'READ_ONLY_LOCAL',sourceMode:'CONTROL_DIAGNOSTIC_NOT_REAL_PROOF',
 liveSourceVerified:false,operationalOrderTotal:null,automated:true,noActionExecuted:true,
 customerDataExported:false,schedule:'CLOSED',state:'OUTSIDE_SERVICE_WINDOW',
 reason:null,filesRead:null,ignoredHistorical:null,projectedOrderCount:null
};
const edge={
 schema:'deliveryos.itaim.edge-gestor-window.v1',
 observedAtUtc:'2026-11-03T15:03:10.0287755Z',
 host:'CAIXA_MOOCA',mode:'READ_ONLY_WINDOW_KEEPALIVE',
 profile:'DEDICATED_USER_PROFILE',processCount:2,visibleWindow:true,
 action:'LAUNCHED',loggedIn:'NOT_CHECKED',merchantVerified:false,
 extensionCodeVerified:true,extensionLaunchFlagSeen:true,
 extensionActive:'NOT_VERIFIED',orderCapture:false,writesPerformed:false,
 desktopGestorUnchanged:true,currentUser:'CAIXA_MOOCA\\Tata'
};
const ui={
 schema:'deliveryos.gestor.completed-visible-ui.v1',
 observedAtUtc:'2026-11-03T15:04:35.5007006Z',
 source:'ORIGINAL_EDGE_UIA_READ_ONLY',state:'HOLD',
 cardsFirst:null,cardsSecond:null,cardsWithFinishedHint:null,
 cardsWithSingleFourDigitCandidate:null,uniqueFourDigitCandidates:null,
 cardsWithAmbiguousCodes:null,finishedListConfirmed:false,
 stableAcrossSamples:null,merchantVerified:false,completeCoverageVerified:false,
 nativeJoinProven:false,actualOrderIdVerified:false,
 noClicksOrNavigation:true,noCustomerDataExported:true,
 noOrderIdsExported:true,noWriteToGestor:true
};
const v2={
 schema:'tata.gestor.structure-v2',source:'ifood_gestor_web',
 mode:'SHADOW_READ_ONLY',route:'expedition',
 counts:{buttons:36,roleButtons:3,lists:0,listItems:0,dataTestId:48,
 dataOrderId:0,articles:0,timeTags:0,scrollable:0,largeScroll:0,
 examinedTextNodes:133,examinedClassNodes:356},
 classHints:{order:1,pedido:0,card:0,item:12,virtual:0},
 patternCounts:{clock:0,minute:0,shortOrder:0,tagDelay:0,courier:2},
 headerHints:{hasHeader:false,tata:false,itaim:false},
 identifiersCaptured:false,personalDataCaptured:false,verifiedMerchant:false,
 verifiedCoverage:false,observedAt:'2026-11-03T13:40:27.127Z',
 receivedAt:'2026-11-03T13:40:27.128Z',classification:'STRUCTURE_ONLY_UNVERIFIED'
};
const input={schema:SCHEMA,now:'2026-11-03T18:44:00Z',
 host:'CAIXA_MOOCA',unit:'ITAIM',reader,edge,ui,v2};
const copy=x=>JSON.parse(JSON.stringify(x));
const run=(change)=>{let i=copy(input);change(i);return project(i);};
const base=project(input);
check('output schema',base.schema===OUT);
check('scope strict',base.scope==='ITAIM');
check('real order join never proven',base.readerJoinProven===false);
check('no real ids export',base.orderIdsExported===0);
check('no customer export',base.customerFieldsExported===0);
check('no publishable orders',base.ordersPublishable===0);
check('no executed actions',base.actionsExecuted===0);
check('off shift diagnostic',base.reader==='OFF_SHIFT_DIAGNOSTIC');
check('stale edge preserved',base.edge==='STALE_OR_PAUSED');
check('stale UI preserved',base.ui==='STALE_OR_PAUSED');
check('stale V2 preserved',base.v2==='STALE_OR_PAUSED');
check('stale V2 is no proof',base.reason==='OUTSIDE_READER_SERVICE_WINDOW');
check('no GPS proof from statuses',base.deliveryGpsProven===false);
check('caller clock not attested',base.clockBasis==='CALLER_SUPPLIED_UNVERIFIED');
check('does not copy source filenames or counts',!JSON.stringify(base).includes('Tata')&&!JSON.stringify(base).includes('36'));
check('reject wrong host',run(i=>{i.host='FOXxy'}).reason==='INVALID_ENVELOPE_OR_SCOPE');
check('reject wrong unit',run(i=>{i.unit='MOOCA'}).reason==='INVALID_ENVELOPE_OR_SCOPE');
check('reject unknown top-level keys',run(i=>{i.authCode='SECRET'}).reason==='INVALID_ENVELOPE_OR_SCOPE');
check('reject stale reader',run(i=>{i.now='2026-11-03T19:00:00Z'}).reason==='READER_DIAGNOSTIC_STALE');
check('reject future reader',run(i=>{i.reader.observedAtUtc='2026-11-03T18:45:00Z'}).reader==='STALE_DIAGNOSTIC');
check('invalid reader schema',run(i=>{i.reader.schema='random'}).reason==='INVALID_READER_DIAGNOSTIC');
check('reader real source claim blocked',run(i=>{i.reader.liveSourceVerified=true}).reason==='INVALID_READER_DIAGNOSTIC');
check('reader writes blocked',run(i=>{i.reader.noActionExecuted=false}).reason==='INVALID_READER_DIAGNOSTIC');
check('reader operational count blocked',run(i=>{i.reader.operationalOrderTotal=12}).reason==='INVALID_READER_DIAGNOSTIC');
check('unexpected reader PII blocked',run(i=>{i.reader.customerName='Person'}).reason==='INVALID_READER_DIAGNOSTIC');
check('unknown edge PII field blocked',run(i=>{i.edge.sessionToken='not allowed'}).reason==='INVALID_EDGE_DIAGNOSTIC');
check('edge writes hold',run(i=>{i.edge.writesPerformed=true}).reason==='PRIVACY_OR_EFFECT_BOUNDARY');
check('edge desktop mutation hold',run(i=>{i.edge.desktopGestorUnchanged=false}).reason==='PRIVACY_OR_EFFECT_BOUNDARY');
check('UI clicks hold',run(i=>{i.ui.noClicksOrNavigation=false}).reason==='PRIVACY_OR_EFFECT_BOUNDARY');
check('UI order ID export hold',run(i=>{i.ui.noOrderIdsExported=false}).reason==='PRIVACY_OR_EFFECT_BOUNDARY');
check('V2 personal capture hold',run(i=>{i.v2.personalDataCaptured=true}).reason==='PRIVACY_OR_EFFECT_BOUNDARY');
check('V2 identifier capture hold',run(i=>{i.v2.identifiersCaptured=true}).reason==='PRIVACY_OR_EFFECT_BOUNDARY');
check('V2 nested customer text blocked',run(i=>{i.v2.counts.customerName='Person'}).reason==='INVALID_V2_DIAGNOSTIC');
check('V2 negative counter blocked',run(i=>{i.v2.classHints.card=-1}).reason==='INVALID_V2_DIAGNOSTIC');
check('V2 invalid nested hint',run(i=>{i.v2.headerHints.itaim='true'}).reason==='INVALID_V2_DIAGNOSTIC');
check('V2 date impossible rejected',run(i=>{i.v2.observedAt='2026-02-30T13:40:27Z'}).reason==='INVALID_V2_DIAGNOSTIC');
check('V2 fabricated merchant claim not proof',run(i=>{
 i.v2.observedAt='2026-11-03T18:43:55Z';i.v2.receivedAt='2026-11-03T18:43:55Z';
 i.v2.verifiedMerchant=true;i.v2.verifiedCoverage=true;
}).gestorMerchantProven===false);
check('V2 fresh still no order proof',run(i=>{
 i.v2.observedAt='2026-11-03T18:43:55Z';i.v2.receivedAt='2026-11-03T18:43:55Z';
}).reason==='OUTSIDE_READER_SERVICE_WINDOW');
check('fresh reader still diagnostic',run(i=>{i.reader.state='OBSERVED_RECORDS';i.reader.schedule='LUNCH';i.reader.projectedOrderCount=8;}).reader==='FRESH_DIAGNOSTIC_NOT_REAL_PROOF');
check('counts cannot become proven operational orders',run(i=>{i.reader.state='OBSERVED_RECORDS';i.reader.schedule='LUNCH';i.reader.projectedOrderCount=99;}).readerOperationalOrderCount===null);
check('missing edge accepted as hold',run(i=>{i.edge=null}).edge==='MISSING');
check('missing UI accepted as hold',run(i=>{i.ui=null}).ui==='MISSING');
check('missing V2 accepted as hold',run(i=>{i.v2=null}).v2==='MISSING');
check('invalid time rejected',run(i=>{i.now='2026-13-01T13:00:00Z'}).reason==='INVALID_CALLER_CLOCK');
check('invalid leap date rejected',run(i=>{i.now='2026-02-29T13:00:00Z'}).reason==='INVALID_CALLER_CLOCK');
check('fresh Edge relaunch triggers safety HOLD',run(i=>{
 i.edge.observedAtUtc='2026-11-03T18:43:55Z';i.edge.action='LAUNCHED';
}).reason==='EDGE_WINDOW_LAUNCH_NEEDS_SAFETY_REVIEW');
check('fresh Edge relaunch gets explicit safety state',run(i=>{
 i.edge.observedAtUtc='2026-11-03T18:43:55Z';i.edge.action='LAUNCHED';
}).edge==='FRESH_WINDOW_LAUNCH_SAFETY_HOLD');
check('stale launch is not misreported as a new event',base.reason!=='EDGE_WINDOW_LAUNCH_NEEDS_SAFETY_REVIEW');
check('no Edge relaunch keeps status-only',run(i=>{
 i.edge.observedAtUtc='2026-11-03T18:43:55Z';i.edge.action='UNCHANGED';
}).edge==='WINDOW_STATUS_ONLY_UNVERIFIED');
check('Edge alert never grants publishing',run(i=>{
 i.edge.observedAtUtc='2026-11-03T18:43:55Z';i.edge.action='LAUNCHED';
}).ordersPublishable===0);
check('unknown non-whitelisted API absent',!/require\s*\(\s*['"](?:node:)?(?:fs|net|http|https|child_process)/.test(moduleSource));
check('no console action API',!/(ShowWindow|Start-Process|Process\.Start|execFile|spawn\s*\(|setInterval\s*\()/i.test(moduleSource));
check('no live provider URLs in source',!/https?:\/\/|ifood\.com\.br/i.test(moduleSource));
console.log('DIAGNOSTIC_READINESS_CONTRACT_PASS '+passed+'/'+passed+' (PURE_OFFLINE_ONLY)');
