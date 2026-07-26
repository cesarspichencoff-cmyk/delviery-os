'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DeterministicClock,DeterministicIds}=require('../../src/conversation-crm/native/deterministic');
const {loadFeatureFlags}=require('../../src/conversation-crm/native/feature-flags');
const {NativeEventStore}=require('../../src/conversation-crm/native/event-store');
const {createSimulatedDriverRegistry}=require('../../src/conversation-crm/native/drivers/registry');
const {CapabilityRouter}=require('../../src/conversation-crm/native/router');
const {DriverHealthMonitor}=require('../../src/conversation-crm/native/health');
const {scanTree,assertTreeSafe}=require('../../src/conversation-crm/native/privacy-scan');
const {NativeConversationRuntime}=require('../../src/conversation-crm/native/runtime');

function temp(t,prefix){const value=fs.mkdtempSync(path.join(os.tmpdir(),prefix));t.after(()=>fs.rmSync(value,{recursive:true,force:true}));return value;}

test('circuit breaker abre após limiar sintético e volta como half-open após janela',(t)=>{const root=temp(t,'deliveryos-native-health-');const clock=new DeterministicClock('2026-07-01T12:00:00-03:00');const flags=loadFeatureFlags({file:'config/conversation-crm/native-flags.simulator.json'});const store=new NativeEventStore({runtimeRoot:root,clock});const monitor=new DriverHealthMonitor({flags,store,clock,failureThreshold:3,resetAfterMs:60000});for(let i=1;i<=3;i++)monitor.record('simulated-order-driver','failed',`failure-${i}`);assert.equal(monitor.status('simulated-order-driver').circuit_state,'open');assert.equal(monitor.canRoute('simulated-order-driver'),false);clock.advance(60000);assert.equal(monitor.status('simulated-order-driver').circuit_state,'half_open');assert.equal(monitor.canRoute('simulated-order-driver'),true);monitor.record('simulated-order-driver','confirmed','recovery');assert.equal(monitor.status('simulated-order-driver').circuit_state,'closed');});

test('router deixa de selecionar driver cujo circuito está aberto',(t)=>{const root=temp(t,'deliveryos-native-health-route-');const clock=new DeterministicClock('2026-07-01T12:00:00-03:00');const flags=loadFeatureFlags({file:'config/conversation-crm/native-flags.simulator.json'});const store=new NativeEventStore({runtimeRoot:root,clock});const registry=createSimulatedDriverRegistry({clock});const monitor=new DriverHealthMonitor({flags,store,clock,failureThreshold:1});monitor.record('simulated-order-driver','failed','fatal');const router=new CapabilityRouter({flags,registry,store,clock,healthMonitor:monitor});const route=router.route({synthetic:true,request_id:'SIM-REQ-HEALTH',capability_id:'order.status.read',conversation_id:'SIM-CONV-001',case_id:'SIM-CASE-001',unit_id:'SIM-UNIT-001',subject_id:'SIM-SUBJECT-001',payload:{synthetic:true},authority:'A0',policy_id:'POLICY-SIM',evidence_requirements:[],idempotency_key:'cap:health',correlation_id:'SIM-CORR',deadline:'2026-07-01T15:01:00.000Z'});assert.equal(route.status,'unavailable');assert.equal(route.driver,null);});

test('privacy scanner aprova runtime e backup sanitizados e detecta artefato contaminado',(t)=>{const runtimeRoot=temp(t,'deliveryos-native-private-');const backupRoot=temp(t,'deliveryos-native-backup-');const runtime=new NativeConversationRuntime({runtimeRoot});const marker='unique-private@example.test';runtime.processMessage({synthetic:true,message_type:'text',content:`Não veio a bebida ${marker}`,channel:'synthetic',subject_id:'SIM-SUBJECT-001',conversation_id:'SIM-CONV-001',message_id:'SIM-MSG-001',correlation_id:'SIM-CORR-001',idempotency_key:'privacy-message',occurred_at:runtime.clock.iso(),turn_order:1,unit_id:'SIM-UNIT-001',context:{synthetic:true}});assert.equal(assertTreeSafe(runtimeRoot).passed,true);fs.cpSync(runtimeRoot,backupRoot,{recursive:true});assert.equal(assertTreeSafe(backupRoot).passed,true);const contaminated=temp(t,'deliveryos-native-contaminated-');fs.writeFileSync(path.join(contaminated,'artifact.txt'),marker,'utf8');const scan=scanTree(contaminated);assert.equal(scan.passed,false);assert.deepEqual(scan.findings[0].types,['email']);assert.equal(JSON.stringify(scan).includes(marker),false);});

test('chamadas concorrentes equivalentes mantêm um único efeito lógico',async(t)=>{const runtime=new NativeConversationRuntime({runtimeRoot:temp(t,'deliveryos-native-concurrent-')});const input=runtime.scenarioInput('TATA-SC-188');const results=await Promise.all(Array.from({length:5},()=>Promise.resolve().then(()=>runtime.processMessage(input))));assert.equal(results.filter((item)=>item.duplicate===false).length,1);assert.equal(runtime.store.eventsOfType('action.completed').length,1);assert.equal(runtime.store.eventsOfType('driver_health.recorded').length,1);assert.equal(runtime.store.eventsOfType('runtime.response_registered').length,1);});
