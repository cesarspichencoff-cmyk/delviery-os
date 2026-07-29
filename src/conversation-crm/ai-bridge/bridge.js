'use strict';

const { MemoryAiBridgeStore } = require('./job-store');
const { AiNodeRegistry } = require('./node-registry');
const { AiNodeAuth } = require('./node-auth');
const { AiJobService } = require('./job-service');
const { AiResultValidator } = require('./result-validator');
const { AiHeartbeatService } = require('./heartbeat-service');
const { AiBridgeMetrics } = require('./metrics');
const { loadLocalAiFlags, AiFallbackRouter, CircuitBreaker } = require('./fallback-router');
const { createLocalAiResultValidators } = require('../local-ai/result-validators');

class ConversationAiBridge {
  constructor(options = {}) {
    this.store = options.store || new MemoryAiBridgeStore();
    this.clock = options.clock || (() => Date.now());
    this.flags = options.flags || loadLocalAiFlags(options.env || {});
    this.registry = options.registry || new AiNodeRegistry({ store: this.store, clock: this.clock, tokenFactory: options.tokenFactory });
    this.auth = options.auth || new AiNodeAuth({ store: this.store, clock: this.clock, maxSkewMs: options.maxSkewMs });
    this.jobs = options.jobs || new AiJobService({ store: this.store, clock: this.clock, tokenFactory: options.tokenFactory, defaultTtlMs: options.defaultTtlMs, defaultLeaseMs: options.defaultLeaseMs, maxAttempts: options.maxAttempts });
    this.validator = options.validator || new AiResultValidator({ validators: options.validators || createLocalAiResultValidators() });
    this.heartbeat = options.heartbeat || new AiHeartbeatService({ store: this.store, clock: this.clock, staleAfterMs: options.staleAfterMs });
    this.breaker = options.breaker || new CircuitBreaker({ clock: this.clock, threshold: options.failureThreshold, cooldownMs: options.cooldownMs });
    this.fallback = options.fallback || new AiFallbackRouter({ flags: this.flags, breaker: this.breaker });
    this.metrics = options.metrics || new AiBridgeMetrics();
  }

  async enqueue(input) { return this.jobs.enqueue(input); }
  async claim(input) { return this.jobs.claim(input); }
  async processing(input) { return this.jobs.markProcessing(input); }
  async complete(input) {
    const result = await this.jobs.complete(input, this.validator);
    if (result.accepted) this.breaker.success(input.node_id);
    else this.breaker.failure(input.node_id);
    this.metrics.record({ job_id: input.job_id, node_id: input.node_id, state: result.job.state, ...result.job.timing_metrics });
    return result;
  }
}

module.exports = { ConversationAiBridge };
