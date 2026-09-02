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
  openCase(input) {
    const existing = this.store.eventsOfType('crm.case_opened').find((event) => event.payload.case_id === input.case_id);
    if (existing) return Object.freeze({ status: 'duplicate', event: existing });
    return this.append('case_opened', input.case_id, { case_id: input.case_id, conversation_id: input.conversation_id, subject_id: input.subject_id, order_id: input.order_id || null, topic: input.topic || null, state: 'open', synthetic: true });
  }
  updateCaseOrder(input) { return this.append('case_order_updated', `${input.case_id}:${input.revision}`, { ...input, synthetic: true }); }
  recordClassification(input) { return this.append('classification_recorded', input.message_id, input); }
  recordCapability(input) { return this.append('capability_recorded', input.request_id, input); }
  recordAction(input) { return this.append('action_recorded', input.action_id, input); }
  recordResponse(input) { return this.append('response_recorded', input.response_id, input); }
  recordNotification(input) { return this.append('notification_recorded', input.notification_id, input); }
  recordOccurrence(input) { return this.append('occurrence_created', input.occurrence_id, input); }
  recordCorrection(input) { return this.append('data_corrected', `${input.case_id}:${input.field}:${input.revision}`, { ...input, previous_state: 'superseded', current_state: 'provided' }); }
  closeCase(input) { return this.append('case_closed', `${input.case_id}:${input.revision || 1}`, { ...input, state: 'closed' }); }
  reopenCase(input) { return this.append('case_reopened', `${input.case_id}:${input.revision || 1}`, { ...input, state: 'open' }); }

  casesForConversation(conversationId) {
    const opened = this.store.eventsOfType('crm.case_opened').filter((event) => event.payload.conversation_id === conversationId);
    return opened.map((event) => {
      const projection = this.projectCase(event.payload.case_id);
      return Object.freeze({ ...event.payload, order_id: projection.order_id || event.payload.order_id || null, state: projection.state, opened_sequence: event.sequence });
    });
  }

  latestCase(conversationId, options = {}) {
    const cases = this.casesForConversation(conversationId)
      .filter((item) => options.open_only !== true || item.state === 'open')
      .sort((left, right) => left.opened_sequence - right.opened_sequence);
    return cases.at(-1) || null;
  }

  latestClassification(conversationId, caseId = null) {
    return this.store.eventsOfType('crm.classification_recorded')
      .filter((event) => event.payload.conversation_id === conversationId && (!caseId || event.payload.case_id === caseId))
      .at(-1)?.payload || null;
  }

  projectCase(caseId) {
    const events = this.store.events.filter((event) => event.type.startsWith('crm.') && (event.payload.case_id === caseId || event.payload.classification?.case_id === caseId));
    let state = 'open';
    let orderId = null;
    const data = {};
    for (const event of events) {
      if (event.type === 'crm.case_closed') state = 'closed';
      if (event.type === 'crm.case_reopened') state = 'open';
      if (event.type === 'crm.case_opened') orderId = event.payload.order_id || null;
      if (event.type === 'crm.case_order_updated') orderId = event.payload.order_id || null;
      if (event.type === 'crm.data_corrected') data[event.payload.field] = { value: event.payload.value, state: 'provided', revision: event.payload.revision, provenance: event.payload.provenance };
    }
    return Object.freeze({ schema_version: 'conversation-crm-case-projection-v1', case_id: caseId, order_id: orderId, state, data, timeline: events.map((event) => ({ sequence: event.sequence, type: event.type, occurred_at: event.occurred_at, event_id: event.event_id })) });
  }

  snapshot() {
    const events = this.store.events.filter((event) => event.type.startsWith('crm.'));
    return Object.freeze({ schema_version: 'conversation-crm-projection-v1', events: events.length, conversations: new Set(events.map((e) => e.payload.conversation_id).filter(Boolean)).size, cases: new Set(events.map((e) => e.payload.case_id).filter(Boolean)).size, occurrences: events.filter((e) => e.type === 'crm.occurrence_created').length, responses: events.filter((e) => e.type === 'crm.response_recorded').length });
  }
}

module.exports = { ConversationCrmV1 };

