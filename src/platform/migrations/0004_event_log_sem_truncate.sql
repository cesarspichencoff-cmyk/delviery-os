-- =====================================================================
-- 0004 — o append-only do event log cobre TRUNCATE
--
-- A 0001 impôs o append-only pelo BANCO com
--
--   BEFORE UPDATE OR DELETE ON platform.event_log FOR EACH ROW
--
-- e TRUNCATE não dispara trigger de linha. Reproduzido em
-- `run-append-only-tests.ts` (Fase 1, commit 9039cfc): num banco na 0003,
-- UPDATE e DELETE recusados, TRUNCATE aceito sem erro e a tabela vazia. A
-- invariante L3 — o event log é append-only — valia linha a linha e não valia
-- para a tabela inteira. Um gate oficial (backup) dependia desse buraco para
-- montar o próprio fixture.
--
-- Isto CORRIGE uma invariante que já existia. Não decide nada novo: não há
-- purge, retenção nem arquivamento aqui, e continua não existindo caminho
-- oficial para apagar fato.
--
-- O MECANISMO. TRUNCATE só dispara trigger de COMANDO: o PostgreSQL recusa
-- `BEFORE TRUNCATE ... FOR EACH ROW`. A função é a MESMA da 0001,
-- `platform.impedir_mutacao_event_log()`, que já recusa citando `TG_OP` — a
-- mesma regra e a mesma mensagem, agora com "TRUNCATE nao e permitido". Uma
-- segunda função seria um segundo lugar para a regra divergir.
--
-- A 0001 NÃO é editada: ela já foi aplicada e registrada, e reescrever
-- migration aplicada é como o schema fica diferente entre duas máquinas.
--
-- Aditiva e reexecutável: não toca linha nenhuma — histórico com e sem modo
-- fica como está —, e roda de novo sem erro. Sem BEGIN/COMMIT: o runner abre
-- a transação e registra a versão com o checksum real deste arquivo, como na
-- 0003.
--
-- O QUE ELA NÃO IMPEDE: quem é DONO da tabela, ou superusuário, ainda pode
-- desabilitar ou derrubar a trigger. Isso é privilégio de administração, não
-- caminho operacional — medido e classificado em `run-append-only-tests.ts`.
-- =====================================================================

DROP TRIGGER IF EXISTS event_log_sem_truncate ON platform.event_log;
CREATE TRIGGER event_log_sem_truncate
    BEFORE TRUNCATE ON platform.event_log
    FOR EACH STATEMENT EXECUTE FUNCTION platform.impedir_mutacao_event_log();
