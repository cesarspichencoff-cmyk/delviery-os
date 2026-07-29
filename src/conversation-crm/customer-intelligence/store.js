'use strict';

const {
  FACT_STATES, CONSENT_STATES, customerError, requireText,
  requireEnum, stableHash, canonical, cloneFrozen
} = require('./contracts');

const PRIVATE_KEY = /(?:name|nome|phone|telefone|email|address|endereco|cpf|document|cookie|token|password|senha)/iu;

function sanitizeAudit(value, depth = 0) {
  if (depth > 6) return '[DEPTH_LIMIT]';
  if (Array.isArray(value)) return value.map((item) => sanitizeAudit(item, depth + 1));
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && (/@/u.test(value) || /\d{10,}/u.test(value))) return '[REDACTED]';
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => (
    [key, PRIVATE_KEY.test(key) ? '[REDACTED]' : sanitizeAudit(nested, depth + 1)]
  )));
}

class CustomerIntelligenceStore {
  constructor(options = {}) {
    this.clock = options.clock || (() => new Date());
    this.events = [];
    this.customers = new Map();
    this.importedBatches = new Map();
  }

  now() {
    const value = this.clock();
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw customerError('CLOCK_INVALID');
    return date.toISOString();
  }

  append(type, aggregateId, payload = {}, metadata = {}) {
    const sequence = this.events.length + 1;
    const event = cloneFrozen({
      schema_version: 'deliveryos-customer-event-v1',
      event_id: `CUST-EVT-${String(sequence).padStart(6, '0')}`,
      sequence,
      type,
      aggregate_id: aggregateId,
      occurred_at: this.now(),
      source: metadata.source || 'synthetic',
      actor: metadata.actor || 'system',
      payload: sanitizeAudit(payload)
    });
    this.events.push(event);
    return event;
  }

  createCustomer(input = {}) {
    const customerId = input.customer_id || `CUST-${stableHash(this.events.length, this.now(), input.provenance || 'synthetic').slice(0, 12)}`;
    if (this.customers.has(customerId)) throw customerError('CUSTOMER_ID_DUPLICATE');
    const customer = {
      schema_version: 'deliveryos-customer-v1',
      customer_id: customerId,
      status: 'active',
      provenance: requireText(input.provenance || 'synthetic', 'CUSTOMER_PROVENANCE_REQUIRED'),
      unit_affinities: [],
      identities: [],
      external_sources: [],
      facts: [],
      restrictions: [],
      notes: [],
      consents: [],
      orders: [],
      reservations: [],
      incidents: [],
      tags: [],
      segments: [],
      fact_candidates: [],
      merge_history: [],
      created_at: this.now()
    };
    this.customers.set(customerId, customer);
    this.append('customer_created', customerId, { provenance: customer.provenance });
    return this.customer(customerId);
  }

  mutable(customerId) {
    const customer = this.customers.get(customerId);
    if (!customer) throw customerError('CUSTOMER_NOT_FOUND');
    return customer;
  }

  customer(customerId) {
    return cloneFrozen(this.mutable(customerId));
  }

  list() {
    return cloneFrozen([...this.customers.values()].map((item) => ({
      customer_id: item.customer_id,
      status: item.status,
      provenance: item.provenance,
      identity_count: item.identities.length,
      consent_state: this.consentState(item.customer_id, 'all_marketing'),
      review_required: item.fact_candidates.length > 0 || item.facts.some((fact) => fact.state === 'conflicting')
    })));
  }

  addIdentity(customerId, identity, metadata = {}) {
    const customer = this.mutable(customerId);
    if (!identity || !['phone', 'email', 'external_id'].includes(identity.type) || !identity.token) {
      throw customerError('CUSTOMER_IDENTITY_INVALID');
    }
    const key = `${identity.type}:${identity.token}:${identity.source}`;
    if (!customer.identities.some((item) => `${item.type}:${item.token}:${item.source}` === key)) {
      customer.identities.push({ ...identity, verification_state: metadata.verification_state || 'unverified' });
      this.append('customer_identity_added', customerId, {
        identity_type: identity.type,
        source: identity.source,
        verification_state: metadata.verification_state || 'unverified'
      }, metadata);
    }
    return this.customer(customerId);
  }

  recordFact(customerId, input = {}, metadata = {}) {
    const customer = this.mutable(customerId);
    const state = requireEnum(input.state, FACT_STATES, 'CUSTOMER_FACT_STATE_INVALID');
    if (state === 'inferred' && input.confirmed === true) throw customerError('INFERENCE_CANNOT_BE_CONFIRMED');
    const fact = {
      fact_id: input.fact_id || `FACT-${stableHash(customerId, input.field, this.events.length).slice(0, 12)}`,
      field: requireText(input.field, 'CUSTOMER_FACT_FIELD_REQUIRED'),
      value: input.value,
      state,
      source: requireText(input.source || metadata.source || 'synthetic', 'CUSTOMER_FACT_SOURCE_REQUIRED'),
      observed_at: input.observed_at || this.now(),
      valid_until: input.valid_until || null
    };
    customer.facts.push(fact);
    this.append('customer_fact_recorded', customerId, {
      fact_id: fact.fact_id, field: fact.field, state: fact.state, source: fact.source
    }, metadata);
    return cloneFrozen(fact);
  }

  retractFacts(customerId, factIds = [], metadata = {}) {
    const customer = this.mutable(customerId);
    const requested = new Set(factIds);
    const existing = customer.facts.filter((fact) => requested.has(fact.fact_id));
    customer.facts = customer.facts.filter((fact) => !requested.has(fact.fact_id));
    existing.forEach((fact) => this.append('customer_fact_retracted', customerId, {
      fact_id: fact.fact_id,
      field: fact.field,
      original_source: fact.source,
      reason: metadata.reason || 'import_batch_rollback'
    }, metadata));
    return cloneFrozen({ retracted_fact_ids: existing.map((fact) => fact.fact_id) });
  }

  rollbackImportedCustomer(customerId, metadata = {}) {
    const customer = this.mutable(customerId);
    customer.status = 'rolled_back';
    this.append('customer_import_rolled_back', customerId, {
      batch_id: metadata.batch_id || null,
      prior_data_preserved: true
    }, metadata);
    return this.customer(customerId);
  }

  recordFactCandidate(customerId, input = {}, metadata = {}) {
    const customer = this.mutable(customerId);
    const candidate = {
      candidate_id: input.candidate_id || `FC-${stableHash(customerId, input.field, this.events.length).slice(0, 12)}`,
      field: requireText(input.field, 'FACT_CANDIDATE_FIELD_REQUIRED'),
      value: input.value,
      source: requireText(input.source || 'conversation', 'FACT_CANDIDATE_SOURCE_REQUIRED'),
      status: 'pending_confirmation',
      created_at: this.now()
    };
    customer.fact_candidates.push(candidate);
    this.append('customer_fact_candidate_recorded', customerId, {
      candidate_id: candidate.candidate_id, field: candidate.field, status: candidate.status
    }, metadata);
    return cloneFrozen(candidate);
  }

  recordRestriction(customerId, input = {}, metadata = {}) {
    const customer = this.mutable(customerId);
    const restriction = {
      restriction_id: input.restriction_id || `RST-${stableHash(customerId, input.type, this.events.length).slice(0, 12)}`,
      type: requireText(input.type, 'RESTRICTION_TYPE_REQUIRED'),
      value: requireText(input.value, 'RESTRICTION_VALUE_REQUIRED'),
      status: input.status === 'confirmed' ? 'confirmed' : 'declared',
      source: input.source || metadata.source || 'conversation',
      created_at: this.now()
    };
    customer.restrictions.push(restriction);
    this.append('customer_restriction_recorded', customerId, {
      restriction_id: restriction.restriction_id, type: restriction.type, status: restriction.status
    }, metadata);
    return cloneFrozen(restriction);
  }

  recordConsent(customerId, input = {}, metadata = {}) {
    const customer = this.mutable(customerId);
    const state = requireEnum(input.state, CONSENT_STATES, 'CONSENT_STATE_INVALID');
    const consent = {
      consent_id: input.consent_id || `CNS-${stableHash(customerId, input.purpose, input.channel, this.events.length).slice(0, 12)}`,
      purpose: requireText(input.purpose, 'CONSENT_PURPOSE_REQUIRED'),
      channel: requireText(input.channel, 'CONSENT_CHANNEL_REQUIRED'),
      state,
      source: requireText(input.source || metadata.source || 'synthetic', 'CONSENT_SOURCE_REQUIRED'),
      evidence_code: input.evidence_code || null,
      observed_at: input.observed_at || this.now(),
      expires_at: input.expires_at || null,
      responsible: input.responsible || null
    };
    customer.consents.push(consent);
    this.append('customer_consent_recorded', customerId, {
      consent_id: consent.consent_id,
      purpose: consent.purpose,
      channel: consent.channel,
      state: consent.state,
      source: consent.source
    }, metadata);
    return cloneFrozen(consent);
  }

  consentState(customerId, purpose, channel = null, now = this.now()) {
    const customer = this.mutable(customerId);
    const matches = customer.consents.filter((item) => (
      item.purpose === purpose && (!channel || item.channel === channel)
    ));
    if (!matches.length) return 'unknown';
    const latest = matches[matches.length - 1];
    if (latest.expires_at && Date.parse(latest.expires_at) <= Date.parse(now)) return 'expired';
    if (matches.some((item) => ['blocked', 'withdrawn'].includes(item.state))
      && !matches.slice(matches.findLastIndex((item) => ['blocked', 'withdrawn'].includes(item.state)) + 1)
        .some((item) => item.state === 'allowed')) {
      return matches.findLast((item) => ['blocked', 'withdrawn'].includes(item.state)).state;
    }
    return latest.state;
  }

  recordRelated(customerId, collection, value, metadata = {}) {
    const customer = this.mutable(customerId);
    if (!['orders', 'reservations', 'incidents', 'notes', 'tags', 'segments'].includes(collection)) {
      throw customerError('CUSTOMER_COLLECTION_INVALID');
    }
    customer[collection].push(structuredClone(value));
    this.append(`customer_${collection}_recorded`, customerId, {
      record_hash: stableHash(JSON.stringify(canonical(value))).slice(0, 16)
    }, metadata);
    return this.customer(customerId);
  }

  findByIdentity(identity) {
    return cloneFrozen([...this.customers.values()].filter((customer) => (
      customer.identities.some((item) => item.type === identity.type && item.token === identity.token)
    )).map((customer) => customer));
  }

  auditLog() {
    return cloneFrozen(this.events);
  }

  rebuild(events = this.events) {
    return cloneFrozen({
      schema_version: 'deliveryos-customer-rebuild-proof-v1',
      event_count: events.length,
      event_hash: stableHash(JSON.stringify(canonical(events))),
      aggregate_ids: [...new Set(events.map((event) => event.aggregate_id))].sort()
    });
  }
}

module.exports = { CustomerIntelligenceStore, sanitizeAudit };
