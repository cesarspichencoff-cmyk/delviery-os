'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {NativeConversationRuntime,CHECKPOINTS,runAllCanonicalScenarios,runScenarioIsolated,scenarioInputFor,runScenarioOnRuntime}=require('../../src/conversation-crm/native');

function root(t,prefix='deliveryos-native-runtime-'){const value=fs.mkdtempSync(path.join(os.tmpdir(),prefix));t.after(()=>fs.rmSync(value,{recursive:true,force:true}));return value;}

test('runtime percorre pipeline nativo completo sem acesso externo',(t)=>{const runtime=new NativeConversationRuntime({runtimeRoot:root(t)});const result=runScenarioOnRuntime(runtime,'TATA-SC-186');assert.equal(result.result.status,'confirmed');assert.equal(result.response.status_reflected,'confirmed');assert.equal(result.external_system_accessed,false);assert.equal(result.real_driver_used,false);assert.equal(result.raw_message_persisted,false);assert.equal(result.production_blocked,true);assert.equal(runtime.store.eventsOfType('runtime.checkpoint').length,10);assert.equal(runtime.store.eventsOfType('action.completed').length,1);assert.equal(runtime.store.eventsOfType('evidence.recorded').length,1);assert.equal(runtime.store.eventsOfType('runtime.response_registered').length,1);});

test('mesma mensagem, ação e resposta repetidas produzem um único efeito lógico',(t)=>{const runtime=new NativeConversationRuntime({runtimeRoot:root(t)});const input=scenarioInputFor('TATA-SC-188',runtime.clock);const first=runtime.processMessage(input);const second=runtime.processMessage(input);assert.equal(first.result.status,'confirmed');assert.equal(second.duplicate,true);assert.equal(runtime.store.eventsOfType('gateway.message_received').length,1);assert.equal(runtime.store.eventsOfType('action.completed').length,1);assert.equal(runtime.store.eventsOfType('runtime.response_registered').length,1);});

for(const stage of CHECKPOINTS)test(`recuperação após queda em ${stage} não perde nem duplica efeito`,(t)=>{const runtimeRoot=root(t,`deliveryos-native-crash-${stage}-`);let runtime=new NativeConversationRuntime({runtimeRoot});const input=scenarioInputFor('TATA-SC-186',runtime.clock);assert.throws(()=>runtime.processMessage(input,{crashAfter:stage}),{code:'SIMULATED_CRASH'});runtime=new NativeConversationRuntime({runtimeRoot});const result=runtime.processMessage(input);assert.equal(result.result.status,'confirmed');assert.equal(runtime.store.snapshot().quarantine,0);assert.equal(runtime.store.eventsOfType('runtime.checkpoint').length,10);assert.equal(runtime.store.eventsOfType('action.completed').length,1);assert.equal(runtime.store.eventsOfType('runtime.response_registered').length,1);assert.equal(runtime.store.eventsOfType('observability.flow').length,1);});

test('replay restaura a mesma projeção reconstruível',(t)=>{const runtimeRoot=root(t);let runtime=new NativeConversationRuntime({runtimeRoot});const result=runScenarioOnRuntime(runtime,'TATA-SC-193');const before={store:runtime.store.snapshot(),crm:runtime.crm.snapshot(),hub:runtime.stateHub.snapshot(),queue:runtime.queue.snapshot(),case:runtime.crm.projectCase(result.case_id)};runtime=new NativeConversationRuntime({runtimeRoot});const after={store:runtime.store.snapshot(),crm:runtime.crm.snapshot(),hub:runtime.stateHub.snapshot(),queue:runtime.queue.snapshot(),case:runtime.crm.projectCase(result.case_id)};assert.deepEqual(after,before);});

test('duas execuções isoladas com mesma seed geram relatório canônico idêntico',()=>{const a=runScenarioIsolated('TATA-SC-193');const b=runScenarioIsolated('TATA-SC-193');assert.equal(a.report_hash,b.report_hash);assert.equal(a.snapshot_hash,b.snapshot_hash);});

test('catálogo completo executa 200 cenários, 51 intenções e zero integração real',()=>{const run=runAllCanonicalScenarios();assert.equal(run.summary.total,200);assert.equal(run.summary.passed,200);assert.equal(run.summary.failed,0);assert.equal(run.summary.intents,51);assert.equal(run.summary.real_driver_used,false);assert.equal(run.summary.external_system_accessed,false);assert.equal(run.reports.every((item)=>item.passed&&item.synthetic),true);});
