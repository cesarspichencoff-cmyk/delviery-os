-- B5 — profundidade da fila offline reportada pelo proprio aparelho.
--
-- Estado tecnico mais recente do dispositivo, NAO evento operacional.
-- O Android envia somente pending_points e pending_events; nenhum device_id,
-- coordenada, trip_id, payload operacional ou PII vem no corpo. O instante
-- abaixo e carimbado pelo servidor.
--
-- Aditiva e nullable: aparelhos que nunca reportaram continuam UNKNOWN.
ALTER TABLE identity.device
  ADD COLUMN IF NOT EXISTS queue_pending_points INTEGER,
  ADD COLUMN IF NOT EXISTS queue_pending_events INTEGER,
  ADD COLUMN IF NOT EXISTS queue_depth_reported_at TIMESTAMPTZ;

ALTER TABLE identity.device
  ADD CONSTRAINT device_queue_pending_points_valido
    CHECK (queue_pending_points IS NULL OR queue_pending_points BETWEEN 0 AND 1000000),
  ADD CONSTRAINT device_queue_pending_events_valido
    CHECK (queue_pending_events IS NULL OR queue_pending_events BETWEEN 0 AND 1000000);

COMMENT ON COLUMN identity.device.queue_pending_points IS
  'Pontos GPS ainda pending/failed no telefone na ultima telemetria autenticada; contador agregado, sem coordenadas.';
COMMENT ON COLUMN identity.device.queue_pending_events IS
  'Eventos ainda pending/failed no telefone na ultima telemetria autenticada; contador agregado, sem payload.';
COMMENT ON COLUMN identity.device.queue_depth_reported_at IS
  'Instante do servidor em que os dois contadores de fila foram recebidos.';
