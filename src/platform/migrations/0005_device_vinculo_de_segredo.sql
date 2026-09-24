-- =====================================================================
-- 0005 — o aparelho prova que é ele: vínculo de segredo em identity.device
--
-- Até aqui, nenhum caminho oficial emitia token de aparelho. O Android
-- chamava `POST /api/device/session` esperando `device_token`; o runtime
-- crítico respondia 404, e o servidor do piloto antigo respondia 200 sem
-- token. Reproduzido em `run-cadeia-real-tests.ts` (A1, A2) antes de fechar.
--
-- O DESENHO. O humano AUTORIZA o aparelho (a linha em identity.device, com
-- unidade e ator). O aparelho gera, no primeiro boot, um segredo próprio que
-- nunca sai dele a não ser no bootstrap. No PRIMEIRO contato de um aparelho
-- autorizado, o servidor guarda o hash desse segredo (vínculo por primeiro
-- uso); daí em diante só quem apresenta o mesmo segredo recebe token para
-- aquele device_id. O device_id sozinho — que aparece em log, no event log e
-- na tela — deixa de valer como credencial.
--
-- Aditiva: três colunas, nenhuma linha alterada, nenhuma constraint que
-- reprove histórico. Reexecutável (IF NOT EXISTS). Sem BEGIN/COMMIT: o
-- runner abre a transação e registra o checksum, como na 0003 e na 0004.
--
-- O que ela NÃO faz: não cria tabela nova, não cria identidade paralela, não
-- guarda o segredo em claro, não guarda token emitido (revogação continua
-- sendo `revoked_at`, decidida a cada requisição).
-- =====================================================================

ALTER TABLE identity.device ADD COLUMN IF NOT EXISTS secret_hash      TEXT;
ALTER TABLE identity.device ADD COLUMN IF NOT EXISTS secret_bound_at  TIMESTAMPTZ;
ALTER TABLE identity.device ADD COLUMN IF NOT EXISTS last_session_at  TIMESTAMPTZ;

COMMENT ON COLUMN identity.device.secret_hash IS
  'SHA-256 (hex) do segredo que o aparelho gerou. NULL = aparelho autorizado que ainda nao fez o primeiro contato.';
COMMENT ON COLUMN identity.device.secret_bound_at IS
  'Instante do primeiro contato, quando o hash foi vinculado. Nunca muda por conta do runtime.';
COMMENT ON COLUMN identity.device.last_session_at IS
  'Ultima emissao de token para este aparelho.';
