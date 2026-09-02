# Contratos das ferramentas Customer + Menu

O `CustomerMenuToolRouter` aceita apenas 19 ferramentas allowlisted. CRM:

`find_customer_by_phone`, `find_customer_candidates`,
`get_customer_summary`, `get_customer_preferences`,
`get_customer_restrictions`, históricos recentes, candidato a fato e pedido
de confirmação.

Cardápio:

`search_menu_items`, detalhes, menu por canal, disponibilidade, alergênicos,
customizações, candidatos de recomendação, harmonizações e comparação.

Toda resposta usa `deliveryos-customer-menu-tool-result-v1`, com `status`,
`data`, `sources` e `unknowns`. SQL, nomes de tabela e credenciais são
bloqueados.

O adaptador produz os contratos `Customer Context`, `Menu Context` e
`Recommendation Context`. O Pattern Engine mantém a jornada; o DeliveryOS
consulta ferramentas; o Writer recebe somente o envelope aprovado.
