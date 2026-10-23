-- PROPOSTA DE REVISAO (LAB EXCLUSIVO) - RLS dos recibos 0011.
-- NAO E MIGRATION, NAO INSTALAR, NAO EXECUTAR EM BANCO OPERACIONAL.
-- O arquivo SQL 0011 ORIGINAL permanece separado no Foxxy e NAO esta aqui.
-- Precondicoes: tabela original ja existe, roles distintas previamente criadas
-- sem credenciais neste script, banco temporario nomeado lab_review_rls_<hex10>,
-- socket Unix privado (sem TCP) e sessao explicitamente armada por
-- SET deliveryos.review_rls_lab = 'approved_ephemeral_lab'.
-- A flag de sessao sozinha nao confirma que o banco e descartavel.
-- Dados de unidades abaixo sao apenas para prova: ITAIM e PINHEIROS.
-- O servico real ainda NAO seleciona estas roles por sessao autenticada.
BEGIN;

DO $receipt_rls_review_guard$
BEGIN
  IF current_setting('deliveryos.review_rls_lab', true)
     IS DISTINCT FROM 'approved_ephemeral_lab' THEN
    RAISE EXCEPTION 'REVIEW_ONLY: exige sessao de laboratorio explicita';
  END IF;
  -- O cliente pode definir a flag. Validar o destino independentemente.
  IF current_database() !~ '^lab_review_rls_[a-f0-9]{10}$' THEN
    RAISE EXCEPTION 'REVIEW_ONLY: exige banco efemero lab_review_rls_hex10';
  END IF;
  IF inet_server_addr() IS NOT NULL THEN
    RAISE EXCEPTION 'REVIEW_ONLY: exige conexao por socket local';
  END IF;
  IF to_regclass('entregas.inbound_receipt') IS NULL THEN
    RAISE EXCEPTION 'REVIEW_ONLY: SQL 0011 original precisa estar aplicada';
  END IF;
  IF (SELECT count(*) FROM pg_roles
      WHERE rolname IN ('deliveryos_entregas_pilot',
                        'deliveryos_receipt_itaim',
                        'deliveryos_receipt_pinheiros')) <> 3 THEN
    RAISE EXCEPTION 'REVIEW_ONLY: roles previamente existentes obrigatorias';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname IN ('deliveryos_entregas_pilot',
                      'deliveryos_receipt_itaim',
                      'deliveryos_receipt_pinheiros')
      AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'REVIEW_ONLY: superuser e BYPASSRLS proibidos';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname IN ('deliveryos_receipt_itaim','deliveryos_receipt_pinheiros')
      AND rolinherit
  ) THEN
    RAISE EXCEPTION 'REVIEW_ONLY: roles por unidade exigem NOINHERIT';
  END IF;
  IF pg_has_role('deliveryos_entregas_pilot','deliveryos_receipt_itaim','MEMBER')
     OR pg_has_role('deliveryos_entregas_pilot','deliveryos_receipt_pinheiros','MEMBER')
     OR pg_has_role('deliveryos_receipt_itaim','deliveryos_receipt_pinheiros','MEMBER')
     OR pg_has_role('deliveryos_receipt_pinheiros','deliveryos_receipt_itaim','MEMBER') THEN
    RAISE EXCEPTION 'REVIEW_ONLY: membership cruzada ou shared->unit proibida';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='entregas' AND tablename='inbound_receipt'
      AND policyname NOT IN ('inbound_receipt_itaim_review',
                             'inbound_receipt_pinheiros_review')
  ) THEN
    RAISE EXCEPTION 'REVIEW_ONLY: policies desconhecidas impedem composicao';
  END IF;
  -- Inclui ACLs herdadas de PUBLIC, membership e colunas individuais.
  IF has_any_column_privilege('deliveryos_entregas_pilot',
                               'entregas.inbound_receipt','SELECT')
     OR has_any_column_privilege('deliveryos_entregas_pilot',
                                 'entregas.inbound_receipt','INSERT')
     OR has_any_column_privilege('deliveryos_entregas_pilot',
                                 'entregas.inbound_receipt','UPDATE')
     OR has_table_privilege('deliveryos_entregas_pilot',
                             'entregas.inbound_receipt','DELETE')
     OR has_table_privilege('deliveryos_entregas_pilot',
                             'entregas.inbound_receipt','TRUNCATE')
     OR has_table_privilege('deliveryos_entregas_pilot',
                             'entregas.inbound_receipt','TRIGGER')
     OR has_any_column_privilege('deliveryos_entregas_pilot',
                                 'entregas.inbound_receipt','REFERENCES') THEN
    RAISE EXCEPTION 'REVIEW_ONLY: papel multiunidade com privilegio de recibos';
  END IF;
  IF has_any_column_privilege('deliveryos_receipt_itaim',
                               'entregas.inbound_receipt','UPDATE')
     OR has_any_column_privilege('deliveryos_receipt_pinheiros',
                                 'entregas.inbound_receipt','UPDATE')
     OR has_table_privilege('deliveryos_receipt_itaim',
                             'entregas.inbound_receipt','DELETE')
     OR has_table_privilege('deliveryos_receipt_pinheiros',
                             'entregas.inbound_receipt','DELETE') THEN
    RAISE EXCEPTION 'REVIEW_ONLY: papel de unidade com mutacao indevida';
  END IF;
END
$receipt_rls_review_guard$;

ALTER TABLE entregas.inbound_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE entregas.inbound_receipt FORCE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA entregas TO deliveryos_receipt_itaim,deliveryos_receipt_pinheiros;
GRANT SELECT, INSERT ON entregas.inbound_receipt
  TO deliveryos_receipt_itaim,deliveryos_receipt_pinheiros;

DROP POLICY IF EXISTS inbound_receipt_itaim_review ON entregas.inbound_receipt;
CREATE POLICY inbound_receipt_itaim_review ON entregas.inbound_receipt
  FOR ALL TO deliveryos_receipt_itaim
  USING (unit_id='ITAIM') WITH CHECK (unit_id='ITAIM');

DROP POLICY IF EXISTS inbound_receipt_pinheiros_review ON entregas.inbound_receipt;
CREATE POLICY inbound_receipt_pinheiros_review ON entregas.inbound_receipt
  FOR ALL TO deliveryos_receipt_pinheiros
  USING (unit_id='PINHEIROS') WITH CHECK (unit_id='PINHEIROS');

-- Recheca a role compartilhada APOS os GRANTs especificos.
DO $receipt_rls_review_post$
BEGIN
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity
          FROM pg_class WHERE oid='entregas.inbound_receipt'::regclass) THEN
    RAISE EXCEPTION 'REVIEW_ONLY: RLS/FORCE ausente apos composicao';
  END IF;
  IF has_any_column_privilege('deliveryos_entregas_pilot',
                               'entregas.inbound_receipt','SELECT')
     OR has_any_column_privilege('deliveryos_entregas_pilot',
                                 'entregas.inbound_receipt','INSERT') THEN
    RAISE EXCEPTION 'REVIEW_ONLY: permissao compartilhada apos GRANT especifico';
  END IF;
END
$receipt_rls_review_post$;
COMMIT;
