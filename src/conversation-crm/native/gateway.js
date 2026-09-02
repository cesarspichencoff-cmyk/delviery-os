'use strict';

const { validateGatewayInput } = require('./contracts');
const { messageProvenance, sanitize } = require('./privacy');
const { assertFeature } = require('./feature-flags');

class ConversationGateway {
  constructor(options = {}) {
    this.store = options.store;
    this.flags = options.flags;
    this.clock = options.clock;
    this.originals = new Map();
  }

  receive(raw) {
    assertFeature(this.flags, 'conversationGatewayV1');
    const input = validateGatewayInput(raw);
    const message = messageProvenance(input.content);
    const contextPrivacy = sanitize(input.context);
    const privacy = {
      detected: message.detected_categories.length > 0 || contextPrivacy.detected,
      finding_types: [...new Set([...message.detected_categories, ...contextPrivacy.finding_types])].sort(),
      removed_fields: contextPrivacy.removed_fields,
      message
    };
    const prior = this.store.findByIdempotency(`gateway:${input.idempotency_key}`);
    if (prior) {
      this.originals.set(input.message_id, input.content);
      return Object.freeze({ status: 'duplicate', input, persisted_input: prior.payload.input, privacy: prior.payload.privacy, original_available_ephemerally: true });
    }
    this.originals.set(input.message_id, input.content);
    const previousTurns = this.store.eventsOfType('gateway.message_received').filter((event) => event.payload.input.conversation_id === input.conversation_id);
    const lastTurn = Math.max(0, ...previousTurns.map((event) => Number(event.payload.input.turn_order)));
    const persistedInput = {
      schema_version: input.schema_version,
      synthetic: input.synthetic,
      message_type: input.message_type,
      channel: input.channel,
      subject_id: input.subject_id,
      conversation_id: input.conversation_id,
      message_id: input.message_id,
      correlation_id: input.correlation_id,
      idempotency_key: input.idempotency_key,
      occurred_at: input.occurred_at,
      turn_order: input.turn_order,
      unit_id: input.unit_id,
      content_provenance: message,
      context_persisted: false
    };
    const appended = this.store.append({ event_id: `gateway_${input.message_id}`, idempotency_key: `gateway:${input.idempotency_key}`, type: 'gateway.message_received', occurred_at: input.occurred_at, payload: { input: persistedInput, privacy: { detected: privacy.detected, finding_types: privacy.finding_types, removed_fields: privacy.removed_fields }, out_of_order: input.turn_order <= lastTurn } });
    return Object.freeze({
      status: appended.status,
      input,
      persisted_input: persistedInput,
      privacy: appended.event?.payload.privacy || {},
      out_of_order: appended.event?.payload.out_of_order || false,
      original_available_ephemerally: true
    });
  }

  original(messageId) { return this.originals.get(messageId) || null; }
  forgetOriginal(messageId) { this.originals.delete(messageId); }
  conversationMessages(conversationId) { return this.store.eventsOfType('gateway.message_received').filter((event) => event.payload.input.conversation_id === conversationId).sort((a,b) => a.payload.input.turn_order - b.payload.input.turn_order).map((event) => event.payload.input); }
}

module.exports = { ConversationGateway };

