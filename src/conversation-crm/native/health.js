'use strict';

const {assertFeature}=require('./feature-flags');
const {sha256}=require('./deterministic');

class DriverHealthMonitor{
  constructor(options={}){this.flags=options.flags;this.store=options.store;this.clock=options.clock;this.failureThreshold=Number.isInteger(options.failureThreshold)?options.failureThreshold:3;this.resetAfterMs=Number.isInteger(options.resetAfterMs)?options.resetAfterMs:60000;this.entries=new Map();this.rebuild();}
  rebuild(){this.entries.clear();for(const event of this.store.eventsOfType('driver_health.recorded'))this.entries.set(event.payload.driver_id,{...event.payload});}
  record(driverId,resultStatus,observationKey){assertFeature(this.flags,'simulatedDriversV1');const key=`health:${driverId}:${observationKey||resultStatus}`;const prior=this.store.findByIdempotency(key);if(prior)return Object.freeze({...prior.payload});const previous=this.entries.get(driverId)||{driver_id:driverId,failures:0,circuit_state:'closed',last_failure_at:null};let failures=previous.failures;let state=previous.circuit_state;if(['failed','unavailable'].includes(resultStatus)){failures+=1;if(failures>=this.failureThreshold)state='open';}else if(resultStatus==='confirmed'){failures=0;state='closed';}const entry={driver_id:driverId,health:resultStatus==='confirmed'?'healthy':resultStatus==='degraded'?'degraded':['failed','unavailable'].includes(resultStatus)?'unavailable':'unknown',failures,circuit_state:state,last_failure_at:['failed','unavailable'].includes(resultStatus)?this.clock.iso():previous.last_failure_at,updated_at:this.clock.iso(),synthetic:true};this.store.append({event_id:`health_${sha256(key).slice(0,20)}`,idempotency_key:key,type:'driver_health.recorded',occurred_at:this.clock.iso(),payload:entry});this.entries.set(driverId,entry);return Object.freeze(entry);}
  status(driverId){const entry=this.entries.get(driverId);if(!entry)return Object.freeze({driver_id:driverId,health:'unknown',failures:0,circuit_state:'closed',synthetic:true});if(entry.circuit_state==='open'&&entry.last_failure_at&&this.clock.date().getTime()-new Date(entry.last_failure_at).getTime()>=this.resetAfterMs)return Object.freeze({...entry,circuit_state:'half_open'});return Object.freeze({...entry});}
  canRoute(driverId){return this.status(driverId).circuit_state!=='open';}
  snapshot(){return Object.freeze([...this.entries.keys()].sort().map((id)=>this.status(id)));}
}

module.exports={DriverHealthMonitor};
