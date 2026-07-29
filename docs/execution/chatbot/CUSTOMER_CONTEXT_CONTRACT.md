# Customer Context Contract V1

## Finalidade

Preparar a leitura futura de contexto de cliente sem acessar banco, telefone,
CRM real ou identidade externa nesta mudança.

## Campos

| Campo | Regra |
|---|---|
| `schema_version` | `deliveryos-customer-context-v1` |
| `status` | ausente, desconhecido, parcial, pronto, ambíguo, indisponível ou bloqueado |
| `identity_status` | `unknown`, `unique`, `ambiguous` ou `not_found` |
| `customer_id` | somente quando a identidade for única |
| `consent_status` | desconhecido, ausente, concedido ou revogado |
| `confirmed_facts` | fatos confirmados, com fonte explícita |
| `inferred_facts` | hipóteses separadas; nunca promovidas silenciosamente |
| `declared_restrictions` | restrições declaradas; alergia confirmada tem prioridade |
| `unknowns` | lacunas visíveis |
| `provenance` | fontes sem conteúdo pessoal bruto |

Um mesmo campo não pode existir simultaneamente como confirmado e inferido.
Identidade ambígua força esclarecimento antes de qualquer ação ou
personalização.

## Interfaces reservadas

`find_customer_by_phone`, `get_customer_summary`,
`get_customer_preferences`, `get_recent_orders`,
`get_recent_reservations`, `get_recent_incidents`,
`record_customer_fact_candidate` e `request_customer_confirmation`.

Todos são mocks fechados nesta mudança. Não há SQL, busca real, merge de
identidade ou persistência de telefone. A implementação integral pertence à
Mudança 007.

