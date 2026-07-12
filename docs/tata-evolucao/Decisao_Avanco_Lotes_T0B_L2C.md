# Decisão de Avanço de Lotes — T0B L2C

> Fecha o ciclo de exposição multiperíodo e define o que pode (e não pode) seguir.

---

## 1. O que L2C entregou

| Entrega | Status |
|---|---|
| UNION UUID multi-fonte | **Feito** (70.071 únicos) |
| Cobertura por mês/dia | **Feita** (9 meses; gaps documentados) |
| Baseline nativo volume/cancel/atraso/preparo/espera | **Feito** por bloco |
| Hora 17 multiperíodo | **Confirmada zero** |
| Reteste hipóteses L2B | **Feito** |
| Separação nativo vs WA | **Mantida** |
| Alertas ativos | **Nenhum** |
| ALERT-CAND-001 | **Governança analítica** |

---

## 2. O que **não** está pronto

| Item | Motivo |
|---|---|
| Taxas A mensais robustas | n alto-confiança baixo por mês |
| Alerta operacional de faixa horária | gates de amostra/ação não cumpridos |
| Série contínua única out→jun | gaps e famílias de fonte; análise por bloco |
| Taxa /1.000 itens ou por praça | composição ausente |
| Bloco 3 / avaliações / OP / mídia | fora de escopo |

---

## 3. Veredito de avanço

### **APROVADO COM RESSALVAS** · e **NECESSITA MAIS EXPOSIÇÃO** de WhatsApp reclassificado se o objetivo for taxa A fina multiperíodo

Interpretação prática:

1. **Baseline nativo iFood** está utilizável para formação de contexto e comparações weekday/hora/mês **com denominador**.  
2. **Governança** (normalizar, cobrir, não misturar eixos) está pronta para uso analítico.  
3. **Próximo lote de cruzamento fino** só faz sentido após mais unidades A/B de alta confiança ou período WA adicional reclassificado.  
4. **Não** iniciar alertas, cursos, avaliações, Bloco 3, OP ou mídia a partir deste commit.

---

## 4. Ordem recomendada (não iniciada aqui)

1. (Opcional) Enriquecer WA com reclass em meses de overlap já cobertos.  
2. Só então recalcular A com n≥30/categoria ou 8 semanas estáveis.  
3. Manter baseline nativo como **denominador e contexto**, nunca substituído por chat.  
4. Qualquer candidato a alerta → gates L2C + César.

---

## 5. Dados ainda ausentes

- Composição item-a-item / praça  
- `ready_at` / `dispatched_at` absolutos  
- Continuação perfeita 1–26/mai só no L3 (mitigado por Logistica, com tag de fonte)  
- Motivação de cancelamento harmonizada em 100% dos packs  
- Validação humana multi-avaliador do numerador A em todos os meses  

---

*Decisão L2C · não inicia próximo lote automaticamente.*
