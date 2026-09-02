'use strict';

const { sha256 } = require('../native/deterministic');
const { idempotencyKey, payloadHash, requireIso, requireToken, newOpaqueToken } = require('./contracts');
const { sanitizeAiContext } = require('./privacy');

function nowIso(clock) { return new Date(clock()).toISOString(); }
function event(job, type, at, extra = {}) {
  return { event_id: `aije_${sha256(`${job.job_id}|${type}|${job.attempt_count}|${at}`).slice(0, 24)}`, job_id: job.job_id, type, occurred_at: at, ...extra };
}

class AiJobService {
  constructor(options = {}) {
    this.store = options.store;
    this.clock = options.clock || (() => Date.now());
    this.tokenFactory = options.tokenFactory || newOpaqueToken;
    this.defaultTtlMs = Number(options.defaultTtlMs || 30_000);
    this.defaultLeaseMs = Number(options.defaultLeaseMs || 15_000);
    this.maxAttempts = Number(options.maxAttempts || 3);
  }

  async enqueue(input = {}) {
    const requestType = requireToken(input.request_type, 'AI_REQUEST_TYPE_REQUIRED');
    if (!['conversation_director', 'response_writer'].includes(requestType)) throw Object.assign(new Error('AI_REQUEST_TYPE_INVALID'), { code: 'AI_REQUEST_TYPE_INVALID' });
    const sanitized = sanitizeAiContext(input.payload || {});
    const createdAt = nowIso(this.clock);
    const ttlMs = Number(input.ttl_ms || this.defaultTtlMs);
    const identity = idempotencyKey(input);
    const job = {
      schema_version: 'conversation-ai-job-v1',
      job_id: `aij_${sha256(identity).slice(0, 24)}`,
      idempotency_key: identity,
      conversation_id: requireToken(input.conversation_id, 'AI_CONVERSATION_ID_REQUIRED'),
      turn_id: requireToken(input.turn_id, 'AI_TURN_ID_REQUIRED'),
      request_type: requestType,
      requested_model: requireToken(input.model_version, 'AI_MODEL_VERSION_REQUIRED'),
      provider_version: requireToken(input.provider_version, 'AI_PROVIDER_VERSION_REQUIRED'),
      prompt_contract_version: requireToken(input.prompt_contract_version, 'AI_PROMPT_VERSION_REQUIRED'),
      payload: sanitized.payload,
      payload_hash: sanitized.payload_hash,
      privacy_findings: sanitized.findings,
      privacy_removed_fields: sanitized.removed_fields,
      state: 'queued', node_id: null, lease_owner: null, lease_token_hash: null,
      lease_expires_at: null, attempt_count: 0, created_at: createdAt,
      expires_at: new Date(new Date(createdAt).getTime() + ttlMs).toISOString(),
      claimed_at: null, processing_at: null, completed_at: null,
      validator_result: null, fallback_reason: null, result_hash: null,
      timing_metrics: {}
    };
    return this.store.createJob(job, event(job, 'queued', createdAt, { payload_hash: job.payload_hash }));
  }

  async claim(input = {}) {
    const node = await this.store.getNode(input.node_id);
    if (!node || !['active', 'degraded'].includes(node.state)) throw Object.assign(new Error('NODE_NOT_CLAIMABLE'), { code: 'NODE_NOT_CLAIMABLE' });
    const now = nowIso(this.clock);
    const models = (input.models || node.allowed_models || []).filter((model) => node.allowed_models.includes(model));
    if (!models.length) return null;
    const leaseToken = this.tokenFactory(32);
    const leaseExpiresAt = new Date(new Date(now).getTime() + Number(input.lease_ms || this.defaultLeaseMs)).toISOString();
    const claimed = await this.store.claimNext({
      node_id: node.node_id, models, now, lease_expires_at: leaseExpiresAt,
      lease_token_hash: sha256(leaseToken),
      event: (job) => event(job, 'claimed', now, { node_id: node.node_id, lease_expires_at: leaseExpiresAt })
    });
    if (!claimed) return null;
    return { job: claimed, lease_token: leaseToken };
  }

  async markProcessing(input = {}) {
    const job = await this.requireLease(input);
    if (job.state !== 'claimed') throw Object.assign(new Error('AI_JOB_NOT_CLAIMED'), { code: 'AI_JOB_NOT_CLAIMED' });
    const at = nowIso(this.clock);
    const updated = { ...job, state: 'processing', processing_at: at };
    return this.store.updateJob(updated, event(updated, 'processing', at, { node_id: input.node_id }));
  }

  async requireLease(input = {}) {
    const job = await this.store.getJob(input.job_id);
    if (!job) throw Object.assign(new Error('AI_JOB_NOT_FOUND'), { code: 'AI_JOB_NOT_FOUND' });
    const now = nowIso(this.clock);
    if (job.node_id !== input.node_id || job.lease_token_hash !== sha256(String(input.lease_token || ''))) throw Object.assign(new Error('AI_LEASE_INVALID'), { code: 'AI_LEASE_INVALID' });
    if (!job.lease_expires_at || job.lease_expires_at <= now || job.expires_at <= now) throw Object.assign(new Error('AI_LEASE_EXPIRED'), { code: 'AI_LEASE_EXPIRED' });
    return job;
  }

  async complete(input = {}, validator) {
    const current = await this.store.getJob(input.job_id);
    if (!current) throw Object.assign(new Error('AI_JOB_NOT_FOUND'), { code: 'AI_JOB_NOT_FOUND' });
    if (current.state === 'completed') {
      const repeatedHash = payloadHash(input.result?.output);
      if (current.node_id === input.node_id && current.result_hash === repeatedHash) return { accepted: true, duplicate: true, job: current };
      throw Object.assign(new Error('AI_RESULT_ALREADY_FINALIZED'), { code: 'AI_RESULT_ALREADY_FINALIZED' });
    }
    const job = await this.requireLease(input);
    if (!['claimed', 'processing'].includes(job.state)) throw Object.assign(new Error('AI_JOB_NOT_COMPLETABLE'), { code: 'AI_JOB_NOT_COMPLETABLE' });
    const validation = validator.validate({ job, result: input.result, node_id: input.node_id });
    const at = nowIso(this.clock);
    if (!validation.accepted) {
      const rejected = { ...job, state: 'rejected', validator_result: validation, completed_at: at, fallback_reason: validation.reason };
      const finalized = await this.store.finalizeJob(rejected, event(rejected, 'rejected', at, { reason: validation.reason }));
      return { accepted: false, duplicate: !finalized.applied, job: finalized.job };
    }
    const resultHash = payloadHash(validation.output);
    const completed = { ...job, state: 'completed', validator_result: validation, completed_at: at, result_hash: resultHash, result: validation.output, timing_metrics: validation.timing_metrics };
    const finalized = await this.store.finalizeJob(completed, event(completed, 'completed', at, { result_hash: resultHash }));
    if (!finalized.applied) {
      if (finalized.job.state === 'completed' && finalized.job.node_id === input.node_id && finalized.job.result_hash === resultHash) return { accepted: true, duplicate: true, job: finalized.job };
      throw Object.assign(new Error('AI_RESULT_ALREADY_FINALIZED'), { code: 'AI_RESULT_ALREADY_FINALIZED' });
    }
    return { accepted: true, duplicate: false, job: finalized.job };
  }

  async expireLeases() {
    const now = nowIso(this.clock);
    const changed = [];
    for (const job of await this.store.listJobs()) {
      if (!['claimed', 'processing'].includes(job.state) || !job.lease_expires_at || job.lease_expires_at > now) continue;
      const terminal = job.expires_at <= now || job.attempt_count >= this.maxAttempts;
      const updated = {
        ...job, state: terminal ? (job.expires_at <= now ? 'expired' : 'failed') : 'queued',
        node_id: terminal ? job.node_id : null, lease_owner: null, lease_token_hash: null,
        lease_expires_at: null, fallback_reason: terminal ? 'lease_exhausted' : null
      };
      changed.push(await this.store.updateJob(updated, event(updated, terminal ? updated.state : 'lease_requeued', now)));
    }
    return changed;
  }

  async markFallback(jobId, reason) {
    const job = await this.store.getJob(jobId);
    if (!job || job.state === 'completed') return job;
    const at = nowIso(this.clock);
    const updated = { ...job, state: 'fallback_used', fallback_reason: String(reason || 'deterministic'), completed_at: at };
    return this.store.updateJob(updated, event(updated, 'fallback_used', at, { reason: updated.fallback_reason }));
  }
}

module.exports = { nowIso, event, AiJobService };

