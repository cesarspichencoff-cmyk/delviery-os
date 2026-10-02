---
lifecycle:
  artefato: docs/etapa-4-8/field-gate/2026-10-02-canonical-dispatch-postgresql18.md
  status: ACTIVE
  authority_scope: canonical_dispatch_postgresql_http_evidence
  superseded_by: null
  atualizado_em: "2026-10-02"
  state_basis: 66d46a0
---

# Despacho canônico — HTTP real sobre PostgreSQL 18

Data: 2026-10-02
Host: Foxxy / WSL2
Base Git antes da prova: `66d46a07ce02b02dbab5b39af8a22d9a2a71004c`
Resultado: **POSTGRESQL REAL + HTTP REAL 6/6 PASS**

## O que esta prova acrescenta

A Cadeia Real já havia provado a função de leitura canônica diretamente contra
PostgreSQL real. Faltava provar o caminho completo usado pelo despacho:

```
aparelho lógico
  -> sessão canônica
  -> GPS
  -> runtime crítico real
  -> platform.event_log PostgreSQL
  -> GET /api/dispatch/trip/*
  -> assertion HMAC curta
  -> piloto real
  -> GET /api/trip/location e /api/trip/route
```

A nova suíte `run-canonical-dispatch-postgres-tests.ts` usa
`bancoIsolado`: cria um banco próprio, aplica as migrations reais e o remove
no `finally`.

## Provas

Cluster: PostgreSQL 18 local do WSL. O banco operacional
`deliveryos_q018_lab` foi usado apenas como ponto de conexão administrativa;
os fatos da prova ficaram em um banco efêmero `dispatchpg_*`.

- **PG1** runtime crítico recebeu dois fatos GPS e persistiu os dois em
  `platform.event_log`, na unidade/viagem/modo corretos;
- **PG2** piloto real leu `/api/trip/location` através do runtime crítico e
  devolveu fonte `platform.event_log`, 2 pontos e a última coordenada correta;
- **PG3** `/api/trip/route` devolveu os 2 pontos persistidos, na ordem;
- **PG4** o papel `motoboy_interno` recebeu metadata, mas nenhuma coordenada;
- **PG5** `/api/gps/batch` legado do piloto permaneceu tombstone 503, sem
  fallback silencioso para RAM;
- **PG6** segredo interno divergente foi recusado com 401 e o piloto não caiu
  para `pointsByTrip`.

Resultado:

```
CANONICAL_DISPATCH_POSTGRES_GREEN 6/6
```

## Cleanup

Depois da prova:

- nenhuma database `dispatchpg_*` permaneceu no cluster;
- nenhum processo de piloto da prova permaneceu;
- o único `critical.js` observado depois era um processo antigo do usuário
  `italo`, iniciado em 29/09/2026, portanto não pertencente a esta execução.

## Fronteira

Isto fecha a lacuna de **PostgreSQL real do caminho HTTP canônico do despacho**.

Ainda não prova nem autoriza:

- segredo operacional real de leitura por unidade;
- Docker/Compose final;
- deploy;
- troca de ambiente;
- aparelho físico;
- produção.

Nenhum segredo operacional foi criado e nenhum banco operacional recebeu fatos
desta prova.
