# HANDBACK — execução solo no Cloud (Claude) → retomada no ChatGPT

**Missão:** `docs/execution/CLOUD_SOLO_DEVELOPER_MISSION_2026-10-07.md` · **Execução:** 2026-10-07 23:00 → 2026-10-08 (America/Sao_Paulo)
**Ambiente:** Claude Code Remote (Anthropic), modelo Claude Opus 5.5 — o mais capaz disponível nesta sessão. Nenhum Vertex AI, nenhum recurso cobrado.
**Base validada:** `tmp/tata-comanda-product-adapter-20261006` @ `73626d09cae4ba91b7db2ea4942aa1a882ae7dc0` (filho de `2ff7dee`, só acrescenta a missão; remoto revalidado sem avanço concorrente antes de cada push).
**Branch publicada:** `feat/cloud-solo-reader-resilience-20261007` — sem merge, sem PR, sem deploy.
**VÉRTICE:** `cesarspichencoff-cmyk/vertice-runtime.` @ `vertice-active` = `e81b6d8` (`VERTICE_ENTRY.md` lido; usado como disciplina interna, sem marca no produto).

## 0. Leitura em 60 segundos

1. **Causa raiz do reader "RUNNING mas parado" — reproduzida em SQL Server 2022 real, local e no GitHub Actions.** O watcher instalado (SHA `4507304C…`, o mesmo da evidência do cutover de 05/10) deixa o `SqlDataReader` aberto quando `Read()` lança LOCK_TIMEOUT (1222); a partir daí todo poll falha no cliente ("already an open DataReader"), o modo contínuo engole o erro, a sessão fica `sleeping` e o checkpoint para — exatamente a assinatura de 05/10 21:55:51. Detalhe: `docs/execution/TATA_READER_STALL_ROOT_CAUSE_AND_SUPERVISOR_2026-10-07.md`.
2. **Correção pronta para a CAIXA (CODE_READY + TEST_PASS, não instalada):** supervisor de lotes que roda o watcher auditado **sem alterar um byte**, heartbeat sem PII, avaliador de saúde por progresso, auditoria estática que classifica o V2 em segundos, e script de cutover com rollback automático (`-Mode Plan` por padrão).
3. **Três gates vermelhos da plataforma consertados na causa** (migration 0009 não reexecutável; URL administrativa vazando para o Product System; P3 de papéis desatualizado).
4. **Achados graves que pedem decisão do César:** 8 commits provados de 04–05/10 (B8 multiunidade, leitor oficial do Product System, fonte PG→Product, prontidão do piloto) **não estão** na linhagem atual, e há **dois B5 incompatíveis** com migrations `0009` diferentes; C6 do envelope M1 vermelho desde 30/09; o consumidor sombra da outra linhagem regrava o status ~1000×/s.

## 1. Commits publicados (todos em `feat/cloud-solo-reader-resilience-20261007`)

| commit | o que entrega |
|---|---|
| `a2222cb` | supervisor de lotes, avaliador de saúde, auditoria estática, harness SQL Server com controle negativo, fixtures byte-exatas do watcher instalado |
| `cf5f14d` | cutover do supervisor com rollback automático + documento de causa raiz |
| `e08cdfe` | migration 0009 reexecutável + equivalência declarada de checksum (runner e preflight); Product System sem URL administrativa; P3 de papéis |
| `9e5f01a` | `/api/fontes` — saúde real do leitor TATÁ na superfície de leitura |
| `98d3863` | CI da branch (Node+PostgreSQL e PowerShell+SQL Server) |
| `7fe5fda` | bench de I/O do consumidor sombra |
| `bdcf59d` | revisão adversarial (antivírus, aviso depois do JSON, lock, órfão no rollback, ACL de `bin\`), compatibilidade WinPS 5.1, CI Android |
| _(último)_ | registros STATE/EVIDENCE/LEDGER/PERGUNTAS e este handback |

## 2. Delta por frente

### A — Verdade operacional TATÁ → DeliveryOS
- `runtime/tata-reader/tata_reader_supervisor_v1.ps1` — supervisor (WinPS 5.1 e PS 7; lote padrão 20 polls; heartbeat melhor-esforço contra lock de antivírus).
- `runtime/tata-reader/tata_reader_health_v1.cjs` — avaliador puro + CLI (`npm run health:tata-reader -- --heartbeat … --host-status … --consumer-status … --checkpoint …`).
- `runtime/tata-reader/tata_reader_watch_static_audit_v1.cjs` — auditoria estática (`npm run audit:tata-reader:watcher -- <watcher.ps1>`).
- `runtime/tata-reader/tata_reader_supervisor_cutover_v1.ps1` — cutover Plan/Apply/Rollback com recibo sanitizado.
- `tests/tata-reader/**` — suítes + harness; `tests/tata-reader/fixtures/PROVENANCE.json` prova a origem byte a byte do watcher.
- `tools/tata_reader_harness_sqlserver.sh` — SQL Server 2022 Developer descartável, fixado por digest.
- `tools/tata_reader_consumer_io_bench.cjs` — mede escrita por poll de qualquer laço consumidor.

### B — Product System
- `GET /api/fontes` (`tools/product_system_server.ts` + `src/platform/leitura/saude-fonte-tata.ts`): saúde real da fonte TATÁ no vocabulário canônico; sem `TATA_READER_INSTALL_ROOT` responde `NAO_CONFIGURADA/indisponivel`, nunca demonstração; histórico 05/10 continua `ao_vivo=false`.
- **Achado:** o histórico TATÁ de 05/10 (195 pedidos, R$ 38.989,37) **só existe na API** — nenhuma tela o mostra (`grep tata_comanda src/product/ui` = 0). Exibir exige tocar caminho protegido do envelope M1 → **Q-020**. Não toquei UI protegida.

### C — Android
- Pela primeira vez no Cloud: SDK instalado (dl.google.com acessível nesta sessão) e **testes JVM 52/52 PASS** (`testDebugUnitTest`, 8 classes). Job `android-unit` adicionado ao CI. **Não é prova de aparelho**: telefone físico continua pendente.

### D — Confiabilidade
- **0009 não reexecutável** (B5, 06/10) → `test:platform:pg` vermelho desde `8fe27a0`. Corrigida com guarda `pg_constraint` (padrão da 0003). Para não PARAR banco que aplicou o texto antigo, a migration declara `-- checksum-anterior-equivalente: 5b639bf835be0e16` (padrão `validCheckSum` do Liquibase) e o runner e o preflight aceitam **só** esse checksum, visível. Gate novo `test:platform:migration-reexec` 5/5, vermelho antes (1/5).
- **Product System aceitava `DELIVERYOS_PG_URL`** (URL administrativa das suítes) como banco da superfície: conectava como administrador e quebrava a suíte com a variável no ambiente. Agora só `DELIVERYOS_DATABASE_URL`; 52/52 com e sem a variável.
- **papeis:compose P3** afirmava 2 papéis desde que o SQL ganhou piloto e source-ingest (01/10); agora compara com `DELIVERYOS_RUNTIME_ROLES` (fonte única) com controle negativo.

### E — Figma
- Leitura autenticada OK em `dGyF0eRDd4YG8uqyWqU1P4` (lidos `29:2` e a página `9:4`, com `22:2 CONTRACT-B5 · Device Queue Telemetry`, `23:2 STATE-B8 · Multi-unit Read` e `29:2 CONTRACT-B5 · Offline Queue Depth`). **Nenhuma escrita** (Q-007 em PAUSE; não há superfície TATÁ live aprovada). Paridade visual de algo novo: UNKNOWN.

### F — Cloud
- Terminal, PostgreSQL 16 local, Docker + SQL Server 2022, PowerShell 7.4.6 (hash oficial conferido), Chromium/Playwright (screenshots), Android SDK + Gradle 8.9, GitHub Actions. Sem subagentes.

## 3. Provas (comandos e resultados)

| gate | resultado | onde |
|---|---|---|
| `npm run test:tata-reader:health` | 15/15 | local + CI |
| `npm run test:tata-reader:static` | 10/10 | local + CI |
| `npm run test:tata-reader:supervisor` | 14/14 | local (PS 7.4.6) + CI (PS 7.6.6) |
| `npm run test:tata-reader:cutover` | 9/9 | local + CI |
| `tests/tata-reader/ps51_compat_check.ps1` | 0 achados; controle positivo 3/3 | PSScriptAnalyzer 1.23.0, perfil WinPS 5.1 |
| `npm run test:tata-reader:sqlserver` | 3/3 (X1 controle reproduz; X2 recupera em 0,1 s após liberar; X3 um evento por pedido) | local + CI |
| `npm run test:platform:migration-reexec` | 5/5 (antes: 1/5) | local + CI |
| `npm run test:platform:pg` | 17/17 (antes: vermelho) | local + CI |
| `npm run test:platform:database-preflight` | 9/9 | local + CI |
| `npm run test:platform:product` | 52/52 com e sem `DELIVERYOS_PG_URL` | local + CI |
| `npm run test:platform:saude-fontes` | 6/6 | local + CI |
| `npm run test:platform:papeis:compose` | 10/10 (antes: 9/10) | local + CI |
| Android `testDebugUnitTest` | 52/52 | local; job `android-unit` no CI |
| `npm run test:lab` | Lab V4 48 + 9/9 mutações + navegador 28/28 + D4 | local (headless shell 1228 instalado) |
| `npm run test:platform:m1b-perceptual` | 5/5 (antes: sempre PULADO por servidor ausente) | local, servidor real na 5292 |
| GitHub Actions | run `37720135234`: `node-postgres` ✅ `pwsh-sqlserver` ✅ | https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/37720135234 |

**Regressão ampla pós-mudança:** 65 gates distintos (PostgreSQL 16 local), incluindo as suítes de mutação spine, q016, q017, cadeia, relógio, append-only, pb19 e m1b — **todas GREEN, zero cegas**, rodadas depois da troca do runner de migrations. 62 PASS na primeira passada; `test:lab` só caiu por versão do navegador do ambiente (resolvida: GREEN); `governanca`/`governanca:mutacoes` vermelhas só pelo G6b/G6c de lifecycle — fechadas por este registro (conferido depois do commit).

## 4. Classificação

- **WORLD_PROVEN:** nada novo nesta execução (CAIXA e Foxxy inacessíveis daqui — não há Desktop Commander neste ambiente).
- **TEST_PASS (sandbox/CI):** causa raiz; supervisor; avaliador; auditoria; lógica do cutover; harness SQL Server; correções de plataforma; `/api/fontes`; testes JVM Android.
- **CODE_READY (só roda na CAIXA):** partes Windows do cutover (`Get-Service`/`Restart-Service`, ACL, WinPS 5.1, host C#).
- **DEPLOYED:** nada.

## 5. Regressões, riscos e UNKNOWNs

- **Regressão introduzida:** nenhuma conhecida (zero `FAIL_NOVO`). Números em `docs/execution/EVIDENCE.jsonl` (`cloud-solo-regression-2026-10-07`).
- **Pré-existentes que continuam vermelhos (declarados):** `test:platform:m1-bridge` C6 — 12 caminhos protegidos mudaram desde 30/09 (Q-003, Q-015, B6, B7, adaptador TATA) sem registro no envelope → **Q-019**.
- **Linhagens divergentes (risco alto):** `tmp/product-reader-official-wiring-20261005` (ponta `ba77962`) tem 8 commits de 04–05/10 ausentes desta linha. Merge de ensaio: 9 conflitos, 49 arquivos, **duas migrations 0009** (`device_offline_queue_depth` aqui; `device_runtime_status` lá, tabela própria com `source_mode` e `rejected_points`). Figma tem os dois B5 (`22:2` e `29:2`) e o B8 (`23:2`). → **Q-021**.
- **Consumidor sombra (outra linhagem, `live_shadow_consumer_loop_v1.cjs`, sha `407c6aaa…`):** com 2000 eventos processados e zero novos, cada poll faz 2000 escritas + 2000 renomeações do status (≈1000/s no poll de 2 s), crescendo sem poda. Correção de uma linha (mover `status("RUNNING")` para fora do laço por arquivo) medida: 1/poll. **Não alterei aquela linhagem** — está em uso por outra execução.
- **V2 (`77C16940…`) segue fora do Git** e é UNKNOWN; publicar byte a byte antes de instalar.
- **Campo de contrato antigo:** `collection_boundary.extended_reader_permissions_currently_authorized: false` em `tata_comanda_order_truth_v1.cjs` ficou desatualizado depois do grant de 06/10; não alterado (mudar valor de contrato exige versão).
- **Clock:** a CAIXA já divergiu do relógio da conversa; toda saúde é avaliada no relógio da própria máquina do leitor.

## 6. Custos

Zero gasto adicional. Downloads gratuitos (PowerShell, SQL Server Developer, Android SDK, Gradle, npm); minutos do GitHub Actions dentro do uso já existente do repositório (o repositório já tinha 406 execuções).

## 7. Próximo passo seguro, específico e pequeno (na CAIXA, com Desktop Commander)

1. Conferir `Get-FileHash` do V2 = `77C16940…` e **publicar o V2 byte a byte** no Git.
2. `node runtime\tata-reader\tata_reader_watch_static_audit_v1.cjs <V2>` → esperado `INSTALL_ONLY_UNDER_SUPERVISOR`.
3. `powershell -File runtime\tata-reader\tata_reader_supervisor_cutover_v1.ps1 -Mode Plan -RepoRuntimeDir <checkout>\runtime\tata-reader` → `PLAN_OK…` + SHA instalado.
4. Fora do pico: `-Mode Apply -ExpectedInstalledWatcherSha256 <SHA do passo 3> -SqlSessionCheck` → `APPLIED_HEALTHY` (ou rollback provado, código 3).
5. Publicar o recibo sanitizado; só então `LIVE_READER_WORLD_PROVEN`.

Em paralelo, decisões do César: **Q-019** (C6), **Q-020** (exibir TATÁ na UI), **Q-021** (linhagem B5/B8).
