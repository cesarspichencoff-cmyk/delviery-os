'use strict';

const { DATA_STATES } = require('./contracts');
const { nativeError } = require('./errors');
const { canonicalJson, sha256 } = require('./deterministic');

function sameValue(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

class ConversationContextStore {
  constructor(options = {}) {
    this.store = options.store;
    this.clock = options.clock;
  }

  events(conversationId, options = {}) {
    return this.store.eventsOfType('context.entity_observed').filter((event) => {
      if (event.payload.conversation_id !== conversationId) return false;
      if (options.case_id && event.payload.case_id !== options.case_id) return false;
      if (options.order_id && event.payload.order_id !== options.order_id) return false;
      return true;
    });
  }

  observe(input) {
    if (!DATA_STATES.includes(input.state)) throw nativeError('DATA_STATE_INVALID');
    if (!input.case_id) throw nativeError('CONTEXT_CASE_REQUIRED');
    const current = this.project(input.conversation_id, { case_id: input.case_id })[input.field];
    const revision = Number.isInteger(input.revision) ? input.revision : (current?.revision || 0) + 1;
    const identity = {
      conversation_id: input.conversation_id,
      case_id: input.case_id,
      order_id: input.order_id || null,
      turn_id: input.message_id,
      field: input.field,
      revision,
      state: input.state
    };
    return this.store.append({
      event_id: `context_${sha256(canonicalJson(identity)).slice(0, 20)}`,
      idempotency_key: `context:${sha256(canonicalJson(identity))}`,
      type: 'context.entity_observed',
      occurred_at: input.occurred_at || this.clock.iso(),
      payload: {
        ...identity,
        message_id: input.message_id,
        value: input.value,
        confidence: Number.isFinite(input.confidence) ? input.confidence : 1,
        provenance: input.provenance || 'provided',
        supersedes_event_id: input.supersedes_event_id || null,
        synthetic: true
      }
    });
  }

  correct(input) {
    const current = this.project(input.conversation_id, { case_id: input.case_id })[input.field];
    if (!current) return this.observe({ ...input, state: input.state || 'provided', revision: 1 });
    if (sameValue(current.value, input.value) && current.state === (input.state || 'provided')) {
      return Object.freeze({ status: 'duplicate', event: this.store.events.find((event) => event.event_id === current.event_id) || null });
    }
    const supersededRevision = current.revision + 1;
    this.observe({
      conversation_id: input.conversation_id,
      case_id: input.case_id,
      order_id: current.order_id || input.order_id || null,
      message_id: input.message_id,
      field: input.field,
      value: current.value,
      state: 'superseded',
      revision: supersededRevision,
      confidence: current.confidence,
      provenance: current.provenance,
      supersedes_event_id: current.event_id,
      occurred_at: input.occurred_at
    });
    return this.observe({
      ...input,
      state: input.state || 'provided',
      revision: supersededRevision + 1,
      supersedes_event_id: current.event_id
    });
  }

  upsert(input) {
    const current = this.project(input.conversation_id, { case_id: input.case_id })[input.field];
    if (!current) return this.observe({ ...input, state: input.state || 'provided', revision: 1 });
    return this.correct(input);
  }

  project(conversationId, options = {}) {
    const output = {};
    for (const event of this.events(conversationId, options)) {
      const payload = event.payload;
      if (payload.state === 'superseded') continue;
      const current = output[payload.field];
      if (!current || payload.revision > current.revision || (payload.revision === current.revision && event.sequence > current.sequence)) {
        output[payload.field] = { ...payload, event_id: event.event_id, sequence: event.sequence };
      }
    }
    return Object.freeze(output);
  }

  findCaseByOrder(conversationId, orderReference) {
    const matches = this.events(conversationId).filter((event) => (
      event.payload.field === 'order_reference'
      && event.payload.state !== 'superseded'
      && sameValue(event.payload.value, orderReference)
    ));
    return matches.at(-1)?.payload.case_id || null;
  }
}

module.exports = { sameValue, ConversationContextStore };
