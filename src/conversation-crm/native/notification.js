'use strict';

const { assertFeature }=require('./feature-flags');

class NotificationEngine{
  constructor(options={}){this.store=options.store;this.flags=options.flags;this.clock=options.clock;this.ids=options.ids;}
  send(input){
    assertFeature(this.flags,'deliveryosNotificationEngineV1');
    const allowed=input.synthetic===true&&input.case_active===true&&input.event_confirmed===true&&input.policy_allows===true&&input.opt_out!==true&&input.channel==='synthetic';
    if(!allowed)return Object.freeze({status:'prohibited',notification:null});
    const prior=this.store.findByIdempotency(`notification:${input.idempotency_key}`);
    if(prior)return Object.freeze({status:'duplicate',notification:prior.payload});
    const notification={notification_id:this.ids.next('notification'),case_id:input.case_id,event_id:input.event_id,content_code:input.content_code,recipient_id:input.recipient_id,channel:'synthetic',sent_at:this.clock.iso(),synthetic:true};
    const result=this.store.append({event_id:`notification_${notification.notification_id}`,idempotency_key:`notification:${input.idempotency_key}`,type:'notification.sent',occurred_at:this.clock.iso(),payload:notification});
    return Object.freeze({status:result.status==='accepted'?'confirmed':result.status,notification});
  }
  snapshot(){return Object.freeze({sent:this.store.eventsOfType('notification.sent').length});}
}

module.exports={NotificationEngine};
