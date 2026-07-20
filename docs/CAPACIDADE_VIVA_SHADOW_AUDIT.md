# Auditoria local — Capacidade Viva human-v2 em modo sombra (Fase 2E.2)

> Continuação da Fase 2E.1 ([docs/CAPACIDADE_VIVA_SHADOW.md](CAPACIDADE_VIVA_SHADOW.md)). Esta auditoria
> não altera calibração, limites nem interface — só executa o Copiloto real localmente e verifica, com
> evidência reproduzível, que as garantias descritas naquele documento realmente se sustentam em runtime.

## 1. Ambiente

| Item | Valor |
|---|---|
| Worktree | `deliveryos-copiloto-v33-implementation` |
| Branch | `feature/copiloto-v33-implementation` |
| HEAD inicial | `41902a5` |
| Entrada canônica | `GET /` → redireciona 302 para `/app-v1/index.html` |
| URLs locais usadas nesta auditoria | `http://localhost:5185/` (verificação visual, sombra ligada) · `http://localhost:5186/` (verificação visual, sombra desligada) · `http://localhost:5187–5190/` (auditoria funcional via servidor real, ver §7) |
| Comando canônico reprodutível | `CAPACIDADE_VIVA_HUMAN_V2_SHADOW=true node tools/servir_v1.js` (ou `node tools/servir_v1_shadow.js`, novo nesta fase) |

Boot confirmado sem erro bloqueante: layout V3.3 preservado (praças em círculo, tipografia, paleta),
progressão cromática preservada (`body[data-mode]="calmo"` em operação tranquila, mesma paleta verde da
Fase congelada em `6f04177`), nenhum erro no console do navegador, todos os recursos de boot
(`app.js`, `style.css`, `manifest.webmanifest`, seed do cardápio) respondendo 200.

## 2. Flag e configuração

- **Flag sombra ativa**: `CAPACIDADE_VIVA_HUMAN_V2_SHADOW=true` — confirmado por observação real
  persistida em `observacoes.runtime.jsonl` após a primeira requisição a `/api/fonte`.
- **Configuração**: `cv-cal-tata-human-v2` (v2), origem `deliveryos-capacidade-viva-calibration@076a1cb`.
- **Hash validado**: `f248a17328ca71fc8608e0897d24ee3966bf0b7bcd55afbebb6feaa4cc7534dc` — recalculado a
  cada carregamento e conferido byte a byte contra o valor congelado na Fase 2E.1.
- **Adaptador inicializado**: confirmado pela presença de `config_nome`, `config_hash`,
  `commit_validacao`, `status_config:"shadow_only"`, `automatic_decisions_allowed:false` em toda
  observação real gerada.

## 3. Ferramentas desta auditoria (novas, não alteram nada existente)

- **`tools/servir_v1_shadow.js`** — launcher que garante `CAPACIDADE_VIVA_HUMAN_V2_SHADOW=true` antes de
  subir `tools/servir_v1.js` de verdade (não duplica o servidor, só define a env var e delega).
- **`tools/auditar_capacidade_viva_shadow.js`** — roda os módulos reais (`config.js`, `adapter.js`,
  `human-rules.js`, `observation-log.js`, `flags.js`) sobre cenários controlados e imprime um relatório
  determinístico. Não persiste no log real (`persist:false`) — serve para reauditar a qualquer momento
  sem gerar ruído em `data/`. Execução desta fase: **33/33 checks OK, 0 falhas**.

```
node tools/auditar_capacidade_viva_shadow.js
```

## 4. Cenários executados e resultados

Todos os valores abaixo vêm da execução real de `tools/auditar_capacidade_viva_shadow.js` mais três
rodadas de servidor real (`tools/servir_v1.js`) com env controlada — não são estimativas.

### Bandas de severidade

| Cenário | Entrada | Estado obtido | Esperado | Caminho |
|---|---|---|---|---|
| Motoboy 5–9.99 min | 7 min | `normal` | `normal` | regra direta¹ |
| Motoboy 10–14.99 min | 12 min | `atencao` | `atencao` | regra direta¹ |
| Motoboy 15–19.99 min | 17 min | `quase_critico` | `quase_critico` | regra direta¹ |
| Motoboy 20+ min | 25 min | `critico` | `critico` | regra direta¹ |
| Pronto <25 min | 15 min | `normal` | `normal` | adapter (janela NIGHT real) |
| Pronto 25–35 min | 30 min | `atencao` | `atencao` | adapter |
| Pronto 35–40 min | 37 min | `quase_critico` | `quase_critico` | adapter |
| Pronto 40+ min | 45 min | `critico` | `critico` | adapter |
| Volume isolado sem sinal de espera | contagem bruta, sem timing por pedido | `evidencia_insuficiente` | `evidencia_insuficiente` | regra direta¹ |

¹ "regra direta" = `classifyOrderHuman` chamada diretamente com um fato construído à mão, não via o
adaptador — motivo explicado em §6 (limitação D4A do braço motoboy) e §6b (gate de volume isolado).

### Qualidade da fonte

| Cenário | Resultado |
|---|---|
| Idade incompatível (500 min sem terminal) | `qualidade_da_fonte`, zumbi=true |
| Dado temporal contraditório (pronto 120 min > idade 30 min + 60) | `qualidade_da_fonte`, subtype=`dado_temporal_incompativel` |
| Status travado (idade e pronto ambos ≥180 min, nunca saiu) | `qualidade_da_fonte`, zumbi=true |

Todos os três excluem `exclude_from_isf`, `exclude_from_capacity` e `exclude_from_pause`
simultaneamente — nenhum pedido zumbi pressiona praça, ISF ou pausa.

### Falha técnica (fail-safe, §9)

Testado tanto via chamada direta ao módulo quanto via **servidor real rodando** (`tools/servir_v1.js`
de verdade, porta local, `curl` real contra `/api/fonte`):

| Cenário | `/api/fonte` continua respondendo `ready`? | Registro |
|---|---|---|
| Configuração ausente (caminho inexistente) | **SIM** — 8 pedidos na janela, normal | 1 linha em `falhas.runtime.jsonl`, motivo `config_ausente` |
| Hash inválido (fixture alterada) | **SIM** — 8 pedidos na janela, normal | 1 linha em `falhas.runtime.jsonl`, motivo `hash_incompatível`, hash esperado e encontrado registrados |
| Snapshot incompatível (`NIGHT` não é array, `t` não é número) | adapter devolve `{ok:false}` sem lançar | não aplicável (chamada direta ao módulo) |
| Entrada nula/indefinida | adapter devolve `{ok:false}` sem lançar | não aplicável (chamada direta ao módulo) |

Em nenhum dos quatro casos o Copiloto parou de responder, e em nenhum caso a falha vazou para o canal
de observação operacional — sempre foi parar exclusivamente em `falhas.runtime.jsonl`.

## 5. Isolamento visual (§3 da missão)

Comparação com **dois servidores reais simultâneos**, mesmo cenário e mesma seed
(`?cenario=foco&seed=audit-2e2`): um com `NODE_ENV=production` (sombra desligada), outro com
`CAPACIDADE_VIVA_HUMAN_V2_SHADOW=true` (sombra ligada, configuração válida).

- **Conjunto de campos do payload**: idêntico nos dois servidores.
- **Conteúdo do payload** (exceto `gerado_em`, que reflete o relógio local de cada processo): **idêntico
  byte a byte** — `JSON.stringify` igual nos dois.
- **`body[data-mode]`**: `"calmo"` nos dois (verificado via navegador real em ambas as portas).
- **Texto visível ao operador**: extraído via leitura de página real — nenhuma menção a "sombra",
  "shadow", "human-v2" ou ao nome/hash da configuração em nenhum dos dois.
- **Painel de intervenção, praça destacada, prioridade oficial**: inalterados — o payload que os
  alimenta é, como provado acima, byte-idêntico.

Conclusão: a saída do motor sombra **não** altera `body[data-mode]`, progressão cromática, painel de
intervenção, praça destacada, evidências visíveis, prioridade oficial, textos ao operador ou o estado
atual do Copiloto. A única diferença observável entre sombra ligada e desligada é a existência (ou não)
de linhas em `data/capacidade-viva/shadow/*.runtime.jsonl` — um canal técnico que o navegador nunca lê.

## 6. Multiplicidade de pedidos (zumbi + normal + crítico na mesma janela)

Janela com três pedidos simultâneos: um zumbi (idade 500 min, sem terminal), um normal (pronto há 5
min) e um crítico real (pronto há 45 min sem saída).

- **Zumbi excluído**: sim — contabilizado em `pedidos_excluidos_por_fonte: 1`.
- **Normal não mascara o crítico**: confirmado — o normal nunca compete pela posição de observação
  dominante (severidade 0 é sempre superada por qualquer pressão real).
- **Crítico permanece dominante**: `estado: "critico"`, `severidade: 3`.
- **ISF considera só dado válido**: `participa_do_isf: true` para o pedido crítico reportado; o zumbi
  nunca participa (ver §4 acima).
- **Observação registra exclusão e criticidade juntas**: o mesmo registro traz `estado:"critico"` **e**
  `pedidos_excluidos_por_fonte:1` — a auditoria não precisa de dois registros para saber as duas coisas.

Esta é a mesma precedência corrigida na Fase 2E.1 (o adaptador originalmente deixava um zumbi "vencer"
um crítico real na disputa por qual pedido vira a observação da janela); esta auditoria reconfirma que a
correção continua válida.

## 7. Deduplicação e heartbeat

Sequência real de 8 "ticks" processados pelo mesmo `observation-log` (heartbeat configurado para 15
min): normal→normal→normal→crítico→crítico→(saúde da fonte degrada)→(mesma degradação)→(+15min, mesmo
estado).

| # | Entrada | Registrado? | Motivo |
|---|---|---|---|
| 1 | pronto 30min, fonte ready | sim | `primeira_observacao` |
| 2 | idêntico | não | `tick_equivalente_deduplicado` |
| 3 | idêntico | não | `tick_equivalente_deduplicado` |
| 4 | pronto 45min (crítico), fonte ready | sim | `mudanca_de_estado` |
| 5 | idêntico | não | `tick_equivalente_deduplicado` |
| 6 | fonte degrada | sim | `mudanca_saude_da_fonte` |
| 7 | idêntico | não | `tick_equivalente_deduplicado` |
| 8 | +15min, mesmo estado/fonte | sim | `heartbeat_tecnico` |

**Redução observada: 8 snapshots processados → 4 registros persistidos (50% deduplicado)**, com cada
um dos quatro gatilhos exigidos pela missão (mudança de estado, mudança de saúde da fonte, heartbeat no
intervalo configurado) provado isoladamente. "Surgimento/resolução de exceção" é, neste motor, uma
subcategoria de mudança de estado (a passagem para `critico` já É o surgimento da exceção) — não é um
gatilho independente, por isso não aparece como uma quinta razão distinta.

## 8. D4A e limitação do braço motoboy

Forma real de uma entrada `NIGHT` que chega ao runtime (capturada nesta auditoria, pedido sintético):

```json
{"id":"PED-AUDIT","curto":"AU1","r":978,"p":988,"s":null,"e":null,"c":null}
```

`s` (saída da loja) e `e` (entrega) chegam **sempre `null`** — não há, hoje, nenhuma fonte de dado que
observe esses dois eventos (ver `src/live/interface/adaptador.js`, comentários nas linhas 120–121: "não
observado pela fonte simulada — nunca inventado"). O fato normalizado pelo adapter reflete isso
honestamente:

```json
{"...": "...", "courier_wait_store_min": null, "courier_wait_epistemic": null}
```

**D4A fornece espera real do motoboy na loja? NÃO.** O braço "motoboy esperando" de
`classifyOrderHuman` é estruturalmente inalcançável via snapshot ao vivo nesta integração — não porque
a regra esteja quebrada (as quatro bandas foram reconfirmadas nesta auditoria chamando a regra
diretamente, §4), mas porque a fonte de dado que a alimentaria não existe ainda. O sistema não inventa
esse sinal: quando ausente, o adapter deixa `courier_wait_store_min: null` e a análise segue pelos
braços que a janela realmente sustenta (pronto sem saída, idade operacional). Nenhum pedido perde
avaliação por isso — só não é avaliado *pelo braço motoboy* especificamente.

**Recomendação técnica separada (aquisição futura do dado):** para o braço motoboy virar observável de
verdade, a fonte precisa passar a registrar o evento "motoboy retirou o pedido da loja" com carimbo de
tempo — hoje a única saída observada é `p` (pronto), nunca uma saída física. Isso é uma decisão de
captação de dado operacional (ex.: botão de confirmação na expedição, ou leitura do sistema do parceiro
de entrega), não uma mudança de código no Copiloto ou no motor human-v2. Até essa fonte existir, o braço
motoboy continua coberto só por teste direto sobre a regra — nunca por dado real ao vivo. Este documento
não recomenda fabricar ou aproximar esse sinal a partir de outro campo.

## 9. Ausência de dado pessoal

Em nenhuma observação real gerada nesta auditoria (incluindo a de maior severidade, `critico`) apareceu
nome de funcionário, ranking, score individual, comando executável (`intervencao_executavel` é sempre
`false`) ou `automatic_decisions_allowed:true`. Campos como `config_nome` (nome da *configuração*, não
de pessoa) são intencionais e exigidos pela Fase 2E.1 §4.

## 10. Riscos ainda existentes

- **Braço motoboy sem cobertura de dado real** (§8) — risco de calibração ficar "cega" para esse tipo de
  pressão até a fonte existir. Mitigação: documentado, não contornado, coberto por teste direto.
- **Volume de observações reais ainda é zero** — esta auditoria roda contra o simulador/fixtures
  controlados, não contra operação real. Nenhuma conclusão sobre precisão em produção pode ser tirada
  daqui — só sobre a integridade da integração.
- **Dependência de reinício de processo para mudar a flag** — hoje, ligar/desligar o modo sombra exige
  reiniciar `tools/servir_v1.js` com a env var certa; não há hot-reload. Aceitável para esta fase
  (nenhuma decisão automática depende disso), mas relevante se uma fase futura quiser alternância mais
  ágil.
- **Heartbeat testado com relógio sintético, não com o passar real do tempo** — a lógica foi provada
  correta (`Date.parse` real, deltas reais), mas uma operação real rodando por horas seguidas ainda não
  foi observada.

## 11. Recomendação para coleta real

Mantém-se a recomendação já registrada na Fase 2E.1 ([CAPACIDADE_VIVA_SHADOW.md](CAPACIDADE_VIVA_SHADOW.md#critérios-para-observação-futura-em-operação-real)):
nenhuma ativação além de modo sombra antes de semanas de observação real, confronto explícito feito por
César, e aprovação humana registrada. Esta auditoria não altera esse critério — só confirma que a
infraestrutura está pronta para começar a coletar com segurança.
