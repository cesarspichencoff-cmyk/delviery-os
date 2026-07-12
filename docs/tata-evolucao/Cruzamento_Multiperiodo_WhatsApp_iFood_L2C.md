# Cruzamento Multiperíodo WhatsApp × iFood — L2C

> Separação semântica obrigatória: **nativo iFood** ≠ **comunicação WhatsApp**.  
> Junção **agregada** (data/faixa/weekday/período/mês). Sem join mensagem↔pedido.  
> Banner B: **ANÁLISE EXPLORATÓRIA — NÃO REPRESENTA PADRÃO CONFIRMADO**.

---

## 1. Overlap temporal WA × pedidos

| Item | Valor |
|---|---|
| Datas com WA e iFood | **261** dias |
| Faixa de overlap | **2025-10-01 → 2026-06-24** |
| Fuso | America/Sao_Paulo |

---

## 2. Trilha A — incidência comunicacional / 100 pedidos válidos

Unidades **alta confiança** (L2A.1), fluxo normal, hora ≠ 17.

| Bloco | Den. válidos | Indisp. n | Indisp./100 | Comp. n | Comp./100 |
|---|---:|---:|---:|---:|---:|
| Out/25 | 7039 | 2 | 0,028 | 9 | 0,128 |
| Nov/25 | 7804 | 6 | 0,077 | 11 | 0,141 |
| Dez/25 | 7096 | 6 | 0,085 | 6 | 0,085 |
| Jan/26 | 7345 | 9 | 0,123 | 8 | 0,109 |
| Fev/26 | 7219 | 3 | 0,042 | 5 | 0,069 |
| Mar/26 | 7713 | 9 | 0,117 | 7 | 0,091 |
| Abr/26 | 7616 | 3 | 0,039 | 4 | 0,053 |
| Mai–Jun L2B | 8124 | 6 | 0,074 | 3 | 0,037 |

**Notas**

- Quase todas as células mensais de A têm **n &lt; 10**; várias **n &lt; 5** → amostra pequena.  
- Ordem de grandeza A: **~0,03 – 0,14 / 100** — comunicação rara vs volume de pedidos.  
- **Não** é taxa real de erro nem censo de ocorrências.  
- Compensação e indisponibilidade **não** são falha automática.

### Sensibilidade ao canal (bloco Mai–Jun L2B)

Continua válida a ressalva L2B: remover canal dominante reduz numeradores.  
Classificação: **viés de comunicação possível** · recorrente.

---

## 3. Trilha B — só exploratória

Categorias: item_faltante, embalagem, falha_sistema, atraso, reclamacao, escalonamento.

- Contagens e /100 pedidos **permitidos** com banner.  
- **Proibido:** alerta, risco, pior dia/hora, frequência real.  
- n mensais tipicamente baixos (codebook estrito).

---

## 4. Trilha C

`lideranca`, `ideia_melhoria`: **sem taxa**.

---

## 5. Absoluto vs normalizado (overlap WA×iFood)

| Hora | WA/100 ped. (datas comuns) | Atraso-flag/100 (global) | Volume |
|---:|---:|---:|---|
| 18 | 1,26 | 30,3 | alto |
| **19** | **0,61** | **42,1** (pico atraso) | **pico volume** |
| 20 | 0,75 | 39,5 | alto |
| 21 | 1,25 | 29,9 | médio |
| **22** | **2,66** | 18,2 | menor que pico |
| 15–16 | 24–48 | ~18–19 | **den. baixo — instável** |
| 17 | — | — | **0 pedidos** |

### Achado multiperíodo central

1. **Hora 19:** máximo de **volume** e de **atraso nativo**; mínima incidência de **chat/100 pedidos** entre 18–22.  
2. **Hora 22:** atraso nativo **mais baixo** que o pico; chat/100 **mais alto** que 18–20.  
3. Portanto: **final de turno pode ter pressão de comunicação sem piora do atraso-flag nativo** (hipótese fraca→recorrente metodológica; **não** alerta).

---

## 6. Perguntas de cruzamento (resumo)

| # | Pergunta | Resultado |
|---|---|---|
| 1 | Atraso nativo alto ⇒ mais comm de atraso? | **Não afirmável** (n B baixo) |
| 2 | Compensações após atraso elevado? | **Aguardando dados** (n) |
| 3 | Indisponibilidade ⇒ queda volume/cancel? | **Hipótese fraca** |
| 4 | 21–22 &gt; 18–20 em WA/100? | **Sim no overlap** (recorrente) |
| 5 | Sem canal dominante? | Sensível (viés possível) |
| 6 | Meses independentes A? | Taxas A raras; instáveis por n |
| 7 | Diferença weekday? | Volume sim; A sem padrão robusto |
| 8 | Pico volume = pico atraso? | **Sim (hora 19)** — nativo |
| 9 | Fim de turno: comm sem piora nativa? | **Compatível** com dados |
| 10 | Rejeitar hipóteses L2B? | Ver `Estabilidade_…_L2C.md` |

---

## 7. ALERT-CAND-001 (reclassificado)

**REGRA DE GOVERNANÇA ANALÍTICA** (não alerta de loja):

> Nenhum dia ou faixa pode ser priorizado sem normalização por exposição e cobertura.

---

*Cruzamento L2C · nativo e comunicação em eixos separados.*
