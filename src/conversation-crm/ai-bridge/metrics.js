'use strict';

class AiBridgeMetrics {
  constructor() { this.samples = []; }
  record(sample = {}) {
    const safe = Object.fromEntries(Object.entries(sample).filter(([key, value]) => (
      ['job_id', 'node_id', 'request_type', 'model_version', 'state', 'fallback_reason'].includes(key)
      ? typeof value === 'string' || value == null
      : (/_ms$|tokens_per_second|count$/u.test(key) && Number.isFinite(value) && value >= 0)
    )));
    this.samples.push(Object.freeze(safe));
    return safe;
  }
  snapshot() {
    const total = this.samples.length;
    return Object.freeze({
      samples: total,
      completed: this.samples.filter((sample) => sample.state === 'completed').length,
      fallback_used: this.samples.filter((sample) => sample.state === 'fallback_used').length,
      failed: this.samples.filter((sample) => ['failed', 'rejected', 'expired'].includes(sample.state)).length
    });
  }
}

module.exports = { AiBridgeMetrics };
