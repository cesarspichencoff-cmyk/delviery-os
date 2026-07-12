# Decisão de Avanço de Lotes — T0B L5

> Fecha a mineração controlada da voz do cliente.

---

## 1. Entregue

| Item | Status |
|---|---|
| Fonte única validada (hash OK) | Sim |
| Período confirmado Abr–Jul/2026 | Sim |
| Dedup de avaliações | Sim (1.230 → 1.034) |
| Taxonomia e severidade | Sim |
| Separação review_at vs ocorrência | Sim (order_at ausente) |
| Cruzamento L2C / L4 | Sim (com limites) |
| Casos anonimizados | Sim |
| Alertas / ranking / culpa individual | **Não** |
| PII no Git | **Não** |

---

## 2. Veredito

### **APROVADO COM RESSALVAS**

e **não** “APROVADO PARA L6 OPERACIONAL” de forma irrestrita.

**Ressalvas**

1. Export **sem** respostas, moderação e `order_at` — limita atendimento e cruzamento horário.  
2. Maioria das avaliações **sem texto** — temas dependem de tags.  
3. L6 (operacional/RH/mídia) **não** deve usar este lote para avaliar pessoas.  
4. Um caso de possível segurança alimentar exige **revisão humana**, fora de automação.

---

## 3. O que pode seguir (não iniciado)

| Uso | Condição |
|---|---|
| Formação em atendimento (casos 001–006) | Validação César |
| Processo de resposta a avaliações | Definir captura de reply + SLA |
| Matriz de autonomia (omissão/troca/qualidade) | Limites financeiros com César |
| L6 operacional | Escopo próprio; **sem** rankings nominais de avaliação |

---

## 4. Necessidades

| Tipo | Item |
|---|---|
| Processo | Registrar e treinar respostas; classificar recuperação |
| Dados | `order_at`, reply_at, moderation_state, order_id técnico privado |
| Autonomia | Quando compensar omissão/troca sem escalar |
| Formação | Escuta + não defensiva em frescor/qualidade |
| DeliveryOS | Fila de avaliações negativas com texto (investigação, não alerta punitivo) |

---

## 5. Explicitamente fora

- Alertas ativos  
- Cursos completos  
- Avaliar funcionários  
- OP / RH / mídia neste commit  
- Culpa sem evidência  

---

*Decisão L5 · aprovado com ressalvas · L6 não iniciada.*
