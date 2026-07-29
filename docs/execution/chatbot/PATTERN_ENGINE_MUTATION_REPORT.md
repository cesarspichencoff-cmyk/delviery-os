# Mutation report — Pattern Engine

Foram executadas 16 mutações/controles negativos independentes. Resultado:
`16 killed`, `0 survived`.

| ID | Mutação que deve falhar |
|---|---|
| MUT-001 | saudação vence segurança alimentar |
| MUT-002 | correção vira nova jornada |
| MUT-003 | cancelamento não cancela |
| MUT-004 | repetição adiciona fatos |
| MUT-005 | resposta curta ignora pergunta pendente |
| MUT-006 | referência ambígua escolhe o primeiro candidato |
| MUT-007 | pergunta lateral suspende a jornada |
| MUT-008 | troca de assunto sobrescreve em vez de suspender |
| MUT-009 | retomada escolhe jornada errada |
| MUT-010 | saudação isolada inicia jornada |
| MUT-011 | conversa social cria jornada |
| MUT-012 | `scenario_id` entra no contrato/oráculo |
| MUT-013 | limite da pilha é ignorado |
| MUT-014 | Writer troca a pergunta aprovada |
| MUT-015 | custo desconhecido é liberado |
| MUT-016 | identidade ambígua é escolhida silenciosamente |

O relatório é gerado por `runPatternMutationCertification()` e testado sem
dependência externa.

