'use strict';

const SAFE_DEFAULTS = Object.freeze({ enabled: false, shadow: true, node_required: false, fallback: 'deterministic' });

function parseBoolean(value, fallback) {
  if (value == null || value === '') return fallback;
  if (value === true || String(value).toLowerCase() === 'true') return true;
  if (value === false || String(value).toLowerCase() === 'false') return false;
  throw Object.assign(new Error('LOCAL_AI_FLAG_INVALID'), { code: 'LOCAL_AI_FLAG_INVALID' });
}

function loadLocalAiFlags(env = {}) {
  const fallback = env.CONVERSATION_AI_FALLBACK || SAFE_DEFAULTS.fallback;
  if (fallback !== 'deterministic') throw Object.assign(new Error('LOCAL_AI_FALLBACK_INVALID'), { code: 'LOCAL_AI_FALLBACK_INVALID' });
  return Object.freeze({
    enabled: parseBoolean(env.CONVERSATION_LOCAL_AI_ENABLED, false),
    shadow: parseBoolean(env.CONVERSATION_LOCAL_AI_SHADOW, true),
    node_required: parseBoolean(env.CONVERSATION_AI_NODE_REQUIRED, false),
    fallback
  });
}

class CircuitBreaker {
  constructor(options = {}) {
    this.threshold = Number(options.threshold || 3);
    this.cooldownMs = Number(options.cooldownMs || 30_000);
    this.clock = options.clock || (() => Date.now());
    this.records = new Map();
  }
  success(key) { this.records.set(key, { failures: 0, opened_at: null }); }
  failure(key) {
    const current = this.records.get(key) || { failures: 0, opened_at: null };
    const failures = current.failures + 1;
    this.records.set(key, { failures, opened_at: failures >= this.threshold ? this.clock() : current.opened_at });
  }
  state(key) {
    const current = this.records.get(key) || { failures: 0, opened_at: null };
    if (current.opened_at == null) return 'closed';
    if (this.clock() - current.opened_at >= this.cooldownMs) return 'half_open';
    return 'open';
  }
}

class AiFallbackRouter {
  constructor(options = {}) {
    this.flags = options.flags || SAFE_DEFAULTS;
    this.breaker = options.breaker || new CircuitBreaker();
  }
  route(input = {}) {
    if (!this.flags.enabled) return { public_source: 'deterministic', local_ai: 'disabled', reason: 'flag_disabled' };
    if (this.breaker.state(input.node_id || 'none') === 'open') return { public_source: 'deterministic', local_ai: 'degraded', reason: 'circuit_open' };
    if (!input.node_ready) return { public_source: 'deterministic', local_ai: 'unavailable', reason: input.reason || 'node_unavailable' };
    if (this.flags.shadow) return { public_source: 'deterministic', local_ai: 'shadow', reason: null };
    if (!input.validated_result) return { public_source: 'deterministic', local_ai: 'rejected', reason: input.reason || 'result_unavailable' };
    return { public_source: 'local_ai', local_ai: 'active', reason: null };
  }
}

module.exports = { SAFE_DEFAULTS, parseBoolean, loadLocalAiFlags, CircuitBreaker, AiFallbackRouter };

