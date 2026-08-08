# Autonomous Experience Lab — V1

## Resultado

O laboratório reutilizável conversa pela mesma rota HTTP do painel,
`POST /api/homologation/chat`, sobre estado, catálogo certificado, Pattern Engine,
Hospitality, Recommendation, Writer, validador e compositor reais. Cada conversa
usa runtime temporário, reset isolado e seed reproduzível. Nenhum driver real,
serviço pago, dado pessoal ou sistema externo participa da prova.

As 12 reprovações da homologação V2 permanecem congeladas em
`tools/conversation-crm/experience-lab/golden-failures.v2.json` como classes de
falha, sem copiar dados pessoais ou otimizar apenas para frases literais.

## Estrutura

- `catalog.js`: 40 conversas estruturadas e 40 mutadas, cobrindo as famílias
  exigidas com 4–12 turnos.
- `synthetic-customer.js`: cliente adaptativo, coloquial e determinístico.
- `runner.js`: servidor real em porta local efêmera, rota real, estado real,
  catálogo certificado e limpeza integral do runtime.
- `hard-evaluator.js`: gates A–O para delta material, loop, fato perdido,
  pergunta repetida, referência, canal, fatos não sustentados, linguagem interna,
  segurança, retomada, quantidade, apoio à decisão e primeira visita.
- `experience-evaluator.js`: leitura de transcript e fatos permitidos para
  naturalidade, hospitalidade, continuidade, utilidade e repetição. Seu resultado
  é obrigatoriamente `ADVISORY_NOT_INDEPENDENT`; não substitui César.
- `cli.js`: execução por seed, modo, limite, Writer local e arquivo de evidência.

Comando canônico:

```powershell
node tools/conversation-crm/experience-lab/cli.js --seed TATA-EXPERIENCE-LAB-V1 --mode all --output <arquivo-fora-do-git>
```

## Classes encontradas e correções

| FAILURE_CLASS | Primeira divergência | Causa raiz | Correção de classe | Regressão |
|---|---|---|---|---|
| RESPONSE_LOOP | nova pergunta repetia a recomendação | plano não distinguia preço, decisão e segurança do pedido anterior | respostas direcionadas por objetivo e explicação específica quando segurança bloqueia a escolha | verde |
| DECISION_SUPPORT_FAILURE | “qual dessas...” devolvia lista/fallback | apoio à decisão continha pergunta em campo proibido e era rejeitado pelo pós-validador | resposta e pergunta separadas; comparação usa apenas preparo, preço e contexto autorizados | verde |
| REFERENCE_FAILURE | “essa segunda...” não resolvia antecedente | referência ordinal exigia forma excessivamente literal | resolução pela lista apresentada e forma ordinal coloquial | verde |
| MATERIAL_DELTA_IGNORED | leve, cream cheese e maçaricado não replanejavam | extração curta e recomposição insuficientes | sinais coloquiais entram no contexto e forçam nova busca/explicação | verde |
| CHANNEL_SWITCH_FAILURE | iFood → salão permanecia no canal anterior | expressões de intenção presencial não tinham precedência explícita | canal explícito substitui contexto e candidatos, sem mistura de catálogos | verde |
| QUANTITY_DELTA_IGNORED | 2 → 5 preservava plano anterior | quantidade atualizava estado sem invalidar suficiência implícita | grupo atualizado e opções sem quantidade confirmada deixam de ser tratadas como suficientes | verde |
| FIRST_VISIT_FALLBACK | pessoa nova recebia clarificação genérica | vocabulário coloquial de desconhecimento não chegava à descoberta guiada | primeira visita inicia escolha por familiar/cozido versus cru | verde |
| SAFETY_CONTEXT_LOST | alergia não dominava o turno seguinte | alergia podia contaminar preferência e apoio à decisão era resolvido antes do gate preventivo | alergia não vira preferência; segurança tem precedência e impede escolher ou ranquear até confirmação da equipe | verde |

## Ciclos e evidências

O lote vermelho inicial executou 80 conversas/424 turnos e encontrou 327 falhas
em sete classes. Os ciclos seguintes reduziram para 124 e 16 falhas. A prova
com Writer revelou uma oitava causa — precedência incorreta da alergia — e a
terceira correção centralizou o gate preventivo. O laboratório não ultrapassou
três ciclos de correção.

Foram concluídas 1.240 conversas sintéticas e 6.297 turnos ao longo das rodadas.
As duas rodadas frescas finais, já com as 20 famílias explícitas, foram:

- `TATA-EXPERIENCE-LAB-FINAL-E-20260808`: 80 conversas, 380 turnos,
  zero falha, hash `e8f225cc527e0811f19f1425e222699d9be5de58edf96a1e68e86bbed0fcb03f`.
- `TATA-EXPERIENCE-LAB-FINAL-F-20260808`: 80 conversas, 380 turnos,
  zero falha, hash `3d7a7545cb286fb88cbfb98b318aeede00752e89375ab5bbada9e3c876629d43`.

A amostra abrangente do Writer local usou a seed
`TATA-EXPERIENCE-LAB-WRITER-COMPREHENSIVE-20260808`: 20 conversas, 95 turnos,
uma passagem por cada família, zero falha e hash
`8b76e522665c8d639b45a42302638d9ee7a96d22ed313573d4340333c6832b28`.

## Limites honestos

- O Hard Evaluator é determinístico, mas continua sendo código do mesmo sprint.
- O Experience Evaluator não é independente: `ADVISORY_NOT_INDEPENDENT`.
- O lote completo 40+40 usa o compositor determinístico pela mesma rota real;
  a prova com Gemma cobre uma passagem por cada família por causa do custo de
  tempo local, sem custo financeiro externo.
- Passar o laboratório não autoriza produção nem prova excelência humana.
- A próxima prova pertence a César: 5–10 conversas livres e representativas,
  julgadas pela pergunta “Eu confiaria isso a um cliente real do TATÁ?”.
