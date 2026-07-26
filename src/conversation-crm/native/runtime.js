'use strict';

const path=require('node:path');
const {DeterministicClock,DeterministicIds,sha256,canonicalJson}=require('./deterministic');
const {loadFeatureFlags,assertFeature}=require('./feature-flags');
const {loadSimulatorConfig}=require('./simulator-config');
const {loadCanonicalCatalogs,deepFreeze}=require('./catalogs');
const {NativeEventStore}=require('./event-store');
const {ConversationGateway}=require('./gateway');
const {ConversationCrmV1}=require('./crm');
const {ConversationContextStore}=require('./context');
const {HumanQueue}=require('./human-queue');
const {createSimulatedDriverRegistry}=require('./drivers/registry');
const {CapabilityRouter}=require('./router');
const {ActionExecutor}=require('./action-executor');
const {DeliveryOsStateHub}=require('./state-hub');
const {EvidenceStore}=require('./evidence-store');
const {NotificationEngine}=require('./notification');
const {NativeObservability}=require('./observability');
const {DriverHealthMonitor}=require('./health');
const {NativeConversationEngine}=require('./engine');
const {composeResponse}=require('./response-composer');
const {loadPlaceholderRegistry}=require('./placeholders');
const {nativeError}=require('./errors');

const CHECKPOINTS=Object.freeze(['message_received','message_persisted','classification_completed','crm_updated','capability_requested','action_started','result_persisted','response_composed','response_registered','checkpoint_advanced']);
class SimulatedCrashError extends Error{constructor(stage){super('simulated_crash');this.code='SIMULATED_CRASH';this.stage=stage;}}

function capabilityEntity(capabilityId){if(capabilityId.startsWith('order.'))return'order';if(capabilityId.startsWith('reservation.'))return'reservation';if(capabilityId.startsWith('waitlist.'))return'waitlist';if(capabilityId.startsWith('occurrence.')||capabilityId.startsWith('health.'))return'occurrence';if(capabilityId.startsWith('human.'))return'handoff';if(capabilityId.startsWith('notification.'))return'notification';return'driver';}

class NativeConversationRuntime{
  constructor(options={}){
    this.projectRoot=path.resolve(options.projectRoot||path.resolve(__dirname,'..','..','..'));
    this.config=options.config||loadSimulatorConfig({projectRoot:this.projectRoot});
    this.flags=options.flags||loadFeatureFlags({projectRoot:this.projectRoot,file:options.flagsFile||'config/conversation-crm/native-flags.simulator.json'});
    assertFeature(this.flags,'conversationNativeV1');
    this.catalogs=options.catalogs||loadCanonicalCatalogs();this.seed=this.config.seed;
    this.clock=options.clock||new DeterministicClock(this.config.initial_clock);this.ids=options.ids||new DeterministicIds(this.seed);
    this.runtimeRoot=path.resolve(options.runtimeRoot||this.config.runtime_path.resolved);
    this.store=new NativeEventStore({runtimeRoot:this.runtimeRoot,clock:this.clock});
    const checkpoint=this.store.readCheckpoint();if(checkpoint?.state?.clock)this.clock.restore(checkpoint.state.clock);
    this.gateway=new ConversationGateway({store:this.store,flags:this.flags,clock:this.clock});
    this.crm=new ConversationCrmV1({store:this.store,flags:this.flags,clock:this.clock,ids:this.ids});
    this.context=new ConversationContextStore({store:this.store,clock:this.clock});
    this.queue=new HumanQueue({store:this.store,flags:this.flags,clock:this.clock,ids:this.ids});
    this.registry=createSimulatedDriverRegistry({clock:this.clock,catalogs:this.catalogs});
    this.health=new DriverHealthMonitor({flags:this.flags,store:this.store,clock:this.clock});
    this.router=new CapabilityRouter({flags:this.flags,registry:this.registry,store:this.store,clock:this.clock,catalogs:this.catalogs,healthMonitor:this.health});
    this.executor=new ActionExecutor({flags:this.flags,store:this.store,clock:this.clock,ids:this.ids});
    this.stateHub=new DeliveryOsStateHub({store:this.store,flags:this.flags,clock:this.clock});
    this.evidence=new EvidenceStore({store:this.store,flags:this.flags,clock:this.clock,seed:this.seed});
    this.notifications=new NotificationEngine({store:this.store,flags:this.flags,clock:this.clock,ids:this.ids});
    this.observability=new NativeObservability({store:this.store,clock:this.clock});
    this.engine=new NativeConversationEngine({flags:this.flags,catalogs:this.catalogs});
    this.placeholders=loadPlaceholderRegistry(this.catalogs);
  }

  stage(messageId,stage,payload,crashAfter){if(!CHECKPOINTS.includes(stage))throw nativeError('CHECKPOINT_INVALID');this.store.append({event_id:`stage_${sha256(`${messageId}|${stage}`).slice(0,20)}`,idempotency_key:`stage:${messageId}:${stage}`,type:'runtime.checkpoint',occurred_at:this.clock.iso(),payload:{message_id:messageId,stage,...payload,seed:this.seed,clock:this.clock.iso(),synthetic:true}});if(crashAfter===stage)throw new SimulatedCrashError(stage);}

  processMessage(raw,options={}){
    const finalKey=`runtime:response:${raw.idempotency_key}`;const prior=this.store.findByIdempotency(finalKey);if(prior){const saved=prior.payload.result;const completed=this.store.findByIdempotency(`stage:${raw.message_id}:checkpoint_advanced`);if(!completed){this.store.writeCheckpoint({clock:this.clock.iso(),seed:this.seed,last_message_id:raw.message_id,last_stage:'checkpoint_advanced'});this.stage(raw.message_id,'checkpoint_advanced',{checkpoint_written:true},options.crashAfter);}const observed=this.store.findByIdempotency(`observability:${raw.correlation_id}:complete:1`);if(!observed)this.observability.record({conversation_id:saved.conversation_id,case_id:saved.case_id,scenario_id:saved.scenario_id,seed:this.seed,intent:saved.classification.intent,capability:saved.classification.capability_id,driver:saved.route.driver_id,authority:saved.classification.authority,policy:saved.classification.policy_id,result:saved.result.status,confidence:saved.classification.confidence,freshness:saved.result.freshness,conflict:saved.result.status==='conflict',handoff:saved.handoff?.status||null,checkpoint:'complete',correlation_id:raw.correlation_id});return deepFreeze({...saved,duplicate:true,recovered:true});}
    const caseId=`case_${sha256(raw.conversation_id).slice(0,20)}`;
    try{
      const gateway=this.gateway.receive(raw);this.stage(raw.message_id,'message_received',{gateway_status:'received'},options.crashAfter);
      this.crm.ensureConversation(gateway.input);this.crm.recordMessage(gateway.input);this.crm.openCase({case_id:caseId,conversation_id:gateway.input.conversation_id,subject_id:gateway.input.subject_id});this.stage(raw.message_id,'message_persisted',{raw_message_stored:false},options.crashAfter);
      const mergedContext={...Object.fromEntries(Object.entries(this.context.project(gateway.input.conversation_id)).map(([key,item])=>[key,item.value])),...gateway.input.context};
      const classification=this.engine.analyze({content:gateway.input.content,context:mergedContext});
      for(const [field,entity]of Object.entries(classification.entities||{})){if(entity&&typeof entity==='object'&&'value'in entity&&entity.value!=null)this.context.observe({conversation_id:gateway.input.conversation_id,message_id:gateway.input.message_id,field,value:entity.value,state:entity.state||'inferred',revision:1,provenance:entity.provenance||'engine'});}
      this.crm.recordClassification({message_id:gateway.input.message_id,case_id:caseId,conversation_id:gateway.input.conversation_id,classification:{intent:classification.intent,subintent:classification.subintent,origin:classification.origin,severity:classification.severity,fields_missing:classification.fields_missing,capability_id:classification.capability_id,authority:classification.authority,policy_id:classification.policy_id,escalation:classification.escalation,legacy_projection:classification.legacy_projection,synthetic:true}});
      this.stage(raw.message_id,'classification_completed',{intent:classification.intent,confidence:classification.confidence},options.crashAfter);
      if(classification.intent.startsWith('occurrence.')||classification.intent==='public_exposure')this.crm.recordOccurrence({occurrence_id:`occ_${sha256(`${caseId}|${classification.intent}`).slice(0,20)}`,case_id:caseId,conversation_id:gateway.input.conversation_id,intent:classification.intent,severity:classification.severity,state:'open',synthetic:true});
      this.stage(raw.message_id,'crm_updated',{case_id:caseId},options.crashAfter);
      const request={synthetic:true,request_id:`req_${sha256(`${gateway.input.message_id}|${classification.capability_id}`).slice(0,20)}`,capability_id:classification.capability_id,conversation_id:gateway.input.conversation_id,case_id:caseId,unit_id:gateway.input.unit_id||'SIM-UNIT-001',subject_id:gateway.input.subject_id,payload:{synthetic:true,scenario_id:classification.scenario_id,action:classification.action},authority:classification.authority,policy_id:classification.policy_id,evidence_requirements:['source','observed_at','confidence','freshness','conflict'],idempotency_key:`cap:${gateway.input.message_id}:${classification.capability_id}`,correlation_id:gateway.input.correlation_id,deadline:new Date(this.clock.date().getTime()+60000).toISOString()};
      const route=this.router.route(request);this.crm.recordCapability({request_id:request.request_id,case_id:caseId,conversation_id:gateway.input.conversation_id,capability_id:request.capability_id,driver_id:route.driver?.manifest.id||null,route_status:route.status,synthetic:true});this.stage(raw.message_id,'capability_requested',{request_id:request.request_id,driver_id:route.driver?.manifest.id||null},options.crashAfter);
      this.stage(raw.message_id,'action_started',{request_id:request.request_id},options.crashAfter);
      const action=this.executor.execute(route,{status:classification.expected_result?.status||'unknown',scenario_id:classification.scenario_id,outcome:gateway.input.context.simulation_outcome,retryable:classification.expected_result?.retryable===true});
      if(route.driver)this.health.record(route.driver.manifest.id,action.result.status,request.request_id);
      const evidence=this.evidence.record({evidence_type:'capability_result',source:action.result.source,capability:classification.capability_id,driver:route.driver?.manifest.id||null,result:{status:action.result.status,confidence:action.result.confidence,freshness:action.result.freshness},correlation_id:gateway.input.correlation_id,scenario_id:classification.scenario_id});
      const result=deepFreeze({...action.result,evidence_id:evidence.evidence_id});
      this.stateHub.ingestFact({synthetic:true,entity_type:capabilityEntity(classification.capability_id),entity_id:gateway.input.context.order_id||caseId,field:classification.capability_id,value:{status:result.status},source:result.source,observed_at:this.clock.iso(),effective_at:this.clock.iso(),confidence:result.confidence,freshness:result.freshness,evidence_id:evidence.evidence_id,revision:1,conflict_state:result.status==='conflict'?'conflict':'none'});
      this.crm.recordAction({action_id:action.action.action_id,case_id:caseId,conversation_id:gateway.input.conversation_id,capability_id:classification.capability_id,result_status:result.status,evidence_id:evidence.evidence_id,executed:action.action.executed,synthetic:true});
      this.stage(raw.message_id,'result_persisted',{result_status:result.status,evidence_id:evidence.evidence_id},options.crashAfter);
      let handoff=null;const additionalHandoffs=[];if(classification.escalation&&classification.escalation!=='E0'){handoff=this.queue.create({case_id:caseId,conversation_id:gateway.input.conversation_id,escalation:classification.escalation,reason:classification.intent,idempotency_key:`${caseId}:${classification.escalation}`,questions_asked:classification.fields_missing});}
      if(classification.policies.food_safety){for(const escalation of classification.policies.food_safety.escalations){if(escalation===classification.escalation)continue;additionalHandoffs.push(this.queue.create({case_id:caseId,conversation_id:gateway.input.conversation_id,escalation,reason:'food_safety',idempotency_key:`${caseId}:${escalation}:food_safety`}));}}
      const response=composeResponse({classification,result,handoff});this.stage(raw.message_id,'response_composed',{response_status:result.status},options.crashAfter);
      const responseId=`response_${sha256(gateway.input.message_id).slice(0,20)}`;this.crm.recordResponse({response_id:responseId,case_id:caseId,conversation_id:gateway.input.conversation_id,status_reflected:result.status,text_hash:sha256(response.text),handoff_confirmed:handoff?.status==='confirmed',synthetic:true});
      const output=deepFreeze({schema_version:'conversation-native-result-v1',synthetic:true,seed:this.seed,clock:this.clock.iso(),scenario_id:classification.scenario_id,conversation_id:gateway.input.conversation_id,message_id:gateway.input.message_id,case_id:caseId,gateway:{status:'accepted',out_of_order:gateway.out_of_order,privacy:gateway.privacy},classification,capability_request:request,route:{status:route.status,driver_id:route.driver?.manifest.id||null,reason:route.reason},action:action.action,result,evidence,handoff,additional_handoffs:additionalHandoffs,response,closure:classification.closure,production_blocked:this.placeholders.production_blockers_open===46,external_system_accessed:false,real_driver_used:false,raw_message_persisted:false,duplicate:false,recovered:false});
      this.store.append({event_id:`runtime_response_${gateway.input.message_id}`,idempotency_key:finalKey,type:'runtime.response_registered',occurred_at:this.clock.iso(),payload:{result:output}});this.stage(raw.message_id,'response_registered',{response_id:responseId},options.crashAfter);
      this.observability.record({conversation_id:gateway.input.conversation_id,case_id:caseId,scenario_id:classification.scenario_id,seed:this.seed,intent:classification.intent,capability:classification.capability_id,driver:route.driver?.manifest.id,authority:classification.authority,policy:classification.policy_id,result:result.status,confidence:classification.confidence,freshness:result.freshness,conflict:result.status==='conflict',handoff:handoff?.status||null,checkpoint:'complete',correlation_id:gateway.input.correlation_id});
      this.store.writeCheckpoint({clock:this.clock.iso(),seed:this.seed,last_message_id:gateway.input.message_id,last_stage:'checkpoint_advanced'});this.stage(raw.message_id,'checkpoint_advanced',{checkpoint_written:true},options.crashAfter);
      return output;
    }finally{this.gateway.forgetOriginal(raw.message_id);}
  }

  scenarioInput(scenarioId){const scenario=this.catalogs.scenarios.scenarios.find((item)=>item.scenario_id===scenarioId);if(!scenario)throw nativeError('SCENARIO_NOT_FOUND');return{synthetic:true,message_type:'text',content:scenario.input,channel:'synthetic',subject_id:`SIM-SUBJECT-${scenarioId.slice(-3)}`,conversation_id:`SIM-CONV-${scenarioId}`,message_id:`SIM-MSG-${scenarioId}`,correlation_id:`SIM-CORR-${scenarioId}`,idempotency_key:`scenario:${scenarioId}`,occurred_at:this.clock.iso(),turn_order:1,unit_id:'SIM-UNIT-001',context:{scenario_id:scenarioId,synthetic:true}};}
  runScenario(scenarioId,options={}){return this.processMessage(this.scenarioInput(scenarioId),options);}
  snapshot(){const value={schema_version:'conversation-native-snapshot-v1',synthetic:true,seed:this.seed,clock:this.clock.iso(),event_store:this.store.snapshot(),crm:this.crm.snapshot(),state_hub:this.stateHub.snapshot(),human_queue:this.queue.snapshot(),evidence:this.evidence.snapshot(),notifications:this.notifications.snapshot(),drivers:this.registry.manifests().map((item)=>({id:item.id,health:item.health,availability:item.availability,capabilities:item.capabilities.length})),driver_health:this.health.snapshot(),production_blockers:this.placeholders.production_blockers_open};return deepFreeze({...value,snapshot_hash:sha256(canonicalJson(value))});}
}

module.exports={CHECKPOINTS,SimulatedCrashError,capabilityEntity,NativeConversationRuntime};
