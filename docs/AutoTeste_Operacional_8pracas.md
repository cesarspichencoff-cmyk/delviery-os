# Auto Teste Operacional v2 — motor de 8 praças

> Backtest sobre **30 dias reais** (27/05/2026→25/06/2026), 8305 pedidos.
> **Mesmo cérebro do protótipo** (`src/perfil-delivery/motor.js`) — nenhuma regra duplicada.

### Três motores, separados de propósito
| Motor | Estado | Fonte |
|---|---|---|
| (A) tempo / estado do pedido | **REAL** | relatório iFood (recebido/pronto/saiu/cancelado) |
| (B) praça (qual bancada / carga) | **SINTÉTICO** | composição pedido→itens fabricada (`makeFonteSintetica`) |
| (C) conhecimento do cardápio | **REAL** | `cardapio_knowledge_seed.json` (199 itens, 8 praças) |

## Nota do motor (desfecho real): **8.1 / 10**
*(0,40×precisão 70% + 0,40×cobertura 98% + 0,20×calma 0.7) — precisão/cobertura usam só desfecho REAL; números de praça são ilustrativos.*

---

## 1. As 8 praças no motor (quantos itens entraram)
| Praça | Classe | Itens no cardápio |
|---|---|---|
| Combinados (`combinados`) | produção | 20 |
| Duplas (`duplas`) | produção | 64 |
| Enrolados (`enrolados`) | produção | 16 |
| Enrolados Quentes (`enrolados_quentes`) | produção | 11 |
| Quentes (`cozinha_quentes`) | produção | 31 |
| Sobremesa (`sobremesa`) | conferência/montagem | 9 |
| Bar (`bar_bebidas`) | conferência/montagem | 36 |
| Montagem (`montagem_outros`) | conferência/montagem | 5 |

## 2. Diagnósticos que o motor agora emite (não só alerta)
O motor deixou de dizer só "tem atraso". Exemplos REAIS gerados no backtest:

**Praça de produção sobrecarregada (com causa + quanto libera):**
```
Duplas CARREGANDO
• 10 pedidos na praça
• 6 sairiam se Duplas liberar
trava o fechamento de pedidos
→ priorizar duplas · olhar Sushi de Polvo
```  
_(27/05/2026 11:56)_

**Fechamento (pedido que depende de uma só praça):**
```
FECHAMENTO · #4413
• só depende de Duplas
• ainda tem item frio
pronto pra fechar assim que Duplas sair
→ verificar se já dá pra fechar #4413
```  
_(27/05/2026 14:43)_

**Conferência (pedido grande / 2 sacolas / bebida+kit):**
```
CONFERÊNCIA · #3992
• 2 sacolas · 3 itens
• obrigatório: bebida + kit + sobremesa
risco de faltar item / 2ª sacola esquecida
→ separar 2ª sacola e conferir item a item
```  
_(27/05/2026 22:27)_

**Saída travada (motoboy é o gargalo):**
```
SAÍDA LENTA
• 3 prontos sem sair
• motoboy é o gargalo
pedidos vão atrasar na entrega
→ chamar motoboy / conferir saída
```  
_(02/06/2026 12:12)_

## 3. Volume de focos por tipo (mês)
- praça: **159** · pedido preso: **136** · saída: **11** · fechamento: **161** · conferência: **69**
- total **536** (~17.9/dia) · tempo: 🟢 47% calmo · 🌫️ 40% ambiente · 🔶 13% foco

## 3b. CAMADA DE DECISÃO — recomendações geradas (novo)
A cada foco, a camada de decisão ranqueia a **melhor próxima ação** ("se você olhar uma coisa agora, olhe isso"):

- Recomendações geradas no mês: **470** (uma por onset de foco)
- Por tipo: priorizar_praca **159** · conferir_saida **114** · fechar_simples **95** · conferencia **69** · olhar_pedido **22** · chamar_motoboy **11**
- Confiança: alta **125** · média **345** · baixa **0**
- Dependem de composição (sintética hoje → confiança limitada a média): **345** (73%)
- Só de tempo/estado real (confiança alta já hoje): **125** (27%)

Exemplos REAIS gerados no backtest:

**Priorizar praça (release impact):**
```
AÇÃO RECOMENDADA — Priorizar Duplas
por quê: 6 pedidos saem se Duplas liberar
primeiro olhar: #8565 (combinado)
impacto: libera 6 saídas · reduz atraso
confiança: média
dados: tempos reais (iFood) · cardápio real (199 itens) · composição sintética
```  
_(27/05/2026 11:56)_

**Chamar motoboy (timing 100% real):**
```
AÇÃO RECOMENDADA — Chamar motoboy agora
por quê: 3 prontos há mais de 30 min
primeiro olhar: #4489 · 40 min
impacto: todos viram atraso de entrega
confiança: alta
dados: tempos reais (iFood) · cardápio real (199 itens) · composição sintética
```  
_(02/06/2026 12:12)_

**Fechar pedidos simples:**
```
AÇÃO RECOMENDADA — Fechar pedidos simples agora
por quê: 3 pedidos dependem só de Duplas, sem mais pendências
primeiro olhar: #0039, #0753, #3522
impacto: 3 pedidos saem da fila
confiança: média
dados: tempos reais (iFood) · cardápio real (199 itens) · composição sintética
```  
_(27/05/2026 21:24)_

**Conferência reforçada:**
```
AÇÃO RECOMENDADA — Conferência reforçada
por quê: 2 sacolas · bebida · kit
primeiro olhar: #3992 na montagem
impacto: evita item esquecido e 2ª sacola perdida
confiança: média
dados: tempos reais (iFood) · cardápio real (199 itens) · composição sintética
```  
_(27/05/2026 22:27)_

## 4. Precisão dos focos (desfecho real)
- **373/536 (70%)** dos focos aconteceram com um pedido **ruim de fato vivo** naquele minuto (cancelado/atraso>15/problema). Fora de janela ruim: 163.
- Focos de pedido preso especificamente: 136. *(fechamento/conferência são ações úteis, não previsões de risco.)*

## 5. Cobertura dos pedidos ruins
- **1013** pedidos ruins no mês; **23** passaram 100% em calmo (ponto cego). Cobertura **98%**.
- Pedidos que cruzaram risco: **1960** (24%).

## 6. Praças que mais travaram *(SINTÉTICO — ilustrativo, baseline provisório não calibrado)*
- Duplas (`duplas`): **8475** min de sobrecarga
- Combinados (`combinados`): **4548** min de sobrecarga
- Enrolados (`enrolados`): **4246** min de sobrecarga
- Quentes (`cozinha_quentes`): **3088** min de sobrecarga
- Enrolados Quentes (`enrolados_quentes`): **1363** min de sobrecarga

## 7. Dias com mais gargalo
- 07/06/2026: gargalo **78%** · 33 focos · 431 pedidos · 33 ruins
- 21/06/2026: gargalo **75%** · 21 focos · 387 pedidos · 13 ruins
- 31/05/2026: gargalo **71%** · 26 focos · 336 pedidos · 39 ruins
- 20/06/2026: gargalo **70%** · 27 focos · 347 pedidos · 133 ruins
- 14/06/2026: gargalo **67%** · 24 focos · 379 pedidos · 32 ruins

## 8. Horários mais críticos
- **21h** — 80 focos
- **12h** — 64 focos
- **13h** — 63 focos
- **22h** — 55 focos
- **20h** — 51 focos
- **19h** — 46 focos

## 9. O que é REAL vs SINTÉTICO neste resultado
- **REAL e confiável:** todo o eixo de tempo/estado — atraso, pronto sem sair, cancelamento, problema; precisão e cobertura acima.
- **SINTÉTICO (ilustrativo):** quais itens cada pedido teve → logo, qual praça carregou, item dominante, 2ª sacola, bebida/kit. Vira REAL quando ligar KDS/impressora/API iFood (trocar só `makeFonteSintetica`).
- **REAL mas não calibrado:** o cardápio (199 itens/8 praças) é real; os BASELINE por praça são PROVISÓRIOS (tuning é passo futuro).

## 10. Próximos ajustes (quando liberar tuning)
- Rever baseline de **Combinados** (satura tempo demais — provável baseline subestimado, sobretudo Duplas por concentrar sushi/sashimi/dyo).
- Rever baseline de **Duplas** (satura tempo demais — provável baseline subestimado, sobretudo Duplas por concentrar sushi/sashimi/dyo).
- Rever baseline de **Enrolados** (satura tempo demais — provável baseline subestimado, sobretudo Duplas por concentrar sushi/sashimi/dyo).
- Rever baseline de **Enrolados Quentes** (satura tempo demais — provável baseline subestimado, sobretudo Duplas por concentrar sushi/sashimi/dyo).
- Rever baseline de **Quentes** (satura tempo demais — provável baseline subestimado, sobretudo Duplas por concentrar sushi/sashimi/dyo).
- Subir piso de expedição/produção (exagero 120%).
- Reforçar demote→ambiente (sequência de foco chegou a 16 min).
- Só calibrar baseline DEPOIS de ligar a composição real — antes disso é calibrar no escuro.

---
*Determinístico. Trocar a fonte de itens (sintética→real) NÃO muda nenhuma regra — basta re-rodar.*