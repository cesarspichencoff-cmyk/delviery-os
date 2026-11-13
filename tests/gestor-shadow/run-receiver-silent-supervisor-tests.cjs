'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {SCHEMA, SAFE_STATE, qualifiedReceiverHealth, scopedEdgeTabs, createSupervisor} = require('../../runtime/reporting/gestor_receiver_silent_supervisor_v1.cjs');
const {spawnSync} = require('node:child_process');
const current = {status:'SHADOW_STRUCTURE_ONLY', received:42, hasLatest:true, ageMs:2000,
  stale:false, merchantVerified:false, coverageVerified:false};
const stale = {...current, stale:true, ageMs:60000};
const page = {type:'page',url:'https://gestordepedidos.ifood.com.br/#/home/order-display/expedition',
  webSocketDebuggerUrl:'SECRET_TOKEN',title:'PII_SECRET_CUSTOMER_001'};
function createFixture(options={}) {
  let time=0, restarts=0, kills=0, posts=[];
  let response=options.response || {kind:'failed', value:null};
  let portTaken=options.portTaken || false;
  let codeApproved=options.codeApproved !== false;
  let active=null;
  const sup=createSupervisor({
    clock:()=>time,
    receiverHealth:async()=>response,
    portOpen:async()=>portTaken,
    edgePort:()=>options.edgeAbsent?null:62138,
    edgeTabs:async()=>({kind:'reply',value:[page]}),
    hashOk:()=>codeApproved,
    spawnReceiver:()=>{restarts++;active={pid:400+restarts,exitCode:null,signalCode:null,on(){},kill(){kills++;this.signalCode='SIGTERM'}};return active;},
    publish:doc=>{posts.push({...doc});return {...doc}},
  });
  return {sup,setTime:x=>{time=x},setResponse:x=>{response=x},setPort:x=>{portTaken=x},
    setHash:x=>{codeApproved=x},get restarts(){return restarts},get kills(){return kills},
    get posts(){return posts},get child(){return active}};
}
test('existing V2 status is recognized but remains STRUCTURE_ONLY',()=>{
  assert.equal(qualifiedReceiverHealth(current),true);
  assert.equal(qualifiedReceiverHealth(stale),true);
  assert.equal(qualifiedReceiverHealth({...current,merchantVerified:true}),false);
  assert.equal(qualifiedReceiverHealth({...current,coverageVerified:true}),false);
  assert.equal(qualifiedReceiverHealth({...current,status:'REAL_ORDER_SOURCE'}),false);
});
test('invalid /health shape, malicious stale and missing received are rejected',()=>{
  for(const d of [null,{},[],{...current,stale:'false'}, {...current,received:-1},
    {...current,ageMs:-42}, {...current,received:'42'}]) assert.equal(qualifiedReceiverHealth(d),false);
});
test('Edge tab check is exact scoped route, not some other iFood page',()=>{
  assert.equal(scopedEdgeTabs([page]),true);
  assert.equal(scopedEdgeTabs([{type:'page',url:'https://gestordepedidos.ifood.com.br/#/download'}]),false);
  assert.equal(scopedEdgeTabs([{type:'iframe',url:page.url}]),false);
  assert.equal(scopedEdgeTabs([{type:'page',url:'https://gestordepedidos.ifood.com.br.evil.invalid/#/home/order-display/expedition'}]),false);
  assert.equal(scopedEdgeTabs({url:page.url}),false);
});
test('when receiver is down supervisor requests startup of EXISTING receiver child only',async()=>{
  const f=createFixture();const s=await f.sup.tick();
  assert.equal(s.state,SAFE_STATE.RECEIVER_RECOVERING);
  assert.equal(f.restarts,1);assert.equal(s.expeditionPagePresent,true);
  assert.equal(s.receiverHealthResponded,false);
});
test('no duplicate child spawn while initial receiver is not yet listening',async()=>{
  const f=createFixture();await f.sup.tick();f.setTime(20_000);await f.sup.tick();
  assert.equal(f.restarts,1);assert.equal(f.kills,0);
});
test('own wedged child can be signaled after grace; no replacement spawned on top',async()=>{
  const f=createFixture();await f.sup.tick();f.setTime(61_000);await f.sup.tick();
  assert.equal(f.kills,1);assert.equal(f.restarts,1);
  f.setTime(81_000);await f.sup.tick();assert.equal(f.restarts,2);
});
test('when child exits no rapid restart loop; retry occurs only after backoff',async()=>{
  const f=createFixture();await f.sup.tick();f.child.exitCode=1;
  f.setTime(10_000);await f.sup.tick();assert.equal(f.restarts,1);
  f.setTime(60_000);await f.sup.tick();assert.equal(f.restarts,2);
});
test('no code hash match => HOLD, never start executable',async()=>{
  const f=createFixture({codeApproved:false});const r=await f.sup.tick();
  assert.equal(r.state,SAFE_STATE.HASH_MISMATCH);assert.equal(f.restarts,0);
});
test('foreign process occupying port => HOLD and never kill it',async()=>{
  const f=createFixture({portTaken:true});const r=await f.sup.tick();
  assert.equal(r.state,SAFE_STATE.PORT_UNTRUSTED);
  assert.equal(f.restarts,0);assert.equal(f.kills,0);
});
test('already healthy receiver never causes second listener launch',async()=>{
  const f=createFixture({response:{kind:'reply',value:current},portTaken:true});
  for(let i=0;i<6;i++) {f.setTime(i*20_000);const s=await f.sup.tick();
    assert.equal(s.state,SAFE_STATE.STRUCTURE_ONLY_CURRENT)}
  assert.equal(f.restarts,0);
});
test('stale structure does not count as up-to-date, and restarting Edge is not attempted',async()=>{
  const f=createFixture({response:{kind:'reply',value:stale},portTaken:true});
  for(let i=0;i<6;i++) {f.setTime(i*20_000);const s=await f.sup.tick();
    assert.equal(s.state,SAFE_STATE.STRUCTURE_ONLY_STALE);assert.equal(s.receiverSourceStale,true)}
  assert.equal(f.restarts,0);assert.equal(f.kills,0);
});
test('Edge inaccessible is declared separately from receiver health, without browser action',async()=>{
  const f=createFixture({edgeAbsent:true,response:{kind:'reply',value:current}});
  const r=await f.sup.tick();assert.equal(r.expeditionPagePresent,false);
  assert.equal(r.edgeCdpReachable,false);assert.equal(r.state,SAFE_STATE.STRUCTURE_ONLY_CURRENT);
  assert.equal(f.restarts,0);
});
test('exported status never exposes Edge target ID, URLs, order ID or customer info',async()=>{
  const f=createFixture({response:{kind:'reply',value:current}});
  const r=await f.sup.tick();const obj=JSON.stringify(r);
  assert.equal(obj.includes('SECRET_TOKEN'),false);
  assert.equal(obj.includes('PII_SECRET_CUSTOMER_001'),false);
  assert.equal(obj.includes('gestordepedidos.ifood.com.br'),false);
  assert.equal(obj.includes('uuid'),false);
});
test('task template is DISABLED until explicitly authorized, SYSTEM non-GUI Node, and rollbackable',()=>{
  const xml=fs.readFileSync(path.join(__dirname,'../../docs/operations/DeliveryOS-Itaim-GestorV2-Receiver-Silent-Guard.xml'),'utf8');
  assert.match(xml,/<UserId>S-1-5-18<\/UserId>/);
  assert.match(xml,/<LogonType>ServiceAccount<\/LogonType>/);
  assert.match(xml,/<Enabled>false<\/Enabled>/);
  assert.match(xml,/<Hidden>true<\/Hidden>/);
  assert.match(xml,/<MultipleInstancesPolicy>IgnoreNew<\/MultipleInstancesPolicy>/);
  assert.match(xml,/<RestartOnFailure>/);
  assert.match(xml,/<ExecutionTimeLimit>PT0S<\/ExecutionTimeLimit>/);
  assert.match(xml,/<Command>C:\\Program Files\\nodejs\\node.exe<\/Command>/);
  assert.doesNotMatch(xml,/powershell\.exe|cmd\.exe|msedge\.exe|Start-Process|s[ch]tasks.*\/Change/i);
});
test('supervisor is inert when imported and blocked if directly run away from SYSTEM/CAIXA',()=>{
  const modulePath=path.resolve(__dirname,'../../runtime/reporting/gestor_receiver_silent_supervisor_v1.cjs');
  const r=spawnSync(process.execPath,[modulePath],{
    encoding:'utf8',timeout:1500,env:{...process.env,COMPUTERNAME:'FOXXY',USERNAME:'SomeUser'}});
  assert.equal(r.status,30);assert.equal(r.stdout,'');assert.equal(r.stderr,'');
});
test('the only browser operation is localhost CDP page-presence read; no browser relaunch',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../../runtime/reporting/gestor_receiver_silent_supervisor_v1.cjs'),'utf8');
  assert.match(source,/windowsHide: true/);
  assert.doesNotMatch(source,/chrome\.debugger|Runtime\.evaluate|Page\.navigate|Page\.reload|Input\.dispatch|--user-data-dir|--app=/);
  assert.equal(SCHEMA,'deliveryos.itaim.existing-gestor-v2-receiver-supervisor.v1');
});
