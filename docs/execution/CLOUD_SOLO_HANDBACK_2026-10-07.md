# HANDBACK — execução solo no Cloud (Claude) → retomada no ChatGPT

**Missão:** `docs/execution/CLOUD_SOLO_DEVELOPER_MISSION_2026-10-07.md` · **Execução:** 2026-10-07 23:00 → 2026-10-08 (America/Sao_Paulo), em duas sessões (a 2ª começou com "Continua", 08/10 14:11).
**Ambiente:** Claude Code Remote (Anthropic), modelo configurado `claude-opus-5-5`. Nenhum recurso cobrado.
**Base validada:** `tmp/tata-comanda-product-adapter-20261006` @ `73626d09cae4ba91b7db2ea4942aa1a882ae7dc0` (filho de `2ff7dee`, só acrescenta a missão). Remoto revalidado antes de cada push: nenhum avanço concorrente na base nem na branch.
**Branch:** `feat/cloud-solo-reader-resilience-20261007` — sem merge, sem PR, sem deploy.
**VÉRTICE:** `cesarspichencoff-cmyk/vertice-runtime.` @ `vertice-active` = `e81b6d8` (`VERTICE_ENTRY.md` lido; usado como disciplina interna, sem marca no produto).

## 0. Leitura em 60 segundos

1. **Causa raiz do reader "RUNNING mas parado": reproduzida em sandbox, inferida em produção.** O watcher instalado (SHA `4507304C…`, o mesmo da evidência do cutover de 05/10) deixa o `SqlDataReader` aberto quando `Read()` lança LOCK_TIMEOUT (1222); daí todo poll falha no cliente ("already an open DataReader"), o modo contínuo engole o erro, a sessão fica `sleeping` e o checkpoint para — a assinatura de 05/10 21:55:51. **FACT em SQL Server 2022 real com PowerShell 7/.NET 8** (local e CI); **INFERENCE de alta confiança** para a CAIXA (.NET Framework 4.8 não medido). Detalhe: `docs/execution/TATA_READER_STALL_ROOT_CAUSE_AND_SUPERVISOR_2026-10-07.md`.
2. **Correção pronta para a CAIXA (CODE_READY + TEST_PASS, não instalada):** supervisor de lotes que roda o watcher auditado sem alterar um byte; heartbeat sem PII; saúde por progresso; auditoria estática por tokens; cutover Plan/Apply/Rollback cujo **Apply e rollback agora são executados** em teste (SCM simulado, 7/7) e que exige de volta os **três SHA** do Plan.
3. **A revisão independente de `d48bd42` achou 3 defeitos graves; todos corrigidos com vermelho antes e verde depois** (`3215447`). Mais dois achados meus nesta sessão: fuso (PS 7 em UTC-3 tomava heartbeat de 90 min antes como novo) e a janela do `File.Replace` do NTFS derrubando a leitura de saúde (CLI e `/api/fontes` com 500).
4. **Pronto e não executado: prova em Windows real** (`63f3359`, job `windows-real-scm`): Windows PowerShell 5.1, SCM de verdade, host C# v2 real compilado com `csc.exe`, conta virtual. Repositório público → runner padrão gratuito. **Depende de autorização de push** (CLAUDE.md exige confirmação por push).
5. **Continua pedindo decisão do César:** Q-019 (C6 do envelope M1), Q-020 (TATÁ na UI), Q-021 (linhagem B5/B8 com duas `0009`). Consumidor sombra da outra linhagem regrava o status ~1000×/s.

## 1. Commits

| commit | o que entrega | publicado |
|---|---|---|
| `a2222cb` | supervisor, avaliador de saúde, auditoria estática, harness SQL Server com controle negativo, fixtures byte-exatas | sim |
| `cf5f14d` | cutover com rollback + documento de causa raiz | sim |
| `e08cdfe` | migration 0009 reexecutável + equivalência declarada de checksum; Product System sem URL administrativa; P3 de papéis | sim |
| `9e5f01a` | `/api/fontes` — saúde real do leitor na superfície de leitura | sim |
| `98d3863` | CI da branch (Node+PostgreSQL, PowerShell+SQL Server) | sim |
| `7fe5fda` | bench de I/O do consumidor sombra | sim |
| `bdcf59d` | revisão adversarial (antivírus, aviso depois do JSON, lock, órfão, ACL), checagem estática WinPS 5.1, CI Android | sim |
| `d48bd42` | registros + 1º handback | sim |
| `3215447` | **revisão independente**: supervisor sem queda por corrida de arquivo, nunca dois escritores, efeitos não declarados = FATAL; auditoria por tokens; cutover com rollback em toda falha pós-efeito, 3 SHA, instalação atômica; fuso | **local** |
| `c7197a9` | cutover ponta a ponta com SCM simulado — Apply e rollback executados (7/7) | **local** |
| `0153592` | leitura de saúde tolerante à troca de arquivo do NTFS (CLI + `/api/fontes`, assíncrona) | **local** |
| `63f3359` | job `windows-real-scm`: WinPS 5.1 + SCM real + host C# v2 real | **local** |
| _(último)_ | este handback, documento de causa raiz corrigido, STATE/EVIDENCE/LEDGER | **local** |

"Local" = commitado e aguardando a autorização de push.

## 2. Delta por frente

### A — Verdade operacional TATÁ → DeliveryOS
- `runtime/tata-reader/tata_reader_supervisor_v1.ps1` (SHA-256 `F6E17EB9…3BF580`) — lotes de 20 polls; saídas 75/78 (0 só em teste, 70 só se tudo escapar); try/catch por iteração; registro do filho obrigatório; `BLOCKED_CHILD_ALIVE`; quarentena de órfão; `EFFECTS_UNDECLARED` fatal.
- `runtime/tata-reader/tata_reader_health_v1.cjs` — avaliador puro + CLI; `readSignalDoc`/`readMtimeMs` tolerantes à janela do `File.Replace`.
- `runtime/tata-reader/tata_reader_watch_static_audit_v1.cjs` — tokenizador; escrita SQL em qualquer literal; código dinâmico; `CommandText` só literal; `human_review_required: true`.
- `runtime/tata-reader/tata_reader_supervisor_cutover_v1.ps1` (SHA-256 `0D7D110E…DFD1E08`) — Plan devolve `apply_requires` (3 SHA); Apply por fases com rollback; caça de órfão pela linha de comando (só PowerShell); rollback que se recusa a restaurar com candidato vivo; `Test-InstantAfter` em UTC.
- `tests/tata-reader/**` — suítes, ensaio com SCM simulado (`run-cutover-e2e-tests.cjs` + `fixtures/fake_service_host.cjs`), prova em Windows real (`windows/real_scm_cutover_e2e.ps1` + `fixtures/host_v2/`, cópia byte a byte do host de `93b006b`, procedência em `fixtures/PROVENANCE.json`).

### B — Product System
- `GET /api/fontes`: saúde real da fonte TATÁ no vocabulário canônico; sem raiz configurada = `NAO_CONFIGURADA/indisponivel`; leitura agora assíncrona e sem 500 na troca de arquivo; erro leva só a classe, nunca o caminho.
- O histórico TATÁ de 05/10 (195 pedidos) **só existe na API**; exibir exige caminho protegido do envelope M1 → **Q-020**. Nenhuma UI protegida tocada.

### C — Android
- Testes JVM 52/52 no Cloud; job `android-unit` no CI. **Não é prova de aparelho.**

### D — Confiabilidade da plataforma
- 0009 reexecutável (+ equivalência de checksum declarada só para `5b639bf835be0e16`); Product System só com `DELIVERYOS_DATABASE_URL`; P3 de papéis contra `DELIVERYOS_RUNTIME_ROLES`.

### E — Figma
- Leitura autenticada em `dGyF0eRDd4YG8uqyWqU1P4` (`22:2`, `23:2`, `29:2`). **Nenhuma escrita** (Q-007 em PAUSE).

### F — Cloud
- PostgreSQL 16, Docker + SQL Server 2022, PowerShell 7.4.6, PSScriptAnalyzer, Chromium/Playwright, Android SDK, GitHub Actions. Um agente de revisão independente (só leitura) — achou os 3 graves de `d48bd42`.

## 3. Provas

| gate | resultado | onde |
|---|---|---|
| `test:tata-reader:health` | 17/17 (H17: janela real dos dois renames, com controle positivo) | local |
| `test:tata-reader:static` | 13/13 (A11–A13 = os contornos da revisão) | local |
| `test:tata-reader:supervisor` | 22/22 (o supervisor de `d48bd42` passa 14/22) | local, PS 7.4.6 |
| `test:tata-reader:cutover` | 13/13 (C12: fuso UTC-3) | local |
| `test:tata-reader:e2e` | 7/7, em UTC e America/Sao_Paulo | local, SCM simulado |
| `test:tata-reader:sqlserver` | 3/3 (X1 controle reproduz; X2 recupera; X3 um evento por pedido) | local + CI `37720135234` |
| `ps51_compat_check.ps1` | 0 achados, controle 3/3 (+ orquestrador do Windows e fixtures: 0) | PSScriptAnalyzer 1.23.0 |
| `test:platform:saude-fontes` | 9/9 (F8 janela real; F9 laço de eventos livre) | local |
| `test:platform:product` | 52/52 com e sem `DELIVERYOS_PG_URL` | local |
| `tsc --noEmit`, `build:platform` | limpos | local |
| `test:platform:governanca` | GREEN (14 guardas) | local |
| `windows-real-scm` (W0–W5) | **NÃO EXECUTADO** — depende do push | CI |

A regressão final dos gates tocados (lista do CI `node-postgres` + leitor) está em `docs/execution/EVIDENCE.jsonl` (`cloud-solo-session2-regression-2026-10-08`).

## 4. Classificação

- **WORLD_PROVEN:** nada novo (CAIXA e Foxxy inacessíveis daqui).
- **TEST_PASS (sandbox/CI):** causa raiz em .NET 8; supervisor; avaliador; auditoria; cutover inteiro com SCM simulado; leitura tolerante ao NTFS; correções de plataforma; `/api/fontes`; JVM Android.
- **CODE_READY:** prova em Windows real (aguarda push); tudo o que depende da CAIXA (instalação, `Restart-Service` do serviço real, ACL real, binário do host instalado).
- **DEPLOYED:** nada.

## 5. Regressões, riscos e UNKNOWNs

- **Regressão introduzida:** nenhuma conhecida (zero `FAIL_NOVO` nos gates tocados).
- **Mudança de contrato interno:** `lerSaudeDaFonteTata` passou a ser assíncrona (único chamador: `/api/fontes`).
- **Pré-existente vermelho (declarado):** `test:platform:m1-bridge` C6 → **Q-019**.
- **Linhagens divergentes:** 8 commits de 04–05/10 fora desta linha; duas migrations 0009 → **Q-021**.
- **Consumidor sombra (outra linhagem):** ~1000 escritas/s de status com 2000 eventos; correção de uma linha medida; não alterado.
- **V2 (`77C16940…`)**: fora do Git; UNKNOWN; **precisa de leitura humana** além da auditoria.
- **Host instalado:** a fonte v2 compilável conhecida é `93b006b` (a anterior nem compila); o binário instalado não tem SHA no Git — o Plan o mede e o Apply exige o mesmo valor.
- **Causa em produção:** INFERENCE; o 1222 dentro de `Read()` só foi visto em .NET 8.
- **Relógio:** toda saúde é avaliada no relógio da máquina do leitor.

## 6. Custos

Zero gasto. Downloads gratuitos; GitHub Actions em repositório **público** (runners padrão, Windows incluído, sem cobrança — docs.github.com, "Billing and usage").

## 7. Próximo passo seguro e pequeno

**Aqui (depende só de autorização):** push de `feat/cloud-solo-reader-resilience-20261007` → CI roda `windows-real-scm`. Verde = WinPS 5.1 e SCM real provados para o cutover; vermelho = defeito real achado antes da CAIXA.

**Na CAIXA (com Desktop Commander), nesta ordem:**
1. `Get-FileHash` do V2 = `77C16940…`; publicar o V2 byte a byte no Git; **uma pessoa lê o V2**.
2. `node runtime\tata-reader\tata_reader_watch_static_audit_v1.cjs <V2>` → `INSTALL_ONLY_UNDER_SUPERVISOR`.
3. `powershell -File runtime\tata-reader\tata_reader_supervisor_cutover_v1.ps1 -Mode Plan -RepoRuntimeDir <checkout>\runtime\tata-reader` → `PLAN_OK`; `apply_requires.SupervisorSha256` tem de ser `F6E17EB9A14D575ED7C572D2C59B551AD9E75809903E6540875AEF49093BF580`.
4. Fora do pico: `-Mode Apply -ExpectedInstalledWatcherSha256 <…> -ExpectedHostBinarySha256 <…> -SupervisorSha256 <…> -SqlSessionCheck` → saída 0 (`APPLIED_HEALTHY`) ou 3 (rollback provado); saída 2 = parar e chamar humano.
5. Publicar o recibo sanitizado; só então `LIVE_READER_WORLD_PROVEN`.

Em paralelo, decisões do César: **Q-019**, **Q-020**, **Q-021**.
