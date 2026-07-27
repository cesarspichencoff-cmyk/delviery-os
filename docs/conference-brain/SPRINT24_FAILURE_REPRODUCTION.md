# Sprint 2.4 — Reprodução das 2 falhas do gate relâmpago (Fase 0)

> Executado ANTES de qualquer alteração de código, a partir de `9e73a34`
> (branch `fix/conference-live-multidimensional-model-v4`). Suíte de origem:
> `deliveryos-recheck-multidimensional-v2/tests/auditoria/conference-sprint23-lightning.test.js`
> (commit `c42fbda`, worktree `audit/recheck-conference-live-multidimensional-v2`),
> copiada **sem alteração** para `tests/auditoria/` nesta branch. O teste
> requer `DELIVERYOS_AUDIT_TARGET_ROOT` apontando para este worktree — nunca
> incorporado à branch de auditoria, nunca `cherry-pick` do commit de lá.

```
DELIVERYOS_AUDIT_TARGET_ROOT=<este worktree> node --test tests/auditoria/conference-sprint23-lightning.test.js
ℹ tests 11
ℹ pass 9
ℹ fail 2
```

Confere exatamente com o relatório da rechecagem relâmpago (`9/11 aprovados`).

## Tabela das 2 falhas

| # | Teste | Entrada | Esperado | Obtido | Função responsável | Causa-raiz |
|---|---|---|---|---|---|---|
| 1 | `empate temporal contraditorio de agrupamento nao pode depender da ordem de replay` | Duas leituras de agrupamento com o **mesmo** `observed_at` (`2026-07-24T10:00:00.000Z`) e fatos contraditórios: uma diz PRESENT (grupo `L-TIE`, membros `L-A`/`L-B`), a outra diz REMOVED (`observed:true`, vazia). `forward = reconcileGrouping([present, removed])`; `reversed = reconcileGrouping([removed, present])` | `forward.current` deve ser igual a `reversed.current` (o resultado não pode depender de qual candidato aparece primeiro no array) | `forward.current.presence === "removed"` (o último do array `[present, removed]`); `reversed.current.presence === "present"` (o último do array `[removed, present]`) — **divergem** | `grouping.js#reconcileGrouping` | A correção do Sprint 2.3 ordena por `observed_at` com `Array.prototype.sort` (estável) e dobra sequencialmente — mas quando dois candidatos têm o **mesmo** `observed_at`, o sort estável preserva a ORDEM DE ENTRADA original entre eles. "Ordenar por tempo" degenera silenciosamente em "ordenar por posição no array" exatamente no caso de empate — o mesmo bug do bloqueador 3 do Sprint 2.3, sobrevivendo disfarçado dentro do próprio desempate. |
| 2 | `crash apos prontidao multidimensional persistida e antes do relogio e reparado sem depender do legado` | Uma observação multidimensional é construída com `readiness.confirmationText: "Pedido pronto avisado"` e `orderStateText: ""` (vazio) — `order_state` fica `unknown`, mas `readiness_state` fica `READY_NOTIFIED` via o texto de confirmação. `Clock.isReadyFromMultidimensional(projected)` confirma prontidão (`true`). A observação é persistida manualmente em `live_observations` (simulando o crash: estado gravado, evento do relógio NUNCA chegou a ser emitido). Um ciclo de recuperação roda com o mesmo `raw_status`/`readiness` | Exatamente 1 evento `ready_observed` deve ser criado na recuperação | 0 eventos criados | `observer.js` (bloco de emissão de `READY_OBSERVED`) | O bloco de recuperação (já corrigido no Sprint 2.3 para reavaliar TODO ciclo, não só quando o texto muda) decide se o pedido está pronto usando `isReadyMilestone(status)`, onde `status = deriveLegacyLiveStatus(reconciled)` — a projeção LEGADA (`LIVE_ORDER_STATUS`, só 9 valores, sem conceito de "pronto só por `readiness_state`"). Neste caso, `order_state` é `unknown` (texto vazio) e `deriveLegacyLiveStatus()` só olha `order_state`/`completion_state`/`courier_state` — nunca `readiness_state` sozinho — então `status` fica `unknown`, `isReadyMilestone("unknown")` é `false`, e o evento nunca é considerado necessário. O CONTRATO multidimensional (`Clock.isReadyFromMultidimensional`) já sabia que o pedido está pronto (via `readiness_state`) — mas o observador nunca consulta essa função; só consulta a projeção com perda. |

## Relação com os bloqueadores da missão

| Falha | Bloqueador |
|---|---|
| empate temporal | 1 — agrupamento não determinístico com `observed_at` empatado |
| crash antes do ready_observed | 2 — recuperação decide pela projeção legada, não pelo contrato multidimensional |

Os 9 testes que já passavam (PII composta, PII aninhada, URL com credenciais/host
misto/homógrafo, permutações sem empate, identidade de eventos do relógio,
restauração em disco) não foram tocados nesta fase e continuam servindo de
placar de não-regressão.
