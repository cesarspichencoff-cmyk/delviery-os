-- =====================================================================
-- Leitor mínimo da outbox pública de Entregas.
--
-- Este papel pertence ao BANCO FONTE do source-ingest. Ele não é o papel
-- deliveryos_source_ingest, que pertence ao BANCO DESTINO e só escreve na
-- plataforma. Separar as credenciais impede que uma conexão comprometida
-- ganhe leitura de domínio + escrita de destino ao mesmo tempo.
--
-- Sem senha no repositório. Credencial é efeito de implantação.
-- =====================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'deliveryos_entregas_feed_reader'
  ) THEN
    CREATE ROLE deliveryos_entregas_feed_reader LOGIN NOINHERIT;
  END IF;
END $$;

-- Reaplicação corrige drift de grants anteriores no schema Entregas.
REVOKE ALL PRIVILEGES ON SCHEMA entregas
  FROM deliveryos_entregas_feed_reader;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA entregas
  FROM deliveryos_entregas_feed_reader;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA entregas
  FROM deliveryos_entregas_feed_reader;

GRANT USAGE ON SCHEMA entregas
  TO deliveryos_entregas_feed_reader;

-- O feed precisa somente:
--   event_id: localizar o cursor;
--   seq: ordenar globalmente e avançar após o cursor;
--   event: validar e entregar o envelope público.
GRANT SELECT (seq, event_id, event)
  ON entregas.public_outbox
  TO deliveryos_entregas_feed_reader;
