# Conversation Pattern Engine

## Decisão arquitetural

O controle de diálogo do chatbot TATÁ é determinístico. O Pattern Engine decide
o padrão da mensagem, a jornada, a etapa, correções, referências, suspensão e
retomada. Um modelo local pode apenas redigir a superfície final depois de
receber um `ApprovedResponseEnvelope` validado.

```text
mensagem + estado + candidatos operacionais
  -> Pattern Resolver
  -> decisão versionada
  -> Journey Graph e State Hub
  -> Response Plan V2
  -> ApprovedResponseEnvelope
  -> Writer opcional
  -> validação independente
  -> resposta ou fallback determinístico
```

O motor não consulta modelo, rede, cenário esperado ou oráculo. `scenario_id`
não faz parte do contrato.

## Contrato de entrada

Versão: `deliveryos-conversation-pattern-input-v1`.

- `current_message` e `normalized_message`;
- `active_journey`, `active_step` e `pending_question`;
- `collected_facts`;
- `suspended_journeys` e `side_questions`;
- `last_assistant_act` e `recent_turns`;
- `candidate_intents` e `candidate_entities`.

Somente fatos operacionais sintéticos e permitidos podem entrar no estado. A
mensagem bruta não é persistida pelo Pattern Engine.

## Contrato de saída

Versão: `deliveryos-conversation-pattern-decision-v1`.

- `pattern`: `greeting`, `chitchat`, `continue`, `correction`,
  `clarification`, `side_question`, `interrupt`, `resume`, `switch_topic`,
  `repeat`, `cancel`, `close` ou `handoff`;
- `confidence` entre zero e um;
- `journey_action`: `none`, `start`, `advance`, `suspend`, `resume`,
  `backtrack`, `complete` ou `cancel`;
- `target_journey` e `target_step`;
- `facts_added` e `facts_corrected`;
- `reference_resolution`;
- `question_to_answer` e `question_to_resume`;
- `requires_clarification` e `clarification_question`;
- `collision_log`, com os sinais concorrentes e a regra vencedora.

## Prioridade de resolução

1. segurança e handoff;
2. correção explícita;
3. cancelamento;
4. repetição ou reformulação;
5. resposta à pergunta pendente;
6. referência contextual;
7. pergunta lateral;
8. mudança de assunto;
9. retomada;
10. saudação combinada com necessidade;
11. saudação isolada;
12. chitchat;
13. nova jornada;
14. fallback de esclarecimento.

Todos os sinais detectados são avaliados antes da escolha. Quando mais de uma
regra concorre, `collision_log` registra a prioridade aplicada sem armazenar o
texto original.

## Estado e Journey Stack

O estado versionado contém jornada e etapa ativas, pergunta pendente, fatos,
jornadas suspensas, pilha de perguntas laterais, histórico de jornadas,
correções, referências não resolvidas e último ato do assistente. A pilha tem
profundidade máxima de três jornadas suspensas; excesso falha fechado em
esclarecimento, sem sobrescrever a jornada mais antiga.

Correções preservam o valor anterior no histórico e alteram somente o campo
resolvido. Referência com mais de um candidato plausível nunca é assumida. Uma
resposta curta só é vinculada quando a pergunta pendente fornece tipo e domínio
suficientes.

## Integrações

- State Hub: recebe somente a projeção sintética da jornada, com revisão e
  proveniência `conversation_pattern_engine`.
- Response Plan V2: recebe a decisão e o estado resultante; a pergunta decidida
  pelo Pattern Engine tem precedência sobre perguntas já concluídas.
- Writer local: recebe somente o envelope aprovado e não participa da redução
  de estado.
- Fallback: usa o compositor determinístico e preserva jornada, etapa e pergunta
  pendente.

Com a opção do Pattern Engine desligada, o runtime anterior permanece
inalterado.

## Limites

Esta mudança não promove modelo, não modifica playbooks, políticas, intenções,
CRM, drivers, Bridge, protocolo do AI Node, autenticação, instalador ou qualquer
integração real. A escolha entre Gemma 4 E4B e Qwen3.5 é exclusivamente humana e
posterior aos gates técnicos.
