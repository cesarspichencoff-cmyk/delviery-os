-- =====================================================================
-- 0010 — procedência do produtor do feed público de Entregas
--
-- O contrato de 16/10/2026 (docs/security/
-- DELIVERYOS_SOURCE_PROVENANCE_RELEASE_GATE_2026-10-16.md) provou que
-- `source_mode`, `source` e `unit_id` do feed são declarações de payload,
-- não identidade. Esta migration dá ao servidor as duas peças que o
-- produtor NÃO controla:
--
--   platform.producer_key        quem pode produzir, para qual unidade,
--                                quais tipos e quais modos; vida da chave.
--   platform.producer_admission  o que a fronteira decidiu sobre cada
--                                registro: admitido ou quarentena, e por quê.
--
-- E a coluna em que a atestação viaja: entregas.public_outbox.attestation.
--
-- `real` NÃO é concedível: o CHECK de allowed_modes só aceita simulated e
-- control. Não existe autoridade de mundo provada para nenhum produtor;
-- abrir isso exige decisão do César, prova de fonte real e OUTRA migration.
--
-- Revogação é de mão única: a única mudança aceita numa chave é
-- revoked_at NULL -> valor. Rotação é linha nova (novo key_id). Nada se
-- apaga. A admissão é append-only, inclusive contra TRUNCATE (lição da 0004).
--
-- Aditiva e reexecutável. Sem BEGIN/COMMIT: o runner abre a transação e
-- registra a versão com o checksum deste arquivo. Dono e superusuário ainda
-- podem desligar triggers — privilégio de administração, não caminho
-- operacional (mesmo limite declarado na 0004).
-- =====================================================================

CREATE TABLE IF NOT EXISTS platform.producer_key (
  producer_id TEXT NOT NULL CHECK (producer_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  key_id TEXT NOT NULL CHECK (key_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  unit_id TEXT NOT NULL REFERENCES identity.unit(unit_id),
  public_key BYTEA NOT NULL UNIQUE CHECK (octet_length(public_key) = 32),
  allowed_event_types TEXT[] NOT NULL CHECK (cardinality(allowed_event_types) >= 1),
  allowed_modes TEXT[] NOT NULL CHECK (
    cardinality(allowed_modes) >= 1
    AND allowed_modes <@ ARRAY['simulated','control']::TEXT[]
  ),
  not_before TIMESTAMPTZ NOT NULL,
  not_after TIMESTAMPTZ NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  registered_by TEXT NOT NULL CHECK (length(registered_by) BETWEEN 1 AND 128),
  revoked_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoked_reason TEXT,
  PRIMARY KEY (producer_id, key_id),
  CONSTRAINT producer_key_validade CHECK (not_after > not_before),
  CONSTRAINT producer_key_revogacao_completa CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL AND revoked_reason IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revoked_reason IS NOT NULL)
  )
);

CREATE OR REPLACE FUNCTION platform.producer_key_so_revoga()
RETURNS TRIGGER AS $$
BEGIN
  -- Só UPDATE chega a olhar a linha: DELETE e TRUNCATE (por comando, sem
  -- linha) caem direto na recusa.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.revoked_at IS NULL
       AND NEW.revoked_at IS NOT NULL
       AND (NEW.producer_id, NEW.key_id, NEW.unit_id, NEW.public_key,
            NEW.allowed_event_types, NEW.allowed_modes, NEW.not_before,
            NEW.not_after, NEW.registered_at, NEW.registered_by)
           IS NOT DISTINCT FROM
           (OLD.producer_id, OLD.key_id, OLD.unit_id, OLD.public_key,
            OLD.allowed_event_types, OLD.allowed_modes, OLD.not_before,
            OLD.not_after, OLD.registered_at, OLD.registered_by)
    THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'platform.producer_key so aceita revogacao de mao unica: % nao e permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS producer_key_so_revoga ON platform.producer_key;
CREATE TRIGGER producer_key_so_revoga
  BEFORE UPDATE OR DELETE ON platform.producer_key
  FOR EACH ROW EXECUTE FUNCTION platform.producer_key_so_revoga();

DROP TRIGGER IF EXISTS producer_key_sem_truncate ON platform.producer_key;
CREATE TRIGGER producer_key_sem_truncate
  BEFORE TRUNCATE ON platform.producer_key
  FOR EACH STATEMENT EXECUTE FUNCTION platform.producer_key_so_revoga();

CREATE TABLE IF NOT EXISTS platform.producer_admission (
  seq BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  decision TEXT NOT NULL CHECK (decision IN ('admitted','quarantined')),
  reason TEXT NOT NULL CHECK (reason ~ '^[a-z_]{3,64}$'),
  -- Em quarentena todo identificador abaixo é DECLARADO, não provado.
  producer_id TEXT,
  key_id TEXT,
  nonce TEXT,
  unit_id TEXT,
  event_id TEXT,
  event_type TEXT,
  declared_mode TEXT,
  assigned_mode TEXT,
  envelope_sha256 TEXT NOT NULL CHECK (envelope_sha256 ~ '^[0-9a-f]{64}$'),
  source_ref TEXT NOT NULL CHECK (length(source_ref) BETWEEN 1 AND 256),
  received_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT producer_admission_modo_atribuido CHECK (
    assigned_mode IS NULL OR assigned_mode IN ('simulated','control')
  ),
  CONSTRAINT producer_admission_admitida_completa CHECK (
    decision <> 'admitted' OR (
      reason = 'atestacao_verificada'
      AND producer_id IS NOT NULL AND key_id IS NOT NULL AND nonce IS NOT NULL
      AND unit_id IS NOT NULL AND event_id IS NOT NULL AND event_type IS NOT NULL
      AND assigned_mode IS NOT NULL
    )
  ),
  CONSTRAINT producer_admission_quarentena_sem_modo CHECK (
    decision <> 'quarantined' OR assigned_mode IS NULL
  )
);

-- Uma decisão por registro de origem e bytes: releitura depois de queda é
-- idempotente, nunca "replay".
CREATE UNIQUE INDEX IF NOT EXISTS producer_admission_releitura
  ON platform.producer_admission (source_ref, envelope_sha256);
-- Antirreplay durável: nonce e event_id de um produtor admitem uma vez.
CREATE UNIQUE INDEX IF NOT EXISTS producer_admission_nonce
  ON platform.producer_admission (producer_id, nonce)
  WHERE decision = 'admitted';
CREATE UNIQUE INDEX IF NOT EXISTS producer_admission_evento
  ON platform.producer_admission (producer_id, event_id)
  WHERE decision = 'admitted';

CREATE OR REPLACE FUNCTION platform.impedir_mutacao_producer_admission()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'platform.producer_admission e append-only: % nao e permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS producer_admission_sem_update ON platform.producer_admission;
CREATE TRIGGER producer_admission_sem_update
  BEFORE UPDATE OR DELETE ON platform.producer_admission
  FOR EACH ROW EXECUTE FUNCTION platform.impedir_mutacao_producer_admission();

DROP TRIGGER IF EXISTS producer_admission_sem_truncate ON platform.producer_admission;
CREATE TRIGGER producer_admission_sem_truncate
  BEFORE TRUNCATE ON platform.producer_admission
  FOR EACH STATEMENT EXECUTE FUNCTION platform.impedir_mutacao_producer_admission();

ALTER TABLE entregas.public_outbox
  ADD COLUMN IF NOT EXISTS attestation TEXT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'entregas_public_outbox_attestation_tamanho'
  ) THEN
    ALTER TABLE entregas.public_outbox
      ADD CONSTRAINT entregas_public_outbox_attestation_tamanho
      CHECK (attestation IS NULL OR length(attestation) BETWEEN 1 AND 32768);
  END IF;
END;
$$;
