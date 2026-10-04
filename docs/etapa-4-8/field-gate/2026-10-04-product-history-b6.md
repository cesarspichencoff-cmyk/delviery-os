# Product System â€” B6 histÃ³rico

Data: 2026-10-04
Branch: `tmp/product-history-b6-20261003`
Base: `6db6fa4ccd00a7721bfa6cd5b05c57ba24c7d9e2`
Escopo: **histÃ³rico read-only; sem produÃ§Ã£o**

## OperaÃ§Ã£o Viva

A superfÃ­cie histÃ³rica nÃ£o usa replay completo. A leitura humana:

- exige `unit_id`;
- consulta `platform.event_log` por unidade;
- roda em transaÃ§Ã£o `READ ONLY`;
- tem limite duro;
- nÃ£o seleciona `payload`;
- mantÃ©m `real`, `simulated` e `control` separados;
- contabiliza legado sem `source_mode` e isola linha fora do contrato.

## Copiloto

O store JSONL jÃ¡ era append-only. A leitura `history(entity)` percorre o arquivo validando cada
linha e preserva todas as versÃµes. O estado atual permanece independente em `all(entity)`.

Teste adversarial: uma recomendaÃ§Ã£o `proposed` seguida da mesma recomendaÃ§Ã£o `dismissed`
produziu 2 versÃµes no histÃ³rico e 1 linha atual em `all()`, sem ressuscitar a versÃ£o antiga.

## SuperfÃ­cie

OperaÃ§Ã£o Viva mostra **HistÃ³rico registrado** e Copiloto mostra **HistÃ³rico de propostas**.
As janelas visuais sÃ£o limitadas e nÃ£o oferecem aÃ§Ã£o.

## Provas

- typecheck: PASS;
- Product System: **50/50 PASS**;
- Copiloto: **41/41 PASS**;
- Conference/Store 4B5: **37/37 PASS**;
- `B6_UI_RUNTIME_GREEN`;
- HTTP/page errors no browser: 0;
- PostgreSQL isolado: 3 eventos ITAIM, modos `controle,real,simulado`;
- `payload` na resposta: false;
- POST em `/api/historico`: 405.

## Fronteira

B6 estÃ¡ **TEST_PASS + runtime local PROVEN**. NÃ£o hÃ¡ afirmaÃ§Ã£o de deploy ou produÃ§Ã£o. B7
(identidade/autorizaÃ§Ã£o humana para aÃ§Ã£o) e B8 (segunda unidade/fonte real) continuam abertos.
