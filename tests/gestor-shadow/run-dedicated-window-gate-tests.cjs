'use strict';
const assert=require('node:assert/strict');
const {INPUT,PROFILE,review}=require('../../runtime/reporting/gestor_dedicated_window_gate_v1.cjs');
const win=(ref='isolated')=>({ref,processName:'msedge.exe',
  exactProfileCandidate:true,mainProcessCandidate:true,topLevelWindowCount:1,
  visible:true,minimized:false,uiReadOnly:true,groupCards:3,
  individualOrderEvidence:false,stable:true});
const sample=()=>({schema:INPUT,host:'CAIXA_MOOCA',profilePath:PROFILE,
  source:'SANITIZED_WINDOW_METADATA_UNVERIFIED',windows:[win()]});
let tested=0;
function ok(label,mutator,expected='HOLD'){
  const s=sample();mutator(s);const r=review(s);
  assert.equal(r.state,expected,label);
  assert.equal(r.ordersPublishable,0,label);
  assert.equal(r.windowActionsAuthorized,false,label);
  assert.equal(r.hideAuthorized,false,label);
  assert.equal(r.merchantVerified,false,label);
  assert.equal(r.sessionVerified,false,label);
  tested++;
}
ok('a unique candidate stays unverified',()=>{},'CANDIDATE_UNVERIFIED');
ok('group count never becomes order count',s=>{s.windows[0].groupCards=12},'CANDIDATE_UNVERIFIED');
{
  const r=review(sample());
  assert.equal(r.groupCount,3);
  assert.equal(r.orderCount,null);
  assert.equal(r.profileVerified,false);
  assert.equal(r.candidateRef,'isolated');
  tested++;
}
ok('zero group cards do not prove zero orders',s=>s.windows[0].groupCards=0,'CANDIDATE_UNVERIFIED');
ok('wrong host',s=>s.host='FOXXY');
ok('legacy profile is not current dedicated profile',s=>s.profilePath='DeliveryOS-Edge-Gestor-Itaim');
ok('dedicated v2 profile is also rejected',s=>s.profilePath=PROFILE+'-V2');
ok('unknown source is rejected',s=>s.source='BROWSER_VERIFIED');
ok('untrusted proof flags rejected',s=>s.merchantVerified=true);
ok('raw customer field rejected',s=>s.windows[0].customerName='PERSONAL');
ok('identifiable order count rejected',s=>s.windows[0].orderCount=5);
ok('no windows',s=>s.windows=[]);
ok('duplicate references',s=>s.windows.push({...win()}));
ok('two isolated candidates',s=>s.windows.push(win('second')));
ok('non isolated process cannot be promoted',s=>s.windows[0].exactProfileCandidate=false);
ok('unsupported browser process',s=>s.windows[0].processName='chrome.exe');
ok('no owner main process',s=>s.windows[0].mainProcessCandidate=false);
ok('two top-level windows',s=>s.windows[0].topLevelWindowCount=2);
ok('hidden window cannot be selected',s=>s.windows[0].visible=false);
ok('minimized window cannot be selected',s=>s.windows[0].minimized=true);
ok('unstable window',s=>s.windows[0].stable=false);
ok('not read-only',s=>s.windows[0].uiReadOnly=false);
ok('candidate asserts individual order evidence from group',s=>s.windows[0].individualOrderEvidence=true);
ok('too many group cards',s=>s.windows[0].groupCards=201);
ok('bad value for group cards',s=>s.windows[0].groupCards=3.5);
ok('too many window records',s=>s.windows=Array.from({length:13},(_,i)=>win('w'+i)));
ok('foreign window is tolerated but cannot be selected',s=>{
  s.windows.push({...win('other'),exactProfileCandidate:false});
},'CANDIDATE_UNVERIFIED');
ok('wrong schema',s=>s.schema='other');
ok('unexpected browser command-line field',s=>s.windows[0].commandLine='private');
console.log('GESTOR_DEDICATED_WINDOW_GATE_PASS '+tested+'/'+tested+' SYNTHETIC_ONLY');
