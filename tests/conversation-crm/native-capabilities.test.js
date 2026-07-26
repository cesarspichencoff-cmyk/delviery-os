'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DeterministicClock,DeterministicIds}=require('../../src/conversation-crm/native/deterministic');
const {loadCanonicalCatalogs}=require('../../src/conversation-crm/native/catalogs');
const {loadFeatureFlags}=require('../../src/conversation-crm/native/feature-flags');
const {NativeEventStore}=require('../../src/conversation-crm/native/event-store');
const {createSimulatedDriverRegistry}=require('../../src/conversation-crm/native/drivers/registry');
const {CapabilityRouter}=require('../../src/conversation-crm/native/router');
const {ActionExecutor}=require('../../src/conversation-crm/native/action-executor');
const {DeliveryOsStateHub}=require('../../src/conversation-crm/native/state-hub');
const {EvidenceStore}=require('../../src/conversation-crm/native/evidence-store');
const {NotificationEngine}=require('../../src/conversation-crm/native/notification');

function setup(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'deliveryos-native-cap-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const clock=new DeterministicClock('2026-07-01T12:00:00-03:00');const ids=new DeterministicIds('TATA-SIM-V1');const flags=loadFeatureFlags({file:'config/conversation-crm/native-flags.simulator.json'});const store=new NativeEventStore({runtimeRoot:root,clock});const catalogs=loadCanonicalCatalogs();const registry=createSimulatedDriverRegistry({clock,catalogs});const router=new CapabilityRouter({flags,registry,store,clock,catalogs});return{root,clock,ids,flags,store,catalogs,registry,router};}
function request(capability,authority='A0',suffix='1'){return{synthetic:true,request_id:`SIM-REQ-${suffix}`,capability_id:capability,conversation_id:'SIM-CONV-001',case_id:'SIM-CASE-001',unit_id:'SIM-UNIT-001',subject_id:'SIM-SUBJECT-001',payload:{synthetic:true},authority,policy_id:'POLICY-SIM-001',evidence_requirements:['source','freshness'],idempotency_key:`cap:${capability}:${suffix}`,correlation_id:'SIM-CORR-001',deadline:'2026-07-01T15:01:00.000Z'};}

test('drivers simulados cobrem exatamente as 39 capacidades e nunca usam modo real',(t)=>{const{catalogs,registry}=setup(t);const expected=new Set(catalogs.capabilities.capabilities.map((item)=>item.id));assert.deepEqual(registry.coverage(),expected);assert.equal(registry.manifests().length>=9,true);assert.equal(registry.manifests().some((item)=>item.id==='simulated-production-driver'),true);for(const manifest of registry.manifests()){assert.equal(manifest.synthetic,true);assert.equal(manifest.read_mode,'simulated');assert.equal(manifest.write_mode,'simulated');}});

test('router seleciona deterministicamente um único driver sintético para cada capacidade permitida',(t)=>{const{catalogs,router}=setup(t);for(const item of catalogs.capabilities.capabilities){const routed=router.route(request(item.id,item.authority,item.id.replace(/\W/g,'_')));if(item.authority==='A4'||item.current_state==='prohibited'){assert.equal(routed.status,'prohibited');assert.equal(routed.driver,null);}else{assert.equal(routed.status,'available');assert.equal(routed.driver.manifest.synthetic,true);assert.equal(routed.driver.supports(item.id),true);}}});

test('executor preserva estados simulados e deduplica a ação lógica',(t)=>{const{router,store,clock,flags,ids}=setup(t);const executor=new ActionExecutor({flags,store,clock,ids});const routed=router.route(request('waitlist.create','A2','waitlist'));const first=executor.execute(routed,{status:'confirmed',scenario_id:'TATA-SC-186'});const second=executor.execute(routed,{status:'confirmed',scenario_id:'TATA-SC-186'});assert.equal(first.result.status,'confirmed');assert.equal(first.result.confirmation,'synthetic_confirmed');assert.equal(second.status,'duplicate');assert.equal(store.eventsOfType('action.completed').length,1);});

test('A3 pode preparar contexto sintético, mas não registra execução autônoma',(t)=>{const{router,store,clock,flags,ids}=setup(t);const executor=new ActionExecutor({flags,store,clock,ids});const routed=router.route(request('compensation.suggest','A3','comp'));const result=executor.execute(routed,{status:'unknown'});assert.equal(result.result.status,'unknown');assert.equal(result.action.executed,false);});

test('A4 permanece proibido e nenhum driver é chamado',(t)=>{const{router,store,clock,flags,ids}=setup(t);const executor=new ActionExecutor({flags,store,clock,ids});const routed=router.route(request('medical.diagnose','A4','medical'));const result=executor.execute(routed,{status:'confirmed'});assert.equal(result.result.status,'prohibited');assert.equal(result.action.driver_id,null);assert.equal(result.action.executed,false);});

test('State Hub preserva fontes e expõe conflito sem escolher candidato',(t)=>{const{store,clock,flags}=setup(t);const hub=new DeliveryOsStateHub({store,clock,flags});const base={synthetic:true,entity_type:'order',entity_id:'SIM-ORDER-001',field:'status',observed_at:clock.iso(),effective_at:clock.iso(),confidence:0.9,freshness:{state:'current',age_ms:0},semantic_version:'1.0.0'};hub.ingestFact({...base,source:'simulated-order-driver',value:'preparing',revision:1});hub.ingestFact({...base,source:'simulated-production-driver',value:'ready',revision:1,conflict_state:'conflict'});const projection=hub.project('order','SIM-ORDER-001');assert.equal(projection.fields.status.state,'conflict');assert.equal(projection.fields.status.value,null);assert.equal(projection.fields.status.candidates.length,2);});

test('Evidence Store sanitiza PII e registra seed e cenário sem conteúdo bruto',(t)=>{const{root,store,clock,flags}=setup(t);const evidence=new EvidenceStore({store,clock,flags,seed:'TATA-SIM-V1'});const marker='marker-private@example.test';const saved=evidence.record({evidence_type:'capability_result',source:'simulated-order-driver',capability:'order.status.read',driver:'simulated-order-driver',result:{status:'unknown',error:`falha ${marker}`},correlation_id:'SIM-CORR-001',scenario_id:'TATA-SC-001'});assert.match(saved.evidence_id,/^evi_/);const disk=fs.readdirSync(root).map((name)=>fs.readFileSync(path.join(root,name),'utf8')).join('\n');assert.equal(disk.includes(marker),false);assert.equal(disk.includes('TATA-SIM-V1'),true);});

test('Notification Engine só envia em canal sintético e deduplica',(t)=>{const{store,clock,flags,ids}=setup(t);const engine=new NotificationEngine({store,clock,flags,ids});const input={synthetic:true,case_active:true,event_confirmed:true,policy_allows:true,opt_out:false,channel:'synthetic',case_id:'SIM-CASE-001',event_id:'SIM-EVT-001',content_code:'status_changed',recipient_id:'SIM-SUBJECT-001',idempotency_key:'notify:SIM-EVT-001'};assert.equal(engine.send(input).status,'confirmed');assert.equal(engine.send(input).status,'duplicate');assert.equal(engine.send({...input,idempotency_key:'notify:blocked',opt_out:true}).status,'prohibited');assert.equal(engine.snapshot().sent,1);});
