# Auto Teste Operacional v2 — motor de 8 praças

> Backtest sobre **30 dias reais** (27/05/2026→25/06/2026), 8305 pedidos.
> **Mesmo cérebro do protótipo** (`src/perfil-delivery/motor.js`) — nenhuma regra duplicada.

### Três motores, separados de propósito
| Motor | Estado | Fonte |
|---|---|---|
| (A) tempo / estado do pedido | **REAL** | relatório iFood (recebido/pronto/saiu/cancelado) |
| (B) praça (qual bancada / carga) | **SINTÉTICO** | composição pedido→itens fabricada (`makeFonteSintetica`) |
| (C) conhecimento do cardápio | **REAL** | `cardapio_knowledge_seed.json` (199 itens, 8 praças) |

## Nota do motor (desfecho real): **7.1 / 10**
*(0,40×precisão 43% + 0,40×cobertura 100% + 0,20×calma 0.7) — precisão/cobertura usam só desfecho REAL; números de praça são ilustrativos.*

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
FECHAMENTO · #1219
• só depende de Duplas
• ainda tem item frio
pronto pra fechar assim que Duplas sair
→ verificar se já dá pra fechar #1219
```  
_(30/05/2026 12:21)_

**Conferência (pedido grande / 2 sacolas / bebida+kit):**
```
CONFERÊNCIA · #6885
• 2 sacolas · 2 itens
• obrigatório: bebida + kit
risco de faltar item / 2ª sacola esquecida
→ separar 2ª sacola e conferir item a item
```  
_(28/05/2026 11:38)_

**Saída travada (motoboy é o gargalo):**
```
SAÍDA TRAVADA
• 14 prontos sem sair
• motoboy é o gargalo
pedidos vão atrasar na entrega
→ chamar motoboy / conferir saída
```  
_(27/05/2026 12:38)_

## 3. Volume de focos por tipo (mês)
- praça: **15** · pedido preso: **15** · saída: **405** · fechamento: **16** · conferência: **9**
- total **460** (~15.3/dia) · tempo: 🟢 4% calmo · 🌫️ 81% ambiente · 🔶 15% foco

## 3b. CAMADA DE DECISÃO — recomendações geradas (novo)
A cada foco, a camada de decisão ranqueia a **melhor próxima ação** ("se você olhar uma coisa agora, olhe isso"):

- Recomendações geradas no mês: **460** (uma por onset de foco)
- Por tipo: chamar_motoboy **397** · priorizar_praca **43** · conferencia **11** · conferir_saida **7** · fechar_simples **2**
- Confiança: alta **404** · média **56** · baixa **0**
- Dependem de composição (sintética hoje → confiança limitada a média): **56** (12%)
- Só de tempo/estado real (confiança alta já hoje): **404** (88%)

Exemplos REAIS gerados no backtest:

**Priorizar praça (release impact):**
```
AÇÃO RECOMENDADA — Priorizar Duplas
por quê: 6 pedidos saem se Duplas liberar agora
primeiro olhar: Pedido #8565 (combinado — segura o pedido inteiro)
impacto: libera 6 saídas · reduz risco de atraso
confiança: média
dados: tempos reais (iFood) · cardápio real (199 itens) · composição sintética
```  
_(27/05/2026 11:56)_

**Chamar motoboy (timing 100% real):**
```
AÇÃO RECOMENDADA — Chamar motoboy agora
por quê: 14 pedidos prontos há mais de 30 min
primeiro olhar: Pedido #7006 (pronto há 55 min)
impacto: 14 prontos virando atraso na entrega
confiança: alta
dados: tempos reais (iFood) · cardápio real (199 itens) · composição sintética
```  
_(27/05/2026 12:38)_

**Fechar pedidos simples:**
```
AÇÃO RECOMENDADA — Fechar pedidos simples agora
por quê: 3 pedidos dependem de uma única praça (ex.: Duplas) e já esperam
primeiro olhar: #7223, #9403, #9381
impacto: desafoga a bancada · 3 pedidos saem da fila
confiança: média
dados: tempos reais (iFood) · cardápio real (199 itens) · composição sintética
```  
_(02/06/2026 11:49)_

**Conferência reforçada:**
```
AÇÃO RECOMENDADA — Conferência reforçada
por quê: Pedido #6885 tem 2 sacolas, bebida, kit
primeiro olhar: Pedido #6885
impacto: alto risco de esquecimento (item / 2ª sacola)
confiança: média
dados: tempos reais (iFood) · cardápio real (199 itens) · composição sintética
```  
_(28/05/2026 11:38)_

## 4. Precisão dos focos (desfecho real)
- **200/460 (43%)** dos focos aconteceram com um pedido **ruim de fato vivo** naquele minuto (cancelado/atraso>15/problema). Fora de janela ruim: 260.
- Focos de pedido preso especificamente: 15. *(fechamento/conferência são ações úteis, não previsões de risco.)*

## 5. Cobertura dos pedidos ruins
- **1013** pedidos ruins no mês; **5** passaram 100% em calmo (ponto cego). Cobertura **100%**.
- Pedidos que cruzaram risco: **1960** (24%).

## 6. Praças que mais travaram *(SINTÉTICO — ilustrativo, baseline provisório não calibrado)*
- Duplas (`duplas`): **8475** min de sobrecarga
- Combinados (`combinados`): **4548** min de sobrecarga
- Enrolados (`enrolados`): **4246** min de sobrecarga
- Quentes (`cozinha_quentes`): **3088** min de sobrecarga
- Enrolados Quentes (`enrolados_quentes`): **1363** min de sobrecarga

## 7. Dias com mais gargalo
- 10/06/2026: gargalo **98%** · 15 focos · 244 pedidos · 44 ruins
- 08/06/2026: gargalo **97%** · 15 focos · 248 pedidos · 16 ruins
- 24/06/2026: gargalo **97%** · 17 focos · 189 pedidos · 24 ruins
- 02/06/2026: gargalo **97%** · 16 focos · 256 pedidos · 22 ruins
- 31/05/2026: gargalo **97%** · 18 focos · 336 pedidos · 39 ruins

## 8. Horários mais críticos
- **12h** — 52 focos
- **11h** — 41 focos
- **15h** — 36 focos
- **21h** — 35 focos
- **14h** — 34 focos
- **17h** — 34 focos

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
- Subir piso de expedição/produção (exagero 1733%).
- Reforçar demote→ambiente (sequência de foco chegou a 16 min).
- Só calibrar baseline DEPOIS de ligar a composição real — antes disso é calibrar no escuro.

---
*Determinístico. Trocar a fonte de itens (sintética→real) NÃO muda nenhuma regra — basta re-rodar.*