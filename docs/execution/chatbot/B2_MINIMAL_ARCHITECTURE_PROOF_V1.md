# B2 Minimal Architecture Proof V1

## B2 DESIGN

A prova separa três autoridades em código exclusivamente experimental:

1. Cognitive Planner sob Contract V2, sem texto final e sem autoridade factual.
2. DeliveryOS como gate de fatos, ferramentas, referências e safety.
3. Gemma somente como Writer do Response Plan aprovado, seguida de pós-validação e fallback determinístico.

Arquitetura A e `src/**` permaneceram intactos. O Strong Model do Work foi usado
somente para congelar planos; não existe integração externa ou runtime de
produção nesta branch.

## 24 CASES

- 24/24 estruturalmente válidos.
- hard semantic: 22/24, 91,67%.
- safety: 24/24, 100%.
- repair: 24/24, 100%.
- reference: 23/24, 95,83%.
- zero falha semântica catastrófica.

Falhas reais preservadas: o caso I interpretou `7` como quantidade sem resolver
a ambiguidade com horário; o caso N reparou o erro anterior, mas não pediu o item
necessário para consultar composição.

## HUMAN GOLDENS

Os 12 casos foram publicados sob o gate final. Um texto da Gemma foi bloqueado
por linguagem interna e substituído pelo fallback determinístico. Nenhum plano
foi regenerado.

## FREE CONVERSATIONS

Foram executadas 20 conversas novas com dois turnos cada. O segundo turno foi
escolhido depois da primeira resposta e vinculado ao hash dessa resposta.

- 40 turnos.
- 38 publicações.
- 13 ocorrências `WRITER_LIMIT` protegidas pelo pós-validador.
- 2 turnos sem publicação porque até o fallback continha nomes de fixture
  impróprios para a superfície do cliente.

## A VS B2

Resultado da comparação anonimizada, com limitação de independência registrada:

| Dimensão | A | B2 | Empate/ambas ruins |
|---|---:|---:|---:|
| Resultado geral | 3 | 16 | 1 |
| Compreensão | 2 | 16 | 2 |
| Continuidade | 2 | 17 | 1 |
| Ajuda útil | 3 | 16 | 1 |
| Apoio à decisão | 3 | 16 | 1 |
| Reparo | 0 | 5 | 15 |
| Naturalidade | 6 | 14 | 0 |
| Hospitalidade | 3 | 15 | 2 |
| Não repetição | 2 | 15 | 3 |

Duas comparações tiveram fatos disponíveis assimétricos e não sustentam uma
conclusão causal isolada.

## HARD GATES

O pós-validador bloqueou disponibilidade não comprovada e linguagem interna. A
prioridade urgente permaneceu soberana nos dois turnos da conversa crítica. Não
houve preço, alergênico, canal ou disponibilidade inventados nas publicações
finais. Dois turnos ficaram sem resposta, portanto o gate de completude falhou.

## FIRST DIVERGENCE

No caso I, o Planner escolheu silenciosamente que `7` significava sete pessoas.
O correto era esclarecer quantidade versus horário. Foi a primeira falha
semântica dura das saídas congeladas e não foi corrigida por regeneração.

## CHALLENGER

- O construtor, o candidato e o avaliador pertencem à mesma sessão do Work.
- Os 24 casos já eram conhecidos de missões anteriores.
- B2 recebeu contextos e resultados de ferramenta curados; A recebeu seu
  contexto nativo, criando duas assimetrias factuais observáveis.
- O pós-validador foi endurecido após falhas vistas nesta mesma amostra.
- As conversas livres têm somente dois turnos e o Synthetic Customer não foi um
  avaliador independente.
- Dois turnos B2 ainda não produziram resposta segura.

## VERDICT

`B2_PROMISING_NOT_VALIDATED`

## WHAT THIS PROVES

Uma função cognitiva mais capaz, sem autoridade factual, pode melhorar
materialmente compreensão, continuidade, repair e troca de objetivo. O
DeliveryOS conseguiu bloquear deriva factual do Writer e preservar safety.

## WHAT THIS DOES NOT PROVE

Não prova produção, fornecedor, custo, latência, privacidade de modelo externo,
conversa longa, equivalência de contexto, 10/10 ou homologação humana.

## NEXT DECISION

César decide se autoriza uma segunda prova B2 independente e ainda limitada,
com contexto A/B equivalente e foco exclusivo em eliminar os dois gaps de
publicação antes de qualquer integração.

## STATE

- Branch local: `experiment/b2-minimal-architecture-proof-v1`.
- Base: `e602b8f4ea96aba39ab7353cba715c0d9cef9af2`.
- Baseline A preservada: `0cdc09f030938c84dcaf6a6d69276ceb7e5b78b7`.
- Conversation: 784/784.
- Privacy: aprovada, zero finding e controle positivo detectado.
- Custo externo: zero.
- Zero push, merge ou deploy.
