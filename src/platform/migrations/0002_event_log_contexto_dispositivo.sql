-- =====================================================================
-- 0002 — contexto de dispositivo no event log
--
-- O event log nasceu sem `device_id` e sem `sequence_local`. Faltando os
-- dois, um fato vindo do celular perde exatamente a informação que torna o
-- modo offline auditável:
--
--   * `device_id` responde QUAL aparelho reportou. Sem isso, dois motoboys
--     com relógios diferentes viram uma linha do tempo só, e um aparelho com
--     defeito não pode ser isolado depois;
--   * `sequence_local` responde EM QUE ORDEM o aparelho produziu. É a única
--     ordenação confiável quando o relógio do celular está errado — e ele
--     está errado com frequência.
--
-- Aditiva e reexecutável: colunas opcionais, nenhum dado reescrito. Um fato
-- vindo do painel continua sem aparelho, e isso é correto, não ausência.
--
-- Por que uma migration nova em vez de editar a 0001: a 0001 já foi aplicada
-- e validada contra um PostgreSQL real. Reescrever migration aplicada é como
-- o schema se torna diferente entre duas máquinas sem ninguém perceber.
-- =====================================================================

BEGIN;

ALTER TABLE platform.event_log ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE platform.event_log ADD COLUMN IF NOT EXISTS sequence_local BIGINT;

-- Reconstituir a fila de um aparelho é a consulta da investigação: "o que
-- este celular mandou, na ordem dele". Sem índice ela varre o log inteiro.
CREATE INDEX IF NOT EXISTS event_log_dispositivo_idx
    ON platform.event_log (device_id, sequence_local)
    WHERE device_id IS NOT NULL;

INSERT INTO platform.schema_migration (version, applied_at, checksum)
VALUES ('0002_event_log_contexto_dispositivo', now(), 'aditiva-sem-reescrita')
ON CONFLICT (version) DO NOTHING;

COMMIT;
