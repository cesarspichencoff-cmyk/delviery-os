# Destino dos Achados — Formação, Processo e Alertas — L2B

> Cada achado com contrato mínimo. Status **nunca** “confirmado permanentemente”.  
> Candidatos a alerta: no máximo **EM VALIDAÇÃO**.

---

## 1. Achados

### F-L2B-001 — Indisponibilidade comunicada (taxa A)

| Campo | Conteúdo |
|---|---|
| categoria | indisponibilidade |
| descrição | 5 unidades alta conf. auditadas / 8.124 pedidos válidos ≈ **0,062 / 100** |
| período | 2026-05-27..2026-06-25 |
| metrica | incidência comunicacional normalizada |
| dimensão | período completo fluxo normal |
| confiança | baixa–média (n=5) |
| estabilidade | hipótese fraca · W1 puxa |
| limitações | WA≠censo; subtipos mistos; não é erro automático |
| alternativas | pausa proativa; subnotificação |
| impacto | clareza de quando pausar item vs loja |
| ação | procedure + briefing de pausa/86 |
| **destino** | **procedimento**, **briefing pré-turno**, dado adicional |
| **status** | hipótese fraca |

### F-L2B-002 — Compensação comunicada (taxa A)

| Campo | Conteúdo |
|---|---|
| categoria | compensacao |
| descrição | 2 unidades / 8.124 ≈ **0,025 / 100** (amostra pequena) |
| metrica | incidência comunicacional normalizada |
| confiança | baixa |
| limitações | n=2; só communication_time; não é falha automática |
| **destino** | **formação** (autonomia de cortesia), **matriz de autonomia**, procedimento |
| **status** | hipótese fraca |

### F-L2B-003 — Absoluto vs normalizado por hora

| Campo | Conteúdo |
|---|---|
| categoria | transversal |
| descrição | Pico de pedidos 18–20h **não** é o pico de WA/100; 21–22 sobe; 15–16 instável |
| metrica | wa_units / 100 pedidos |
| estabilidade | hipótese recorrente no período (método) |
| **destino** | **comunicação**, **formação**, candidato futuro a alerta (método) |
| **status** | hipótese recorrente no período |

### F-L2B-004 — Canal dominante

| Campo | Conteúdo |
|---|---|
| categoria | canal |
| descrição | WA-05 ~29% das unidades; remove canal → numeradores A caem |
| **destino** | necessidade de dado adicional; comunicação metodológica |
| **status** | descritivo |

### F-L2B-005 — Trilha B exploratória

| Campo | Conteúdo |
|---|---|
| categoria | B (várias) |
| descrição | n=2–8 por cat.; só exploratório |
| **destino** | dado adicional; formação genérica cuidadosa |
| **status** | exploratório |

### F-L2B-006 — After 23h

| Campo | Conteúdo |
|---|---|
| descrição | 4 pedidos boundary; sem efeito em taxas A se excluídos |
| **destino** | nenhuma ação (manter série separada) |
| **status** | rejeitado (como ameaça às taxas) |

---

## 2. Destinos agregados

### Formação
- Autonomia e registro de **compensação** (tipos/contextos).  
- Ler chat com **normalização por exposição** (não “hora cheia de msg = falha”).  
- Indisponibilidade: distinguir pausa de item / loja / insumo (não culpar).

### Processo / procedimento
- Checklist de **pausa/86** com motivo.  
- Política de **não** misturar communication_time com event_time em relatórios.  
- Exclusão formal de **hora 17** e **≥23h** de taxas de fluxo normal.

### Briefing pré-turno
- Lembrar: jantar = mais pedidos; comunicação por pedido pode ser outra história.  
- Registrar pausas com tipo.

### Matriz de autonomia
- Quando compensar sem escalar; o que documentar (motivo + tipo).

### Candidato a alerta (máx. EM VALIDAÇÃO)

| ID | Descrição | Status |
|---|---|---|
| ALERT-CAND-001 | Exigir normalização por exposição antes de priorizar faixa horária de comunicação | **EM VALIDAÇÃO** |

**Não** aprovado para teste. Requisitos futuros: precisão ≥0,90, períodos independentes, normalização, ação clara, aprovação humana.

### Nenhuma ação
- Tratar os 4 pedidos 23h como distorção de taxa A (já excluídos).

---

## 3. O que **não** vira destino nesta missão

- Alerta ativo no DeliveryOS  
- Curso completo / aula  
- Ranking de pessoas  
- “Pior dia/hora” operacional  
- Taxa real de erro a partir do WhatsApp  

---

## 4. Próximo passo recomendado (fora desta missão)

1. Ampliar período de exposição + reclass WA com mesmo codebook.  
2. Reauditar A com n≥30 por categoria antes de taxas finas.  
3. Manter B exploratória até gate A.  
4. Só então reavaliar ALERT-CAND-001.

---

*Destinos L2B · formação e processo prioritários · alertas só em validação.*
