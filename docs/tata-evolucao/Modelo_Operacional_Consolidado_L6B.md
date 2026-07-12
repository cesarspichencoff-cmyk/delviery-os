# Modelo Operacional Consolidado — L6B

> Fundação operacional do TATÁ Evolução (Delivery TATÁ Sushi).  
> Consolida L6A + L1–L5 + Visão Mestra + **decisões do César** nesta missão.  
> **Não** é curso, app nem código DeliveryOS.

---

## 1. Princípios operacionais (congelados)

1. Qualidade antes de velocidade.  
2. Experiência do cliente antes da conveniência interna.  
3. Capacidade real antes de volume irresponsável.  
4. Padrão antes de improviso.  
5. Hierarquia no momento crítico; discordância responsável **depois**.  
6. Segurança para relatar e responsabilidade para corrigir.  
7. Ajuda não é favor.  
8. Responsabilidade **não desaparece** quando há colaboração.  
9. Estado do pedido antes de cobrança genérica (“cadê?”).  
10. Comunicação: fatos + impacto + ação necessária.

**Ranking individual público:** **proibido** (treinamento, cultura, operação).  
Substituir por **Passaporte de Evolução**: competências, evolução, foco de desenvolvimento, requisitos, evidência **privada** de consistência.

---

## 2. Funções e propriedade

| Função | Propriedade principal |
|---|---|
| **SAC e Atendimento** | Comunicação com cliente, investigação inicial, resposta, recuperação, acompanhamento, **fechamento do ciclo** com o cliente |
| **Caixa** | Lançamento, pagamento, estorno **técnico**, conferência financeira, execução financeira de decisão **já autorizada** |
| **Delivery Júnior / Pleno / Sênior** | Produção da expedição: montagem, kit, conferência, responsável pela sacola, apoio de fluxo |
| **Assistência Operacional** | Apoio a decisões, pausa de item com critério, reforço de padrão |
| **Liderança em exercício / Preparação** | Contenção de pico, redistribuição, exceções até o limite documentado |
| **Liderança (César/gestão)** | Pausa de loja, exceções comerciais, limites acima da autonomia, conflitos estruturais |

No pico as funções **cooperam**, mas a **propriedade da situação permanece explícita**.

---

## 3. Responsável pela sacola (oficial consolidada — César)

| Elemento | Definição |
|---|---|
| O quê | Cada pedido tem **uma** pessoa responsável pela sacola no fluxo crítico |
| Onde | Atribuição no **pré-turno** por **posição**, não por “pessoa favorita” |
| Durante | Ajuda de outros **não** encerra a responsabilidade |
| Transferência | Só com **passagem explícita** (verbal ou registrada) |
| Encerramento | Após entrega formal ao próximo responsável (expedição/motoboy conforme fluxo) |
| Princípio | Todos podem ajudar. **Uma** pessoa fecha o ciclo. |

---

## 4. Prioridade no pico (oficial consolidada — César)

Ordem de raciocínio (não é “praça fixa prioritária”):

1. Pedido mais próximo de conclusão.  
2. Gargalo que bloqueia **múltiplos** pedidos.  
3. Pedido mais antigo com risco real.  
4. Qualidade e segurança.  
5. Proteção do fluxo global.

Pressão verbal isolada **não** define prioridade.

---

## 5. Modelo de regra (campos)

Cada `rule_id` usa: nome · finalidade · gatilho · responsável · apoio · autoridade · passos mínimos · evidência · encerramento · exceções · fonte · vigência · confiança · decisão pendente · impacto formação/processo/DeliveryOS.

**Status:** oficial consolidada · proposta para validação · provisória · antiga compatível · desatualizada · contraditória · aguardando decisão · não localizada.

---

## 6. Regras oficiais consolidadas nesta L6B

| rule_id | Nome | Status |
|---|---|---|
| R-L6B-01 | Separação SAC × Caixa | **oficial consolidada** |
| R-L6B-02 | Responsável pela sacola | **oficial consolidada** |
| R-L6B-03 | Prioridade no pico (5 critérios) | **oficial consolidada** |
| R-L6B-04 | Proibição de ranking individual público | **oficial consolidada** |
| R-L6B-05 | Quente separado de frio na montagem | **proposta para validação** (fonte OP-04; prática forte) |
| R-L6B-06 | Kit e conferência conforme tipos documentados | **proposta para validação** (OP-04) |
| R-L6B-07 | Multi-sacola comunicada ao cliente | **proposta para validação** (texto OP-04) |
| R-L6B-08 | Expedição só após saída no app + identificação | **proposta para validação** (OP-04) |
| R-L6B-09 | Escalonamento com contexto (qtde, praça, motoboy, impacto) | **proposta para validação** (OP-10/roteiro) |
| R-L6B-10 | Pausa e item 86 (estrutura César) | **proposta para validação** |
| R-L6B-11 | Compensação e recuperação (estrutura sem valores) | **proposta para validação** |
| R-L6B-12 | Níveis 45/55/65 | **aguardando decisão / calibração** |

Detalhes de 10–11 em `Protocolos_Prioritarios_Rascunho_L6B.md` e matriz em `Matriz_Autonomia_Escalonamento_V0_9.md`.

---

## 7. Quatro perspectivas (temas prioritários)

| Tema | Documento | Comunicação | Dado (L2C) | Cliente (L5) |
|---|---|---|---|---|
| Kit / omissão | OP-04 forte | WA omissões | — | reaparece |
| Troca | parcial | WA/L5 | — | reaparece (n baixo) |
| Qualidade | higiene/treino | — | — | tema negativo líder |
| Pausa | fragmentado → proposta L6B | escalonamento WA | — | residual |
| Compensação | ausente → estrutura L6B | WA | — | reply ausente no export |
| Atraso | OP-10 foco 19h | chat 21–22 | pico atraso-flag ~19h | pouco texto de atraso |
| Cancelamento | históricos | — | 0,9–2,5/100 | pouco |
| Comunicação | multi-sacola + OP-10 | hub César (L1) | — | — |
| Recuperação | lacuna | — | — | sem resposta no export |
| Sacola responsável | César L6B | OP-11 “dona de etapa” | — | — |
| Pico/gargalo | OP-10/13 | — | volume 19h | — |

---

## 8. Tempo operacional (herdado L2C)

- Fuso America/Sao_Paulo.  
- `operational_day_key = local_date`.  
- Fluxo normal: horário local **&lt; 23:00**.  
- Hora 17: exposição zero esperada.  
- Templates antigos 22:00–00:00: **desatualizados** para medição atual.

---

## 9. O que este modelo **não** faz

- Não oficializa números financeiros.  
- Não oficializa 45/55/65.  
- Não prova que a regra escrita já é prática 100%.  
- Não avalia pessoas nem cria ranking.  

---

*Modelo L6B · base para validação final do César e gate L8.*
