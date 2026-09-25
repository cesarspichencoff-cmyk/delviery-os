-- =====================================================================
-- Papéis MÍNIMOS dos runtimes do DeliveryOS — a matriz, executável.
--
-- Até a certificação da Cadeia Real, a composição oficial conectava migrate,
-- crítico e assíncrono como POSTGRES_USER, que a imagem do PostgreSQL cria
-- SUPERUSUÁRIO: o runtime podia desligar a trava do event log, apagar tabela,
-- revogar aparelho. Nada no código fazia isso — mas "nada faz" não é "nada
-- pode".
--
-- Este arquivo é o INVENTÁRIO do que cada processo executa de fato (medido
-- estatement a statement em pg-repositories.ts, critical.ts, async-runtime.ts,
-- rota-sessao.ts e a porta de replay), como GRANT. É PROVADO por
-- `test:platform:cadeia` (seção P): o crítico e o assíncrono sobem com estes
-- papéis, a cadeia inteira passa, e as sabotagens que o dono consegue
-- (desligar trigger, apagar fato, revogar aparelho) são recusadas por
-- PRIVILÉGIO — antes de qualquer trigger.
--
-- A composição oficial APLICA este arquivo (certificação, 2026-09-25): o job
-- `deliveryos-papeis` roda como dono depois da migration, a cada subida, e em
-- seguida `senhas_dos_papeis.sql`. O crítico e o assíncrono conectam com
-- estes papéis; em containers reais, `tools/papeis_compose_real.sh`.
--
-- Quem aplica migration (DDL) continua sendo o DONO do schema: o serviço
-- `deliveryos-migrate`. Runtime nunca é dono.
--
-- Idempotente: cada CREATE ROLE é guardado; GRANT repetido é no-op.
-- Senhas ficam FORA daqui: `senhas_dos_papeis.sql` as lê do ambiente.
-- =====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'deliveryos_critical') THEN
    CREATE ROLE deliveryos_critical LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'deliveryos_async') THEN
    CREATE ROLE deliveryos_async LOGIN;
  END IF;
END $$;

-- ------------------------------------------------------------- CRÍTICO
-- Lê configuração, sobe HTTP, autentica aparelho, grava fato + mensagem.
GRANT USAGE ON SCHEMA platform, identity TO deliveryos_critical;

-- event log: só INSERT (e SELECT para `existingKeys`). Nunca UPDATE/DELETE/
-- TRUNCATE: a trava recusa, e o privilégio recusa ANTES da trava.
GRANT SELECT, INSERT ON platform.event_log TO deliveryos_critical;
-- outbox: enfileira (INSERT) e conta pendentes para /health (SELECT).
GRANT SELECT, INSERT ON platform.outbox TO deliveryos_critical;
-- inbox: idempotência de ingestão.
GRANT SELECT, INSERT ON platform.inbox TO deliveryos_critical;
-- auditoria: só escreve (emissão de sessão). audit_id é IDENTITY → sequência.
GRANT INSERT ON platform.audit TO deliveryos_critical;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA platform TO deliveryos_critical;
-- aparelhos: lê o cadastro; escreve SÓ as colunas do vínculo e da sessão.
-- Revogar (revoked_at, revoked_by) e cadastrar (INSERT) são atos humanos:
-- o runtime não pode, por privilégio.
GRANT SELECT ON identity.device TO deliveryos_critical;
GRANT UPDATE (secret_hash, secret_bound_at, last_session_at, last_seen_at, app_version)
  ON identity.device TO deliveryos_critical;
-- sonda de escrita do /ready (`probe:escrita`) e `migrate_on_boot` em local.
-- Em produção migrate_on_boot é falso: a sonda ainda escreve aqui.
GRANT SELECT, INSERT, UPDATE ON platform.schema_migration TO deliveryos_critical;

-- ---------------------------------------------------------- ASSÍNCRONO
-- Replay no boot (lê o log), consome a outbox, executa jobs, audita requeue.
GRANT USAGE ON SCHEMA platform TO deliveryos_async;
GRANT SELECT ON platform.event_log TO deliveryos_async;
GRANT SELECT, UPDATE ON platform.outbox TO deliveryos_async;
GRANT SELECT, INSERT, UPDATE ON platform.job TO deliveryos_async;
GRANT INSERT ON platform.audit TO deliveryos_async;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA platform TO deliveryos_async;
GRANT SELECT ON platform.schema_migration TO deliveryos_async;
