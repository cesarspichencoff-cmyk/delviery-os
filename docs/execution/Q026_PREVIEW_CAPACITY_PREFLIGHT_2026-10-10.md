# Q-026 — orçamento de conexões PostgreSQL por worker (SHADOW / HOLD)

Data: 2026-10-10. Adendo de segurança à [candidata limpa #77](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/77), a partir da prova de dois processos do [PR #74](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/74).

**Escopo:** ferramenta pura `tools/q026-preview-capacity-gate.ts` e entrada CLI explícita `tools/q026-preview-capacity-cli.ts`. NÃO leem ambiente, não abrem banco, não criam projeto, não modificam `product_system_server.ts`, não têm acesso a segredos e não habilitam flags de produção.

## Por que é preciso

O CI do PR #74 confirmou que `DELIVERYOS_ENTREGAS_MAX_INFLIGHT=1` funciona **por processo**; dois processos independentes que apontam para o mesmo PostgreSQL aceitaram **duas** consultas simultâneas. Quando o deadline HTTP está ativado, cada processo cria pools `pg` de leitura (máximo 2) e cancelamento independente (máximo 1). Uma implantação de N processos poderia alcançar N×3 conexões PostgreSQL para esses dois pools, além dos demais pools da aplicação, monitoramento, serviços, administração, conexões reservadas e folga operacional.

`MAX_INFLIGHT` NÃO é limite global; cada worker possui seu próprio contador. Não confundir o cálculo com semáforo entre instâncias nem com prova de latência. O pool pode criar menos conexões efetivas que o teto, mas o orçamento deve cobrir o teto.

## Input obrigatório — campos numéricos, **sem** credenciais

`workers`, `admissionPerWorker` (somente 1/2/4), `pgMaxConnections` (**ler de `SHOW max_connections` no PostgreSQL real de Preview**), `pgReservedConnections`, `otherServicesConnections`, `safetyHeadroomConnections` (mínimo 1) e `otherConnectionsPerWorker` (inclui todos os outros pools de cada instância). O programa **recusa** campos ausentes, desconhecidos ou tipos errados. Nunca inserir host, senha, URL ou token no JSON.

Exemplo **ilustrativo, NÃO representa dados reais do DeliveryOS**:

```bash
npx tsx tools/q026-preview-capacity-cli.ts '{"workers":4,"admissionPerWorker":2,"pgMaxConnections":100,"pgReservedConnections":5,"otherServicesConnections":20,"safetyHeadroomConnections":15,"otherConnectionsPerWorker":1}'
```

Orçamento hipotético = 4×(2 leitura + 1 cancelador + 1 outro pool) + 20 outros serviços + 5 reservas + 15 folga = **56 conexões** de um total hipotético de 100; saldo 44; até 8 requisições HTTP admitidas nos 4 processos, mas até 8 consultas de leitura SQL simultaneamente (2 por processo). Saída `sufficient_on_declared_assumptions=true` significa **somente** aritmética consistente com premissas declaradas, não autorização de deploy.

Se o total ultrapassar `max_connections`, sai com código 2. Sem campos suficientes também sai 2; nenhum default de quantidade de processos ou conexões pode ser inventado.

## Limites decisórios

- É preciso confirmar topologia real, pooler/pgBouncer (se houver), nomes de funções PG reais, limites de conexão por role e TLS, e orçamento de administração/monitoramento; nenhuma dessas informações foi descoberta pelo teste puro.
- Não expor ou armazenar strings de conexão para calcular a capacidade.
- Capacidade de conexões suficiente **não garante** p95/p99, ausência de starvation, cancelamento rápido durante CPU, MVCC curto, qualidade de GPS, resiliência offline ou login Android.
- Para seguir para Preview autêntico exige-se um projeto/URL efetivamente ligado ao repositório correto. Sem esse destino, o estado é `PREVIEW_UNKNOWN`, não `DEPLOYED` ou `WORLD_PROVEN`.
- A implementação incremental do Claude (#71) e a candidata limpa (#77) permaneceram DRAFT/HOLD, sem alteração de `main`/integração ou produção em decorrência desta ferramenta.

**Q-026 e Q-024 abertas. Este gate é necessário para dimensionamento, mas não suficiente para promoção.**
