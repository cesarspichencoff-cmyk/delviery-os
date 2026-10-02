---
lifecycle:
  artefato: docs/etapa-4-8/field-gate/2026-10-01-cadeia-real-postgresql18.md
  status: ACTIVE
  authority_scope: cadeia_real_postgresql18_evidence
  superseded_by: null
  atualizado_em: "2026-10-01"
  state_basis: c547640
---

# Cadeia Real — PostgreSQL 18 isolado

Data local: 2026-10-01
Host: Foxxy / WSL2
Base Git: `c547640e14ae79ae7fc664a3fea02e6ffad40292`
Resultado final: **36/36 PASS · CADEIA_REAL_GREEN**

## Ambiente de prova

A execução final não usou produção nem o banco persistente
`deliveryos_q018_lab`.

Foi criado um cluster PostgreSQL **18** descartável em `/tmp`:

- `initdb` próprio;
- listen somente em `127.0.0.1`;
- porta de laboratório `55439`;
- autenticação `trust` restrita a esse cluster efêmero;
- `fsync`, `synchronous_commit` e `full_page_writes` desligados somente
  para acelerar o laboratório;
- `trap` para parar o servidor e remover todo o diretório temporário.

Antes da cadeia, foi executado o **build oficial**:

```
npm run build:platform
```

Isso importa porque uma tentativa anterior usando apenas `tsc` gerou
`dist/` sem `docs/contracts/eventos.schema.json`; o runtime crítico recusou
subir corretamente. A prova final usa o mesmo empacotamento exigido pelo
runtime.

## O que a cadeia exerceu

A suíte criou banco próprio por execução, aplicou as migrations reais e
executou os binários de `dist/`.

Passaram:

- bootstrap antes/depois da autorização humana;
- pré-vínculo de `secret_hash` antes da emissão da sessão;
- preservação de `secret_bound_at` durante o bootstrap;
- persistência da sessão após reabertura do aparelho lógico;
- captura offline, falha de rede, retry e reconexão;
- ingestão GPS no PostgreSQL;
- idempotência após recibo perdido;
- replay após reinício do worker;
- expiração e renovação de sessão;
- isolamento A ≠ B;
- revogação;
- recusa de localização simulada em lote real;
- ausência de segredo em claro no banco/log;
- leitura de realidade em transação somente-leitura;
- localização canônica por viagem + `source_mode`;
- ausência declarada sem fabricar saúde;
- papéis mínimos do crítico e assíncrono;
- sabotagens recusadas por privilégio.

Resultado:

```
36/36 provas da cadeia real
CADEIA_REAL_GREEN
LEFTOVER_DATABASES
LEFTOVER_ROLES
```

As duas listas de leftovers ficaram vazias.

## Suíte adversarial no mesmo tipo de banco

Depois da prova positiva, `run-cadeia-mutation-tests.js` foi executado contra
outro PostgreSQL 18 efêmero, também isolado em loopback.

Resultado:

```
15/15 · 0 mutacao(oes) cega(s)
CADEIA_MUTATIONS_GREEN
LEFTOVER_DATABASES
LEFTOVER_ROLES
```

Foram detectadas M1, M2, M2b, M3, M4, M5, M6, M7, M7b, M8, M9, M10, M11 e
M12. Cada mutação restaurou os arquivos originais byte a byte; as variantes que
tocavam código carregado pelos binários também reconstruíram `dist/` antes e
depois.

## Prova de papéis mínimos

A primeira execução contra um cluster já existente usou socket local com
autenticação `peer`. Como o processo de teste era o usuário PostgreSQL
administrativo, a montagem da URL não materializou o papel pretendido e P4/P5
chegaram às tabelas como dono. A suíte acusou isso em vez de ficar verde.

O harness foi endurecido: P1 agora abre conexões novas e exige literalmente:

```
current_user = papel_minimo
session_user = papel_minimo
```

Também mede a matriz de ACL do `platform.event_log` antes das sabotagens.

A execução final usa um cluster efêmero com autenticação própria do laboratório,
permitindo que os runtimes entrem diretamente como os papéis gerados para a
execução. P4/P5 então provaram que:

- crítico não pode DELETE/TRUNCATE/UPDATE no event log;
- crítico não pode desligar/drop trigger;
- crítico não pode revogar, cadastrar ou trocar unidade/segredo do aparelho;
- crítico não pode ativar `session_replication_role=replica`;
- assíncrono não pode inserir fato/outbox;
- assíncrono não pode ler `identity.device`;
- assíncrono não pode apagar outbox;
- ambos continuam capazes apenas das operações que o runtime necessita.

## Duas correções do harness

A primeira rodada PostgreSQL real terminou 32/36 e revelou quatro problemas:

1. C3 comparava dois objetos `Date` por identidade, embora o instante de
   `secret_bound_at` fosse o mesmo. Foi corrigido para comparar ISO por valor.
2. D4 ainda esperava `aguardando_primeiro_contato`; depois do pré-vínculo
   humano, o estado correto é `vinculada` + evidência insuficiente até chegar
   um lote.
3. P4/P5 usavam um socket `peer` inadequado para provar papéis distintos no
   cluster existente.
4. P1 não verificava `current_user/session_user`, deixando o problema acima
   invisível até as sabotagens.

A correção não afrouxou privilégios nem expectativas de segurança. Ela tornou
a identidade SQL observável e a segunda rodada terminou 36/36.

## Fronteira

Esta prova estabelece comportamento real do PostgreSQL e dos binários do HEAD
em laboratório isolado.

Ela **não** prova:

- aparelho Android físico;
- PostgreSQL hospedado que será usado no campo;
- segredos/credenciais operacionais;
- Docker/Compose final neste Foxxy;
- deploy, cutover ou migrations no banco operacional;
- backup off-host.

Nenhum efeito de produção foi executado.
