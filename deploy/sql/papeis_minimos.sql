-- =====================================================================
-- Papéis MÍNIMOS dos runtimes do DeliveryOS — a matriz, executável.
--
-- Hoje a composição oficial conecta migrate, crítico e assíncrono como
-- POSTGRES_USER, que a imagem do PostgreSQL cria SUPERUSUÁRIO: o runtime pode
-- desligar a trava do event log, apagar tabela, revogar aparelho. Nada no
-- código faz isso — mas "nada faz" não é "nada pode".
--
-- Este arquivo é o INVENTÁRIO do que cada processo executa de fato (medido
-- estatement a statement em pg-repositories.ts, critical.ts, async-runtime.ts,
-- rota-sessao.ts e a porta de replay), como GRANT. Ele NÃO é aplicado pela
-- composição — ligar a composição a estes papéis é a próxima fronteira, fora
-- desta missão. É PROVADO por `test:platform:cadeia` (seção P): o crítico e o
-- assíncrono sobem com estes papéis, a cadeia inteira passa, e as sabotagens
-- que o dono consegue (desligar trigger, apagar fato, revogar aparelho) são
-- recusadas por PRIVILÉGIO — antes de qualquer trigger.
--
-- Quem aplica migration (DDL) continua sendo o DONO do schema: o serviço
-- `deliveryos-migrate`. Runtime nunca é dono.
--
-- Idempotente: cada CREATE ROLE é guardado; GRANT repetido é no-op.
-- Senhas ficam FORA daqui (ALTER ROLE ... PASSWORD pelo operador).
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
