-- DeliveryOS — fundação da plataforma híbrida
-- Migration 0001. PostgreSQL padrão: nada de extensão proprietária, nada de
-- SDK. Roda em Postgres local, gerenciado ou Supabase sem alteração.
--
-- Convenções aplicadas em todo o arquivo:
--   * TIMESTAMPTZ sempre, nunca TIMESTAMP — o servidor pode estar em UTC e o
--     aparelho em São Paulo, e fundir os dois perde a hora do fato;
--   * occurred_at (mundo real) e recorded_at (nosso relógio) nunca fundidos;
--   * idempotency_key com UNIQUE — a deduplicação é do banco, não do código.

BEGIN;

CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS entregas;
CREATE SCHEMA IF NOT EXISTS sources;
CREATE SCHEMA IF NOT EXISTS orders;
CREATE SCHEMA IF NOT EXISTS crm;
CREATE SCHEMA IF NOT EXISTS copiloto;

-- ------------------------------------------------------------------ --
-- platform: controle de versão do próprio schema
-- ------------------------------------------------------------------ --

CREATE TABLE IF NOT EXISTS platform.schema_migration (
    version      TEXT PRIMARY KEY,
    applied_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    checksum     TEXT NOT NULL
);

-- ------------------------------------------------------------------ --
-- identity: unidades, atores e aparelhos
-- ------------------------------------------------------------------ --

CREATE TABLE IF NOT EXISTS identity.unit (
    unit_id      TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    timezone     TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity.actor (
    actor_id   TEXT PRIMARY KEY,
    unit_id    TEXT NOT NULL REFERENCES identity.unit(unit_id),
    role       TEXT NOT NULL,
    label      TEXT NOT NULL,
    active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT actor_role_valido CHECK (role IN (
        'gerente','lider_delivery','operador_expedicao','motoboy_interno','sistema'
    ))
);

-- Aparelho autorizado. `revoked_at` em vez de DELETE: quem foi revogado
-- precisa continuar existindo para os fatos antigos fazerem sentido.
CREATE TABLE IF NOT EXISTS identity.device (
    device_id     TEXT PRIMARY KEY,
    unit_id       TEXT NOT NULL REFERENCES identity.unit(unit_id),
    actor_id      TEXT REFERENCES identity.actor(actor_id),
    label         TEXT NOT NULL,
    app_version   TEXT,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at  TIMESTAMPTZ,
    revoked_at    TIMESTAMPTZ,
    revoked_by    TEXT
);

CREATE INDEX IF NOT EXISTS device_unit_ativo_idx
    ON identity.device (unit_id) WHERE revoked_at IS NULL;

-- ------------------------------------------------------------------ --
-- platform: inbox — o que entra de fora
-- ------------------------------------------------------------------ --

CREATE TABLE IF NOT EXISTS platform.inbox (
    idempotency_key TEXT PRIMARY KEY,
    unit_id         TEXT NOT NULL,
    source          TEXT NOT NULL,
    kind            TEXT NOT NULL,
    payload         JSONB NOT NULL,
    occurred_at     TIMESTAMPTZ NOT NULL,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    sequence_local  BIGINT,
    device_id       TEXT
);

CREATE INDEX IF NOT EXISTS inbox_device_seq_idx
    ON platform.inbox (device_id, sequence_local);
CREATE INDEX IF NOT EXISTS inbox_recebido_idx
    ON platform.inbox (received_at DESC);

-- ------------------------------------------------------------------ --
-- platform: event log — append-only de verdade
-- ------------------------------------------------------------------ --

CREATE TABLE IF NOT EXISTS platform.event_log (
    event_id        TEXT PRIMARY KEY,
    unit_id         TEXT NOT NULL,
    object_type     TEXT NOT NULL,
    object_id       TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    payload         JSONB NOT NULL,
    occurred_at     TIMESTAMPTZ NOT NULL,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_id        TEXT,
    origin          TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    correlation_id  TEXT,
    causation_id    TEXT,
    clock_trust     TEXT NOT NULL DEFAULT 'trusted',
    contract_version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS event_log_objeto_idx
    ON platform.event_log (object_type, object_id, occurred_at);
CREATE INDEX IF NOT EXISTS event_log_unidade_tempo_idx
    ON platform.event_log (unit_id, occurred_at DESC);

-- Append-only imposto pelo BANCO, não pela disciplina de quem escreve o
-- código. Um UPDATE ou DELETE no event log é sempre defeito, e um defeito
-- silencioso destrói a auditoria inteira.
CREATE OR REPLACE FUNCTION platform.impedir_mutacao_event_log()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'event_log e append-only: % nao e permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS event_log_sem_update ON platform.event_log;
CREATE TRIGGER event_log_sem_update
    BEFORE UPDATE OR DELETE ON platform.event_log
    FOR EACH ROW EXECUTE FUNCTION platform.impedir_mutacao_event_log();

-- ------------------------------------------------------------------ --
-- platform: outbox — o que precisa sair depois do fato
-- ------------------------------------------------------------------ --

CREATE TABLE IF NOT EXISTS platform.outbox (
    outbox_id       TEXT PRIMARY KEY,
    stream          TEXT NOT NULL,
    kind            TEXT NOT NULL,
    payload         JSONB NOT NULL,
    idempotency_key TEXT NOT NULL,
    correlation_id  TEXT,
    state           TEXT NOT NULL DEFAULT 'pending',
    attempts        INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    available_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_at       TIMESTAMPTZ,
    locked_by       TEXT,
    processed_at    TIMESTAMPTZ,
    last_error      TEXT,
    CONSTRAINT outbox_state_valido CHECK (state IN ('pending','processing','done','dead')),
    CONSTRAINT outbox_tentativas_nao_negativas CHECK (attempts >= 0)
);

-- Índice parcial: a fila só pergunta pelo que está pendente e disponível.
-- Sem o WHERE, o índice cresce com o histórico e a consulta desacelera com o
-- tempo, justamente quando há mais volume.
CREATE INDEX IF NOT EXISTS outbox_fila_idx
    ON platform.outbox (available_at, created_at)
    WHERE state = 'pending';

CREATE INDEX IF NOT EXISTS outbox_dead_idx
    ON platform.outbox (created_at DESC) WHERE state = 'dead';

-- ------------------------------------------------------------------ --
-- platform: jobs
-- ------------------------------------------------------------------ --

CREATE TABLE IF NOT EXISTS platform.job (
    job_id           TEXT PRIMARY KEY,
    kind             TEXT NOT NULL,
    payload          JSONB NOT NULL,
    idempotency_key  TEXT NOT NULL UNIQUE,
    state            TEXT NOT NULL DEFAULT 'pending',
    attempts         INTEGER NOT NULL DEFAULT 0,
    max_attempts     INTEGER NOT NULL DEFAULT 8,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    available_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_at        TIMESTAMPTZ,
    locked_by        TEXT,
    lease_expires_at TIMESTAMPTZ,
    processed_at     TIMESTAMPTZ,
    last_error       TEXT,
    CONSTRAINT job_state_valido CHECK (state IN ('pending','running','done','failed','dead'))
);

CREATE INDEX IF NOT EXISTS job_fila_idx
    ON platform.job (available_at, created_at) WHERE state = 'pending';

-- Lease vencido: é por aqui que o job de um worker morto volta para a fila.
CREATE INDEX IF NOT EXISTS job_lease_idx
    ON platform.job (lease_expires_at) WHERE state = 'running';

-- ------------------------------------------------------------------ --
-- platform: auditoria
-- ------------------------------------------------------------------ --

CREATE TABLE IF NOT EXISTS platform.audit (
    audit_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_id   TEXT,
    role       TEXT,
    action     TEXT NOT NULL,
    object_type TEXT,
    object_id  TEXT,
    granted    BOOLEAN NOT NULL,
    detail     JSONB
);

CREATE INDEX IF NOT EXISTS audit_tempo_idx ON platform.audit (at DESC);

-- ------------------------------------------------------------------ --
-- entregas: viagens, paradas e pontos
-- ------------------------------------------------------------------ --

CREATE TABLE IF NOT EXISTS entregas.trip (
    trip_id           TEXT PRIMARY KEY,
    unit_id           TEXT NOT NULL REFERENCES identity.unit(unit_id),
    courier_actor_id  TEXT NOT NULL,
    state             TEXT NOT NULL,
    created_by        TEXT NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL,
    started_at        TIMESTAMPTZ,
    closed_at         TIMESTAMPTZ,
    contract_version  TEXT NOT NULL,
    policy_bundle_id  TEXT
);

CREATE INDEX IF NOT EXISTS trip_unidade_estado_idx
    ON entregas.trip (unit_id, state);
-- Viagem ativa por motoboy: é a consulta do despacho, feita o tempo todo.
CREATE INDEX IF NOT EXISTS trip_motoboy_ativa_idx
    ON entregas.trip (courier_actor_id)
    WHERE state NOT IN ('encerrada', 'cancelada');

CREATE TABLE IF NOT EXISTS entregas.delivery (
    delivery_id        TEXT PRIMARY KEY,
    trip_id            TEXT NOT NULL REFERENCES entregas.trip(trip_id),
    order_ref          TEXT NOT NULL,
    channel            TEXT NOT NULL,
    planned_stop_order INTEGER NOT NULL,
    state              TEXT NOT NULL,
    -- Chegada DETECTADA (sistema) e RELATADA (humano) são fatos diferentes e
    -- moram em colunas diferentes. Fundir as duas faria um toque de dedo
    -- parecer evidência de sensor.
    arrival_detected_at TIMESTAMPTZ,
    arrival_reported_at TIMESTAMPTZ,
    confirmed_at        TIMESTAMPTZ,
    unconfirmed_at      TIMESTAMPTZ,
    active              BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS delivery_trip_idx ON entregas.delivery (trip_id);

CREATE TABLE IF NOT EXISTS entregas.gps_point (
    point_id        TEXT PRIMARY KEY,
    idempotency_key TEXT NOT NULL UNIQUE,
    trip_id         TEXT NOT NULL REFERENCES entregas.trip(trip_id),
    device_id       TEXT NOT NULL,
    latitude        DOUBLE PRECISION NOT NULL,
    longitude       DOUBLE PRECISION NOT NULL,
    accuracy_m      DOUBLE PRECISION NOT NULL,
    speed_mps       DOUBLE PRECISION,
    heading_deg     DOUBLE PRECISION,
    altitude_m      DOUBLE PRECISION,
    occurred_at     TIMESTAMPTZ NOT NULL,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    synced_at       TIMESTAMPTZ,
    source          TEXT NOT NULL,
    quality         TEXT NOT NULL,
    captured_offline BOOLEAN NOT NULL DEFAULT FALSE,
    clock_trust     TEXT NOT NULL,
    sequence_local  BIGINT,
    schema_version  TEXT NOT NULL,
    CONSTRAINT gps_latitude_valida CHECK (latitude BETWEEN -90 AND 90),
    CONSTRAINT gps_longitude_valida CHECK (longitude BETWEEN -180 AND 180),
    CONSTRAINT gps_accuracy_valida CHECK (accuracy_m >= 0)
);

CREATE INDEX IF NOT EXISTS gps_trip_tempo_idx
    ON entregas.gps_point (trip_id, occurred_at);

CREATE TABLE IF NOT EXISTS entregas.occurrence (
    occurrence_id TEXT PRIMARY KEY,
    unit_id       TEXT NOT NULL,
    trip_id       TEXT REFERENCES entregas.trip(trip_id),
    delivery_id   TEXT,
    kind          TEXT NOT NULL,
    state         TEXT NOT NULL,
    opened_at     TIMESTAMPTZ NOT NULL,
    closed_at     TIMESTAMPTZ,
    opened_by     TEXT NOT NULL,
    detail        JSONB
);

CREATE INDEX IF NOT EXISTS occurrence_aberta_idx
    ON entregas.occurrence (unit_id) WHERE closed_at IS NULL;

-- Aceite do termo de localização. Append-only pela mesma razão do event log.
CREATE TABLE IF NOT EXISTS entregas.term_acknowledgement (
    acknowledgement_id    TEXT PRIMARY KEY,
    rider_id              TEXT NOT NULL,
    unit_id               TEXT NOT NULL,
    term_version          TEXT NOT NULL,
    term_material_version TEXT NOT NULL,
    term_hash             TEXT NOT NULL,
    status                TEXT NOT NULL,
    accepted_at           TIMESTAMPTZ NOT NULL,
    recorded_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    device_id             TEXT NOT NULL,
    app_version           TEXT,
    language              TEXT,
    origin                TEXT,
    correlation_id        TEXT,
    schema_version        TEXT NOT NULL,
    CONSTRAINT ack_status_valido CHECK (status IN ('accepted','declined'))
);

CREATE INDEX IF NOT EXISTS ack_rider_hash_idx
    ON entregas.term_acknowledgement (rider_id, term_hash) WHERE status = 'accepted';

-- ------------------------------------------------------------------ --
-- sources: eventos de fontes autorizadas (agente de loja, futuro)
-- ------------------------------------------------------------------ --

CREATE TABLE IF NOT EXISTS sources.source_event (
    source_event_id TEXT PRIMARY KEY,
    unit_id         TEXT NOT NULL,
    source          TEXT NOT NULL,
    kind            TEXT NOT NULL,
    payload         JSONB NOT NULL,
    -- observed_at: quando o agente VIU. occurred_at: quando ACONTECEU na
    -- origem. São diferentes sempre que o agente estava offline.
    observed_at     TIMESTAMPTZ NOT NULL,
    occurred_at     TIMESTAMPTZ,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    sequence_local  BIGINT,
    cursor          TEXT,
    evidence_hash   TEXT,
    idempotency_key TEXT NOT NULL UNIQUE,
    schema_version  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS source_event_unidade_idx
    ON sources.source_event (unit_id, source, observed_at DESC);

-- ------------------------------------------------------------------ --
-- orders: Order Twin
-- ------------------------------------------------------------------ --

CREATE TABLE IF NOT EXISTS orders.order_twin (
    order_twin_id  TEXT PRIMARY KEY,
    unit_id        TEXT NOT NULL,
    order_ref      TEXT NOT NULL,
    channel        TEXT NOT NULL,
    state          TEXT NOT NULL,
    first_seen_at  TIMESTAMPTZ NOT NULL,
    last_seen_at   TIMESTAMPTZ NOT NULL,
    -- Confiança do gêmeo: sem isto, um pedido reconstruído por inferência
    -- pareceria tão firme quanto um lido da fonte.
    confidence     TEXT NOT NULL DEFAULT 'observed',
    payload        JSONB NOT NULL,
    schema_version TEXT NOT NULL,
    CONSTRAINT order_twin_unico UNIQUE (unit_id, channel, order_ref),
    CONSTRAINT order_twin_confianca CHECK (confidence IN ('observed','inferred','unknown'))
);

CREATE INDEX IF NOT EXISTS order_twin_unidade_estado_idx
    ON orders.order_twin (unit_id, state);

COMMIT;
