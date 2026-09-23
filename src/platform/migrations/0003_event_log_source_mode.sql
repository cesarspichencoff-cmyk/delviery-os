-- =====================================================================
-- 0003 — o modo do fato passa a ser durável no event log
--
-- O `EventEnvelope` carrega `source_mode` (real | simulated | control), a
-- mensagem da outbox carrega, e o `platform.event_log` NÃO carregava. Provado
-- em `run-q016-replay-tests.ts` (Fase 1, commit 9ebe5ea): dois fatos iguais em
-- tudo menos no modo viravam a MESMA linha no log. Um replay a partir dele só
-- reconstruiria os escopos inventando o modo — e a Q-016 decidiu que o log é
-- a fonte que governa a reconstrução.
--
-- TRÊS ESCOLHAS, E O QUE CADA UMA RECUSA
--
-- 1. Coluna ANULÁVEL e SEM DEFAULT. Um `DEFAULT 'real'` carimbaria como real
--    tudo que não disse o que era — o simulado viraria real na ausência do
--    campo, que é exatamente o que L9 proíbe. A ausência precisa continuar
--    visível como ausência.
--
-- 2. Obrigatoriedade para fato NOVO pelo banco, com `NOT VALID`. A restrição
--    vale para toda linha inserida daqui em diante, por qualquer escritor —
--    não depende da disciplina de quem escreve o código, do mesmo jeito que o
--    append-only não depende. `NOT VALID` isenta as linhas que já existiam:
--    elas nasceram sem o campo e nenhuma migration pode fingir que não.
--
-- 3. NENHUM backfill. Preencher o histórico exigiria `UPDATE` no event log,
--    que a trigger `event_log_sem_update` recusa (L3) — e mesmo que não
--    recusasse, não existe registro durável de onde o modo histórico saia com
--    prova. A outbox carrega o campo, mas é mutável (sem trigger de
--    append-only), pode ter sido purgada, e o que ela guarda é o padrão
--    implícito da instância, não uma atestação. Linha antiga fica com
--    `source_mode` NULO, e nulo aqui significa UNKNOWN: não apta ao replay por
--    modo enquanto a procedência não for provada.
--
-- Um `VALIDATE CONSTRAINT` futuro falharia de propósito enquanto existir
-- histórico sem modo. Isso é o banco dizendo a verdade, não um defeito.
--
-- Aditiva e reexecutável. Sem BEGIN/COMMIT: o runner de migrations já abre a
-- transação e registra a versão com o checksum real deste arquivo.
-- =====================================================================

ALTER TABLE platform.event_log ADD COLUMN IF NOT EXISTS source_mode TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'event_log_source_mode_obrigatorio'
           AND conrelid = 'platform.event_log'::regclass
    ) THEN
        ALTER TABLE platform.event_log
            ADD CONSTRAINT event_log_source_mode_obrigatorio
            CHECK (source_mode IS NOT NULL AND source_mode IN ('real', 'simulated', 'control'))
            NOT VALID;
    END IF;
END
$$;
