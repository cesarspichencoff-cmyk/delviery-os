# Leitura canônica de localização da viagem

Data: 2026-10-01
Host: Foxxy
Base Git: `f2f9a024a4b6a605937d016c1c3ca141cc7f2697`
Resultado: **CODE_READY + TEST_PASS local; PostgreSQL real NOT_RUN nesta sessão**

## Gap encontrado

O Android já envia GPS para a plataforma canônica, e os fatos ficam em
`platform.event_log`. Apesar disso, a central de despacho ainda consulta
`/api/trip/location` e `/api/trip/route` no piloto, onde os pontos vivem em
`pointsByTrip` em memória.

Persistir esse mapa no piloto seria a correção errada: criaria uma segunda
fonte durável de coordenadas e permitiria divergência entre piloto e plataforma.

## Correção preparada

Foi criada `src/platform/leitura/localizacao-de-viagem.ts` com a porta
`lerLocalizacaoCanonicaDaViagem`.
Ela:

- lê exclusivamente `platform.event_log`;
- executa dentro de `SET TRANSACTION READ ONLY`;
- exige `unit_id + trip_id + source_mode`;
- não mistura `real`, `simulated` e `control`;
- preserva os campos observados do fato GPS;
- falha fechado se encontrar coordenada inválida no log;
- devolve ausência como zero pontos, sem fabricar posição;
- não é endpoint e não decide autorização humana.

A leitura foi adicionada também à seção D da cadeia real para que a próxima
execução com PostgreSQL valide o mesmo caminho contra o banco.

## Provas executadas

Suíte focada `test:platform:location-read`:

- filtro obrigatório de unidade + viagem + modo: PASS;
- transação `READ ONLY`: PASS por contrato observado no cliente de teste;
- reconstrução dos campos do fato: PASS;
- payload inválido falha fechado: PASS;
- ausência permanece ausência: PASS;
- total: **3/3 PASS**.
Regressões executadas:

- `npx tsc --noEmit`: PASS;
- `test:platform:cadeia`: **9/9 lógica PASS**;
- `test:platform:governanca`: **14/14 / GOVERNANCE_GATE_GREEN**.

A subprova de banco real em `test:platform:cadeia` foi **PULADA** porque
`DELIVERYOS_PG_URL` está ausente nesta sessão. Portanto não há alegação de
PostgreSQL real para esta porta ainda.

## Fronteira

Isto prova que existe uma leitura canônica, mínima e fail-closed sobre a fonte
durável correta. Não prova ainda que a central de despacho usa essa porta.

Continua aberto:

- autenticação/autorização mínima entre o despacho e essa leitura;
- wiring de `/api/trip/location` e `/api/trip/route` para a fonte canônica;
- retirada/tombstone do caminho GPS legado do piloto após o wiring;
- prova PostgreSQL real da nova porta;
- aparelho físico continua fora desta frente.

Nenhum privilégio amplo de `SELECT` sobre `platform.event_log` foi concedido
ao papel `deliveryos_entregas_pilot`, e nenhum deploy/efeito operacional foi feito.
