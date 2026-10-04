-- =====================================================================
-- 0009 — estado efêmero do aparelho: profundidade da fila local
--
-- B5: o Android já mede pending_points / pending_events / rejected_points
-- no Room, mas o servidor não tinha onde guardar o ÚLTIMO estado reportado.
--
-- Isto NÃO entra no event log: profundidade de fila é telemetria efêmera,
-- não fato operacional histórico. A tabela guarda uma linha por aparelho.
-- Nenhuma coordenada, payload de evento ou conteúdo da fila atravessa.
-- =====================================================================

CREATE TABLE IF NOT EXISTS identity.device_runtime_status (
    device_id        TEXT PRIMARY KEY REFERENCES identity.device(device_id),
    reported_at      TIMESTAMPTZ NOT NULL,
    source_mode      TEXT NOT NULL,
    pending_points   INTEGER NOT NULL,
    pending_events   INTEGER NOT NULL,
    rejected_points  INTEGER NOT NULL,
    CONSTRAINT device_runtime_status_source_mode_valid
      CHECK (source_mode IN ('real','simulated','control')),
    CONSTRAINT device_runtime_status_pending_points_nonnegative
      CHECK (pending_points >= 0 AND pending_points <= 1000000),
    CONSTRAINT device_runtime_status_pending_events_nonnegative
      CHECK (pending_events >= 0 AND pending_events <= 1000000),
    CONSTRAINT device_runtime_status_rejected_points_nonnegative
      CHECK (rejected_points >= 0 AND rejected_points <= 1000000)
);

COMMENT ON TABLE identity.device_runtime_status IS
  'Ultimo estado efemero reportado pelo aparelho. Sem coordenadas e sem payload de fila.';
COMMENT ON COLUMN identity.device_runtime_status.reported_at IS
  'Horario do servidor em que o status autenticado foi recebido.';
