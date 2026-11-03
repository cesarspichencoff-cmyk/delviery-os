'use strict';
const assert=require('node:assert/strict');
const {SCHEMA,evaluate}=require('../../runtime/reporting/gestor_shadow_status_bridge_v1.cjs');
const now='2026-11-03T09:30:00.000Z';
const make=()=>({schema:SCHEMA,now,host:'CAIXA_MOOCA',unit:'ITAIM',
 ui:{schema:'deliveryos.gestor.completed-visible-ui.v1',observedAtUtc:now,
  source:'ORIGINAL_EDGE_UIA_READ_ONLY',state:'VISIBLE_CANDIDATES_STABLE',
  cardsFirst:20,cardsSecond:20,cardsWithFinishedHint:0,
  cardsWithSingleFourDigitCandidate:20,uniqueFourDigitCandidates:20,
  cardsWithAmbiguousCodes:0,finishedListConfirmed:true,stableAcrossSamples:true,
  merchantVerified:false,completeCoverageVerified:false,nativeJoinProven:false,
  actualOrderIdVerified:false,noClicksOrNavigation:true,noCustomerDataExported:true,
  noOrderIdsExported:true,noWriteToGestor:true},
 edge:{schema:'deliveryos.itaim.edge-gestor-window.v1',observedAtUtc:now,
  host:'CAIXA_MOOCA',mode:'READ_ONLY_WINDOW_KEEPALIVE',profile:'DEDICATED_USER_PROFILE',
  processCount:1,visibleWindow:true,action:'ALREADY_PRESENT',loggedIn:'NOT_CHECKED',
  merchantVerified:false,extensionCodeVerified:true,extensionLaunchFlagSeen:true,
  extensionActive:'NOT_VERIFIED',orderCapture:false,writesPerformed:false,
  desktopGestorUnchanged:true,currentUser:'CAIXA_MOOCA\\Tata'},
 v2:null,reader:null});
let passed=0;
const check=(name,fn,expected)=>{const input=make();fn(input);const actual=evaluate(input);assert.equal(actual.state,expected,name);assert.equal(actual.ordersPublishable,0,name);assert.equal(actual.navigationAuthorized,false,name);passed++};
check('visible candidates are shadow only',()=>{},'VISIBLE_CARDS_SHADOW_ONLY');
check('wrong unit refused',x=>{x.unit='PINHEIROS'},'HOLD_SCOPE');
check('wrong machine refused',x=>{x.host='OTHER'},'HOLD_SCOPE');
check('stale evidence refused',x=>{x.ui.observedAtUtc='2026-11-03T08:30:00Z'},'STALE_OR_FUTURE_UI');
check('future evidence refused',x=>{x.ui.observedAtUtc='2026-11-03T09:40:00Z'},'STALE_OR_FUTURE_UI');
check('duplicate reference claim refused',x=>{x.ui.uniqueFourDigitCandidates=19},'HOLD_CARD_COUNTS');
check('count mismatch refused',x=>{x.ui.cardsFirst=19},'HOLD_CARD_COUNTS');
check('clicking claim refused',x=>{x.ui.noClicksOrNavigation=false},'HOLD_EFFECT_BOUNDARY');
check('browser write claim refused',x=>{x.edge.writesPerformed=true},'HOLD_EFFECT_BOUNDARY');
check('unrecognized source field refused',x=>{x.ui.unexpected='UNVERIFIED'},'HOLD_SOURCE_SCHEMA');
check('closed window refused',x=>{x.edge.visibleWindow=false},'NO_STABLE_VISIBLE_CARDS');
check('untrusted merchant claim does not promote orders',x=>{x.ui.merchantVerified=true},'VISIBLE_CARDS_SHADOW_ONLY');
check('invalid February day refused',x=>{x.now='2026-03-03T09:30:00Z';x.ui.observedAtUtc='2026-02-31T09:30:00Z';x.edge.observedAtUtc=x.now},'STALE_OR_FUTURE_UI');
console.log('GESTOR_SHADOW_STATUS_BRIDGE_PASS '+passed+'/'+passed);
