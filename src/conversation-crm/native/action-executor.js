'use strict';

const { validateCapabilityResult } = require('./contracts');
const { assertFeature } = require('./feature-flags');
const { nativeError } = require('./errors');
const { sha256 } = require('./deterministic');

class ActionExecutor {
  constructor(options = {}) { this.flags=options.flags;this.store=options.store;this.clock=options.clock;this.ids=options.ids; }
  execute(route, simulation = {}) {
    assertFeature(this.flags, 'deliveryosActionExecutorV1');
    if (!route?.request?.synthetic) throw nativeError('REAL_DATA_NOT_ALLOWED');
    const request=route.request;
    const prior=this.store.findByIdempotency(`action:complete:${request.idempotency_key}`);
    if(prior)return Object.freeze({status:'duplicate',action:prior.payload.action,result:prior.payload.result});
    const action={action_id:`action_${sha256(request.idempotency_key).slice(0,20)}`,request_id:request.request_id,capability_id:request.capability_id,driver_id:route.driver?.manifest.id||null,authority:request.authority,policy_id:request.policy_id,synthetic:true,started_at:this.clock.iso(),executed:false};
    this.store.append({event_id:`action_start_${request.request_id}`,idempotency_key:`action:start:${request.idempotency_key}`,type:'action.started',occurred_at:this.clock.iso(),payload:action});
    let result;
    if(route.status==='prohibited'||request.authority==='A4'){
      result=validateCapabilityResult({synthetic:true,request_id:request.request_id,capability:request.capability_id,status:'prohibited',source:'deliveryos-action-executor',performed_at:this.clock.iso(),confidence:1,freshness:{state:'unknown',observed_at:this.clock.iso(),age_ms:0},evidence_id:null,retryable:false,payload:{synthetic:true,reason:'authority_prohibited'},confirmation:'not_confirmed'});
    }else if(!route.driver){
      result=validateCapabilityResult({synthetic:true,request_id:request.request_id,capability:request.capability_id,status:'unavailable',source:'deliveryos-action-executor',performed_at:this.clock.iso(),confidence:1,freshness:{state:'unknown',observed_at:this.clock.iso(),age_ms:0},evidence_id:null,retryable:false,payload:{synthetic:true,reason:'driver_unavailable'},confirmation:'not_confirmed'});
    }else{
      result=route.driver.execute(request,simulation);action.executed=request.authority!=='A3';
    }
    const completed={action:{...action,completed_at:this.clock.iso(),executed:action.executed},result};
    this.store.append({event_id:`action_complete_${request.request_id}`,idempotency_key:`action:complete:${request.idempotency_key}`,type:'action.completed',occurred_at:this.clock.iso(),payload:completed});
    return Object.freeze({status:'completed',...completed});
  }
}

module.exports={ActionExecutor};

