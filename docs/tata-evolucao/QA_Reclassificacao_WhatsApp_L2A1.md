# QA e Reclassificação WhatsApp — L2A.1

> Amostragem estratificada + reclassificação por codebook + métricas de precisão/recall/F1.  
> Revisão sobre **unidades de evidência**. Sem PII. Sem taxas WA×iFood.

**Privado:** `DERIVED/IFOOD_L2A1/qa/method_metrics_v3.json`, `agg/reclass_index_v3.json`, `agg/high_confidence_units_v3.json`.

---

## 1. Método

| Elemento | Detalhe |
|---|---|
| Universo | 6.632 unidades L1 |
| Codebook | primário (produção) + coder secundário (validação) |
| Amostra por cat. prioritária | até 50 alta + 50 L1+ + 50 L1− + até 50 hard-neg + 50 method-neg |
| Total revisado (8 cats) | **~1.963** julgamentos amostrais |
| Seed | 20260712 (reprodutível) |
| Estratificação | grupo WA, faixa horária, comprimento (n_msgs), mês |
| Gold de validação | concordância dual-coder na amostra de `alta_confianca` |
| Precisão L1 | L1+ amostral vs gold primário (baseline fraco) |

**Limitação metodológica:** dual-coder automatizado não substitui revisão humana multi-avaliador; IC de Wilson e demote por limite inferior são obrigatórios antes de gate A.

---

## 2. Tabela por categoria (reclass v3)

| Categoria | L1 bruto | Alta | Média | Baixa | Ambíguo | Prec. alta | Recall est. | F1 | Gate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| item_faltante | 448 | 33 | 0 | 102 | 4 | **0,82** | 1,00* | 0,90 | **B** |
| embalagem | 860 | 91 | 0 | 430 | 154 | **1,00** | 0,15 | 0,26 | **B** |
| falha_sistema | 291 | 112 | 1 | 396 | 92 | **0,88** | 1,00* | 0,94 | **B** |
| indisponibilidade | 290 | 119 | 1 | 71 | 5 | **0,98** | 1,00* | 0,99 | **A** |
| atraso | 834 | 79 | 0 | 325 | 385 | **0,86** | 0,34 | 0,49 | **B** |
| compensacao | 846 | 212 | 0 | 365 | 33 | **1,00** | 1,00* | 1,00 | **A**† |
| reclamacao | 374 | 178 | 0 | 219 | 20 | **0,92** | 0,56 | 0,70 | **B** |
| escalonamento | 4104 | 36 | 0 | 1283 | 2943 | **1,00** | 0,12 | 0,21 | **B** |
| lideranca | 1055 | 76 | 0 | 298 | 642 | — | — | — | **C** |
| ideia_melhoria | 264 | 39 | 0 | 130 | 146 | — | — | — | **C** |

\*Recall estimado via amostra de não-positivos do método; valores ~1,0 indicam poucos FN na amostra (incerteza alta se o coder secundário for alinhado ao primário).  
†Compensação: dual-coder parcialmente alinhado — validação humana recomendada antes de alerta.

**Descartados (conf):** restante do universo 6.632 por categoria (não-positivos do codebook).

---

## 3. Precisão L1 (baseline) — por que reclassificar

| Categoria | Prec. L1 amostral (vs gold primário) |
|---|---:|
| item_faltante | 0,08 |
| embalagem | 0,10 |
| falha_sistema | 0,28 |
| indisponibilidade | 0,42 |
| atraso | 0,10 |
| compensacao | 0,20 |
| reclamacao | 0,32 |
| escalonamento | 0,02 |

L1 por palavra-chave **não** serve como numerador de taxa.

---

## 4. Causas principais de erro (L1 e hard negatives)

| Causa | Categorias mais afetadas |
|---|---|
| Keyword sem âncora operacional | escalonamento (`@`, `pode?`), atraso (`motoboy`), embalagem (`kit`) |
| Superclassificação L1 | escalonamento (pool 4.104) |
| Confusão falta gente vs item | item_faltante |
| Conversa geral / social | lideranca, ideia_melhoria |
| Dual-coder alinhado demais | compensacao, embalagem (precisão amostral saturada) |

---

## 5. Intervalos de incerteza (IC 95% Wilson — precisão alta)

| Categoria | IC95 prec. alta (aprox.) |
|---|---|
| item_faltante | 0,66 – 0,91 |
| embalagem | 0,93 – 1,00 |
| falha_sistema | 0,76 – 0,94 |
| indisponibilidade | 0,90 – 1,00 |
| atraso | 0,74 – 0,93 |
| compensacao | 0,93 – 1,00 |
| reclamacao | 0,81 – 0,97 |
| escalonamento | 0,90 – 1,00 (n amostra 36) |

Gate **A** só quando limite inferior do IC ≥ 0,85, amostra ≥ 40 e recall conhecido (não necessariamente alto).

---

## 6. Unidades de alta confiança (numerador futuro)

| Categoria | n alta | Uso L2B |
|---|---:|---|
| indisponibilidade | 119 | taxa normalizada (A) |
| compensacao | 212 | taxa normalizada (A) com ressalva dual-coder |
| falha_sistema | 112 | exploratória / taxa com ressalva IC (B) |
| reclamacao | 178 | exploratória (B) |
| embalagem | 91 | exploratória; recall baixo (B) |
| atraso | 79 | exploratória (B) |
| escalonamento | 36 | exploratória restrita; pool alto histórico (B) |
| item_faltante | 33 | exploratória; n baixo (B) |
| lideranca / ideia_melhoria | 76 / 39 | só qualitativo (C) |

**Total alta (8 prioritárias):** 33+91+112+119+79+212+178+36 = **860** unidades.

---

## 7. O que não foi feito

- Revisão humana multi-avaliador presencial.  
- Taxas por 100 pedidos.  
- Join mensagem↔pedido individual.  
- Confirmação de “pior horário”.

---

*QA reclass L2A.1 · numerador filtrado preparado · L2B não executada.*
