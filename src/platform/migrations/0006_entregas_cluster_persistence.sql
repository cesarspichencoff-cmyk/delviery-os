-- Entregas — persistência operacional cluster-safe.
-- Completa o schema normalizado que já existia desde 0001; não cria
-- state_store paralelo nem segunda verdade.
BEGIN;

ALTER TABLE entregas.trip
  ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS close_mode TEXT,
  ADD COLUMN IF NOT EXISTS last_event_id TEXT,
  ADD COLUMN IF NOT EXISTS return_evidence JSONB,
  ADD COLUMN IF NOT EXISTS manual_close_reason TEXT,
  ADD COLUMN IF NOT EXISTS manual_close_actor TEXT,
  ADD COLUMN IF NOT EXISTS state_before_signal_loss TEXT;

ALTER TABLE entregas.delivery
  ADD COLUMN IF NOT EXISTS actual_stop_order INTEGER,
  ADD COLUMN IF NOT EXISTS unconfirmed_trigger TEXT,
  ADD COLUMN IF NOT EXISTS occurrence_id TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT,
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_reason TEXT,
  ADD COLUMN IF NOT EXISTS removed_by TEXT;

ALTER TABLE entregas.occurrence
  ADD COLUMN IF NOT EXISTS source_channel TEXT,
  ADD COLUMN IF NOT EXISTS report TEXT,
  ADD COLUMN IF NOT EXISTS hypothesis TEXT,
  ADD COLUMN IF NOT EXISTS promised_action TEXT,
  ADD COLUMN IF NOT EXISTS executed_action TEXT,
  ADD COLUMN IF NOT EXISTS evidence TEXT,
  ADD COLUMN IF NOT EXISTS owner_role TEXT,
  ADD COLUMN IF NOT EXISTS confirmation TEXT,
  ADD COLUMN IF NOT EXISTS blocks_availability BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS closed_by TEXT,
  ADD COLUMN IF NOT EXISTS contract_version TEXT,
  ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS entregas.handoff (
  handoff_id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL,
  external_order_ref TEXT NOT NULL,
  external_courier_ref TEXT,
  state TEXT NOT NULL,
  arrived_at TIMESTAMPTZ,
  conference_actor TEXT,
  handoff_actor TEXT,
  volumes JSONB,
  integrity_ok BOOLEAN,
  courier_verified BOOLEAN NOT NULL,
  courier_verification_method TEXT,
  handoff_at TIMESTAMPTZ,
  confirmed BOOLEAN NOT NULL,
  exception TEXT,
  contract_version TEXT NOT NULL,
  version BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS handoff_unit_state_idx
  ON entregas.handoff(unit_id, state);

CREATE TABLE IF NOT EXISTS entregas.rider_state (
  rider_id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL,
  availability TEXT NOT NULL,
  occurrence_blocking_availability BOOLEAN NOT NULL,
  active_trip_id TEXT,
  version BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS rider_state_unit_idx
  ON entregas.rider_state(unit_id, availability);

CREATE TABLE IF NOT EXISTS entregas.domain_event (
  seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  event_id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ,
  origin TEXT NOT NULL,
  device_id TEXT,
  actor_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  clock_trust TEXT NOT NULL,
  contract_version TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS domain_event_object_idx
  ON entregas.domain_event(unit_id, object_type, object_id, seq);

CREATE OR REPLACE FUNCTION entregas.impedir_mutacao_domain_event()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'entregas.domain_event e append-only: % nao e permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS domain_event_sem_update ON entregas.domain_event;
CREATE TRIGGER domain_event_sem_update
  BEFORE UPDATE OR DELETE ON entregas.domain_event
  FOR EACH ROW EXECUTE FUNCTION entregas.impedir_mutacao_domain_event();

CREATE TABLE IF NOT EXISTS entregas.public_outbox (
  seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  outbox_id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  event JSONB NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  published_at TIMESTAMPTZ,
  CONSTRAINT entregas_public_outbox_status CHECK (
    status IN ('pending','published','failed','dead_letter')
  ),
  CONSTRAINT entregas_public_outbox_attempts CHECK (attempts >= 0)
);
CREATE INDEX IF NOT EXISTS public_outbox_unit_seq_idx
  ON entregas.public_outbox(unit_id, seq);
CREATE INDEX IF NOT EXISTS public_outbox_pending_idx
  ON entregas.public_outbox(unit_id, seq)
  WHERE status IN ('pending','failed');

COMMIT;
