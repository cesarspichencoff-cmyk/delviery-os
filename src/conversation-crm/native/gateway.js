'use strict';

const { validateGatewayInput } = require('./contracts');
const { sanitize } = require('./privacy');
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
    const privacy = sanitize(input.content);
    const prior = this.store.findByIdempotency(`gateway:${input.idempotency_key}`);
    if (prior) return Object.freeze({ status: 'duplicate', input: prior.payload.input, privacy: prior.payload.privacy, original_available_ephemerally: false });
    this.originals.set(input.message_id, input.content);
    const previousTurns = this.store.eventsOfType('gateway.message_received').filter((event) => event.payload.input.conversation_id === input.conversation_id);
    const lastTurn = Math.max(0, ...previousTurns.map((event) => Number(event.payload.input.turn_order)));
    const persistedInput = { ...input, content: privacy.sanitized };
    const appended = this.store.append({ event_id: `gateway_${input.message_id}`, idempotency_key: `gateway:${input.idempotency_key}`, type: 'gateway.message_received', occurred_at: input.occurred_at, payload: { input: persistedInput, privacy: { detected: privacy.detected, finding_types: privacy.finding_types, removed_fields: privacy.removed_fields }, out_of_order: input.turn_order <= lastTurn } });
    return Object.freeze({ status: appended.status, input: persistedInput, privacy: appended.event?.payload.privacy || {}, out_of_order: appended.event?.payload.out_of_order || false, original_available_ephemerally: true });
  }

  original(messageId) { return this.originals.get(messageId) || null; }
  forgetOriginal(messageId) { this.originals.delete(messageId); }
  conversationMessages(conversationId) { return this.store.eventsOfType('gateway.message_received').filter((event) => event.payload.input.conversation_id === conversationId).sort((a,b) => a.payload.input.turn_order - b.payload.input.turn_order).map((event) => event.payload.input); }
}

module.exports = { ConversationGateway };

