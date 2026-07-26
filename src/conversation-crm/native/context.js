'use strict';

const { DATA_STATES } = require('./contracts');
const { nativeError } = require('./errors');
const { sha256 } = require('./deterministic');

class ConversationContextStore {
  constructor(options={}){this.store=options.store;this.clock=options.clock;}
  observe(input){
    if(!DATA_STATES.includes(input.state))throw nativeError('DATA_STATE_INVALID');
    const key=`${input.conversation_id}:${input.field}:${input.revision}:${input.state}`;
    return this.store.append({event_id:`context_${sha256(key).slice(0,20)}`,idempotency_key:`context:${key}`,type:'context.entity_observed',occurred_at:this.clock.iso(),payload:{conversation_id:input.conversation_id,message_id:input.message_id,field:input.field,value:input.value,state:input.state,revision:input.revision,provenance:input.provenance||'provided',supersedes_event_id:input.supersedes_event_id||null,synthetic:true}});
  }
  correct(input){const current=this.project(input.conversation_id)[input.field];const revision=(current?.revision||0)+1;if(current)this.observe({conversation_id:input.conversation_id,message_id:input.message_id,field:input.field,value:current.value,state:'superseded',revision,provenance:current.provenance,supersedes_event_id:current.event_id});return this.observe({conversation_id:input.conversation_id,message_id:input.message_id,field:input.field,value:input.value,state:'provided',revision:revision+1,provenance:'provided',supersedes_event_id:current?.event_id||null});}
  project(conversationId){const events=this.store.eventsOfType('context.entity_observed').filter((event)=>event.payload.conversation_id===conversationId);const output={};for(const event of events){if(event.payload.state==='superseded')continue;const current=output[event.payload.field];if(!current||event.payload.revision>=current.revision)output[event.payload.field]={...event.payload,event_id:event.event_id};}return Object.freeze(output);}
}

module.exports={ConversationContextStore};
