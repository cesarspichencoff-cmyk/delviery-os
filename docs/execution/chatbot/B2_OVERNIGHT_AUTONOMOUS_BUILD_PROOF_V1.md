# VÉRTICE — Overnight B2 Autonomous Build & Proof

## OVERNIGHT RESULT

A B2 avançou materialmente, mas não atingiu validação arquitetural. A separação
de autoridade ficou explícita, dois gaps de publicação foram fechados e a suíte
integral permaneceu verde. A prova livre, porém, não demonstrou generalização
independente: os planos fortes foram produzidos offline pela mesma sessão e os
turnos da campanha foram previamente roteirizados.

## B2 ARCHITECTURE

`ConversationPlannerPort` desacopla capacidade cognitiva da orquestração. O
pipeline preserva a ordem Planner → DeliveryOS Authority → Response Plan →
Writer → post-validator. `ReplayPlanner` trabalha somente por hash congelado;
`FunctionPlannerAdapter` serve ao harness experimental. Metadados internos são
removidos antes do Writer.

## 24 CASES

Rechecagem dos outputs congelados: 24/24 estruturados; 22/24 hard semantic
(91,67%); 24/24 safety; 24/24 repair; 23/24 referência; zero falha catastrófica.
Os casos I e N permanecem preservados como falhas do primeiro veredito.

## HUMAN GOLDENS

Dezesseis paráfrases inéditas foram executadas. No primeiro passe, 16/16 foram
publicadas, mas HG2-14 revelou `WRITER_DISTORTION`: a Gemma reconheceu a
correção e omitiu os fatos aprovados. O novo gate detectou essa classe. A
primeira repetição pós-gate mostrou que o fallback também precisava preservar
fatos/perguntas; a correção direcionada passou 3/3. A repetição Gemma completa
após o fechamento terminou por crash do runtime local e não foi declarada
aprovada.

## FREE CONVERSATIONS

Foram executadas 30 conversas sintéticas de seis turnos (180 turnos), com
180/180 publicações e zero vazamento no scanner público. Isto prova estabilidade
do pipeline para planos congelados. Não prova generalização do Planner: os
turnos e planos foram previamente roteirizados pela mesma sessão e o cliente
não reagiu de forma suficientemente livre ao texto publicado.

## ROBUSTNESS PASS

Não executado. O gate `B2_ARCHITECTURE_VALIDATED` não foi atingido; iniciar 60
conversas adicionais teria ampliado volume sem corrigir a limitação causal.

## A VS B2

Em 20 pares, a avaliação advisory escolheu B2 em 20/20 no resultado geral,
com 20/20 em compreensão e continuidade e 6 vitórias/14 empates em repair.
Naturalidade e hospitalidade ficaram 12 B2 contra 8 A. O resultado não é
independente: o estilo tornava a variante parcialmente inferível e havia
assimetria factual em perguntas de valet/informação do restaurante.

## FAILURES FOUND

- `WRITER_DISTORTION`: Writer omitiu fato já aprovado.
- `FALLBACK_INCOMPLETE`: fallback não preservava fato ou pergunta obrigatória.
- `LOCAL_WRITER_RUNTIME_CRASH`: repetição Gemma terminou com código de processo
  `1073807364`.
- `GENERALIZATION_PROOF_LIMIT`: planos e sequência livre não foram produzidos
  por um runtime cognitivo independente.

## ROOT CAUSES FIXED

1. Nomes/metadados internos deixam de atravessar a autoridade e o fallback
   publica resposta segura mesmo sem fato publicável.
2. O pós-validador exige preservação de ao menos um fato aprovado e da pergunta
   obrigatória; o fallback determinístico cumpre o mesmo contrato, inclusive
   em `NEEDS_TOOL`.

## WRITER LIMIT

Na amostra original de 30 turnos, 25 usaram Gemma e 5 fallback. O segundo gate
identificou omissões antes não detectadas. A correção direcionada está verde,
mas a recertificação Gemma completa ficou inconclusiva por instabilidade local.

## SAFETY

Safety permaneceu determinística e soberana: 24/24 nos casos congelados, zero
falha catastrófica e diretiva urgente imutável. Nenhum fato, preço, alergênico
ou disponibilidade foi delegado ao Planner ou Writer.

## WHAT IMPROVED

- porta cognitiva explícita e trocável;
- zero publicação perdida no replay histórico de 20 conversas/40 turnos;
- metadado interno fora da superfície;
- gate de alinhamento Writer/Response Plan;
- fallback preservando fato e pergunta;
- 791/791 testes Conversation e privacidade aprovada.

## WHAT STILL FEELS WEAK

O compositor determinístico é seguro, porém frequentemente seco e com voz de
banco de dados. O Writer local não foi recertificado após o gate final. A prova
de conversas livres ainda não separa adequadamente construtor, candidato,
cliente e avaliador.

## VERDICT

`B2_PROMISING_NOT_VALIDATED`

## MIGRATION DECISION PACKET

Não criado. O contrato autorizava esse pacote somente após B2 validada e
robusta.

## STATE

- Branch: `experiment/hospitality-b2-cognitive-planner-v1`.
- Base: `a1d73220c0926fdbb302d72d542d793b960ed713`.
- Produto A e `src/**`: intactos.
- Custo externo: R$ 0,00.
- Zero API externa, push, merge ou deploy.
- Evidência externa: `deliveryos-review-packets/b2-overnight-autonomous-proof-v1`.

## HUMAN NEXT

César decide se autoriza uma validação B2 realmente independente — com cliente
adaptativo, fatos equivalentes A/B e runtime cognitivo separado — antes de
qualquer discussão de migração.
