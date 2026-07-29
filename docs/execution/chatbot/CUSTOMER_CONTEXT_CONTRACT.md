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

## Interfaces implementadas na Mudança 007+008

`find_customer_by_phone`, `get_customer_summary`,
`get_customer_preferences`, `get_recent_orders`,
`get_recent_reservations`, `get_recent_incidents`,
`record_customer_fact_candidate` e `request_customer_confirmation`.

As interfaces são implementadas por `CustomerMenuToolRouter`. Telefone e
e-mail são normalizados e tokenizados na fronteira; o modelo não recebe SQL,
credencial ou tabela. Merge ambíguo permanece bloqueado e qualquer fato novo
entra como candidato pendente de confirmação.
