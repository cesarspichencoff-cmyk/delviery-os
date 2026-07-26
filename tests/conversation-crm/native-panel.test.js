'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {once}=require('node:events');
const {createNativeServer,validateHost,start}=require('../../tools/conversation-crm/native-server');

async function withServer(t){const runtimeRoot=fs.mkdtempSync(path.join(os.tmpdir(),'deliveryos-native-panel-'));const server=createNativeServer({runtimeRoot});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{server.close();await once(server,'close');fs.rmSync(runtimeRoot,{recursive:true,force:true});});return{base:`http://127.0.0.1:${server.address().port}`,runtimeRoot,server};}

test('servidor nativo aceita somente loopback explícito',()=>{assert.equal(validateHost('127.0.0.1'),'127.0.0.1');assert.equal(validateHost('::1',true),'::1');for(const host of ['0.0.0.0','::','192.168.1.20','example.invalid'])assert.throws(()=>validateHost(host),{code:'HOST_NAO_PERMITIDO'});assert.throws(()=>start({host:'0.0.0.0',port:0,runtimeRoot:os.tmpdir()}),{code:'HOST_NAO_PERMITIDO'});});

test('health expõe seed e relógio, sempre com drivers reais desligados',async(t)=>{const{base}=await withServer(t);const body=await(await fetch(`${base}/api/health`)).json();assert.equal(body.ok,true);assert.equal(body.synthetic,true);assert.equal(body.seed,'TATA-SIM-V1');assert.equal(body.clock,'2026-07-01T15:00:00.000Z');assert.equal(body.real_drivers,false);});

test('painel recebe os 200 cenários e percorre o pipeline real do simulador',async(t)=>{const{base}=await withServer(t);const catalog=await(await fetch(`${base}/api/cases`)).json();assert.equal(catalog.cases.length,200);const body=await(await fetch(`${base}/api/native/scenarios/TATA-SC-186`,{method:'POST'})).json();assert.equal(body.ok,true);assert.equal(body.result.classification.intent,'waitlist.create');assert.equal(body.result.result.status,'confirmed');assert.equal(body.result.real_driver_used,false);const snapshot=await(await fetch(`${base}/api/native/snapshot`)).json();assert.equal(snapshot.snapshot.event_store.events>0,true);assert.equal(snapshot.snapshot.production_blockers,32);});

test('relógio, replay e reset são controlados pelo painel',async(t)=>{const{base}=await withServer(t);const advanced=await(await fetch(`${base}/api/native/clock`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({advance_ms:60000})})).json();assert.equal(advanced.clock,'2026-07-01T15:01:00.000Z');await fetch(`${base}/api/native/scenarios/TATA-SC-193`,{method:'POST'});const replay=await(await fetch(`${base}/api/native/replay`,{method:'POST'})).json();assert.equal(replay.replay_status,'completed');assert.equal(replay.snapshot.event_store.events>0,true);const reset=await(await fetch(`${base}/api/native/reset`,{method:'POST'})).json();assert.equal(reset.reset,true);const snapshot=await(await fetch(`${base}/api/native/snapshot`)).json();assert.equal(snapshot.snapshot.event_store.events,0);});

test('mensagem manual com PII é sanitizada antes do runtime e não volta no painel ou disco',async(t)=>{const{base,runtimeRoot}=await withServer(t);const marker='private-marker@example.test';const body=await(await fetch(`${base}/api/triage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:`Faltou meu refrigerante no pedido ${marker}`,context:{}})})).json();assert.equal(body.ok,true);assert.equal(body.result.classification.intent,'occurrence.missing_item');assert.equal(JSON.stringify(body).includes(marker),false);const disk=fs.readdirSync(runtimeRoot).map((name)=>fs.readFileSync(path.join(runtimeRoot,name),'utf8')).join('\n');assert.equal(disk.includes(marker),false);});

test('interface local mostra capacidade, driver, evidência, replay e relógio sem recurso externo',async(t)=>{const{base}=await withServer(t);const html=await(await fetch(base)).text();const script=await(await fetch(`${base}/app.js`)).text();for(const token of ['advance-clock','replay-state','reset-state','200 casos sintéticos'])assert.equal(html.includes(token),true);for(const token of ['Capacidade e driver','Evidência, autoridade e política','/api/native/replay','/api/native/reset'])assert.equal(script.includes(token),true);assert.equal(/https?:\/\//.test(script),false);assert.equal(script.includes('localStorage'),false);});
