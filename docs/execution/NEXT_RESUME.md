# Retomada — leia este arquivo primeiro

> **ATUALIZADO 2026-07-27 — Bloco 4B3 CONCLUIDO.**
> `CONFERENCE_BRAIN_4B3_COMPLETE` em `b9525dc`. 24 de 65 arquivos, 26 testes.
> O observador aceita relogio injetavel — foi preciso acrescentar, e a
> injecao introduziu um defeito no caminho padrao que os 25 testes de entao
> nao pegavam (todos injetavam relogio). Reproduzido, corrigido e coberto.
> **Proximo: 4B4 — adapter Operacao Viva -> Conference Brain.** O risco
> registrado no mapa forense continua valendo: as duas listas de nove
> dimensoes descrevem coisas diferentes.
>
> **ATUALIZADO 2026-07-27 — Bloco 4B2 CONCLUIDO.**
> `CONFERENCE_BRAIN_4B2_COMPLETE` em `cdaf066`. 21 de 65 arquivos, 23 testes.
> **FRONTEIRA ESTRUTURAL:** o patrimonio historico de testes NAO cabe aqui, e
> isso foi reproduzido. `multidimensional-model` exige mapping-mode e
> playwright-preflight; `sprint24-adversarial` exige observer (4B3); e os DOIS
> testes do gate 12/12 exigem `tools/conference-brain/operator-panel-server`,
> o painel HTTP. Os 309/309 e o 12/12 seguem NAO executados aqui.
> Para retomar no 4B3: portar `live/observer.js` + `live/health.js`, e so
> entao decidir se o painel entra para desbloquear o gate independente.
> **Proximo: 4B3 — observador e relogio.**
>
> **ATUALIZADO 2026-07-27 — Bloco 4B1 CONCLUIDO.**
> `CONFERENCE_BRAIN_4B1_COMPLETE` em `abbb56f`. 15 dos 65 arquivos portados,
> fecho transitivo FECHADO, 23 testes verdes. PII, idempotencia e recuperacao
> do store comprovadas neste repositorio.
> **NAO executados aqui:** os 309 testes do nucleo e o gate independente
> 12/12 — vivem em `tests/conference-brain/`, que entra no **4B2**.
> **Proximo: 4B2 — nucleo multidimensional + as duas suites.**
>
> **ATUALIZADO 2026-07-27 — Unidade 4A (forense) CONCLUIDA.**
> `CONFERENCE_BRAIN_FORENSIC_MAP_COMPLETE`. Leia
> `docs/execution/CONFERENCE_BRAIN_FORENSE.md` antes de tocar no Conference
> Brain. Os 5 testes falhos sao GUARDAS DE NAO-REGRESSAO sobre modulos
> vizinhos — nao testam o Brain, e `314/314` nunca foi alcancavel. O numero
> correto do nucleo e **309/309**, e o gate independente 2.3/2.4 deu **12/12**.
> Estrategia: port seletivo de ~18 arquivos. **Proxima: 4B1.**
>
> **ATUALIZADO 2026-07-27 — Unidades 1, 2, 3 e 3D CONCLUIDAS.**
> `OPERATION_LIVE_RUNTIME_WIRING_COMPLETE` em `2bc30fe`. A ponte deixou de ser
> peca testada: `POST /api/gps/batch` existe no critico e os nove tipos da
> Operacao Viva estao registrados em `OUTBOX_HANDLERS`. A ressalva anterior
> ("nenhuma rota chama `ingerir`") esta SUPERADA — vale para `bd3bc24`, nao
> para o HEAD atual. **Proxima unidade: 4 — Conference Brain.**
>
> **ATUALIZADO 2026-07-27 — Unidades 1, 2 e 3 CONCLUÍDAS.**
> `OPERATION_LIVE_BRIDGE_UNIT_COMPLETE` em `01bc66d`. A cadeia
> ingestão → event log → outbox → consumidor → projeção → replay é
> **ponte local comprovada em testes** — e NÃO está integrada ao runtime:
> nenhuma rota HTTP chama `ingerir`, e `OUTBOX_HANDLERS` continua vazio.
> **Próxima unidade: 4 — Conference Brain** (port em 309/314, não aceito).
>
> **ATUALIZADO 2026-07-27 — Unidades 1 e 2 CONCLUÍDAS.**
> `EVENT_CONTRACTS_UNIT_COMPLETE` no commit `eba60ab`. Nove eventos
> formalizados; dois recusados por não terem produtor nem consumidor. O
> cruzamento schema×código achou e corrigiu duas divergências reais no runtime.
> **Próxima unidade: 3 — ponte Entregas → Operação Viva.**
>
> **ATUALIZADO 2026-07-27 — Unidade 1 CONCLUÍDA.**
> `ANDROID_DEVICE_AUTH_UNIT_COMPLETE`. HEAD `4456f2e`.
> O P0 do Android está corrigido e provado: 24 testes no servidor, 34 Kotlin,
> 35 estruturais. A **próxima unidade é a 2 — contratos dos eventos.**
> O que está abaixo descreve o estado anterior e continua válido para tudo o
> que a Unidade 1 não tocou.

> Escrito em **2026-07-27**, depois de o Macro-Prompt 2 ser interrompido pelo
> fim dos créditos. O Macro-Prompt 2 **NÃO está concluído**.
>
> Nada aqui é estimativa. Todo número veio de execução nesta sessão.

---

## 1. Onde o repositório está

| | |
|---|---|
| **Branch principal** | `feature/deliveryos-hybrid-platform-foundation-v1` |
| **HEAD encontrado no início** | `1fdc2fa` |
| **HEAD final** | ver §4 |
| **Worktree** | `deliveryos-hybrid-platform-foundation-v1` |
| **Upstream** | nenhum configurado — nada foi publicado |
| **Stashes** | nenhum |

## 2. Preservação do estado interrompido

| | |
|---|---|
| **Branch WIP** | `wip/macro2-interrupted-recovery-20260727` |
| **Commit WIP** | `2d298cb` — 80 arquivos, 15.075 inserções |
| **Snapshot externo** | `…/scratchpad/recovery-20260727/` |

O snapshot externo contém: `rastreados.patch` (diff binário, verificado
reversível com `git apply --check --reverse`), `arquivos/` com os **78**
não rastreados copiados um a um (contagem conferida: 78 = 78),
`status-porcelain-v2.txt`, `commits.txt`, `reflog.txt`, `metadados.txt`,
`hashes-modificados.txt`.

O commit WIP **não significa aprovação**. Ele existe só para impedir perda.

## 3. Classificação de tudo que foi tocado

### A — Comprovado e completo (entrou no checkpoint)

| Arquivo | Prova |
|---|---|
| `.claude/skills/` × 6 | 12 testes verdes **e** as seis aparecem carregadas na sessão |
| `src/platform/contracts/event-catalog.ts` | dentro dos 45 testes; `tsc` limpo |
| `src/platform/projections/operacao-viva.ts` | dentro dos 45; `tsc` limpo |
| `src/platform/copiloto/shadow.ts` | **completo**, não truncado; dentro dos 45; `tsc` limpo |
| `src/platform/ingest/device-ingest.ts` | dentro dos 45; `tsc` limpo |
| `run-bridge-tests.ts`, `run-skills-tests.ts` | são os próprios verificadores |
| `CLAUDE.md`, `package.json` | necessários para os acima rodarem |

**Ressalva que não pode ser perdida:** os quatro módulos da ponte estão
comprovados **como unidades**. Eles **não estão integrados** — nenhuma rota do
`critical.ts` os chama, e nenhum handler do `async-runtime.ts` os consome. A
ponte existe em peças testadas, não em funcionamento ponta a ponta.

### D — Produzido por subagente e NÃO aceito (ficou só no WIP)

`src/conference-brain/` (34 arquivos) · `tests/conference-brain/` (6) ·
`tests/auditoria/` (2) · `tools/conference-brain/` (2) ·
`docs/conference-brain/` (21)

Origem: `deliveryos-copiloto-secure-bind-v1` @ `aec9027`.
O subagente **terminou em erro** (limite de gasto), não por conclusão.

### E — Temporário

O snapshot em `scratchpad/recovery-20260727/`. Fora do repositório, de propósito.

### Verificação de integridade dos arquivos

Nenhum marcador de interrupção (`TODO`, `FIXME`, `<<<<<<<`) nos arquivos novos
da plataforma. Os quatro fecham com `}` — nenhum truncado. `tsc --noEmit`
retorna 0 no estado exato do checkpoint, **sem** os arquivos que ficaram no WIP.

## 4. Testes

### Executados e VERDES

```
npx tsc --noEmit                          exit 0
npx tsx src/platform/run-skills-tests.ts  12 OK
npx tsx src/platform/run-bridge-tests.ts  45 OK
```

Os 45 cobrem: catálogo de eventos (11 tipos, PII, tamanho, `source_mode` sem
padrão, compatibilidade de major), ingestão (tradução do lote Android,
revogação antes de tudo, `ack` que trava na primeira recusa, mesmo lote 100×),
projeção (replay reconstrói o mesmo estado, fora de ordem não retrocede,
`real`/`simulated` não se somam, envelhecimento) e shadow (id determinístico,
sem `executed`, política que explode não derruba as outras).

### Executados e FALHANDO — port do Conference Brain

`node --test "tests/conference-brain/"*.test.js` → **314 testes, 309 pass, 5 fail**

Os cinco, com a dependência ausente exata:

| Teste | Módulo que falta |
|---|---|
| `celulas operacionais seguem intactas` | `src/live/interface/celulas-operacionais` |
| `adaptador V3.3 e o vocabulario das areas seguem intactos` | `src/live/interface/adaptador-v33` |
| `Capacidade Viva continua em sombra, sem decisao automatica` | `src/capacidade-viva/shadow/config` |
| `shadow config mantem o hash canonico` | `src/capacidade-viva/shadow/config` |
| `motor de 8 pracas nao foi tocado por este sprint` | `src/live/interface/celulas-operacionais` |

**Hipótese registrada, NÃO confirmada:** são guardas de compatibilidade que
alcançam módulos vizinhos deliberadamente não copiados. Isso é coerente com as
mensagens, mas **não foi provado** — provar exigiria portar os vizinhos e ver os
cinco passarem, ou ler cada teste e confirmar que nenhum deles verifica algo do
próprio Conference Brain. **Nenhuma das duas coisas foi feita.**

O port **não está aprovado**.

### NÃO executados nesta missão (proibidos ou fora do escopo)

Suíte global (`npm run test:entregas`, 481 testes) · suítes de banco
(`test:platform:pg`, `:repos`, `:backup`) · suítes da plataforma do Macro 1
(`test:platform`, `:envelope`, `:deploy`) · gate de auditoria independente do
Conference Brain (`conference-sprint23/24`, esperado 12/12) · qualquer coisa de
Android instrumentado, emulador ou APK · Figma.

## 5. Estado por frente

| Frente | Estado |
|---|---|
| **6 skills** | ✅ comprovadas, no checkpoint, carregando na sessão |
| **`event-catalog.ts`** | ✅ comprovado como unidade · ❌ não integrado |
| **`operacao-viva.ts`** | ✅ comprovado como unidade · ❌ não integrado |
| **`shadow.ts`** | ✅ **completo e comprovado** como unidade · ❌ não integrado |
| **`device-ingest.ts`** | ✅ comprovado como unidade · ❌ sem rota que o chame |
| **Conference Brain** | ⚠️ 309/314, **não aceito**, preservado no WIP |
| **Android** | ❌ P0 reproduzido, **não corrigido** |
| **Figma** | ❌ nada escrito no repositório; `docs/figma/` não existe |

## 6. O P0 do Android — reproduzido, não corrigido

```
android/.../data/EntregasDatabase.kt:207   KEY_SESSION_TOKEN declarada
android/.../sync/SyncWorker.kt:47          única LEITURA da chave
android/.../sync/EntregasApi.kt:85         authenticateDevice() definida
grep -rn "authenticateDevice" android/app/src/   →  só a definição, zero chamadas
```

Ninguém escreve o token. `tokenProvider()` devolve `null`, o header
`Authorization` não vai, e o servidor responde **401** em `/api/gps/batch`,
`/api/events/batch`, `/api/policies` e `/api/term/acknowledge`.

**O que agrava:** 401 cai em `ApiResult.Rejected` (4xx), e `Rejected` **não
retenta** (`SyncWorker.kt:112-119`). Os pontos ficam `failed` para sempre.

Um motoboy em campo veria o app funcionando — GPS capturando, notificação na
tela — e **nada chegaria**, em silêncio, permanentemente.

## 7. Próximo objetivo técnico — um só

```
corrigir e provar a autenticação de dispositivo Android
```

**Confirmado contra o estado real**, e é o objetivo certo por três razões:

1. é o único P0 aberto e reproduzido;
2. sem ele, nenhuma rota de ingestão que se construa depois recebe um único
   byte — todo o resto da ponte fica sem como ser provado ponta a ponta;
3. a metade servidor já existe e está testada: `device-ingest.ts` exige
   `device_id_autenticado` e consulta revogação. Falta o lado do aparelho obter
   e persistir o token, e falta o `PgDeviceRegistry` sobre `identity.device`.

Comando para começar a retomada:

```bash
npx tsc --noEmit && npm run test:platform:skills && npm run test:platform:bridge
```

Se os três passarem, o checkpoint está íntegro e a frente única está livre.

**Não comece pelo Conference Brain, pelo Figma nem pela rota HTTP.** Eles
dependem do token ou são independentes do caminho crítico.
