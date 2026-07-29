# Customer Intelligence CRM V1

## Arquitetura

O CRM é uma projeção orientada a eventos. `CustomerIntelligenceStore` mantém
cliente canônico, identidades tokenizadas, fontes, fatos com certeza explícita,
restrições, consentimentos, pedidos, reservas, incidentes, notas, tags,
segmentos, candidatos a fato e histórico de auditoria.

As entidades PostgreSQL estão descritas em
`src/conversation-crm/customer-intelligence/migrations/001_customer_intelligence.sql`.
A migration é contrato para o PostgreSQL existente e não foi executada em
produção.

## Estados de conhecimento

- `confirmed`: confirmado pelo cliente ou fonte humana autorizada;
- `imported`: veio de plataforma, sem promoção automática;
- `inferred`: hipótese de baixa autoridade;
- `employee_noted`: anotação operacional;
- `unconfirmed`, `stale` e `conflicting`: exigem cautela ou revisão.

Inferência nunca é promovida silenciosamente. A timeline de auditoria remove
valores pessoais; ferramentas internas retornam IDs canônicos e contexto
estruturado.

## Escopo desta versão

O painel local contém somente três clientes sintéticos. Não há cliente real,
campanha, contato externo, merge real ou migration executada.
