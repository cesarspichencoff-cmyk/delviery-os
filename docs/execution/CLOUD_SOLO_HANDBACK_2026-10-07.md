# HANDBACK — execução solo no Cloud (Claude) → retomada no ChatGPT

**Missão:** `docs/execution/CLOUD_SOLO_DEVELOPER_MISSION_2026-10-07.md` · **Execução:** 2026-10-07 23:00 → 2026-10-08 (America/Sao_Paulo), em duas sessões (a 2ª começou com "Continua", 08/10 14:11).
**Ambiente:** Claude Code Remote (Anthropic), modelo configurado `claude-opus-5-5`. Nenhum recurso cobrado.
**Base validada:** `tmp/tata-comanda-product-adapter-20261006` @ `73626d09cae4ba91b7db2ea4942aa1a882ae7dc0` (filho de `2ff7dee`, só acrescenta a missão). Remoto revalidado antes de cada push: nenhum avanço concorrente na base nem na branch.
**Branch:** `feat/cloud-solo-reader-resilience-20261007` — sem merge, sem PR, sem deploy.
**VÉRTICE:** `cesarspichencoff-cmyk/vertice-runtime.` @ `vertice-active` = `e81b6d8` (`VERTICE_ENTRY.md` lido; usado como disciplina interna, sem marca no produto).

## 0. Leitura em 60 segundos

1. **Causa raiz do reader "RUNNING mas parado": reproduzida em sandbox, inferida em produção.** O watcher instalado (SHA `4507304C…`, o mesmo da evidência do cutover de 05/10) deixa o `SqlDataReader` aberto quando `Read()` lança LOCK_TIMEOUT (1222); daí todo poll falha no cliente ("already an open DataReader"), o modo contínuo engole o erro, a sessão fica `sleeping` e o checkpoint para — a assinatura de 05/10 21:55:51. **FACT em SQL Server 2022 real com PowerShell 7/.NET 8** (local e CI); **INFERENCE de alta confiança** para a CAIXA (.NET Framework 4.8 não medido). Detalhe: `docs/execution/TATA_READER_STALL_ROOT_CAUSE_AND_SUPERVISOR_2026-10-07.md`.
2. **Correção pronta para a CAIXA (CODE_READY + TEST_PASS, não instalada):** supervisor de lotes que roda o watcher auditado sem alterar um byte; heartbeat sem PII; saúde por progresso; auditoria estática por tokens; cutover Plan/Apply/Rollback cujo **Apply e rollback são executados** em teste (SCM simulado, 10 cenários) e que exige de volta os **três SHA** do Plan.
3. **Duas revisões independentes, todos os achados tratados com vermelho antes e verde depois.** A 1ª (sobre `d48bd42`) achou 3 graves: cutover sem rollback depois do primeiro efeito e supervisor derrubado por corrida de arquivo — **corrigidos**; auditoria contornável — **mitigada** (cada revisão acha contornos novos; leitura humana do V2 é obrigatória). A 2ª (sobre `1eacabe`) achou dois caminhos de **dois escritores** no checkpoint (reinstalação com órfão vivo; lista de processos que falha virava "ninguém vivo"), mais 4 contornos da auditoria e 5 menores — **todos fechados** no último commit (ainda local). Achados meus: fuso (PS 7 em UTC-3 tomava heartbeat de 90 min antes como novo) e a troca de arquivo do NTFS derrubando a leitura de saúde.
4. **Provado no Windows real (CI `37879636538`, todos os jobs verdes).** Windows PowerShell 5.1.20348 / .NET 4.8: supervisor 24/24 e cutover 13/13; cutover **inteiro** contra o SCM de verdade, com o host C# v2 real compilado pelo `csc.exe` e a conta virtual: Plan só lê, Apply `APPLIED_HEALTHY`, rollback manual provado, candidato que falha revertido, e o `Stop-Service` real matando só o supervisor com o lote órfão morto pela linha de comando (6/6). Antes disso, a primeira passada (`37867864216`) ficou **vermelha** e achou um defeito real do 5.1 (`Get-FileHash` com `PSModulePath` do PowerShell 7: todo lote `WATCHER_UNREADABLE`, 4/23) — corrigido em `078359d`.
5. **Pede decisão do César:** Q-019 (C6 do envelope M1), Q-020 (TATÁ na UI), Q-021 (linhagem B5/B8 com duas `0009`); o repositório é **público** e guarda evidências operacionais em `data/` (agregados financeiros do dia, sem PII nesta branch; outras branches têm mais); o consumidor sombra da outra linhagem regrava o status ~1000×/s.

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
| `3215447` | 1ª revisão independente: supervisor sem queda por corrida de arquivo; efeitos não declarados = FATAL; auditoria por tokens; cutover com rollback em toda falha pós-efeito, 3 SHA, instalação atômica; fuso | sim |
| `c7197a9` | cutover ponta a ponta com SCM simulado — Apply e rollback executados | sim |
| `0153592` | leitura de saúde tolerante à troca de arquivo do NTFS (CLI + `/api/fontes`, assíncrona) | sim |
| `63f3359` | job `windows-real-scm`: WinPS 5.1 + SCM real + host C# v2 real | sim |
| `1eacabe` | handback da sessão 2 e registros | sim |
| `65c38f1` | 2ª revisão independente: nenhum escritor vivo na parada nem no rollback (falha fechada), caça de lote sem registro na partida, rollback que sempre religa, auditoria +4 contornos, `/api/fontes` com prazo e sem FIFO, orquestrador recusa pasta existente | sim |
| `7e705ef` | este handback, documento de causa raiz e STATE/EVIDENCE/LEDGER da 2ª revisão | sim |
| `078359d` | o que o Windows real achou: SHA por .NET, `PSModulePath` limpo no 5.1, classe da exceção em `WATCHER_UNREADABLE`, S24 | sim |
| `40bff44` | registro do achado do Windows real | sim |
| _(último)_ | Windows real verde registrado; W6 (caça de lote sem registro sob a conta virtual) adicionado ao job | local |

"Local" = commitado e aguardando nova autorização de push.

## 2. Delta por frente

### A — Verdade operacional TATÁ → DeliveryOS
- `runtime/tata-reader/tata_reader_supervisor_v1.ps1` — lotes de 20 polls; saídas 75/78 (0 só em teste, 70 só se tudo escapar); try/catch por iteração; registro do filho obrigatório; `BLOCKED_CHILD_ALIVE`; quarentena de órfão; **caça de lote sem registro na partida** (`startup.command_line_hunt` no heartbeat); `EFFECTS_UNDECLARED` fatal.
- `runtime/tata-reader/tata_reader_health_v1.cjs` — avaliador puro + CLI; leitura tolerante à janela do `File.Replace`; **só arquivo regular** (FIFO não prende).
- `runtime/tata-reader/tata_reader_watch_static_audit_v1.cjs` — tokenizador; escrita SQL em qualquer literal; código dinâmico (inclusive `ScriptBlock` qualificado, `InvokeCommand`, `AddScript`, `&`/`.` com expressão); **membro dinâmico**; `CommandText` só literal; `SqlCommand` sem argumentos; `human_review_required: true`.
- `runtime/tata-reader/tata_reader_supervisor_cutover_v1.ps1` — Plan devolve `apply_requires` (3 SHA); Apply por fases com rollback; **na parada e no rollback, todo escritor (caminho fixo e candidato) morre e é confirmado, em rodadas; lista de processos desconhecida bloqueia** (falha fechada); rollback que não restaura com escritor vivo ou desconhecido, e que sempre religa o serviço depois de restaurar; `Test-InstantAfter` em UTC.
- `tests/tata-reader/**` — suítes; ensaio com SCM simulado (`run-cutover-e2e-tests.cjs`, com injeção de falha de lista de processos e de arrumação); prova em Windows real (`windows/real_scm_cutover_e2e.ps1` + `fixtures/host_v2/`, cópia byte a byte do host de `93b006b`, procedência em `fixtures/PROVENANCE.json`).

### B — Product System
- `GET /api/fontes`: saúde real da fonte TATÁ no vocabulário canônico; sem raiz configurada = `NAO_CONFIGURADA/indisponivel`; leitura assíncrona, sem 500 na troca de arquivo, com **prazo de 3 s** (`LEITURA_DOS_ARQUIVOS_EXPIROU`) e sem abrir arquivo não regular; erro leva só a classe, nunca o caminho.
- O histórico TATÁ de 05/10 (195 pedidos) **só existe na API**; exibir exige caminho protegido do envelope M1 → **Q-020**. Nenhuma UI protegida tocada.

### C — Android
- Testes JVM 52/52 no Cloud; job `android-unit` no CI. **Não é prova de aparelho.**

### D — Confiabilidade da plataforma
- 0009 reexecutável (+ equivalência de checksum declarada só para `5b639bf835be0e16`); Product System só com `DELIVERYOS_DATABASE_URL`; P3 de papéis contra `DELIVERYOS_RUNTIME_ROLES`.

### E — Figma
- Leitura autenticada em `dGyF0eRDd4YG8uqyWqU1P4` (`22:2`, `23:2`, `29:2`). **Nenhuma escrita** (Q-007 em PAUSE).

### F — Cloud
- PostgreSQL 16, Docker + SQL Server 2022, PowerShell 7.4.6, PSScriptAnalyzer, Chromium/Playwright, Android SDK, GitHub Actions. Um agente de revisão independente (só leitura), duas rodadas.

## 3. Provas

| gate | resultado | vermelho antes |
|---|---|---|
| `test:tata-reader:health` | 18/18 | H17 janela real (leitura antiga: centenas de exceções); H18 FIFO (CLI anterior preso até o `timeout`, saída 124; agora 33 ms) |
| `test:tata-reader:static` | 14/14 | A14: 13/14 na auditoria anterior |
| `test:tata-reader:supervisor` | 23/23 | supervisor de `d48bd42` 14/22; de `1eacabe` 22/23 (S23) |
| `test:tata-reader:cutover` | 13/13 | C12 fuso: True/True antes |
| `test:tata-reader:e2e` | 10/10, em UTC e America/Sao_Paulo | E8–E10: 0/3 no cutover de `1eacabe` |
| `test:tata-reader:sqlserver` | 3/3 (X1 controle reproduz; X2 recupera; X3 um evento por pedido) | X1 é o próprio controle |
| `ps51_compat_check.ps1` | 0 achados em 8 arquivos, controle 3/3 | controle positivo embutido |
| `test:platform:saude-fontes` | 10/10 | F8 janela real; F10 leitura que não volta |
| `test:platform:product` · `tsc` · `build:platform` · `governanca` | verdes | — |
| CI `37867864216` (Linux, em `7e705ef`) | node-postgres, pwsh-sqlserver (supervisor 23/23, cutover 13/13, e2e 10/10, sqlserver 3/3) e android-unit verdes | — |
| CI `37867864216` — `windows-real-scm` | **vermelho**: supervisor 4/23 sob WinPS 5.1 (achado real, corrigido em `078359d`) | é o próprio vermelho |
| CI `37879636538` — `windows-real-scm` | **verde**: health 18/18, static 14/14, supervisor 24/24 e cutover 13/13 sob WinPS 5.1; SCM real W0–W5 6/6 | o run anterior |

Cada correção da 2ª revisão tem sua linha em `docs/execution/EVIDENCE.jsonl` (`tata-reader-second-review-two-writers-2026-10-08`, `tata-reader-supervisor-unrecorded-batch-2026-10-08`, `tata-reader-audit-and-read-hardening-2026-10-08`); a regressão final dos gates tocados está em `cloud-solo-second-review-regression-2026-10-08`.

## 4. Classificação

- **WORLD_PROVEN:** nada novo (CAIXA e Foxxy inacessíveis daqui).
- **TEST_PASS (sandbox/CI):** causa raiz em .NET 8; supervisor (Linux e WinPS 5.1); avaliador; auditoria; cutover inteiro com SCM simulado e com o **SCM real do Windows**; leitura tolerante ao NTFS e a leitura que não volta; correções de plataforma; `/api/fontes`; JVM Android.
- **CODE_READY:** tudo o que depende da CAIXA (o host realmente instalado, o V2, o SqlClient do .NET Framework contra o banco real); W6 (aguarda push).
- **DEPLOYED:** nada.

## 5. Regressões, riscos e UNKNOWNs

- **Regressão introduzida:** nenhuma conhecida (zero `FAIL_NOVO` nos gates tocados).
- **Contratos internos que mudaram:** `lerSaudeDaFonteTata` é assíncrona e tem prazo (único chamador: `/api/fontes`); o recibo do cutover ganhou `checks.stop_writers` e `rollback.stop_writers`/`move_aside_errors`; o heartbeat ganhou `startup`.
- **Limite declarado do supervisor:** lista de processos ilegível (WMI negado à conta do serviço) **e** morte do supervisor anterior exatamente entre `Process.Start` e o registro do filho → um lote pode se sobrepor; o heartbeat registra `LIST_UNKNOWN`. O W6 (no próximo CI) mostra se o WMI responde à conta virtual.
- **Auditoria estática:** heurística; duas revisões acharam 7 contornos (todos fechados); **o V2 precisa ser lido por uma pessoa**.
- **Pré-existente vermelho (declarado):** `test:platform:m1-bridge` C6 → **Q-019**.
- **Linhagens divergentes:** 8 commits de 04–05/10 fora desta linha; duas migrations 0009 → **Q-021**.
- **Repositório público:** a API do GitHub o mostra público; `data/` desta branch tem agregados financeiros do dia (sem PII de cliente) e um CSV de exemplo; outras branches têm evidências mais detalhadas. Se não devia ser público, é decisão do César.
- **Consumidor sombra (outra linhagem):** ~1000 escritas/s de status com 2000 eventos; correção de uma linha medida; não alterado.
- **Host instalado:** a evidência de 05/10 mostra o host v2 rodando (status `…host-status.v2` com watcher e sombra); a fonte compilável é `93b006b`; o SHA do binário instalado não está no Git (o de 7EBC3C5F… é o host v1, anterior) — o Plan mede e o Apply exige o mesmo valor.
- **Causa em produção:** INFERENCE; o 1222 dentro de `Read()` só foi visto em .NET 8.

## 6. Custos

Zero gasto. Downloads gratuitos; GitHub Actions em repositório **público** (runners padrão, Windows incluído, sem cobrança — docs.github.com, "Billing and usage").

## 7. Próximo passo seguro e pequeno

**Aqui (depende só de autorização):** push do último commit → o CI roda o W6: a caça de lote sem registro do supervisor sob a conta virtual. Verde = a 2ª camada vale no contexto do serviço; vermelho = o limite declarado (`LIST_UNKNOWN`) vale na CAIXA também.

**Na CAIXA (com Desktop Commander), nesta ordem:**
1. `Get-FileHash` do V2 = `77C16940…`; publicar o V2 byte a byte no Git; **uma pessoa lê o V2**.
2. `node runtime\tata-reader\tata_reader_watch_static_audit_v1.cjs <V2>` → `INSTALL_ONLY_UNDER_SUPERVISOR`.
3. `powershell -File runtime\tata-reader\tata_reader_supervisor_cutover_v1.ps1 -Mode Plan -RepoRuntimeDir <checkout>\runtime\tata-reader` → `PLAN_OK`; `apply_requires.SupervisorSha256` tem de ser o SHA do supervisor publicado (ver STATE.json, `tata_reader_resilience_20261007.sha256.supervisor`).
4. Fora do pico: `-Mode Apply -ExpectedInstalledWatcherSha256 <…> -ExpectedHostBinarySha256 <…> -SupervisorSha256 <…> -SqlSessionCheck` → saída 0 (`APPLIED_HEALTHY`) ou 3 (rollback provado); saída 2 = parar e chamar humano.
5. Publicar o recibo sanitizado; só então `LIVE_READER_WORLD_PROVEN`.

Em paralelo, decisões do César: **Q-019**, **Q-020**, **Q-021** e a visibilidade do repositório.
