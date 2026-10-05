# Source-ingest — PostgreSQL source feed

Data: 2026-10-04
Branch: `tmp/source-ingest-pg-feed-20261004`
Base: `8b57f0079d683c37e3ff8d1414a2e18b2b1079e6`
Escopo: **prova local/isolada; sem deploy e sem ativação live**

## Mudança

O processo `entregas-source-ingest` deixa de exigir `store.json` como única fonte.

Quando ligado, exige escolha explícita:

- `DELIVERYOS_ENTREGAS_SOURCE_BACKEND=file`;
- ou `DELIVERYOS_ENTREGAS_SOURCE_BACKEND=postgres`.

OFF continua sendo o default e não abre banco.

### PostgreSQL source feed

`PgCommittedOutboxEntregasEventFeed`:

- lê `entregas.public_outbox`;
- usa `seq` global como ordem durável;
- usa `event_id` como cursor/checkpoint externo;
- roda em `REPEATABLE READ READ ONLY`;
- valida o envelope público;
- recusa cursor inexistente;
- recusa evento inválido;
- recusa divergência entre `event_id` relacional e JSON.

### Privilégio mínimo

O leitor da fonte é separado do escritor do destino.

`deploy/sql/entregas_feed_reader.sql` concede somente:

- `USAGE` no schema `entregas`;
- `SELECT(seq,event_id,event)` em `entregas.public_outbox`.

Não há SELECT de tabela inteira, leitura de `unit_id`, tabelas de domínio ou escrita.

## Provas

- typecheck: PASS;
- plataforma/arquitetura: **44/44 PASS**;
- configuração source-ingest: **14/14 PASS**;
- feed PostgreSQL: **8/8 PASS**;
- PG fonte → PG destino: **6/6 PASS**;
- papel mínimo do writer destino: **4/4 PASS**;
- wiring legado file → PG: **6/6 PASS**;
- binário compilado real PG → PG: **5/5 PASS**.

No gate de processo:

- dois bancos isolados;
- duas credenciais distintas;
- 3 eventos na fonte, em ITAIM e PINHEIROS;
- 2 equivalências seguras gravadas no destino;
- 1 evento sem equivalência isolado;
- checkpoint avançou ao último evento;
- fonte permaneceu com os 3 eventos;
- duas senhas-sentinela nas URLs não apareceram no log.

## Fronteira

**LOCAL_PROCESS_PROVEN / NOT_DEPLOYED.**

Não houve credencial operacional, deploy, inclusão do processo na composição oficial,
ativação de `consumer_live` ou qualquer efeito em produção.
