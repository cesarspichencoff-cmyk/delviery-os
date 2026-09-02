'use strict';

const crypto = require('node:crypto');
const { domainError, isoNow, cloneFrozen } = require('./contracts');
const {
  createCustomerProfile,
  createCustomerIdentity,
  createCustomerOrderReference,
  createCustomerOccurrence,
  createCustomerPromise,
  createCustomerBenefit,
  createCustomerConsent,
  createCustomerTimelineEvent
} = require('./entities');

function defaultId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

class CrmStore {
  constructor(options = {}) {
    this.clock = options.clock || (() => new Date());
    this.id = options.id || defaultId;
    this.entities = {
      profiles: [],
      identities: [],
      order_references: [],
      occurrences: [],
      promises: [],
      benefits: [],
      consents: [],
      timeline: []
    };
  }

  assertProfile(tenantId, profileId) {
    const profile = this.entities.profiles.find((candidate) => candidate.tenant_id === tenantId && candidate.profile_id === profileId);
    if (!profile) throw domainError('PROFILE_NAO_ENCONTRADO');
    return profile;
  }

  append(collection, entity) {
    if (this.entities[collection].some((current) => current[Object.keys(current).find((key) => key.endsWith('_id'))] === entity[Object.keys(entity).find((key) => key.endsWith('_id'))])) {
      throw domainError('ENTITY_ID_DUPLICADO');
    }
    this.entities[collection].push(entity);
    return entity;
  }

  timeline(tenantId, profileId, eventType, payload = {}, source = 'conversation_crm_v0') {
    this.assertProfile(tenantId, profileId);
    const event = createCustomerTimelineEvent({
      event_id: this.id('evt'), tenant_id: tenantId, profile_id: profileId,
      event_type: eventType, source, occurred_at: isoNow(this.clock), payload
    });
    this.entities.timeline.push(event);
    return event;
  }

  createProfile(input) {
    const profile = createCustomerProfile({
      ...input,
      profile_id: input.profile_id || this.id('cus'),
      created_at: input.created_at || isoNow(this.clock)
    });
    this.append('profiles', profile);
    this.timeline(profile.tenant_id, profile.profile_id, 'profile_created', { provenance: profile.provenance });
    return profile;
  }

  addIdentity(input) {
    this.assertProfile(input.tenant_id, input.profile_id);
    const entity = createCustomerIdentity({ ...input, identity_id: input.identity_id || this.id('idt'), created_at: input.created_at || isoNow(this.clock) });
    this.append('identities', entity);
    this.timeline(input.tenant_id, input.profile_id, 'identity_added', { identity_type: entity.identity_type, source: entity.source });
    return entity;
  }

  addOrderReference(input) {
    this.assertProfile(input.tenant_id, input.profile_id);
    const entity = createCustomerOrderReference({ ...input, reference_id: input.reference_id || this.id('ord'), observed_at: input.observed_at || isoNow(this.clock) });
    this.append('order_references', entity);
    this.timeline(input.tenant_id, input.profile_id, 'order_reference_added', { reference_id: entity.reference_id, status: entity.status });
    return entity;
  }

  addOccurrence(input) {
    this.assertProfile(input.tenant_id, input.profile_id);
    const entity = createCustomerOccurrence({ ...input, occurrence_id: input.occurrence_id || this.id('occ'), created_at: input.created_at || isoNow(this.clock) });
    this.append('occurrences', entity);
    this.timeline(input.tenant_id, input.profile_id, 'occurrence_created', {
      occurrence_id: entity.occurrence_id, severity: entity.severity, status: entity.status, summary_code: entity.summary_code
    });
    return entity;
  }

  addPromise(input) {
    this.assertProfile(input.tenant_id, input.profile_id);
    const occurrence = this.entities.occurrences.find((item) => item.tenant_id === input.tenant_id && item.occurrence_id === input.occurrence_id && item.profile_id === input.profile_id);
    if (!occurrence) throw domainError('OCORRENCIA_NAO_ENCONTRADA');
    const entity = createCustomerPromise({
      ...input, promise_id: input.promise_id || this.id('pro'),
      authorized_at: input.authorized_at || isoNow(this.clock), created_at: input.created_at || isoNow(this.clock)
    });
    this.append('promises', entity);
    this.timeline(input.tenant_id, input.profile_id, 'promise_registered', {
      promise_id: entity.promise_id, occurrence_id: entity.occurrence_id, promise_type: entity.promise_type, status: entity.status
    });
    return entity;
  }

  addBenefit(input) {
    this.assertProfile(input.tenant_id, input.profile_id);
    const entity = createCustomerBenefit({
      ...input, benefit_id: input.benefit_id || this.id('ben'),
      authorized_at: input.authorized_by_human_id ? (input.authorized_at || isoNow(this.clock)) : null,
      created_at: input.created_at || isoNow(this.clock)
    });
    this.append('benefits', entity);
    this.timeline(input.tenant_id, input.profile_id, 'benefit_recorded', { benefit_id: entity.benefit_id, benefit_type: entity.benefit_type, status: entity.status });
    return entity;
  }

  recordConsent(input) {
    this.assertProfile(input.tenant_id, input.profile_id);
    const entity = createCustomerConsent({
      ...input, consent_id: input.consent_id || this.id('con'),
      observed_at: input.observed_at || isoNow(this.clock), created_at: input.created_at || isoNow(this.clock)
    });
    this.append('consents', entity);
    this.timeline(input.tenant_id, input.profile_id, 'consent_recorded', { channel: entity.channel, status: entity.status, source: entity.source });
    return entity;
  }

  consentState(tenantId, profileId, channel) {
    this.assertProfile(tenantId, profileId);
    const matches = this.entities.consents.filter((item) => item.tenant_id === tenantId && item.profile_id === profileId && item.channel === channel);
    return matches.length ? matches[matches.length - 1].status : 'unknown';
  }

  snapshot(tenantId, profileId) {
    const profile = this.assertProfile(tenantId, profileId);
    const own = (collection) => this.entities[collection].filter((item) => item.tenant_id === tenantId && item.profile_id === profileId);
    return cloneFrozen({
      schema_version: 'crm-snapshot-v0',
      profile,
      identities: own('identities'),
      order_references: own('order_references'),
      occurrences: own('occurrences'),
      promises: own('promises'),
      benefits: own('benefits'),
      consents: own('consents'),
      timeline: own('timeline')
    });
  }
}

module.exports = { CrmStore, defaultId };


