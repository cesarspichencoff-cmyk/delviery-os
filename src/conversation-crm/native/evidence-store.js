'use strict';

const { assertFeature } = require('./feature-flags');
const { canonicalJson, sha256 } = require('./deterministic');
const { sanitize } = require('./privacy');

class EvidenceStore {
  constructor(options={}){this.store=options.store;this.flags=options.flags;this.clock=options.clock;this.seed=options.seed;}
  record(input){
    assertFeature(this.flags,'deliveryosEvidenceStoreV1');
    const cleaned=sanitize(input);
    const hash=sha256(canonicalJson(cleaned.sanitized));
    const evidenceId=`evi_${hash.slice(0,20)}`;
    const result=this.store.append({event_id:`evidence_${evidenceId}`,idempotency_key:`evidence:${hash}`,type:'evidence.recorded',occurred_at:this.clock.iso(),payload:{evidence_id:evidenceId,evidence_type:input.evidence_type,source:input.source,hash,observed_at:this.clock.iso(),capability:input.capability||null,driver:input.driver||null,result:input.result||null,correlation_id:input.correlation_id,seed:this.seed,scenario_id:input.scenario_id||null,version:'1.0.0',synthetic:true,privacy:{detected:cleaned.detected,finding_types:cleaned.finding_types,removed_fields:cleaned.removed_fields}}});
    return Object.freeze({status:result.status==='quarantined'?'quarantined':'recorded',evidence_id:evidenceId,hash});
  }
  snapshot(){const events=this.store.eventsOfType('evidence.recorded');return Object.freeze({evidence:events.length,hashes:new Set(events.map((event)=>event.payload.hash)).size});}
}

module.exports={EvidenceStore};

