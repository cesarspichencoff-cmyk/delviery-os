# Achados de Avaliações e Cruzamento L2C/L4 — L5

> Métricas comunicacionais de **percepção**.  
> Nome oficial quando normalizado por pedidos: **avaliações observadas por 100 pedidos**.

---

## 1. Achados descritivos principais

| ID | Achado | Status |
|---|---|---|
| REV-FIND-001 | ~84% das avaliações únicas são 5★; média ~4,75 | descritivo |
| REV-FIND-002 | Só ~14% têm texto livre; maioria é nota + tags | descritivo · viés |
| REV-FIND-003 | Negativos/mistos concentrados em **qualidade/frescor percebido**, apresentação e porção | hipótese |
| REV-FIND-004 | **Item faltante / trocado** reaparecem (n=10 / 5 em neg-misto) | hipótese · amostra limitada |
| REV-FIND-005 | **Atraso quase ausente** no texto/tags deste export | descritivo · contraste L2C |
| REV-FIND-006 | Export **sem resposta da loja** e sem moderação | lacuna de processo/dado |
| REV-FIND-007 | ~4,5 avaliações / 100 pedidos (denominador do próprio export, 90 dias) | descritivo |
| REV-FIND-008 | Overlap L2B/L2C (27/05–25/06): ~6,8 aval. diário / 100 pedidos do export | descritivo |

---

## 2. Cruzamento com L2C

| Ponto L2C | Teste L5 | Resultado |
|---|---|---|
| Pico volume/atraso ~19h | Sem `order_at` | **Não testável** no horário do pedido |
| Pressão comm 21–22h | Sem horário de pedido; sem WA neste lote | **Não testável** aqui |
| Dom alto / Ter baixo | Weekday por **`review_at`** apenas | Apenas distribuição de manifestações — **não** taxa por pedido nativo |
| Atraso-flag alto Fev etc. | Período L5 = Abr–Jun/2026; atraso no texto ~0 | **Não há aumento textual de “atraso”** apesar de atraso nativo existir na L2C → **hipótese:** atraso nem sempre vira avaliação, ou cliente prioriza comida |
| Cancel 0,9–2,5/100 | Tema cancel no texto residual | **Evidência insuficiente** |
| Hora 17 / corte 23h | Não aplicável a `review_at` | — |

### Perguntas L5 (respostas honestas)

1. Reclamações de atraso acompanham atraso nativo? → **Evidência insuficiente / não no texto**.  
2. Reclamação no horário do problema? → **Impossível** sem `order_at`.  
3. Cancel vs reclamação? → **Insuficiente**.  
4. Domingo mais reclamações só por volume? → Sem den. nativo por weekday no export de comentários; **não afirmar**.  
5. Pico volume = mais neg/pedido? → **Não calculável** sem order time + den. L2C por hora.  
6. 21–22h = recuperação? → **Sem dados de resposta**.  
7. Pior atraso nativo sem mais reclamações? → **Plausível** (atraso textual ~0 vs atraso-flag L2C material).  
8. Operacional vs percepção? → **Sim, eixos distintos**: L2C mede operação; L5 mede o que o cliente escolhe registrar.

---

## 3. Cruzamento com L4 (Bloco 3 histórico)

| Tema L4 | Em 2026 (L5)? | Classificação |
|---|---|---|
| Kit faltante | Poucos hits de “kit” em texto; wasabi/gari aparecem em reclamações de qualidade | **reaparece de forma fraca / definição mista** |
| Item omitido | **Sim** (item_faltante n≈10 em neg/misto) | **reaparece em período recente** |
| Item trocado | **Sim** (n≈5 + tag “Itens errados”) | **reaparece** (amostra pequena) |
| Hot/temaki/combinado | Via qualidade/porção/apresentação, não contagem de SKU | **parcialmente comparável** |
| Linguagem de cancel | Quase ausente no texto | **evidência insuficiente** |
| Indisponibilidade | n≈1 | **não reaparece de forma material** |
| Conferência | Implícita em faltante/trocado | **hipótese de processo** |

**Não** comparar contagens absolutas 2024×2026 sem exposição equivalente.

---

## 4. Resposta e recuperação

| Métrica | Valor |
|---|---|
| Avaliações com resposta da loja no export | **0** (coluna inexistente) |
| Tempo de resposta | **N/A** |
| Recuperação documentada pela empresa | **N/A** |
| Menções textuais a reembolso/cortesia/etc. | residual / amostra pequena |

**Necessidade de processo:** export ou processo que preserve resposta, SLA e tipo de recuperação.

---

## 5. Segurança alimentar

1 avaliação classificada **crítica** por regex (relato de mal-estar/frescor).  
→ **Encaminhar revisão humana**; sem diagnóstico automático; sem nome no Git.

---

## 6. Candidatos DeliveryOS (não alerta)

| Item | Status |
|---|---|
| Monitorar taxa de texto negativo sobre omissão/troca | candidato a **investigação / dado** |
| Integrar `order_at` + review | necessidade de dado |
| SLA de resposta a avaliações | necessidade de processo |
| ALERT operacional por nota baixa individual | **proibido** nesta missão |

---

*Cruzamento L5 · percepção ≠ atraso nativo; omissões históricas reaparecem.*
