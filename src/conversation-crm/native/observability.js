'use strict';

const {sha256}=require('./deterministic');

class NativeObservability{
  constructor(options={}){this.store=options.store;this.clock=options.clock;}
  record(input){const key=`${input.correlation_id}:${input.checkpoint}:${input.attempt||1}`;return this.store.append({event_id:`obs_${sha256(key).slice(0,20)}`,idempotency_key:`observability:${key}`,type:'observability.flow',occurred_at:this.clock.iso(),payload:{conversation_id:input.conversation_id,case_id:input.case_id,scenario_id:input.scenario_id||null,seed:input.seed,clock:this.clock.iso(),intent:input.intent||null,capability:input.capability||null,driver:input.driver||null,authority:input.authority||null,policy:input.policy||null,result:input.result||null,duration_ms:input.duration_ms||0,retries:input.retries||0,confidence:input.confidence??null,freshness:input.freshness||null,conflict:input.conflict===true,fallback:input.fallback||null,handoff:input.handoff||null,checkpoint:input.checkpoint,error_code:input.error_code||null,synthetic:true}});}
  trace(correlationId){return this.store.eventsOfType('observability.flow').filter((event)=>event.payload.correlation_id===correlationId||event.idempotency_key.includes(correlationId)).map((event)=>event.payload);}
}

module.exports={NativeObservability};
