'use strict';

const POSTGRES_MIGRATION = `
CREATE TABLE IF NOT EXISTS conversation_ai_node (
  node_id text PRIMARY KEY,
  unit_id text NOT NULL,
  public_key_pem text NOT NULL,
  public_key_fingerprint text NOT NULL UNIQUE,
  credential_hash text NOT NULL,
  credential_version integer NOT NULL CHECK (credential_version > 0),
  state text NOT NULL CHECK (state IN ('pending','active','maintenance','degraded','revoked','blocked')),
  allowed_models jsonb NOT NULL DEFAULT '[]'::jsonb,
  version text NOT NULL,
  last_heartbeat_at timestamptz,
  registered_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_ai_node_event (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  node_id text NOT NULL,
  type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  event jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_ai_install_code (
  code_hash text PRIMARY KEY,
  unit_id text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE TABLE IF NOT EXISTS conversation_ai_nonce (
  node_id text NOT NULL,
  nonce text NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (node_id, nonce)
);

CREATE TABLE IF NOT EXISTS conversation_ai_job (
  job_id text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  state text NOT NULL CHECK (state IN ('queued','claimed','processing','completed','rejected','expired','failed','fallback_used')),
  requested_model text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  lease_owner text,
  lease_expires_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  result_hash text,
  record jsonb NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS conversation_ai_job_one_result
  ON conversation_ai_job (job_id, result_hash) WHERE result_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS conversation_ai_job_claimable
  ON conversation_ai_job (created_at, job_id) WHERE state = 'queued';

CREATE TABLE IF NOT EXISTS conversation_ai_job_event (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id text NOT NULL UNIQUE,
  job_id text NOT NULL REFERENCES conversation_ai_job(job_id),
  type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  event jsonb NOT NULL
);

CREATE OR REPLACE FUNCTION deliveryos_forbid_ai_event_update() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'append_only_table'; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS conversation_ai_job_event_append_only ON conversation_ai_job_event;
CREATE TRIGGER conversation_ai_job_event_append_only BEFORE UPDATE OR DELETE ON conversation_ai_job_event
FOR EACH ROW EXECUTE FUNCTION deliveryos_forbid_ai_event_update();

DROP TRIGGER IF EXISTS conversation_ai_node_event_append_only ON conversation_ai_node_event;
CREATE TRIGGER conversation_ai_node_event_append_only BEFORE UPDATE OR DELETE ON conversation_ai_node_event
FOR EACH ROW EXECUTE FUNCTION deliveryos_forbid_ai_event_update();
`;

class PostgresAiBridgeStore {
  constructor(options = {}) {
    if (typeof options.query !== 'function') throw Object.assign(new Error('POSTGRES_QUERY_REQUIRED'), { code: 'POSTGRES_QUERY_REQUIRED' });
    this.query = options.query;
    this.transaction = options.transaction || (async (work) => work(this.query));
  }

  async migrate() { return this.query(POSTGRES_MIGRATION); }

  async putInstallCode(record) {
    await this.query(`INSERT INTO conversation_ai_install_code(code_hash,unit_id,created_at,expires_at,used_at)
      VALUES($1,$2,$3,$4,$5)`, [record.code_hash, record.unit_id, record.created_at, record.expires_at, record.used_at]);
    return record;
  }

  async consumeInstallCode(codeHash, usedAt) {
    const result = await this.query(`UPDATE conversation_ai_install_code SET used_at=$2
      WHERE code_hash=$1 AND used_at IS NULL AND expires_at>$2 RETURNING *`, [codeHash, usedAt]);
    return result.rows?.[0] || null;
  }

  async putNode(node) {
    await this.query(`INSERT INTO conversation_ai_node(node_id,unit_id,public_key_pem,public_key_fingerprint,credential_hash,credential_version,state,allowed_models,version,last_heartbeat_at,registered_at,updated_at,record)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT(node_id) DO UPDATE SET credential_hash=EXCLUDED.credential_hash,credential_version=EXCLUDED.credential_version,state=EXCLUDED.state,allowed_models=EXCLUDED.allowed_models,version=EXCLUDED.version,last_heartbeat_at=EXCLUDED.last_heartbeat_at,updated_at=EXCLUDED.updated_at,record=EXCLUDED.record`,
    [node.node_id, node.unit_id, node.public_key_pem, node.public_key_fingerprint, node.credential_hash, node.credential_version, node.state, JSON.stringify(node.allowed_models || []), node.version, node.last_heartbeat_at, node.registered_at, node.updated_at, JSON.stringify(node)]);
    return node;
  }

  async getNode(nodeId) {
    const result = await this.query('SELECT record FROM conversation_ai_node WHERE node_id=$1', [nodeId]);
    return result.rows?.[0]?.record || null;
  }

  async appendNodeEvent(event) {
    await this.query('INSERT INTO conversation_ai_node_event(node_id,type,occurred_at,event) VALUES($1,$2,$3,$4)', [event.node_id, event.type, event.occurred_at, JSON.stringify(event)]);
    return event;
  }

  async useNonce(nodeId, nonce, expiresAt) {
    const result = await this.query(`INSERT INTO conversation_ai_nonce(node_id,nonce,expires_at) VALUES($1,$2,$3)
      ON CONFLICT DO NOTHING RETURNING nonce`, [nodeId, nonce, expiresAt]);
    return result.rowCount === 1;
  }

  async createJob(job, event) {
    return this.transaction(async (query) => {
      const result = await query(`INSERT INTO conversation_ai_job(job_id,idempotency_key,state,requested_model,created_at,expires_at,lease_owner,lease_expires_at,attempt_count,result_hash,record)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT(idempotency_key) DO NOTHING RETURNING record`,
      [job.job_id, job.idempotency_key, job.state, job.requested_model, job.created_at, job.expires_at, job.lease_owner, job.lease_expires_at, job.attempt_count, job.result_hash, JSON.stringify(job)]);
      if (result.rowCount === 1) {
        await query('INSERT INTO conversation_ai_job_event(event_id,job_id,type,occurred_at,event) VALUES($1,$2,$3,$4,$5)', [event.event_id, event.job_id, event.type, event.occurred_at, JSON.stringify(event)]);
        return { created: true, job };
      }
      const existing = await query('SELECT record FROM conversation_ai_job WHERE idempotency_key=$1', [job.idempotency_key]);
      return { created: false, job: existing.rows[0].record };
    });
  }

  async getJob(jobId) {
    const result = await this.query('SELECT record FROM conversation_ai_job WHERE job_id=$1', [jobId]);
    return result.rows?.[0]?.record || null;
  }

  async getJobByIdempotency(key) {
    const result = await this.query('SELECT record FROM conversation_ai_job WHERE idempotency_key=$1', [key]);
    return result.rows?.[0]?.record || null;
  }

  async updateJob(job, event) {
    return this.transaction(async (query) => {
      const result = await query(`UPDATE conversation_ai_job SET state=$2,lease_owner=$3,lease_expires_at=$4,attempt_count=$5,result_hash=$6,record=$7
        WHERE job_id=$1 RETURNING record`, [job.job_id, job.state, job.lease_owner, job.lease_expires_at, job.attempt_count, job.result_hash, JSON.stringify(job)]);
      if (result.rowCount !== 1) throw Object.assign(new Error('AI_JOB_NOT_FOUND'), { code: 'AI_JOB_NOT_FOUND' });
      if (event) await query('INSERT INTO conversation_ai_job_event(event_id,job_id,type,occurred_at,event) VALUES($1,$2,$3,$4,$5)', [event.event_id, event.job_id, event.type, event.occurred_at, JSON.stringify(event)]);
      return job;
    });
  }

  async finalizeJob(job, event) {
    return this.transaction(async (query) => {
      const result = await query(`UPDATE conversation_ai_job SET state=$2,lease_owner=$3,lease_expires_at=$4,attempt_count=$5,result_hash=$6,record=$7
        WHERE job_id=$1 AND state IN ('claimed','processing') RETURNING record`, [job.job_id, job.state, job.lease_owner, job.lease_expires_at, job.attempt_count, job.result_hash, JSON.stringify(job)]);
      if (result.rowCount === 1) {
        await query('INSERT INTO conversation_ai_job_event(event_id,job_id,type,occurred_at,event) VALUES($1,$2,$3,$4,$5)', [event.event_id, event.job_id, event.type, event.occurred_at, JSON.stringify(event)]);
        return { applied: true, job };
      }
      const existing = await query('SELECT record FROM conversation_ai_job WHERE job_id=$1', [job.job_id]);
      if (!existing.rowCount) throw Object.assign(new Error('AI_JOB_NOT_FOUND'), { code: 'AI_JOB_NOT_FOUND' });
      return { applied: false, job: existing.rows[0].record };
    });
  }


  async claimNext(criteria) {
    return this.transaction(async (query) => {
      const result = await query(`SELECT job_id,record FROM conversation_ai_job
        WHERE state='queued' AND expires_at>$1 AND requested_model=ANY($2::text[])
        ORDER BY created_at,job_id FOR UPDATE SKIP LOCKED LIMIT 1`, [criteria.now, criteria.models]);
      if (!result.rowCount) return null;
      const current = result.rows[0].record;
      const updated = { ...current, state: 'claimed', node_id: criteria.node_id, lease_owner: criteria.node_id, lease_token_hash: criteria.lease_token_hash, lease_expires_at: criteria.lease_expires_at, claimed_at: criteria.now, attempt_count: current.attempt_count + 1 };
      const event = criteria.event(updated);
      await query('UPDATE conversation_ai_job SET state=$2,lease_owner=$3,lease_expires_at=$4,attempt_count=$5,record=$6 WHERE job_id=$1', [updated.job_id, updated.state, updated.lease_owner, updated.lease_expires_at, updated.attempt_count, JSON.stringify(updated)]);
      await query('INSERT INTO conversation_ai_job_event(event_id,job_id,type,occurred_at,event) VALUES($1,$2,$3,$4,$5)', [event.event_id, event.job_id, event.type, event.occurred_at, JSON.stringify(event)]);
      return updated;
    });
  }

  async listJobs() {
    const result = await this.query('SELECT record FROM conversation_ai_job ORDER BY created_at,job_id');
    return result.rows.map((row) => row.record);
  }

  async eventsForJob(jobId) {
    const result = await this.query('SELECT event FROM conversation_ai_job_event WHERE job_id=$1 ORDER BY sequence', [jobId]);
    return result.rows.map((row) => row.event);
  }
}

module.exports = { POSTGRES_MIGRATION, PostgresAiBridgeStore };
