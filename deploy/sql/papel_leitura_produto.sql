-- ============================================================================
-- Papel SOMENTE LEITURA do servidor de apresentação (Product System: Copiloto,
-- Entregas, fila observada) — Q-028.
-- ============================================================================
-- Quem lê a plataforma não escreve nela. O servidor de apresentação já recusa
-- todo método que não seja GET/HEAD; este papel torna a mesma garantia
-- estrutural no PostgreSQL: SELECT apenas, e apenas nas colunas que as leituras
-- usam. Fica de fora o segredo do aparelho (`identity.device.secret_hash`) e o
-- rótulo do pedido (`entregas.ready_order.label`, pode ter endereço).
--
-- NÃO faz parte do job oficial de papéis (`papeis_minimos.sql`): aplicar num
-- banco de operação ou de ensaio é decisão humana. A senha nunca mora aqui:
--   ALTER ROLE deliveryos_leitura PASSWORD '<gerada no host>';
-- Idempotente: CREATE guardado; GRANT repetido é no-op.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'deliveryos_leitura') THEN
    CREATE ROLE deliveryos_leitura LOGIN;
  END IF;
END
$$;

ALTER ROLE deliveryos_leitura NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

GRANT USAGE ON SCHEMA platform, identity, entregas TO deliveryos_leitura;

-- Fatos: as leituras da realidade, do histórico e do pronto.
GRANT SELECT ON platform.event_log TO deliveryos_leitura;

-- Cadastro de aparelhos: exatamente as colunas que a porta de realidade lê.
GRANT SELECT (device_id, unit_id, actor_id, label, registered_at, secret_bound_at,
              last_session_at, app_version, revoked_at,
              queue_pending_points, queue_pending_events, queue_depth_reported_at)
  ON identity.device TO deliveryos_leitura;

-- Fila em PostgreSQL, quando ela é a autoridade declarada da unidade: sem rótulo.
GRANT SELECT (unit_id, order_ref, channel, created_at) ON entregas.ready_order TO deliveryos_leitura;
