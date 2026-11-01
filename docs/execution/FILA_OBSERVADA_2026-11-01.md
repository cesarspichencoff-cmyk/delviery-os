# Fila de prontos observada pela plataforma (01/11/2026)

Branch `claude/deliveryos-pronto-leituras-20261101`, sobre `7f48e07c` (publicada, CI verde). Sem merge,
deploy, instalação, migração ou mudança na operação. Home, Copiloto protegido e Toqan intocados. Nenhum
banco, motor ou sincronizador novo.

## 1. O problema

A leitura do estado atual (etapa anterior, `PRONTO_LEITURAS_2026-11-01.md`) lia a fila só de
`entregas.ready_order`. No campo o piloto roda **em arquivo** (`ready_orders.json`). Ao fazer o Difference
Check apareceu um defeito pior que a ausência: a tabela existe em todo banco da plataforma (migration 0007).
Vazia, ela virava **fila vazia observada**. Reproduzido em PostgreSQL 16.15 antes de qualquer correção (O1):

```
{"estado":"observado","motivo":null,"source_mode":"nao_declarado","total":0,"mais_antigo_desde":null,"pedidos":[]}
```

Esse era um zero falso para toda unidade que roda em arquivo.

## 2. Difference Check: `PilotApplicationFacade.snapshot()` e `/api/snapshot`

O snapshot já lê a fila pela porta `readyOrders.list()`, nos dois modos. A porta serve. **A rota não.**

| Exigência | `/api/snapshot` hoje |
|---|---|
| Só campos permitidos | Leva o snapshot bruto: rótulo (pode ter endereço), viagens, ocorrências com texto livre, motoboys e `internal_riders` |
| Deduplicar com os fatos | Descarta `created_at`. Sem o instante do registro não há como casar fila e `delivery_ready` (pedido + instante) |
| Unidade, origem, instante, disponibilidade | Nenhum dos quatro |
| Modo | Nenhum; o registro da fila não guardava modo |
| Falha da fonte | Uma fonte ilegível derruba a resposta inteira (500), sem distinguir "fila ilegível" de "piloto fora" |
| Custo | Cresce com o histórico: 2,2 KB → 130 KB de 0 a 450 viagens (§6) |

Alternativas descartadas:

- **Ler o arquivo do piloto de dentro da plataforma, na mesma máquina** (como o `source-ingest` lê o
  `store.json`): contorna a autenticação por papel e só funciona no mesmo host;
- **Empurrar a fila do piloto para a plataforma**: exigiria produtor e contrato novos, e ainda
  uma escrita dupla (a fila e a outbox são arquivos diferentes);
- **Espelhar a fila numa tabela**: seria banco e sincronizador novos, e copiaria o rótulo
  (`label NOT NULL`).

## 3. A arquitetura mínima

**Piloto: uma saída somente-leitura pela MESMA porta.** `GET /api/ready-orders/observation` chama
`PilotApplicationFacade.observeReadyQueue()`, que usa a mesma porta `readyOrders.list()` do snapshot com
outra projeção (`src/entregas/pilot/ready-queue-observation.ts`).

- **Acesso**: sessão de gerente ou líder, os mesmos papéis de `/api/copiloto/*`. A rota confere o papel e
  a fachada confere de novo (defesa em profundidade). Motoboy e operador recebem 403, sem corpo de fila;
  sem sessão, 401. Só `GET`. Qualquer parâmetro dá 400, inclusive `?unit_id` e `?token`: a unidade é a do
  piloto, e token na URL não é aceito.
- **Por linha**: `order_ref`, `registered_at` (o `created_at` original), `channel` e `source_mode`. O
  modo é o do piloto **no registro**, e o registro passou a guardá-lo. Ausente vira `null`, nunca real;
  trocar o modo depois não reclassifica registro antigo. Rótulo e autor nunca saem.
- **Em volta das linhas**: `unit_id`; origem (`entregas-pilot`, armazenamento, início do processo, que
  identifica reinícios); `observed_at`; disponibilidade. Fila ilegível sai `unavailable`, com motivo e
  total `null`. Linha com instante ilegível fica fora e entra em `invalid_entries`.
- **Marca dos fatos (`facts_watermark`)**: é o `event_id` do último fato publicado na outbox entre os tipos
  que o estado atual lê. Os tipos (`delivery_ready`, `delivery_removed`, `trip_started`) vêm declarados em
  `covered_types`. A fila é lida primeiro e a marca depois, na mesma fila serializada dos comandos (a
  leitura nunca cai no meio de um commit). Com backend externo, a marca exigiria varrer a outbox, e sai
  `unavailable`, declarada.

**Plataforma: fila só de origem declarada** (`src/platform/leitura/prontos-de-entregas.ts`, contrato
`estado-atual-do-pronto@2`). `lerProntosDeEntregas(cliente, { agora, unit_id, fila })` aceita três casos:

- `observacao_do_piloto`: a saída acima é validada de forma estrita e falha fechada. Campo fora da lista
  (rótulo, autor, snapshot) derruba a observação inteira. Também derrubam: outra unidade, modo fora do
  vocabulário, total que não bate e observação no futuro além da tolerância do relógio
  (`TOLERANCIA_DO_RELOGIO_MS`). A marca é conferida no event log pela chave (`event_id`), na mesma
  transação `REPEATABLE READ, READ ONLY`;
- `postgres`: a tabela, sem `label`, quando ela é a autoridade da unidade. Cada linha sai `nao_declarado`;
- **nenhuma**: `indisponivel`, motivo `origem_da_fila_nao_declarada`. Esta é a correção do zero falso.

Resultado:

- **Fila por modo.** `na_fila` sai em grupos por modo declarado (real, simulated, control,
  nao_declarado). Não existe mais um total único, que somaria real com simulado.
- **Consulta não é evento.** A espera e o "mais antigo" contam do registro. O instante e a idade da
  observação são declarados à parte (`observado_em`, `idade_da_observacao_s`).
- **Consistência**: `consistencia_dos_fatos` vale
  - `fatos_em_dia` se a marca já está no event log;
  - `fatos_atrasados` se não está: um pedido pode estar entre a fila e os fatos, e quem lê fica sabendo;
  - `desconhecida` se não há marca, ou se a marca não cobre os três tipos.

**Cliente da observação** (`src/platform/leitura/fila-do-piloto.ts`). Ele nunca lança. Rede fora, prazo
estourado, credencial recusada, status inesperado ou resposta ilegível viram fila indisponível com
motivo. O token vai só no cabeçalho e não aparece em nenhum motivo.

**Consumidor em execução: a memória do feed** (`src/entregas/integration/durable-event-feed.ts`). O
`source-ingest` reabria, analisava e copiava o `store.json` inteiro a cada segundo, mesmo sem nada novo.
Agora o feed só reabre a loja quando a identidade do arquivo muda (dispositivo, inode, tamanho, `mtime` e
`ctime` em ns), e só copia o trecho que devolve. O relógio de arquivo é grosso (ms no Linux, 2 s no FAT),
por isso vale a regra das entradas "racy" do Git: arquivo mexido há menos de 3 s é sempre relido, e uma
leitura durante uma escrita não fica em memória. Contrato, ordem e cursor do feed não mudaram (feed
durável 9/9).

## 4. O que mudou

| Arquivo | Mudança |
|---|---|
| `src/entregas/pilot/ready-orders.ts` | Registro guarda `source_mode` (arquivo e memória; PostgreSQL não tem coluna e devolve ausente) |
| `src/entregas/pilot/ready-queue-observation.ts` (novo) | Projeção pura da saída mínima |
| `src/entregas/pilot/pilot-facade.ts` | `observeReadyQueue()` serializada com os comandos; `registerReadyOrder` carimba o modo |
| `tools/entregas_pilot_server.ts` | A rota `GET /api/ready-orders/observation` |
| `src/platform/leitura/prontos-de-entregas.ts` | Origem declarada, validação da observação, fila por modo, idade, consistência pela marca |
| `src/platform/leitura/fila-do-piloto.ts` (novo) | Cliente HTTP da observação |
| `src/entregas/integration/durable-event-feed.ts` | Memória do arquivo com assinatura e estabilidade; cópia só do trecho |
| `src/platform/run-pronto-leituras-tests.ts` | R1–R3 e W2 no contrato @2 (fila por modo; W2 declara `postgres`) |
| `src/platform/run-pronto-leituras-mutation-tests.ts` | Âncoras de ML2 e ML12 no código novo, mesmas propriedades |
| `.github/workflows/deliveryos-product-ux.yml` | Passos novos: contratos e ponte, leituras do pronto, saída mínima, fila observada, processos reais, custo |

## 5. Provas

| Suíte | Antes do código | Na base `7f48e07c` (suíte final, só o produto revertido) | Agora |
|---|---|---|---|
| `test:entregas:ready-queue-observation` (Q1–Q8 + H1–H3 com o processo real do piloto) | 0/11 (rota 404) | 0/11 | **11/11** |
| `test:platform:fila-observada` (O1–O14; O1, O11–O13 em PostgreSQL) | 0/13 | 0/14 | **14/14** |
| `test:platform:fila-observada:custo` (C1–C9) | — | 1/10 (passa só C8, a guarda de cópia que já valia) | **10/10** |
| `test:platform:fila-observada:processos` (E1–E8, binários de `dist/`) | — | não carrega (`MODULE_NOT_FOUND`: o cliente não existe) | **8/8** |
| `test:platform:fila-observada:mutacoes` | — | — | **33/33, cegas 0** |

As mutações somam 3 controles, 29 defeitos devolvidos e 1 restauração byte a byte. Cada defeito reprovou
pela prova que guarda a propriedade:

- **Piloto**:
  - rótulo vaza → Q1;
  - sem modo vira real → Q2;
  - registro sem modo → Q2;
  - fachada sem papel → Q3;
  - ilegível vira zero → Q4;
  - linha some calada → Q5;
  - marca ignora a saída → Q6;
  - marca varre a outbox no PostgreSQL → Q8;
  - rota com parâmetro → H3;
  - rota e fachada abertas ao motoboy → H2.
- **Plataforma**:
  - sem origem lê a tabela → O1;
  - campo extra aceito → O3;
  - outra loja → O4;
  - modo inválido → O5;
  - sem modo vira real → O2;
  - grupo único → O5;
  - espera da consulta → O6;
  - futuro aceito → O7;
  - sem marca vira "em dia" → O8;
  - marca parcial → O8;
  - marca não conferida → O12;
  - ilegível vira vazia → O10;
  - cliente lança → O14;
  - credencial recusada mascarada → O14.
- **Feed**:
  - ignora assinatura → C6;
  - sem estabilidade → C7b;
  - leitura no meio da escrita fica em memória com a assinatura nova → C7;
  - devolve sem copiar → C8;
  - relê sempre → C5.

O papel é conferido na rota e na fachada. Remover só a barreira da rota não abre a fila, porque a fachada
recusa. Por isso MP10 remove as duas, e MP4 prova a da fachada sozinha.

As mutações das etapas anteriores continuam sem cegas: `pronto-leituras` **20/20** (ML2 e ML12 com âncoras
no código novo) e `ready-fact` **25/25**.

### Regressão no commit `578c42d0` (árvore limpa, PostgreSQL 16.15 local)

| Grupo | Resultado |
|---|---|
| `build` · `typecheck` · `build:platform` | verdes (`dist/` carimbado em `578c42d0`) |
| Suítes novas: saída mínima · fila observada · processos · custo | 11/11 · 14/14 · 8/8 · 10/10 |
| Leituras do pronto · `ready-fact` · `test:entregas` | 26/26 · 29/29 · 242 linhas OK (igual à etapa anterior) |
| O que usa o feed alterado: feed durável · cluster PostgreSQL · consumidor (memória e PostgreSQL) · configuração do `source-ingest` · ligação do piloto (PostgreSQL) · procedência · assinatura no boot · laboratórios de atestação e de procedência | 9/9 · 8/8 · 12/12 e 3/3 · 9/9 · 6/6 · 32/32 · 4/4 · 20/20 · 16/16 |
| Contrato · ponte · adaptador · Q003 · ligação do runtime · topologia · espinha · conference · Q016 · append-only | 23 · 45 · 9/9 · 9/9 · 21 · OK · 29 · 41 · verde · verde |
| `cadeia` · `q017` · `test:platform` | Mesmas falhas pré-existentes, idênticas ao HEAD anterior: P1–P5 (senhas de papel que só o CI fornece; no CI a cadeia passou), O2, e a importação antiga de `pilot-delegation-issuer.ts` |
| Laboratórios dos passos 50 e 51 do CI | Recusam rodar fora do socket efêmero do GitHub Actions, por desenho (`LAB_REFUSED`). Rodam no CI |

Zero falha nova.

## 6. Custo medido com histórico crescente

Piloto em arquivo, fila parada em 20 registros:

| Viagens no histórico | `store.json` | snapshot | saída mínima | ciclo ocioso do consumidor antes → depois |
|---|---|---|---|---|
| 0 | 0 | 0,14 ms · 2.245 B | 0,18 ms · 2.606 B | 0,1 → 0,06 ms |
| 150 | 1,25 MB | 1,51 ms · 44.705 B | 0,19 ms · 2.606 B | **20,8 → 0,05 ms** |
| 450 | 3,78 MB | 4,46 ms · 130.505 B | 0,15 ms · 2.606 B | **99,1 → 0,05 ms** |

A saída mínima tem o mesmo tamanho com qualquer histórico (C1): ela lê a fila, não o passado. O ciclo
ocioso do `source-ingest`, que roda a cada segundo, deixou de crescer com o histórico.

Plataforma (PostgreSQL 16.15), viagens sintéticas com 40 pontos de GPS cada, intercalados como na
operação:

| Viagens | Linhas da unidade | Leitura | Páginas dos fatos | Marca (pela chave) |
|---|---|---|---|---|
| 100 | 4.500 | 12 ms | 119 | 3 páginas |
| 1.000 | 45.000 | 44 ms | 1.206 | 3 páginas |
| 10.000 | 450.000 | 502 ms | 12.081 | 4 páginas |
| 10.000 com índice `(unit_id, event_type, occurred_at)`, **só no banco descartável** | 450.000 | 456 ms | 11.149 | 4 páginas |

- **A marca é O(1)** (C3).
- **Os fatos do estado atual leem a unidade inteira, GPS incluído, e crescem com o histórico** (C4).
- **Um índice por tipo não resolve** (C9). Ele corta as linhas visitadas (180 mil → 60 mil), mas não as
  páginas (−8%), porque os três tipos estão em quase toda página. Uma migration de índice seria inútil.
- O que resolve é parar de reler o histórico: uma janela (a mesma decisão da Q-026) ou uma projeção
  incremental durável. As duas são decisões do César, agora com números.

## 7. Ponta a ponta com processos reais (`test:platform:fila-observada:processos`)

Piloto (`dist/tools/entregas_pilot_server.js`, modo arquivo), `source-ingest`
(`dist/src/platform/bin/entregas-source-ingest.js`, kill switch em arquivo), assíncrono
(`dist/src/platform/bin/async-runtime.js`) e PostgreSQL isolado. Todas as ações saem do HTTP do console.
Dados sintéticos, modo `simulated`.

| Prova | O que foi observado |
|---|---|
| E1 | O consumidor em execução leva do `store.json` ao event log 3 `delivery_ready`, 1 `delivery_removed` e a saída, todos `simulated`, uma vez; nenhum rótulo nem autor |
| E2 | O assíncrono drena as mensagens da entrega sem dead-letter; T1 em rota só com os fatos dela |
| E3 | Saída mínima por HTTP (gerente) + fatos: fila B e C, D retirado, A e F saíram, `fatos_em_dia` |
| E4 | Consumidor em `STOP` e B entra numa viagem: B some da fila, o fato não chegou, a leitura diz `fatos_atrasados`. Em `RUN`, fica em dia, com B aguardando saída |
| E5 | Consumidor reiniciado sobre o mesmo ponto: nenhuma duplicata |
| E6 | Piloto fora do ar: fila **indisponível** (`piloto_inalcancavel`), consistência desconhecida. Depois do reinício, as mesmas linhas e a mesma marca, byte a byte, com outro início de processo |
| E7 | Assíncrono reiniciado: o replay sobe, nada vai a dead-letter, a outbox continua drenada |
| E8 | O motoboy recebe 403 na rota do processo real |

## 8. O que continua desconhecido, e o próximo bloqueio operacional real

Não provado:

- Nada rodou em aparelho físico, banco de operação ou rede da loja.
- A leitura do estado atual ainda não tem consumidor em produção. Mostrá-la no Copiloto é a exceção
  visual que o César decide depois desta prova.
- **Quem observa a fila em operação, de onde e com qual credencial: Q-028 (aberta, PAUSE).** A rota só
  aceita gerente ou líder; o papel `sistema` do piloto tem poder de escrita; a nuvem não alcança a rede
  da loja.
- O custo dos fatos cresce com o histórico (§6). A janela ou a projeção incremental ficam com a decisão
  do César (Q-026).
- No PostgreSQL, o autor do registro segue UNKNOWN (sem coluna) e a marca sai indisponível. Não existe
  consumidor do feed em execução para o modo PostgreSQL: o `source-ingest` só lê arquivo.

**Próximo bloqueio operacional real.** No campo o piloto roda em `real`, e por decisão do César em 20/10 a
origem real segue fechada no `source-ingest` ("ORIGEM REAL CONTINUA NO_GO",
`docs/security/DELIVERYOS_SOURCE_PROVENANCE_RELEASE_GATE_2026-10-16.md`). Além disso, o consumidor nem está
na configuração da V1 (`LIBERACAO_V1_2026-10-31.md` §3). Resultado: em operação, **nenhum fato do pronto
chega à plataforma**. A fila observada, sozinha, mostraria registros reais com a consistência
`fatos_atrasados`, que é honesta e nunca vira estado completo inventado. Abrir essa porta exige:

- a chave do produtor do piloto no registro (0010 aplicada em operação);
- a custódia dessa chave;
- o `source-ingest` instalado junto dos dados do piloto;
- a aprovação do César.

## 9. Registro

- `docs/execution/PERGUNTAS.jsonl`: Q-028 aberta.
- `docs/execution/EVIDENCE.jsonl` e `docs/execution/MISSION_LEDGER.jsonl`: uma linha cada.
- `PRONTO_LEITURAS_2026-11-01.md` §5: o limite "a fila do modo arquivo não é visível para a plataforma"
  passa a ser tratado aqui. O texto antigo fica, com remissão.
