# Semantic Transition Lab

O checkpoint automático anterior foi invalidado pela conversa humana livre. Esta prova substitui sua conclusão de experiência; os resultados históricos continuam preservados apenas como evidência.

## FIRST DIVERGENCE

Em “Preciso de um lugar para comer hoje”, a saudação era reconhecida, mas o objetivo humano era perdido antes do Writer. Mais tarde, uma jornada gastronômica antiga mantinha autoridade sobre correções e pedidos explícitos de reserva.

## ROOT CAUSE

A transição de jornada ocorria depois de decisões que reutilizavam contexto anterior. Sinais de reparo não revogavam a hipótese rejeitada; referência vaga como “isso” podia vencer uma intenção atual explícita; categoria solicitada não era restrição soberana da recomendação. A entidade de quantidade também não chegava ao plano canônico de reserva em todos os casos.

## FIX

- Prioridade do turno atual: `EXPLICIT CURRENT INTENT > STALE ACTIVE JOURNEY`.
- Relações mínimas `CONTINUE`, `REFINE`, `CORRECT`, `SWITCH`, `INTERRUPT` e `RESUME` antes do planner.
- Reparos e feedback negativo suspendem a hipótese rejeitada e replanejam pelo último objetivo explícito.
- Categoria explícita restringe candidatos; atributo disponível só aparece quando é relevante.
- Reserva remove candidatos stale e preserva a quantidade reconhecida.
- Perguntas laterais continuam interrompendo e retomando sem serem confundidas com abandono.

## WHY LAB MISSED IT

O cliente sintético anterior cooperava com o roteiro, o oráculo mantinha expectativas antigas após mutações e o detector de loop não vinculava rejeição explícita à resposta seguinte. Assim, cobertura alta não exercitava autoridade do turno atual.

## NEW IMMUNITIES

Hard gates: `USER_REPAIR_IGNORED`, `REJECTED_RESPONSE_REPEATED`, `STALE_JOURNEY_RESPONSE`, `EXPLICIT_INTENT_SWITCH_IGNORED`, `CATEGORY_MISMATCH` e `RESERVATION_SWITCH_FAILURE`. O catálogo contém 100 transições/reparos, 100 conversas de categoria, 100 adversariais multiturno e 100 livres; estas recebem somente persona, objetivo, humor e restrições.

## FREE SIMULATION RESULT

Seed `TATA-SEMANTIC-TRANSITION-FRESH-20260809-B`: 400 conversas, 1.750 turnos, zero falha crítica, alta ou média e zero em todos os gates obrigatórios. Repetição em runtime novo produziu o mesmo hash `826a5a3c5e945727057a41b54a97680e12b0d8d46dd2671d77dc2af6e1c3c875`.

## REGRESSIONS

- Prova dirigida da transcrição humana: 13/13.
- Contratos direcionados de jornada, catálogo, segurança e hospitalidade: 79/79.
- Suíte integral Conversation Native: 758/758 em execução final limpa.
- Catálogo canônico: 200/200; nenhum driver real e nenhum acesso externo.
- Privacidade: zero achado; controle positivo detectado.

Uma restauração intermediária pelo Git converteu dois artefatos JSON de LF para CRLF e expôs uma comparação histórica byte a byte. O conteúdo canônico permaneceu idêntico; os artefatos foram regenerados pelo verificador existente e a execução final passou sem alterar o teste ou suas expectativas.

## STATE

Pronto apenas para conversa humana livre. Gemma e a arquitetura de modelo não foram alterados. Produção, push, merge e deploy permanecem bloqueados.
