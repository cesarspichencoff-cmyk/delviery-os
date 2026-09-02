# Resolução de identidade do cliente

## Sinais

Telefone e e-mail são normalizados na fronteira e convertidos em tokens
determinísticos com segredo de runtime. IDs externos combinam origem e valor.
Nome, unidade e histórico não autorizam merge exato isoladamente.

## Classificações

| Estado | Consequência |
|---|---|
| `exact_match` | candidato único; pode seguir para unificação controlada |
| `probable_match` | exige revisão humana |
| `possible_match` | nunca unifica automaticamente |
| `conflict` | preserva todos os candidatos separados |
| `new_customer` | prepara novo cadastro |

`assertHumanMergeAllowed` fecha a operação para qualquer estado diferente de
`exact_match`. A interface prevista oferece comparar, unificar, manter
separados ou revisar depois; esta versão não faz merge de clientes reais.

Toda unificação futura precisa gerar evento reversível em
`customer_merge_history`.
