'use strict';

const { clone } = require('./contracts');

class MemoryAiBridgeStore {
  constructor() {
    this.jobs = new Map();
    this.jobsByIdempotency = new Map();
    this.jobEvents = [];
    this.nodes = new Map();
    this.nodeEvents = [];
    this.installCodes = new Map();
    this.nonces = new Set();
  }

  async putInstallCode(record) {
    if (this.installCodes.has(record.code_hash)) throw Object.assign(new Error('INSTALL_CODE_EXISTS'), { code: 'INSTALL_CODE_EXISTS' });
    this.installCodes.set(record.code_hash, clone(record));
    return clone(record);
  }

  async consumeInstallCode(codeHash, usedAt) {
    const current = this.installCodes.get(codeHash);
    if (!current || current.used_at) return null;
    current.used_at = usedAt;
    return clone(current);
  }

  async putNode(node) {
    this.nodes.set(node.node_id, clone(node));
    return clone(node);
  }

  async getNode(nodeId) { return clone(this.nodes.get(nodeId) || null); }

  async appendNodeEvent(event) {
    this.nodeEvents.push(clone(event));
    return clone(event);
  }

  async useNonce(nodeId, nonce, expiresAt) {
    const key = `${nodeId}:${nonce}`;
    if (this.nonces.has(key)) return false;
    this.nonces.add(key);
    return true;
  }

  async createJob(job, event) {
    const existingId = this.jobsByIdempotency.get(job.idempotency_key);
    if (existingId) return { created: false, job: clone(this.jobs.get(existingId)) };
    this.jobs.set(job.job_id, clone(job));
    this.jobsByIdempotency.set(job.idempotency_key, job.job_id);
    this.jobEvents.push(clone(event));
    return { created: true, job: clone(job) };
  }

  async getJob(jobId) { return clone(this.jobs.get(jobId) || null); }

  async getJobByIdempotency(key) {
    const id = this.jobsByIdempotency.get(key);
    return id ? clone(this.jobs.get(id)) : null;
  }

  async updateJob(job, event) {
    if (!this.jobs.has(job.job_id)) throw Object.assign(new Error('AI_JOB_NOT_FOUND'), { code: 'AI_JOB_NOT_FOUND' });
    this.jobs.set(job.job_id, clone(job));
    if (event) this.jobEvents.push(clone(event));
    return clone(job);
  }

  async finalizeJob(job, event) {
    const current = this.jobs.get(job.job_id);
    if (!current) throw Object.assign(new Error('AI_JOB_NOT_FOUND'), { code: 'AI_JOB_NOT_FOUND' });
    if (!['claimed', 'processing'].includes(current.state)) return { applied: false, job: clone(current) };
    this.jobs.set(job.job_id, clone(job));
    this.jobEvents.push(clone(event));
    return { applied: true, job: clone(job) };
  }

  async claimNext(criteria) {
    const candidates = [...this.jobs.values()]
      .filter((job) => job.state === 'queued' && job.expires_at > criteria.now && criteria.models.includes(job.requested_model))
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.job_id.localeCompare(b.job_id));
    const selected = candidates[0];
    if (!selected) return null;
    const updated = {
      ...selected,
      state: 'claimed',
      node_id: criteria.node_id,
      lease_owner: criteria.node_id,
      lease_token_hash: criteria.lease_token_hash,
      lease_expires_at: criteria.lease_expires_at,
      claimed_at: criteria.now,
      attempt_count: selected.attempt_count + 1
    };
    this.jobs.set(updated.job_id, clone(updated));
    this.jobEvents.push(clone(criteria.event(updated)));
    return clone(updated);
  }

  async listJobs() { return [...this.jobs.values()].map(clone); }
  async eventsForJob(jobId) { return this.jobEvents.filter((event) => event.job_id === jobId).map(clone); }
  async snapshot() {
    return clone({ jobs: [...this.jobs.values()], job_events: this.jobEvents, nodes: [...this.nodes.values()], node_events: this.nodeEvents });
  }
}

module.exports = { MemoryAiBridgeStore };
