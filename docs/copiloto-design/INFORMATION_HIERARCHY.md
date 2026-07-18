# Information Hierarchy — Copiloto Delivery

Princípio: **a única coisa → o resto some**.  
Herança DeliveryOS: não é dashboard.

---

## 1. Pirâmide de atenção (topo → base)

```
1. Conclusão / Foco (o que importa agora)
2. Por que importa (impacto humano/operacional)
3. Evidência mínima (2–3 fatos)
4. Ação recomendada (se segura)
5. Confiança / limite (se ≠ alta ou dado frágil)
6. Previsão curta (se pedida ou no Foco)
7. Detalhe sob demanda (pedidos, alternativas, histórico)
```

Nunca inverter: detalhe não compete com conclusão.

---

## 2. Layout conceitual (qualquer superfície)

### Calmo
| Zona | Conteúdo |
|---|---|
| Centro | presença / pulso |
| Rodapé opcional | “Operação estável” (sem KPI wall) |
| Proibido | grid de áreas, rankings, gráficos |

### Ambiente
| Zona | Conteúdo |
|---|---|
| Faixa clima | ≤2 rótulos (`ambList`) |
| Intensidade | visual proporcional, sem número de “alerta” |
| Proibido | botão de ação |

### Foco
| Zona | Conteúdo | Prioridade visual |
|---|---|---|
| Título | `focus.title` | 1 |
| Resumo | `summary` / `why_it_matters` | 2 |
| Evidências | até 3 | 3 |
| Ação | `recommended_action.label` ou ausente | 4 |
| Pedidos | `affected_orders` máx. 2–3 em destaque | 5 |
| Meta | confiança, área, technical | 6 |

### Técnico
| Zona | Conteúdo |
|---|---|
| Banner | degraded/failed em linguagem calma |
| Corpo | o que não sabemos / o que checar no sistema |
| Proibido | Foco operacional inventado |

---

## 3. Densidade por contexto

| Contexto | Densidade | Regra |
|---|---|---|
| Pico de jantar | mínima | só pirâmide 1–4 |
| Consulta por voz | áudio 1–3 frases | tela carrega 1–6 |
| Pós-pico / fechamento | média | resumo + perguntas |
| Briefing | média-baixa | ≤45s áudio |
| Auditoria/sombra | alta | ranking interno, gates — **fora do chão** |

---

## 4. O que nunca sobe na hierarquia

- Score numérico de prioridade
- Lista completa de `sits`
- Percentuais com falsa precisão
- Nome de pessoa como “problema”
- Segundo Foco simultâneo
- Gráficos multi-série no chão

---

## 5. Progressive disclosure

| Nível | Gatilho | Conteúdo |
|---|---|---|
| L0 | default | conclusão + ação |
| L1 | “por quê?” / expandir | evidências + impacto |
| L2 | “quais pedidos?” | affected_orders + first look |
| L3 | “e se?” / previsão | forecast 10/15/30 |
| L4 | “alternativas” | `alternatives[]` colapsado |
| L5 | admin/sombra | scores, gates, logs |

---

## 6. Hierarquia de tipografia (conceito, não token final)

1. **Display curto** — título do Foco  
2. **Body forte** — conclusão  
3. **Body** — evidência  
4. **Caption** — confiança, fonte, technical  
5. **Meta** — IDs curtos, timestamps  

IDs longos (UUID) **não** sobem de nível; encurtar na UI.

---

## 7. Hierarquia entre áreas no Calmo

**Não há.** Calmo não é mapa de praças.  
Mapa multi-área só em superfície secundária (se existir) e **nunca** como Home do Copiloto no pico.
