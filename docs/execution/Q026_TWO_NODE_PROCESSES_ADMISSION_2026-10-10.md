# Q-026 — limite HTTP por instância não é limite global (SHADOW)

Data 2026-10-10. PR #74 empilhado na candidata consolidada #70.
Escopo: dois processos Node reais executam o servidor de apresentação `criarServidor()` usando o **mesmo PostgreSQL16 descartável**. Nenhuma mudança em runtime, schema, autenticação, CI de publicação, banco operacional ou infraestrutura real.

## Condição adversarial

Cada processo foi iniciado independentemente com `DELIVERYOS_ENTREGAS_MAX_INFLIGHT=1`, `DELIVERYOS_ENTREGAS_RR_DEADLINE_MS=3000` e `DELIVERYOS_ENTREGAS_INCREMENTAL_RR=1`. O banco de teste tem dois mil GPS sintéticos. Um writer isolado mantém `ACCESS EXCLUSIVE LOCK` sobre `platform.event_log`, bloqueando as consultas reais.

Uma requisição GET é enviada a cada instância. A observação `pg_stat_activity` do mesmo PostgreSQL mostra **duas consultas bloqueadas simultaneamente**, comprovando que não há contador global. Um GET extra por instância precisa ser recusado imediatamente com HTTP 503 e `Retry-After: 1`. Ambos os GETs admitidos devem expirar em 503 após ~3000ms. Com o lock removido, as duas instâncias voltam a HTTP 200 com dados disponíveis.

## Prova no commit testado

[GitHub Actions #38095487870](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38095487870) — **2/2 SUCCESS**, commit `69b77f2f50480c006badd23bd7695764fa8603b1`, incluindo typecheck estrito, Q-016/Product/governança e recusa sem PG (exit 78).

- Processos Node distintos: PID **2959** e **2979**.
- Limite admitido em cada processo: **1**.
- Consultas PostgreSQL bloqueadas **no conjunto**: **2**.
- GETs excedentes: **[503,503]**, com `Retry-After:1`.
- GETs admitidos: **503 em 3005,08ms e 3005,38ms**.
- Health sob bloqueio: **[200,200]**.
- Recuperação após rollback/desbloqueio: **[200,200]**.
- Observação do script exclui conexão de sondagem própria.

## Limites e decisão

**Fato provado:** `DELIVERYOS_ENTREGAS_MAX_INFLIGHT` é um mecanismo de admissão *por processo* e não global ao cluster. Não concluir que isso é bug se a implantação operacional usa uma única instância. Não inferir capacidade total sem saber número de instâncias, pools concorrentes e conexões reservadas.

**Antes de múltiplos workers em Preview/produção:** definir limite de conexões do PostgreSQL, réplicas máximas, capacidade do pool por instância, health sob fila e política explícita de backpressure. Em uma topologia de `k` processos cada um com `m` admissões, até `k*m` requisições podem passar pela admissão local (não significa o mesmo número de consultas ativas no banco). Uma coordenação global só deve ser implementada se dados de capacidade exigirem; acrescentar banco de locks distribuídos sem necessidade pode reduzir confiabilidade.

Primeira execução [#38095416662](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38095416662) falhou no **bootstrap de teste**, porque `npx tsx` residia no cache temporário e `fork --import tsx` não encontrava o módulo. Ajustada **somente** a instalação temporária de tsx no job de CI, sem alterar dependências do repositório. Não contabilizar a primeira execução como validação da aplicação.

**Q-026 OPEN/HOLD**. Teste sintético não é Preview, TLS/multi-host, p95/p99 nem validação de dispositivos físicos. Nenhum merge/deploy nesta pesquisa.
