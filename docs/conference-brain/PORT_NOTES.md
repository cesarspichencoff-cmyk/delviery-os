# PORT_NOTES — Conference Brain para a plataforma híbrida

> Registro da port explícita por diretório do Conference Brain para este worktree.
> Método decidido previamente por análise de acoplamento. Este documento registra o
> que foi movido, o que foi deliberadamente deixado para trás, e o que a port **não**
> resolve. Nenhum número aqui é estimado — todos vêm de execução registrada abaixo.

## 1. Origem

| Campo | Valor |
|---|---|
| Worktree de origem | `C:\Users\italo\Desktop\Claude\deliveryos-copiloto-secure-bind-v1` |
| HEAD da origem | `aec902779d65414e33ababc561ff16499774912d` (`aec9027`) |
| Worktree de destino | `C:\Users\italo\Desktop\Claude\deliveryos-hybrid-platform-foundation-v1` |
| Método | Cópia de árvore por diretório, sem reescrita de import |
| Origem do gate de auditoria | `deliveryos-recheck-multidimensional-v2` @ `e5e8240` |

A origem permaneceu **somente leitura**: `git status --porcelain` na origem continua
vazio depois de toda a operação, inclusive depois da execução de controle da suíte.

## 2. O que foi copiado — 62 arquivos

| Árvore | Arquivos |
|---|---|
| `src/conference-brain/` | 34 |
| `tools/conference-brain/` | 2 |
| `tests/conference-brain/` | 6 |
| `docs/conference-brain/` | 20 |
| **Total** | **62** |

Mais 2 arquivos do gate de auditoria independente em `tests/auditoria/`.

Integridade verificada por `diff -r` árvore a árvore contra a origem: **as quatro
árvores são byte-a-byte idênticas**. Nenhum import foi reescrito porque nenhum
precisou ser: o Conference Brain importa apenas `crypto`, `fs`, `path` e ele mesmo
por caminho relativo. Zero dependência externa, zero dependência de módulo irmão.

## 3. O que foi deliberadamente NÃO copiado

| Não copiado | Motivo |
|---|---|
| `src/live/` | Não é dependência do Conference Brain. Motor de 8 praças / interface, fora do escopo. |
| `src/capacidade-viva/` | Não é dependência. Módulo em sombra, ciclo de vida próprio. |
| `src/ifood-official/` | Não é dependência. |
| `src/copiloto/` | Não é dependência. |
| `tools/live/interface/servir_d4a.js` | **Resíduo conhecido** — ver §6. |
| `tools/live/interface/servir_investigacao_volume.js` | **Resíduo conhecido** — ver §6. |
| `tests/auditoria/conference-sprint22-recheck.test.js` | Fora do escopo do gate pedido (só 2.3 e 2.4). |

A ausência dessas árvores é a causa direta — e única — da divergência da §4.

## 4. Resultado dos testes

### 4.1 Suíte do Conference Brain — divergência real, não maquiada

```
node --test "tests/conference-brain/*.test.js"
```

| Métrica | Esperado | Obtido no destino | Controle na origem |
|---|---|---|---|
| tests | 314 | **314** | 314 |
| suites | 44 | **44** | 44 |
| pass | 314 | **309** | 314 |
| fail | 0 | **5** | 0 |
| duração | < 2s | **748 ms** | 379 ms |

Total de testes, total de suítes e tempo batem. **`pass`/`fail` não batem: 5 testes falham.**

Os 5 são, integralmente:

1. `celulas operacionais seguem intactas` — `require("src/live/interface/celulas-operacionais")`
2. `adaptador V3.3 e o vocabulario das areas seguem intactos` — `require("src/live/interface/adaptador-v33")`
3. `Capacidade Viva continua em sombra, sem decisao automatica` — `require("src/capacidade-viva/shadow/config")`
4. `shadow config mantem o hash canonico` — `require("src/capacidade-viva/shadow/config")`
5. `motor de 8 pracas (celulas operacionais) nao foi tocado por este sprint` — `existsSync("src/live/interface/celulas-operacionais.js")`

**Nenhum dos 5 testa o Conference Brain.** Todos são sentinelas de não-regressão que
afirmam que módulos *vizinhos* do repositório de origem continuam intactos — exatamente
as árvores que o escopo mandou não copiar. Falham por `MODULE_NOT_FOUND` e por
`existsSync === false`, nunca por lógica do Conference Brain.

Prova de que a divergência é ambiental e não defeito da cópia: a mesma suíte, nos
mesmos 62 arquivos byte-idênticos, roda **314 pass / 0 fail** na origem, onde os
módulos irmãos existem. O delta é exatamente esses 5.

Consequência estrutural: esses 5 testes são **intrinsecamente não-portáveis**. Enquanto
`src/live/` e `src/capacidade-viva/` não existirem neste worktree, eles falham por
construção. Nenhum teste foi editado, marcado como `skip` ou ajustado para passar.

### 4.2 Gate de auditoria independente — passa integralmente

```
DELIVERYOS_AUDIT_TARGET_ROOT=<destino> node --test "tests/auditoria/*.test.js"
```

| Métrica | Esperado | Obtido |
|---|---|---|
| tests | 12 | **12** |
| pass | 12 | **12** |
| fail | 0 | **0** |
| duração | — | 168 ms |

Estes testes vêm de um worktree terceiro e resolvem os módulos por
`DELIVERYOS_AUDIT_TARGET_ROOT`, então exercitam o código **deste** destino sem
compartilhar nada com ele. Confirmam que as correções dos Sprints 2.3/2.4
sobreviveram à port — em particular `PiiGuard.sanitizeOrderObservation` e
`Grouping.PRESENCE.CONFLICT`, incluindo `PRESENCE.CONFLICT sobrevive ao store e o
painel nao afirma agrupamento`.

## 5. A port não quebrou o destino

Baseline capturado **antes** da cópia, para que "continua verde" signifique algo:

| Verificação | Antes da port | Depois da port |
|---|---|---|
| `npm run test:platform` | 44 platform tests OK | **44 platform tests OK** |
| `npx tsc --noEmit` | limpo (exit 0) | 1 erro — **alheio à port**, ver abaixo |

O erro de `tsc` depois da port é:

```
src/platform/projections/operacao-viva.ts(243,11): error TS2322:
  Property 'frescor' is missing in type '{...}' but required in type 'ViagemProjetada'.
```

Este erro **não vem da port**, e isso é demonstrável:

- A port não adicionou **nenhum** arquivo `.ts` (`find … -name '*.ts'` nas árvores
  portadas retorna vazio).
- `tsconfig.json` inclui apenas `src/**/*.ts` e **não** define `allowJs`/`checkJs` —
  os 62 arquivos `.js` portados são invisíveis ao compilador.
- O arquivo que falha está em `src/platform/**`, território que a port não tocou.
- Ele está **untracked** (`?? src/platform/projections/operacao-viva.ts`) e foi
  modificado 32 s **depois** dos arquivos portados — é trabalho em voo de outra frente.
- O erro é único e confinado a esse arquivo; nenhum erro em `conference-brain`.

Fica registrado como achado a devolver a quem está trabalhando em `src/platform/`,
não como pendência desta port.

## 6. Resíduo conhecido — confirmado ausente

`tools/live/interface/servir_d4a.js` e `tools/live/interface/servir_investigacao_volume.js`
fazem `listen` em `0.0.0.0` incondicionalmente. **Não estavam no escopo e não foram
trazidos** — confirmado: o diretório `tools/live/` sequer existe neste worktree, e uma
busca por nome nos dois arquivos em todo o destino não retorna nada.

O único servidor que veio, `tools/conference-brain/operator-panel-server.js`, tem o
comportamento **oposto**: falha fechada. `PANEL_HOST` só aceita loopback
(`127.0.0.1`, `localhost`, `::1`), o padrão é `127.0.0.1`, e `0.0.0.0` / `::` estão em
`REJECTED_HOSTS` — o processo não sobe. É a correção do bloqueador 2 do Sprint 2.2, e
ela chegou intacta.

## 7. Lacuna conhecida — o modelo está pronto, o extrator não

As 9 dimensões vivem em `src/conference-brain/contracts/live-states.js` e são montadas
por `buildOrderObservation` em `src/conference-brain/live/multidimensional-observation.js`:
`layout`, `visual`, `order_state` (produção), `readiness` (prontidão), `courier`
(logística), `dispatch` (despacho), `completion` (conclusão), `fulfillment_mode`
(modalidade), `store` (loja).

O extrator Playwright, porém, emite **dois campos**. Em
`src/conference-brain/live/browser-adapter.js:140`:

```js
orders.push({ external_id: id, raw_status: rawStatus || "" });
```

Medido neste worktree, alimentando `buildOrderObservation` apenas com o que essa linha
produz: **7 das 9 dimensões recebem ZERO entrada do extrator.** Só `order_state` e
`readiness` derivam de algo real, e ambas do mesmo `raw_status`.

| Dimensão | Recebe entrada do extrator | Valor resultante |
|---|---|---|
| `layout` | não | `"unknown"` |
| `visual` | não | `"unknown"` |
| `order_state` | **sim** (`raw_status`) | `"preparing"` |
| `readiness` | **sim** (`raw_status`) | `"not_ready"` |
| `courier` | não | `"not_applicable"` |
| `dispatch` | não | `"not_applicable"` |
| `completion` | não | `"active"` |
| `fulfillment_mode` | não | ausente |
| `store` | não | `"unknown"` |

**Armadilha de leitura, registrada de propósito:** das 7 dimensões famintas, só 3
aparecem literalmente como `unknown`. As outras 4 caem em `not_applicable`, `active`
ou ausência — valores que *parecem* observação e não são. `completion: "active"` sem
entrada nenhuma não é um fato observado; é o default do construtor. Quem for ligar o
Conference Brain a uma fonte real precisa tratar esses 4 como "não observado", sob
pena de carimbar estado que ninguém viu — o que o próprio contrato do projeto proíbe.

O modelo multidimensional está **completo e testado** (309 testes próprios verdes, mais
12 de auditoria independente). O **extrator** é que é parcial. A port não muda isso em
nenhuma direção: ela move a lacuna junto, sem aumentá-la nem escondê-la.

## 8. Fronteira preservada

`createLiveObserver({ store, fetchOrders, runId, collectorVersion })` em
`src/conference-brain/live/observer.js` continua **exatamente** como na origem —
byte-idêntico. `fetchOrders` permanece injetável, e é ela a fronteira que permite
alimentar o Conference Brain com qualquer fonte, inclusive eventos desta plataforma em
vez do Playwright. Nada nesta port tocou esse contrato; é justamente por essa fronteira
que a lacuna da §7 é substituível sem mexer no modelo.

## 9. O que esta port não fez

- Não alterou `package.json` — os scripts (`test:conference`, etc.) continuam por ligar.
- Não tocou `src/platform/**`.
- Não fez commit; tudo está no working tree para revisão.
- Não editou, pulou nem afrouxou nenhum teste.
