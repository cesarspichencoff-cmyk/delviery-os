# Conference Brain — mapa forense

> Análise de **2026-07-27**, HEAD `1683510`. Reprodução feita num extrato
> isolado em `scratchpad/forense-cb/`, sem tocar em nenhuma branch.
>
> **Nenhum arquivo foi portado. Nenhum código de produção foi alterado.**

---

## 1. O que existe de fato

**65 arquivos**, não 63 — a contagem anterior omitia os 2 de `tests/auditoria`.

| Área | Arquivos |
|---|---|
| `src/conference-brain/**` | **34** |
| `docs/conference-brain/` | 21 |
| `tests/conference-brain/` | 6 |
| `tools/conference-brain/` | 2 |
| `tests/auditoria/` | 2 |

Dentro do núcleo: `live/` 20 · `contracts/` 4 · `normalize/` 2 ·
`ingestion/adapters/` 2 · `storage/`, `snapshots/`, `shadow/`, `ingestion/`,
`composition/`, raiz — 1 cada.

## 2. Os cinco testes falhos — causa REPRODUZIDA

A explicação anterior ("são módulos vizinhos") estava **certa na conclusão e
errada no mecanismo**. Não é dependência ausente do núcleo. É outra coisa.

| # | Teste | Arquivo:linha | O que ele faz |
|---|---|---|---|
| 1 | `celulas operacionais seguem intactas` | `foundation.test.js:388` | `require(R + "src/live/interface/celulas-operacionais")` |
| 2 | `adaptador V3.3 e o vocabulario das areas seguem intactos` | `foundation.test.js:394` | `require(R + "src/live/interface/adaptador-v33")` |
| 3 | `Capacidade Viva continua em sombra, sem decisao automatica` | `foundation.test.js:401` | `require(R + "src/capacidade-viva/shadow/config")` |
| 4 | `shadow config mantem o hash canonico` | `foundation.test.js:407` | idem, e compara `actual_sha256` com `METADATA.expected_sha256` |
| 5 | `motor de 8 pracas nao foi tocado por este sprint` | `live-observer.test.js:640` | `assert.ok(fs.existsSync(".../celulas-operacionais.js"))` |

**Classificação: teste de não-regressão sobre módulo vizinho.**

Os cinco vivem em blocos `describe("compatibilidade com o que ja existe")` e
**não testam o Conference Brain**. Eles afirmam que o sprint do Conference
Brain não quebrou o motor de 8 praças, o adaptador V3.3 e a Capacidade Viva.

Não são: dependência ausente do núcleo · contrato incompatível · regressão
real · estado global vazando · implementação incompleta do subagente.

### As duas provas que fecham o diagnóstico

**(a) O núcleo é autocontido.** Varredura de todos os `require` em
`src/conference-brain/**` devolve exatamente quatro alvos externos:

```
crypto   fs   path   playwright
```

`playwright` só no `live/browser-adapter.js`, atrás de `tryLoadPlaywright` —
ausência dele é tratada, não quebra.

**(b) A própria suíte já afirma a independência.** O teste
`o cerebro da Conferencia nao depende de ENTREGAS`
(`foundation.test.js:414`) varre o diretório inteiro procurando referência a
ENTREGAS — e **passa**.

### Consequência prática

`314/314` **nunca foi alcançável** portando só o Conference Brain. Os cinco
guardas só passam num repositório que também tenha `src/live/interface/` e
`src/capacidade-viva/shadow/`. A expectativa estava errada desde o enunciado.

O número correto do núcleo é **309/309**.

## 3. Gate de auditoria independente — EXECUTADO

```bash
DELIVERYOS_AUDIT_TARGET_ROOT=<extrato> \
  node --test tests/auditoria/conference-sprint23-lightning.test.js \
               tests/auditoria/conference-sprint24-conflict-smoke.test.js
```

**12 passaram, 0 falharam.**

Esses testes foram escritos numa branch de auditoria **separada**, e verificam
`PiiGuard.sanitizeOrderObservation` e `Grouping.PRESENCE.CONFLICT` — símbolos
que só existem no estado pós-Sprint 2.4. É a confirmação executável, por um
terceiro, de que o código preservado carrega as correções 2.3 e 2.4.

## 4. Mapa dos 65 arquivos

| Grupo | Qtd | Decisão |
|---|---|---|
| **A. Núcleo obrigatório** — `contracts/` (4), `live/` reconciliação, agrupamento, indicadores, relógio, PII guard, observer | ~14 | **PORTAR** |
| **B. Adapters** — `ingestion/adapters/` (2), `normalize/` (2) | 4 | **PORTAR** — fronteira que permite alimentar o Brain com QUALQUER fonte |
| **C. Contratos compartilhados** — `contracts/states.js`, `live-states.js`, `schemas.js` | 3 (dentro de A) | **PORTAR** |
| **D. Testes** — `tests/conference-brain/` | 6 | **PORTAR com ressalva**: os 3 blocos `compatibilidade` precisam ser marcados como inaplicáveis, **nunca apagados** |
| **E. Documentação** — `docs/conference-brain/` | 21 | **PORTAR SELETIVAMENTE** — só o que descreve contrato; o resto é histórico de sprint |
| **F. Vizinhos indevidos** | 0 | nenhum entrou no port |
| **G. Obsoleto** — `browser-adapter.js` + preflight Playwright | ~4 | **NÃO PORTAR AGORA** — extrai só `external_id` + `raw_status`; a entrada do DeliveryOS é a Operação Viva, não scraping |
| **H. Desnecessário** — `tools/conference-brain/` (painel operador + validate-historical) | 2 | **NÃO PORTAR AGORA** — painel é superfície, e a Unidade 4 é motor |
| **Auditoria** — `tests/auditoria/` | 2 | **PORTAR** — é o gate independente que prova que a port não perdeu 2.3/2.4 |

### Fatia mínima capaz de receber sinais da Operação Viva

**~18 arquivos:** `contracts/` + `live/reconciliation.js` + `grouping.js` +
`indicators.js` + `clock.js` + `pii-guard.js` + `observer.js` +
`legacy-compat.js` + `multidimensional-observation.js` + `storage/store.js` +
`normalize/` + `ingestion/adapters/`.

Fora: browser adapter, preflight Playwright, painel, docs de sprint.

## 5. Contratos

### Entrada — Operação Viva → Conference Brain

A fronteira já existe e **não precisa ser inventada**:

```js
createLiveObserver({ store, fetchOrders, runId, collectorVersion })
```

`fetchOrders()` é injetável e devolve `{ orders[], signals, health? }`. Hoje a
implementação de produção é scraping; nada impede que seja a projeção.

O que a `Projecao` do HEAD `1683510` já oferece, e o que falta mapear:

| Conference Brain espera | Operação Viva tem hoje |
|---|---|
| identidade da unidade | `unit_id` ✅ |
| real/simulado/controle | `source_mode` ✅ |
| staleness | `frescor` (fresh/aging/stale/unknown) ✅ |
| timestamps | `occurred_at`, `ultimo_fato_em`, `ultima_posicao_em` ✅ |
| dimensões | 9 dimensões operacionais — **vocabulário diferente** das 9 do Brain ⚠️ |
| agrupamento / remoção / desativação | **não existe** na projeção ❌ |
| replay | `reconstruirPorReplay` ✅ |

**As duas listas de nove dimensões não são a mesma coisa.** As do Brain são
sobre PEDIDO observado em tela (layout, visual, produção, prontidão, logística,
despacho, conclusão, modalidade, loja). As da Operação Viva são sobre CARGA da
operação (carga, atraso, mobilidade, integridade, sincronização, confiança,
capacidade, ocorrências, envelhecimento). O adapter precisa traduzir, não
casar campo a campo.

### Saída — Conference Brain → Copiloto shadow

`reconcileMultidimensional(externalId, observations)` é **projeção pura** sobre
o histórico, recalculada a cada leitura — nunca guardada. Compatível por
construção com o que o Copiloto shadow do HEAD já consome.

Traz: dimensões reconciliadas · `source_health` com `reasons[]` · `origin`
(`ifood_screen`/`operator_manual`/`system_inference`/`imported_history`) ·
versões · evidência. `conference_state.mode !== "shadow"` é recusado pelo
schema (`schemas.js:129`).

**Falta**: `confidence` numérico no formato que `exigirConfianca` do Copiloto
espera, e `expires_at`. Ambos acrescentáveis no adapter de saída.

## 6. Bloqueadores históricos — verificação

| Item | Veredito |
|---|---|
| PII em mapping mode | **CORRIGIDO E PROVADO** — gate de auditoria independente exercita `sanitizeOrderObservation`, 12/12 |
| Listener além de localhost | **NÃO APLICÁVEL AO PORT** — o resíduo `0.0.0.0` está em `tools/live/interface/servir_d4a.js` e `servir_investigacao_volume.js`, que **não entraram** no port |
| Sinais multidimensionais não renderizados | **NÃO APLICÁVEL** — é do painel (`tools/`), fora da fatia mínima |
| Modelo desconectado do observador | **CORRIGIDO na camada do observador; AINDA PRESENTE na extração** — `browser-adapter.js:140` produz só `external_id` + `raw_status`, então 7 das 9 dimensões chegam `unknown` via Playwright. **Irrelevante para o DeliveryOS**, cuja entrada será a Operação Viva |
| Agrupamento removido não some | **CORRIGIDO E PROVADO** — `PRESENCE.CONFLICT` verificado pelo gate independente |
| Agendamento desativado preserva estado | **PARECE CORRIGIDO, NÃO PROVADO** — `reconcileSchedule` usa a leitura mais recente; não há teste independente que o confirme |
| Ações/indicadores antigos permanecem | **PARECE CORRIGIDO, NÃO PROVADO** — flags `actions_observed` / `indicatorsObserved` existem; sem gate independente |
| Preflight incompatível | **NÃO APLICÁVEL** — Playwright fora da fatia mínima |
| Idempotência | **CORRIGIDO E PROVADO** — `isSameFact` por identidade do fato; coberto pelos 309 |
| Recuperação | **PARECE CORRIGIDO, NÃO PROVADO** — `store.health()` expõe linhas corrompidas; sem exercício adversarial independente |
| Documentação divergente | **INDETERMINADO** — 21 arquivos não auditados linha a linha |

## 7. Estratégias

| | Código | Regressão | Aderência | Testes reaproveitáveis | Veredito |
|---|---|---|---|---|---|
| **A. Port seletivo do núcleo** | ~18 arq. | baixo | alta | 309 + 12 | **ESCOLHIDA** |
| **B. Reimplementar sobre contratos atuais** | ~15 arq. novos | **alto** | alta | 0 | rejeitada |
| **C. Port + adapters para vizinhos** | ~24 arq. | médio | média | 314 | rejeitada |
| **D. Portar os 65** | 65 arq. | alto | baixa | 314 | rejeitada |

**Escolhida: A — port seletivo do núcleo, com adapter de entrada novo.**

**Por quê:** o núcleo é autocontido (provado), passa 309/309 no isolamento, e o
gate independente confirma 12/12 as correções 2.3/2.4. Ele traz doze correções
de segurança adversarial — PII por allowlist com `fullMatch`, canonicalização
de hostname, determinismo de empate, idempotência por identidade de fato — que
existem **porque a versão óbvia delas estava errada**.

**Por que não B:** reescrever essas doze correções do zero é a forma mais cara
de reaprender o que já foi aprendido, e sem os 309 testes para acusar o erro.

**Por que não C:** portar `src/live/interface/` e `src/capacidade-viva/` só
para satisfazer 5 testes-guarda traz dois módulos que o DeliveryOS não usa. Os
guardas protegem um repositório onde aqueles módulos existem; aqui eles não
existem, e o guarda perde o objeto.

**Por que não D:** traz painel, scraping e 21 documentos de sprint que a
Unidade 4 não precisa. Superfície é escopo próprio.

### Os 5 guardas, na prática

**Não apagar.** Marcar como inaplicáveis, com o motivo no próprio arquivo:
os módulos que eles protegem não existem neste repositório. Se um dia
existirem, o guarda volta a valer.

## 8. Plano da próxima janela

| Unidade | Arquivos | Comportamento | Testes | Conclusão quando |
|---|---|---|---|---|
| **4B1 — contratos e store** | `contracts/` (4) + `storage/store.js` + `normalize/` | vocabulário e persistência append-only | subconjunto de `foundation.test.js` | contratos importáveis, store idempotente |
| **4B2 — núcleo multidimensional** | `reconciliation.js`, `grouping.js`, `indicators.js`, `multidimensional-observation.js`, `pii-guard.js` | reconciliação pura; PII por allowlist | `multidimensional-model.test.js` + gate de auditoria 2.3/2.4 | 12/12 no gate independente |
| **4B3 — observador e relógio** | `observer.js`, `clock.js`, `legacy-compat.js` | ciclo, presença, remoção, expiração | `live-observer.test.js` menos os guardas | remoção limpa estado; expiração some |
| **4B4 — adapter Operação Viva → Brain** | 1 arquivo NOVO | traduz `Projecao` em `fetchOrders()`; mapeia as duas listas de 9 dimensões | novo, com `source_mode` preservado ponta a ponta | sinal real do HEAD chega ao Brain |
| **4B5 — gate adversarial** | — | remover PII guard, idempotência, expiração e exigir falha | — | cada garantia removida derruba o teste certo |

Riscos: **4B4 é o único com desenho novo** — as duas listas de nove dimensões
descrevem coisas diferentes, e forçar correspondência campo a campo produziria
um mapeamento que parece certo e mente. É onde a atenção deve ficar.

Cada bloco fecha com commit local e working tree limpo.

## 9. O que NÃO foi feito

Nenhum arquivo portado · nenhum código de produção alterado · nenhum teste
corrigido · nenhum merge, rebase ou cherry-pick · nenhuma dependência
instalada · os 21 documentos não foram auditados linha a linha.
