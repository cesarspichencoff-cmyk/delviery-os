'use strict';

const { assertFeature } = require('./feature-flags');
const { canonicalJson, sha256 } = require('./deterministic');
const { nativeError } = require('./errors');

const ENTITY_TYPES = Object.freeze(['customer','conversation','unit','order','reservation','waitlist','group','occurrence','promise','task','handoff','driver','notification']);

class DeliveryOsStateHub {
  constructor(options = {}) { this.store = options.store; this.flags = options.flags; this.clock = options.clock; }
  ingestFact(input) {
    assertFeature(this.flags, 'deliveryosStateHubV1');
    if (!ENTITY_TYPES.includes(input.entity_type)) throw nativeError('STATE_ENTITY_TYPE_INVALID');
    if (input.synthetic !== true) throw nativeError('REAL_DATA_NOT_ALLOWED');
    const identity = `${input.entity_type}:${input.entity_id}:${input.field}:${input.source}:${input.revision || 1}`;
    return this.store.append({ event_id: `fact_${sha256(identity).slice(0,20)}`, idempotency_key: `fact:${identity}`, type: 'state_hub.fact_observed', occurred_at: input.observed_at || this.clock.iso(), payload: { ...input, schema_version: 'deliveryos-fact-v1', semantic_version: input.semantic_version || '1.0.0', confidence: Math.max(0,Math.min(1,Number(input.confidence))), freshness: input.freshness || { state: 'unknown', age_ms: null }, conflict_state: input.conflict_state || 'none', synthetic: true } });
  }
  facts(entityType, entityId, field = null) { return this.store.eventsOfType('state_hub.fact_observed').map((event) => event.payload).filter((fact) => fact.entity_type === entityType && fact.entity_id === entityId && (!field || fact.field === field)); }
  project(entityType, entityId) {
    const facts = this.facts(entityType, entityId);
    const fields = {};
    for (const field of new Set(facts.map((fact) => fact.field))) {
      const candidates = facts.filter((fact) => fact.field === field).sort((a,b) => String(a.effective_at).localeCompare(String(b.effective_at)) || Number(a.revision || 0) - Number(b.revision || 0));
      const latestTime = candidates.at(-1)?.effective_at;
      const latest = candidates.filter((fact) => fact.effective_at === latestTime);
      const values = new Set(latest.map((fact) => canonicalJson(fact.value)));
      fields[field] = values.size > 1 ? { state: 'conflict', value: null, candidates: latest } : { state: 'confirmed', value: latest.at(-1)?.value, fact: latest.at(-1) };
    }
    return Object.freeze({ schema_version: 'deliveryos-state-projection-v1', entity_type: entityType, entity_id: entityId, fields, reconstructed_at: this.clock.iso(), synthetic: true });
  }
  snapshot() { const facts=this.store.eventsOfType('state_hub.fact_observed'); return Object.freeze({ facts:facts.length, entities:new Set(facts.map((event)=>`${event.payload.entity_type}:${event.payload.entity_id}`)).size, conflicts:facts.filter((event)=>event.payload.conflict_state==='conflict').length }); }
}

module.exports = { ENTITY_TYPES, DeliveryOsStateHub };

