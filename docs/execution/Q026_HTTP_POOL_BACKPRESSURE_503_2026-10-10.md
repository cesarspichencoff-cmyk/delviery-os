# Q-026 — distinguir sobrecarga de pg-pool e indisponibilidade real no HTTP (CANDIDATO / HOLD)

**Data:** 10/10/2026 · **PR #59** empilhado no #57. Pesquisa branch-only, sem merge, deploy ou mudança em main/integração.

## Problema observado e correção proposta

Na rota `GET /api/entregas` a admissão HTTP já respondia **503** para excesso de requisições, mas o timeout nativo da fila `pg-pool.connect()` de 1s era engolido pelo `lerRealidade()` e convertido em um bloco `leitura.disponivel=false` com status HTTP **200**. Um cliente que verifica exclusivamente status não conseguia distinguir "pool temporariamente ocupado" de uma consulta disponível.

O código da pesquisa introduz a classificação estrita `foiTimeoutNaFilaDoPoolPg` em `src/platform/persistence/pg-pool-backpressure.ts`: só aceita `Error` com mensagem exata `timeout exceeded when trying to connect`, **sem SQLSTATE**, emitida pelo pg-pool quando remove um waiter expirado. O repositório usa `pg 8.13.1` com lock de dependências. Erro de conexão física (mensagem diferente), falha de DNS/TLS e SQLSTATE permanecem genéricos; futura incompatibilidade do texto deverá **falhar para o contrato de leitura indisponível**, nunca inventar sobrecarga. Não foi criada classe de erro genérica que altere outras portas SQL.

Somente sob `DELIVERYOS_ENTREGAS_RR_DEADLINE_MS` opt-in e `DELIVERYOS_ENTREGAS_MAX_INFLIGHT`, o helper permite propagar o timeout de aquisição através de `lerRealidade()` até o handler real, que responde **HTTP 503** com `Retry-After: 1`, `Cache-Control: no-store`, `{"erro":"leitura_temporariamente_ocupada"}`. A resposta não publica SQL, URL nem credenciais.

Indisponibilidade real por autorização SQLSTATE 42501 continua como **HTTP 200**, mas `leitura.disponivel=false, motivo=indisponivel` e sem `Retry-After`, porque a API pública hoje codifica falha geral no bloco de realidade, separando-o da demonstração.

## Provas no banco e rota reais do ensaio

**[GitHub Actions #38091425555](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38091425555)**: **5/5 jobs SUCCESS** na branch de pesquisa, PostgreSQL 16 descartável com 12.000 eventos sintéticos, servidor **`tools/product_system_server.ts`** na porta local aleatória e lock `ACCESS EXCLUSIVE` bloqueando o SELECT real.

- **`pool_checkout_fast`**: 4 GETs admitidos, pool `max=2`. Dois checkout expirados em **1005,29 / 1005,38 ms**, agora com 503 explícito e Retry-After; duas consultas ativas sob lock encerradas como 503 `prazo_total_excedido` em **3005,35 / 3005,33 ms**. Quinto GET recusado com 503, health 200, nova consulta 200 disponível, zero sessão de Entregas ativa no momento da sondagem final.
- **`pool_saturated`**: 8 GETs simultâneos => 4 recusas imediatas (~7–9ms), 2 expirados na fila (~1006ms) com 503 retryable, 2 deadlines (~3008ms). Health 200 e leitura após desbloqueio 200.
- **`permission_denied`**: role PostgreSQL real SELECT-only; após sucesso inicial, revogação do SELECT sobre `platform.event_log` em banco efêmero gera falha de permissão. Contrato permanece HTTP 200 `leitura.disponivel=false,motivo=indisponivel`, sem Retry-After ou vazamento de erro; após GRANT, nova leitura 200 disponível.
- **`cancel_denied`**: revogação de EXECUTE no pg_cancel_backend *apenas* no PostgreSQL descartável; 42501 provado, fallback SET LOCAL statement_timeout encerra SQL bloqueado e recupera rota (HTTP 503, ~3003,20ms).
- **`regression`**: Q-016, Product e governança, com recusa de sucesso sem PG (exit 78).

Valores são **amostras únicas em CI**, não p95/p99, nem prova de produção.

## Limites de verdade e próximos gates

1. A mudança de 503 na fila exige checar o frontend: o `src/product/ui/app.js` lança erro para `!response.ok`; o reload existente preserva leitura anterior e exibe erro técnico "servidor respondeu 503". O status agora é correto, mas falta polir comunicação de sobrecarga e testar acessibilidade.
2. Classificação do driver depende de mensagem interna da versão de pg-pool, pinada no lock; testar contra upgrades.
3. Leituras de 1.03M ainda materializam todos os fatos no caminho canônico; a prova incremental #52 segue separada para Claude, sem integração nesse PR.
4. Sem prova de transação curta sob CPU síncrona, multi-worker/processos, p95/p99 confiáveis, Preview, rede/TLS de ambiente real nem dispositivos físicos.
5. HOLD da Q-026: qualquer promoção pede revisão adversarial, provas do conjunto, autorização humana. Sem merge/deploy/main/integração/migrations/banco operacional/gasto.

**O que passou em SHADOW ≠ comportamento publicado.**
