-- B5 — profundidade da fila offline reportada pelo proprio aparelho.
--
-- Estado tecnico mais recente do dispositivo, NAO evento operacional.
-- O Android envia somente pending_points e pending_events; nenhum device_id,
-- coordenada, trip_id, payload operacional ou PII vem no corpo. O instante
-- abaixo e carimbado pelo servidor.
--
-- Aditiva, nullable e REEXECUTAVEL: aparelhos que nunca reportaram continuam
-- UNKNOWN, e reaplicar o arquivo (redeploy por psql) nao quebra. As
-- constraints sao guardadas por pg_constraint, como na 0003.
--
-- 2026-10-07: o texto de 2026-10-06 adicionava as constraints sem guarda e
-- falhava na segunda aplicacao. O schema resultante e IDENTICO; um banco que
-- aplicou aquele texto e equivalente a este, e o runner aceita SO aquele
-- checksum (tests/migrations/0009_device_offline_queue_depth.texto-2026-10-06.sql):
-- checksum-anterior-equivalente: 5b639bf835be0e16
ALTER TABLE identity.device
  ADD COLUMN IF NOT EXISTS queue_pending_points INTEGER,
  ADD COLUMN IF NOT EXISTS queue_pending_events INTEGER,
  ADD COLUMN IF NOT EXISTS queue_depth_reported_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'device_queue_pending_points_valido'
       AND conrelid = 'identity.device'::regclass
  ) THEN
    ALTER TABLE identity.device
      ADD CONSTRAINT device_queue_pending_points_valido
        CHECK (queue_pending_points IS NULL OR queue_pending_points BETWEEN 0 AND 1000000);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'device_queue_pending_events_valido'
       AND conrelid = 'identity.device'::regclass
  ) THEN
    ALTER TABLE identity.device
      ADD CONSTRAINT device_queue_pending_events_valido
        CHECK (queue_pending_events IS NULL OR queue_pending_events BETWEEN 0 AND 1000000);
  END IF;
END
$$;

COMMENT ON COLUMN identity.device.queue_pending_points IS
  'Pontos GPS ainda pending/failed no telefone na ultima telemetria autenticada; contador agregado, sem coordenadas.';
COMMENT ON COLUMN identity.device.queue_pending_events IS
  'Eventos ainda pending/failed no telefone na ultima telemetria autenticada; contador agregado, sem payload.';
COMMENT ON COLUMN identity.device.queue_depth_reported_at IS
  'Instante do servidor em que os dois contadores de fila foram recebidos.';
