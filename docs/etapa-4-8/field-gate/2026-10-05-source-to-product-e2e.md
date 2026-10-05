# Source PostgreSQL → Product System E2E

Data: 2026-10-05
Branch: `tmp/source-to-product-e2e-20261005`
Base: `957f6ce928539cff267083b924d297673e02d365`
Escopo: **local/isolado; sem produção**

## Cadeia medida

`entregas.public_outbox` em PostgreSQL fonte
→ processo compilado `entregas-source-ingest`
→ `platform.event_log` em PostgreSQL destino
→ Product System compilado com reader read-only.

## Resultado

`SOURCE_TO_PRODUCT_E2E: 10/10 PASS`.

- 3 eventos, duas unidades, source mode preservado;
- ITAIM projetado `em_rota`;
- PINHEIROS isolado quando ITAIM é selecionado e vice-versa;
- HOUSE inativa fora da navegação;
- histórico/realidade sem payload bruto;
- POST 405;
- checkpoint avançado;
- fonte intacta;
- logs sem credenciais sentinela.

## Least privilege

`deploy/sql/product_system_reader.sql` é um papel opcional e ainda não faz parte da composição
oficial. Ele lê apenas as colunas necessárias de identidade/status e `platform.event_log`.
Não pode escrever e não pode ler `identity.device.secret_hash`.

Controles negativos: SQLSTATE `42501`.

## Correção de harness descoberta pelo ensaio

Dois testes antigos interpretavam somente a string inglesa `permission denied`. No PostgreSQL
pt-BR a recusa real é `permissão negada`, gerando falso negativo. Os dois gates passaram a
validar o SQLSTATE `42501`, independente de locale.

## Regressões

- typecheck: PASS;
- feed PostgreSQL: 8/8;
- PG→PG: 6/6;
- processo compilado PG→PG: 5/5;
- Product System: 54/54;
- novo E2E: 10/10.

## Figma Full

O Overview canônico recebeu a faixa `System chain proof · 2026-10-05` no node `24:2`,
renderizada com sucesso pelo MCP. Ela declara `SOURCE → PRODUCT · LOCAL PROVEN` e mantém
`DEPLOY OFF · CONSUMER LIVE OFF`.

## Fronteira

Nada foi implantado. Nenhuma credencial real foi criada. O reader não está wired no compose.
`consumer_live` segue OFF/NOT_AUTHORIZED. Esta prova não promove o estado atual de
Operação Viva/Copiloto para live.
