-- =====================================================================
-- Leitor mínimo do DeliveryOS Product System.
--
-- Este papel é aplicado pelo job opt-in `deliveryos-product-reader-setup`
-- do profile `product`; o runtime crítico não depende deste papel.
-- Ele existe para a superfície read-only do Product System consultar somente
-- a realidade necessária, sem usar owner/superuser nem enxergar secret_hash.
--
-- Sem senha no repositório. Credencial é efeito de implantação.
-- =====================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'deliveryos_product_reader'
  ) THEN
    CREATE ROLE deliveryos_product_reader LOGIN NOINHERIT;
  END IF;
END $$;

-- Reaplicação corrige drift de privilégios antigos.
REVOKE ALL PRIVILEGES ON SCHEMA identity, platform
  FROM deliveryos_product_reader;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA identity, platform
  FROM deliveryos_product_reader;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA identity, platform
  FROM deliveryos_product_reader;

GRANT USAGE ON SCHEMA identity, platform
  TO deliveryos_product_reader;

-- Navegação multi-unidade.
GRANT SELECT (unit_id, display_name, timezone, active)
  ON identity.unit
  TO deliveryos_product_reader;

-- Estado administrativo do aparelho. secret_hash é deliberadamente ausente.
GRANT SELECT (
  device_id,
  unit_id,
  actor_id,
  label,
  registered_at,
  secret_bound_at,
  last_session_at,
  app_version,
  revoked_at
)
  ON identity.device
  TO deliveryos_product_reader;

-- Última telemetria efêmera da fila local.
GRANT SELECT (
  device_id,
  reported_at,
  source_mode,
  pending_points,
  pending_events,
  rejected_points
)
  ON identity.device_runtime_status
  TO deliveryos_product_reader;

-- A projeção e o histórico precisam do envelope completo do fato, inclusive
-- payload interno. O Product System não devolve payload bruto na API.
GRANT SELECT ON platform.event_log
  TO deliveryos_product_reader;
