'use strict';

const { QUEUE_STATES } = require('./contracts');
const { assertFeature } = require('./feature-flags');
const { nativeError } = require('./errors');
const { sha256 } = require('./deterministic');

const QUEUE_BY_ESCALATION = Object.freeze({ E1: ['Q_OPS','waiting_operation'], E2: ['Q_COMMERCIAL_OPS','waiting_operation'], E3: ['Q_MANAGEMENT','waiting_manager'], E4: ['Q_FOOD_SAFETY','waiting_quality'] });

class HumanQueue {
  constructor(options = {}) { this.store = options.store; this.flags = options.flags; this.clock = options.clock; this.ids = options.ids; }
  create(input) {
    assertFeature(this.flags, 'deliveryosHumanQueueV1');
    const [queueId, state] = QUEUE_BY_ESCALATION[input.escalation] || ['Q_OPS','waiting_operation'];
    const taskId = input.task_id || `task_${sha256(input.idempotency_key).slice(0,20)}`;
    const result = this.store.append({ event_id: `queue_${taskId}`, idempotency_key: `queue:create:${input.idempotency_key}`, type: 'human_queue.created', occurred_at: this.clock.iso(), payload: { task_id: taskId, case_id: input.case_id, conversation_id: input.conversation_id, queue_id: queueId, state, owner_function: input.owner_function || 'synthetic_owner', fallback_function: input.fallback_function || 'synthetic_fallback', priority: input.priority || 'normal', reason: input.reason, questions_asked: input.questions_asked || [], actions_done: input.actions_done || [], actions_pending: input.actions_pending || [], evidence_ids: input.evidence_ids || [], synthetic: true } });
    return Object.freeze({ status: result.status === 'accepted' || result.status === 'duplicate' ? 'confirmed' : 'failed', task: result.event?.payload || null });
  }
  update(taskId, state, detail = {}) {
    if (!QUEUE_STATES.includes(state)) throw nativeError('QUEUE_STATE_INVALID');
    return this.store.append({ event_id: `queue_${taskId}_${state}`, idempotency_key: `queue:update:${taskId}:${state}`, type: 'human_queue.updated', occurred_at: this.clock.iso(), payload: { task_id: taskId, state, detail, synthetic: true } });
  }
  snapshot() {
    const created = this.store.eventsOfType('human_queue.created');
    const updated = this.store.eventsOfType('human_queue.updated');
    return Object.freeze(created.map((event) => {
      const changes = updated.filter((candidate) => candidate.payload.task_id === event.payload.task_id);
      return { ...event.payload, state: changes.at(-1)?.payload.state || event.payload.state, timeline_events: 1 + changes.length };
    }));
  }
}

module.exports = { QUEUE_BY_ESCALATION, HumanQueue };
