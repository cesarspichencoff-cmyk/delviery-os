# Design State Matrix — Copiloto Delivery

| Campo | Valor |
|---|---|
| Consome | `src/copiloto`, schemas, `Contrato_Estado_Cognitivo_V1` |
| Não faz | inventar regras de Foco; recalcular score na UI |
| Superfície | uma prioridade por vez; Calmo / Ambiente / Foco |

---

## 1. Eixos de estado

A UI combina **três eixos independentes**:

| Eixo | Valores | Fonte de verdade |
|---|---|---|
| **Consciência** | `calmo` · `ambiente` · `foco` | motor legado / payload `mode` ou ausência de focus ativo |
| **Foco** | `none` · `active` · `resolved` · `invalid` | `focus.status` |
| **Técnico** | `healthy` · `degraded` · `failed` | `technical_state` |
| **Interrupção** | `silent` · `discreet` · `intervention` | `silence.level` (não confundir com Foco) |
| **Confiança** | `baixa` · `media` · `alta` | `focus.confidence` / response |
| **Gravidade** | 0–3 | `focus.severity` — **nunca fundir visualmente com confiança** |

---

## 2. Matriz Consciência × Técnico

|  | healthy | degraded | failed |
|---|---|---|---|
| **calmo** | Presença serena; pulso mínimo; sem lista | Calmo + faixa discreta “leitura parcial” | Sem Foco; banner técnico; sem prioridade inventada |
| **ambiente** | Até 2 rótulos de clima; **sem** bloco de ação | Ambiente + aviso de dado frágil | Preferir técnico; não ambientar “como se soubesse” |
| **foco** | Foco com ação **ou** Foco puro | Foco + `needs_verification` visível | Encerrar Foco operacional; só diagnóstico técnico |

---

## 3. Matriz Foco × Forma de apresentação

| Condição | Forma UI | O que mostra | O que esconde |
|---|---|---|---|
| `status=none` + calmo | Calmo | ritmo / em andamento se existir | listas, KPIs, ranking |
| ambiente sem focus | Ambiente | ≤2 rótulos | ação, scores, fila de alertas |
| focus active + `recommended_action` | **Foco com ação** | título, por quê, evidência curta, ação, impacto, confiança se ≠ alta | alternativas em ranking, 2º foco |
| focus active + action null | **Foco puro** | título, evidência, “olhar aqui” sem prescrever | botão de ação falsa |
| `needs_verification=true` | Foco + verificação | badge “confirmar leitura” | certeza visual alta |
| severity≥3 | Foco crítico | hierarquia máxima; pode interromper (intervention) | decoração |
| status invalid / tech failed | Estado técnico | o que falhou + o que fazer no sistema | prioridade operacional inventada |

---

## 4. Gravidade × Confiança (obrigatório separar)

|  | confiança alta | média | baixa |
|---|---|---|---|
| **sev 0–1** | silêncio ou ambiente | ambiente / discreto | silencioso ou discreto |
| **sev 2** | Foco normal | Foco + sussurro de confiança | Foco com verificação; interrupção discreta |
| **sev 3** | Foco crítico | Foco crítico + verificação | **não** rebaixar gravidade; exigir verificação |

**Proibido:** cor única que misture “grave” e “incerto”.  
**Padrão:** gravidade = peso/urgência visual; confiança = tratamento tipográfico/badge secundário.

---

## 5. Interrupção × UI

| Nível | Comportamento de design |
|---|---|
| **silent** | só registro; zero mudança de tela forçada |
| **discreet** | mudança sutil (ambiente, pulso, borda) |
| **intervention** | Foco / notificação justificada; cooldown respeitado |

---

## 6. Áreas (rótulos de produto)

| `area` | Rótulo UI | Nota |
|---|---|---|
| sushi | Sushi | |
| quentes | Quentes | |
| cozinha | Cozinha | pode colapsar com Quentes se layout apertado — **não** mudar contrato |
| conferencia | Conferência | |
| motoboy | Motoboy / Saída | copy de produto, não “logística” |
| caixa | Caixa | se `confidence` baixa / incomplete → não dramatizar |

---

## 7. Transições permitidas (design)

| De → Para | Motion / copy |
|---|---|
| calmo → ambiente | suave; sem alarme |
| ambiente → foco | uma interrupção; título imediato |
| foco → calmo | alívio; não “parabéns gamificado” |
| foco A → foco B | só se payload `stability.action=switch`; copy: “prioridade mudou porque…” |
| qualquer → failed | corta Foco; linguagem técnica calma |

**Proibido:** carrossel de alertas; fila de 5 focos; toast spam.

---

## 8. Checklist de implementação

- [ ] UI não recalcula `priority_score`
- [ ] Um Foco visível
- [ ] Confiança e gravidade em canais visuais distintos
- [ ] `technical_state=failed` sem prioridade inventada
- [ ] Ambiente sem botão de ação
- [ ] Foco puro sem CTA falso
