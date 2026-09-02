# Avaliação da branch humanizada anterior

Comparação realizada entre:

- base canônica: `feature/conversation-baseline-foundation-v1 @ 14a4f792`;
- material anterior: `feature/conversation-native-deliveryos-humanized-v1 @ 1b914c10`.

Nenhum merge, cherry-pick ou rebase foi realizado.

| Elemento anterior | Classificação | Decisão |
|---|---|---|
| divisão em perfil, estratégias, compositor e validador | conceito reutilizável | preservada como separação de responsabilidades |
| variação escolhida por hash estável | conceito reutilizável | refeita com contrato mais completo de seed, conversa, turno, intenção e estratégia |
| orçamento de emoji por sensibilidade | conceito reutilizável | refeito no perfil versionado |
| leitura das respostas anteriores para continuidade | código potencialmente reutilizável | portar manualmente somente a consulta append-only no runtime |
| evento sanitizado quando a composição é rejeitada | código potencialmente reutilizável | portar manualmente com códigos, sem texto bruto |
| testes de determinismo, R05, O02 e segurança alimentar | teste reutilizável | adaptar para o corpus e contratos da Mudança 002 |
| `createConversationPlan` antigo | incompatível com a fundação atual | schema não corresponde ao Response Plan exigido |
| alteração de `extractEntities` no Engine | rejeitado | muda entendimento operacional fora do escopo |
| validador consultando `classification.ideal_response` | inseguro | viola independência do validador |
| estratégias com respostas completas embutidas | excessivamente baseado em template | substituir por componentes estruturais |
| dois fallbacks amplos para quase toda incerteza | redundante | substituir pela taxonomia explícita |
| mudanças amplas no painel | incompatível com a fundação atual | pertencem à Mudança 003 |
| catálogo paralelo de 200 mensagens para teste humano | redundante | reutilizar o corpus canônico de 50 conversas |

## Conclusão

A branch anterior forneceu quatro ideias úteis, mas seu código não é fonte de
verdade. A implementação atual será manual, menor e orientada pelos contratos
da Mudança 001.
