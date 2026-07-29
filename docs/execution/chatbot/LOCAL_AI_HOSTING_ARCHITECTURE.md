# Arquitetura de hospedagem do diálogo local

Data da inspeção: 2026-07-28. Base: `4f8a66f`.

## O que foi realmente encontrado

O checkout canônico da conversa não contém manifestos de deploy, runtime remoto,
driver PostgreSQL, URL de produção ou provedor configurado. Ele é um simulador
Node local com persistência JSONL. Portanto, **não há hospedagem ativa comprovada
nesta branch**.

Há uma fundação de plataforma em worktree separado,
`feature/deliveryos-hybrid-platform-foundation-v1`, com o contrato PostgreSQL
14+, runtime crítico, runtime assíncrono, outbox e composição em container. A
própria documentação dessa branch declara que nenhum provedor, banco hospedado
ou Docker foi ativado. Ela foi lida como referência arquitetural e não foi
incorporada, mesclada ou tratada como ambiente existente.

Consequências:

- o bridge desta mudança é hospedável e usa um cliente PostgreSQL injetado;
- testes usam store em memória e relógio injetável, nunca um banco paralelo;
- o wiring HTTP/deploy real depende da futura consolidação da plataforma;
- nenhum fornecedor, conta, fila, Redis, Kafka ou serviço pago foi criado;
- WebSocket não é requisito: o transporte canônico é claim/lease por HTTPS.

## Fluxo preservado

```text
cliente -> DeliveryOS -> sanitização -> job queued
                                      ^        |
                                      |        v
                         resultado validado <- claim/lease HTTPS <- AI Node
cliente <- resposta determinística (default e fallback)
```

O AI Node inicia heartbeat, claim e entrega de resultado. O restaurante não
publica porta, IP ou tunnel. O runtime do modelo escuta somente `127.0.0.1`.

## Persistência alvo

O adapter PostgreSQL recebe uma função `query` do runtime da plataforma. Ele não
abre conexão própria e não conhece credenciais. O schema usa:

- `conversation_ai_job`: projeção vigente e lease;
- `conversation_ai_job_event`: trilha append-only;
- `conversation_ai_node`: projeção de registro/revogação;
- `conversation_ai_node_event`: trilha append-only;
- índices únicos para idempotência e resultado aceito;
- `FOR UPDATE SKIP LOCKED` no claim;
- timestamps UTC e expiração explícita.

Até esse adapter ser ligado ao runtime PostgreSQL consolidado, a afirmação
permitida é: **bridge local comprovado e contrato PostgreSQL pronto; hospedagem
real não conectada**.

## Transporte e degradação

O polling inicia rápido após atividade e cresce com backoff e jitter limitado
quando a fila está vazia. Long polling pode ser habilitado por configuração.
WebSocket só poderá ser adicionado se o provedor futuro já o suportar sem custo;
claim/lease permanece fallback obrigatório.

Estados: `queued`, `claimed`, `processing`, `completed`, `rejected`, `expired`,
`failed`, `fallback_used`. Lease expirado pode voltar à fila; job expirado não.
Somente um resultado validado vence. Job pendente nunca impede o fallback.

