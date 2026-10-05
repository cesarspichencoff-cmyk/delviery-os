-- Senha do Product System reader.
-- Só é executado pelo profile opt-in "product".
-- O shell do setup recusa senha ausente/vazia ANTES do psql.
\getenv senha_do_product_reader DELIVERYOS_PRODUCT_READER_DB_PASSWORD
ALTER ROLE deliveryos_product_reader PASSWORD :'senha_do_product_reader';
