'use strict';

const { initialPatternJourneyState, applyPatternDecision } = require('../../../apps/deliveryos-ai-node');
const { canonicalJson, sha256 } = require('./deterministic');

class NativePatternStateStore {
  constructor(options = {}) {
    this.store = options.store;
    this.clock = options.clock;
  }

  events(conversationId) {
    return this.store.eventsOfType('conversation.pattern_decision_applied')
      .filter((event) => event.payload.conversation_id === conversationId);
  }

  reconstruct(conversationId) {
    return this.events(conversationId).reduce(
      (state, event) => applyPatternDecision(state, event.payload.decision),
      initialPatternJourneyState(conversationId)
    );
  }

  apply(input) {
    const replayDecision = {
      ...input.decision,
      question_to_resume: null,
      clarification_question: null
    };
    const identity = canonicalJson({ conversation_id: input.conversation_id, turn_id: input.turn_id, decision: replayDecision });
    const result = this.store.append({
      event_id: `pattern_${sha256(identity).slice(0, 20)}`,
      idempotency_key: `pattern:${input.conversation_id}:${input.turn_id}`,
      type: 'conversation.pattern_decision_applied',
      occurred_at: input.occurred_at || this.clock.iso(),
      payload: {
        schema_version: 'deliveryos-native-pattern-event-v1',
        conversation_id: input.conversation_id,
        turn_id: input.turn_id,
        decision: replayDecision,
        synthetic: true
      }
    });
    return Object.freeze({ status: result.status, event: result.event, state: this.reconstruct(input.conversation_id) });
  }
}

function publishPatternState(stateHub, state, options = {}) {
  const observedAt = options.observed_at;
  return stateHub.ingestFact({
    synthetic: true,
    entity_type: 'conversation',
    entity_id: state.conversation_id,
    field: 'conversation.pattern_state',
    value: {
      version: state.version,
      active_journey: state.active_journey,
      active_step: state.active_step,
      pending_question: state.pending_question,
      suspended_count: state.suspended_journeys.length,
      last_pattern: state.last_pattern
    },
    source: 'conversation_pattern_engine',
    observed_at: observedAt,
    effective_at: observedAt,
    confidence: Number.isFinite(options.confidence) ? options.confidence : 1,
    freshness: { state: 'updated', age_ms: 0 },
    evidence_id: options.evidence_id || null,
    revision: state.version,
    conflict_state: 'none'
  });
}

module.exports = { NativePatternStateStore, publishPatternState };
