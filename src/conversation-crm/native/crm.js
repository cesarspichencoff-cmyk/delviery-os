'use strict';

const { assertFeature } = require('./feature-flags');
const { sha256 } = require('./deterministic');

class ConversationCrmV1 {
  constructor(options = {}) { this.store = options.store; this.flags = options.flags; this.clock = options.clock; this.ids = options.ids; }

  append(type, key, payload) {
    assertFeature(this.flags, 'conversationCrmV1');
    return this.store.append({ event_id: `crm_${sha256(`${type}|${key}`).slice(0,20)}`, idempotency_key: `crm:${type}:${key}`, type: `crm.${type}`, occurred_at: this.clock.iso(), payload });
  }

  ensureConversation(input) { return this.append('conversation_opened', input.conversation_id, { conversation_id: input.conversation_id, subject_id: input.subject_id, unit_id: input.unit_id, channel: input.channel, synthetic: true }); }
  recordMessage(input) { return this.append('message_recorded', input.message_id, { conversation_id: input.conversation_id, message_id: input.message_id, turn_order: input.turn_order, content_hash: sha256(input.content), raw_message_stored: false, synthetic: true }); }
  openCase(input) { return this.append('case_opened', input.case_id, { case_id: input.case_id, conversation_id: input.conversation_id, subject_id: input.subject_id, state: 'open', synthetic: true }); }
  recordClassification(input) { return this.append('classification_recorded', input.message_id, input); }
  recordCapability(input) { return this.append('capability_recorded', input.request_id, input); }
  recordAction(input) { return this.append('action_recorded', input.action_id, input); }
  recordResponse(input) { return this.append('response_recorded', input.response_id, input); }
  recordOccurrence(input) { return this.append('occurrence_created', input.occurrence_id, input); }
  recordCorrection(input) { return this.append('data_corrected', `${input.case_id}:${input.field}:${input.revision}`, { ...input, previous_state: 'superseded', current_state: 'provided' }); }
  closeCase(input) { return this.append('case_closed', `${input.case_id}:${input.revision || 1}`, { ...input, state: 'closed' }); }
  reopenCase(input) { return this.append('case_reopened', `${input.case_id}:${input.revision || 1}`, { ...input, state: 'open' }); }

  projectCase(caseId) {
    const events = this.store.events.filter((event) => event.type.startsWith('crm.') && (event.payload.case_id === caseId || event.payload.classification?.case_id === caseId));
    let state = 'open';
    const data = {};
    for (const event of events) {
      if (event.type === 'crm.case_closed') state = 'closed';
      if (event.type === 'crm.case_reopened') state = 'open';
      if (event.type === 'crm.data_corrected') data[event.payload.field] = { value: event.payload.value, state: 'provided', revision: event.payload.revision, provenance: event.payload.provenance };
    }
    return Object.freeze({ schema_version: 'conversation-crm-case-projection-v1', case_id: caseId, state, data, timeline: events.map((event) => ({ sequence: event.sequence, type: event.type, occurred_at: event.occurred_at, event_id: event.event_id })) });
  }

  snapshot() {
    const events = this.store.events.filter((event) => event.type.startsWith('crm.'));
    return Object.freeze({ schema_version: 'conversation-crm-projection-v1', events: events.length, conversations: new Set(events.map((e) => e.payload.conversation_id).filter(Boolean)).size, cases: new Set(events.map((e) => e.payload.case_id).filter(Boolean)).size, occurrences: events.filter((e) => e.type === 'crm.occurrence_created').length, responses: events.filter((e) => e.type === 'crm.response_recorded').length });
  }
}

module.exports = { ConversationCrmV1 };

