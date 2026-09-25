-- =====================================================================
-- Senhas dos papéis dos runtimes — aplicadas pelo job `deliveryos-papeis`
-- da composição oficial, logo depois de `papeis_minimos.sql`.
--
-- Os valores vêm do AMBIENTE do job, lidos com `\getenv` (psql 15+): nunca
-- escritos aqui, nunca em argumento de linha de comando, que aparece em `ps`.
-- `:'variavel'` é o psql citando o valor como LITERAL — a senha nunca é
-- interpretada como SQL.
--
-- Variável ausente deixa a variável do psql sem valor, e o `:'...'` abaixo
-- chega ao servidor como texto cru: erro de sintaxe, e com ON_ERROR_STOP o job
-- sai com erro em vez de deixar papel sem senha. O compose recusa antes, com
-- `:?`. Senha vazia vira senha NULA no PostgreSQL 10+: o login do papel falha.
--
-- Reaplicar a mesma senha a cada subida é idempotente. Rotação de senha não
-- foi medida: não a trate como provada.
-- =====================================================================

\getenv senha_do_critico DELIVERYOS_CRITICAL_DB_PASSWORD
\getenv senha_do_assincrono DELIVERYOS_ASYNC_DB_PASSWORD

ALTER ROLE deliveryos_critical PASSWORD :'senha_do_critico';
ALTER ROLE deliveryos_async PASSWORD :'senha_do_assincrono';
