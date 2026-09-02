'use strict';

const { nowIso } = require('./job-service');

class AiHeartbeatService {
  constructor(options = {}) {
    this.store = options.store;
    this.clock = options.clock || (() => Date.now());
    this.staleAfterMs = Number(options.staleAfterMs || 30_000);
  }

  async record(input = {}) {
    const node = await this.store.getNode(input.node_id);
    if (!node || ['revoked', 'blocked'].includes(node.state)) throw Object.assign(new Error('NODE_HEARTBEAT_REFUSED'), { code: 'NODE_HEARTBEAT_REFUSED' });
    const at = nowIso(this.clock);
    const updated = {
      ...node,
      last_heartbeat_at: at,
      version: String(input.version || node.version),
      runtime_version: String(input.runtime_version || 'unknown'),
      loaded_model: input.loaded_model || null,
      metrics: {
        queue_depth: Number(input.metrics?.queue_depth || 0),
        memory_used_bytes: Number(input.metrics?.memory_used_bytes || 0),
        active_jobs: Number(input.metrics?.active_jobs || 0)
      },
      updated_at: at
    };
    await this.store.putNode(updated);
    await this.store.appendNodeEvent({ type: 'node_heartbeat', node_id: node.node_id, occurred_at: at, state: updated.state, version: updated.version, loaded_model: updated.loaded_model });
    return updated;
  }

  status(node) {
    if (!node) return 'offline';
    if (['revoked', 'blocked', 'maintenance'].includes(node.state)) return node.state;
    if (!node.last_heartbeat_at) return 'offline';
    return this.clock() - new Date(node.last_heartbeat_at).getTime() > this.staleAfterMs ? 'stale' : node.state;
  }
}

module.exports = { AiHeartbeatService };

