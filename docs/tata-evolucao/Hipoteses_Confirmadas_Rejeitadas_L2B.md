# Hipóteses — Sobreviventes e Rejeitadas — L2B

> Testes no período **2026-05-27 → 2026-06-25**.  
> Status máximos: hipótese recorrente no período / fraca / rejeitada / aguardando mais dados.  
> **Nenhum status “confirmado permanentemente”.**

---

## 1. Quadro-resumo

| ID | Hipótese | Status |
|---|---|---|
| H1 | Indisponibilidades se concentram em faixa | **sinal isolado** |
| H2 | Compensações aumentam após o pico | **hipótese fraca** / tendência a **rejeitar** com n=2 |
| H3 | Mensagens ~22h seguem elevadas após normalização | **hipótese fraca** (vs 19h sobe; vs tarde instável) |
| H4 | Cats B “concentradas” só por volume de pedidos | **hipótese recorrente no período** |
| H5 | Diferenças por dia da semana (A) | **hipótese fraca** |
| H6 | Sinal depende de uma semana/data | **hipótese recorrente no período** (W1 puxa A) |
| H7 | Canal dominante altera conclusões | **hipótese recorrente no período** |
| H8 | Quatro pedidos 23h afetam taxas A | **rejeitada** |

---

## 2. Detalhe

### H1 — Concentração de indisponibilidades
- **Evidência:** 5 unidades; jantar aparece mais em contagem absoluta.  
- **Normalização:** células hora/dia com n&lt;5.  
- **Status:** sinal isolado · **não** padrão.

### H2 — Compensações pós-pico
- **Evidência:** 1 elegível em 22h, 1 em 12h (almoço).  
- **Status:** hipótese fraca; **não sobrevive** como regra “após pico”.

### H3 — 22h após normalização
- **Absoluto:** topo de mensagens no período está na **tarde** (14–16), não em 22h.  
- **Normalizado:** 22h (≈3,0 /100 ped.) &gt; 19h (≈0,86 /100); 15–16 instáveis (den. baixo).  
- **Status:** hipótese fraca de **maior incidência comunicacional no pós-pico vs pico de pedidos**; **rejeitada** a versão “22h é o pior absoluto sem normalizar”.

### H4 — B só parece concentrada por volume
- **Evidência:** jantar concentra pedidos; incidência B/100 não espelha linearmente o ranking de volume.  
- **Status:** **hipótese recorrente no período** — sempre normalizar antes de priorizar faixa.

### H5 — Dias da semana
- Contagens A dispersas; exposição varia (Dom alto, Ter mais baixo).  
- **Status:** hipótese fraca · aguardar mais período.

### H6 — Dependência de semana/data
- Indisponibilidades elegíveis concentradas em W1.  
- **Status:** hipótese recorrente no período (viés de subamostra temporal).

### H7 — Canal dominante (WA-05 ~29%)
- Remover WA-05 reduz numeradores A (5→4 indisp.; 2→1 comp.).  
- **Status:** hipótese recorrente — **viés de comunicação** possível; reportar com/sem canal.

### H8 — Fronteira 23h
- 4 pedidos fora do fluxo; numerador A de taxa os exclui.  
- **Status:** **rejeitada** (sem efeito nas taxas se política mantida).

---

## 3. Hipóteses que **sobreviveram** à normalização (restrito)

1. **H4:** narrativa de pico de chat no jantar **enfraquece** sob /100 pedidos (recorrente no período).  
2. **H3 (versão fraca):** 21–22h pode ter incidência comunicacional por pedido **maior** que 18–20h — ainda fraca, n global de A insuficiente para alerta.  
3. **H6/H7:** sensibilidade a **semana** e **canal** — efeitos de medição, não “pior operação”.

## 4. Hipóteses **rejeitadas** ou que **não sobrevivem**

1. Compensações “sempre após o pico” (H2).  
2. “22h é o pior horário absoluto de mensagens” sem normalizar (H3 abs).  
3. Impacto dos 4 pedidos 23h nas taxas A (H8).  
4. Qualquer “padrão permanente de erro” com 30 dias e n≤5.  
5. Trilha B como frequência real.

---

## 5. Priorização (magnitude · estabilidade · cobertura · ação)

| Prioridade | Item | Por quê |
|---|---|---|
| 1 | Normalizar sempre (H4) | Ação clara de método |
| 2 | Reportar com/sem canal dominante (H7) | Evita viés |
| 3 | Ampliar período antes de taxa A fina | n atual |
| 4 | Não escalar B para alerta | gate L2A.1 |

Não usar significância estatística isolada nem p-hacking de fatias.

---

*Hipóteses L2B · 30 dias · conservador.*
