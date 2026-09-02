'use strict';

const { AdaptivePollSchedule } = require('./adaptive-poll');

class DeliveryOsAiNode {
  constructor(options = {}) {
    this.connector = options.connector;
    this.provider = options.provider;
    this.contractFactory = options.contractFactory;
    this.clock = options.clock || (() => Date.now());
    this.sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.schedule = options.schedule || new AdaptivePollSchedule(options.poll);
    this.nodeId = options.node_id;
    this.version = options.version || '0.1.0';
    this.running = false;
    this.lastHeartbeat = 0;
    this.heartbeatMs = Number(options.heartbeat_ms || 15_000);
  }

  async heartbeat(force = false) {
    if (!force && this.clock() - this.lastHeartbeat < this.heartbeatMs) return null;
    const health = await this.provider.runtime.health();
    const result = await this.connector.heartbeat({
      version: this.version,
      runtime_version: this.provider.providerVersion,
      loaded_model: this.provider.modelVersion,
      metrics: { ...this.provider.runtime.metrics(), health_state: health.state }
    });
    this.lastHeartbeat = this.clock();
    return result;
  }

  async tick() {
    await this.heartbeat();
    const claim = await this.connector.claim({ models: [this.provider.modelVersion] });
    if (!claim?.job) return { had_work: false };
    await this.connector.processing({
      job_id: claim.job.job_id,
      node_id: this.nodeId,
      lease_token: claim.lease_token
    });
    try {
      const contract = this.contractFactory(claim.job);
      const result = await this.provider.generate(claim.job, contract);
      await this.connector.complete({
        job_id: claim.job.job_id,
        node_id: this.nodeId,
        lease_token: claim.lease_token,
        result
      });
      return { had_work: true, state: 'completed', job_id: claim.job.job_id };
    } catch (error) {
      return { had_work: true, state: 'local_failed', job_id: claim.job.job_id, code: error.code || 'LOCAL_GENERATION_FAILED' };
    }
  }

  async start(signal) {
    this.running = true;
    await this.heartbeat(true);
    while (this.running && !signal?.aborted) {
      let result;
      try { result = await this.tick(); } catch { result = { had_work: false, state: 'offline' }; }
      await this.sleep(this.schedule.next(result.had_work));
    }
    return { state: 'stopped' };
  }

  stop() { this.running = false; }
}

module.exports = { DeliveryOsAiNode };
