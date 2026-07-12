# Gates de Categorias para Cruzamento — L2A.1

> Decisão de uso de cada categoria na futura L2B.  
> Alertas futuros exigem barra **mais alta** (seção 4).

---

## 1. Escala de gates

| Gate | Critério | Uso |
|---|---|---|
| **A** Aprovada para taxa normalizada | Precisão ≥ 0,85 **e** limite inferior IC95 ≥ 0,85; recall conhecido; n alta ≥ 40 | Numerador de rate /100 pedidos |
| **B** Só análise exploratória | Precisão 0,70–0,84 **ou** A rebaixada (IC, recall muito baixo, n amostra) | Hipóteses; **não** baseline de alerta |
| **C** Só qualitativa | Precisão &lt; 0,70, recall desconhecido, ou conceito cultural | Formação/cultura; **sem** taxa temporal |
| **D** Bloqueada | Sem método confiável / evidência insuficiente | Fora do cruzamento |

---

## 2. Gate por categoria

| Categoria | Gate | Prec. alta | Recall | n alta | Análise temporal? | Limitações |
|---|---|---:|---:|---:|---|---|
| indisponibilidade | **A** | 0,98 | ~1,0* | 119 | **Sim** (taxa) | Validar em período independente antes de alerta |
| compensacao | **A** | 1,00 | ~1,0* | 212 | **Sim** (taxa) | Dual-coder alinhado; validação humana recomendada |
| falha_sistema | **B** | 0,88 | ~1,0* | 112 | Exploratória | IC inferior &lt; 0,85 |
| reclamacao | **B** | 0,92 | 0,56 | 178 | Exploratória | IC inferior &lt; 0,85; recall moderado |
| atraso | **B** | 0,86 | 0,34 | 79 | Exploratória | IC inferior &lt; 0,85; recall baixo |
| embalagem | **B** | 1,00 | 0,15 | 91 | Exploratória | Recall baixo → subcontagem |
| item_faltante | **B** | 0,82 | ~1,0* | 33 | Exploratória | n &lt; 40; IC largo |
| escalonamento | **B** | 1,00 | 0,12 | 36 | Exploratória restrita | n &lt; 40; L1 historicamente inviável |
| lideranca | **C** | — | — | 76 | **Não** | Cultura/formação |
| ideia_melhoria | **C** | — | — | 39 | **Não** | Cultura/formação |

\*Recall amostral saturado — tratar como “conhecido porém incerto”, não como cobertura total da operação.

---

## 3. Regras de numerador L2B

| Confiança | Entra em taxa? | Entra em exploração? |
|---|---|---|
| alta_confianca + gate A | **Sim** | Sim |
| alta_confianca + gate B | **Não** como taxa oficial | **Sim** |
| media / baixa / ambiguo / descartado | **Não** | Não (exceto auditoria) |
| gate C | **Não** | Qualitativo apenas |

**Denominador:** exposição iFood L3 (pedidos por `local_date` × faixa), sem after-23 no fluxo normal.

---

## 4. Barra para futuro **alerta** (não nesta missão)

Qualquer candidato a alerta exigirá **todas**:

1. Precisão ≥ **0,90** (validação humana ou multi-período).  
2. Validação em **períodos independentes**.  
3. Normalização por exposição (pedidos/itens).  
4. Ação operacional clara.  
5. Aprovação humana (César / operação).

Nenhuma categoria L2A.1 está liberada para alerta automático.

---

## 5. Tabela pronta para L2B (resumo executivo)

| Categoria | L1 bruto | Alta | Gate | Taxa L2B? |
|---|---:|---:|---|---|
| indisponibilidade | 290 | 119 | A | Sim |
| compensacao | 846 | 212 | A | Sim (ressalva) |
| falha_sistema | 291 | 112 | B | Não (só explora) |
| reclamacao | 374 | 178 | B | Não (só explora) |
| atraso | 834 | 79 | B | Não (só explora) |
| embalagem | 860 | 91 | B | Não (só explora) |
| item_faltante | 448 | 33 | B | Não (só explora) |
| escalonamento | 4104 | 36 | B | Não (só explora) |
| lideranca | 1055 | 76 | C | Não |
| ideia_melhoria | 264 | 39 | C | Não |

---

*Gates L2A.1 · L2B ainda não iniciada.*
