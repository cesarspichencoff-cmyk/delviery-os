---
lifecycle:
  artefato: docs/etapa-4-8/PLANO.md
  status: ACTIVE
  authority_scope: etapa_4_8_plano
  superseded_by: null
  atualizado_em: "2026-09-25"
  state_basis: 9e738b1
---

# Etapa 4/8 — Convergência de teste/RC — PLANO

> Documento de contexto. Se esta missão for interrompida e retomada por outra sessão, este arquivo
> substitui a necessidade de reconstruir o histórico da conversa.

## 1. Coordenadas do repositório

- Remoto: `cesarspichencoff-cmyk/delviery-os` (grafia com erro preservada de propósito — renomear
  quebraria referências existentes; ver `docs/execution/STATE.json`).
- Base desta etapa: `9e738b11060c4c9863d36162b45d9188adaf8091` — "Corrige reprovações AA do token
  canônico verde-texto-5 (Q-014)".
- Branch candidata: `feature/deliveryos-test-rc-convergence-v1`.
- Worktree: `Desktop/Claude/deliveryos-test-rc-convergence-v1`.
- Nenhum push, merge, PR ou deploy feito nesta etapa. Tudo local.

## 2. Método VÉRTICE

Fundação de governança separada do DeliveryOS funcionalmente, mas usada para disciplinar como este
tipo de missão é conduzida: lifecycle verificável, entrada única de continuidade, fila estruturada
de decisões humanas (`docs/execution/PERGUNTAS.jsonl`) e um governance gate
(`src/platform/run-governance-tests.ts`, missão `VERTICE_FASE_2`, `docs/execution/MISSION_LEDGER.jsonl`).
`VERTICE_FASE_2` não alterou nada funcional no DeliveryOS — só a fundação de governança.

Repositório próprio planejado (fora deste repo): `cesarspichencoff-cmyk/vertice-runtime`, branch
`vertice-active` — versionado, vendor-agnostic, independente do repo DeliveryOS, consumível por
diferentes inteligências. Política de acesso desse repositório é `Q-012`, ainda **aberta**
(`default_behavior: PAUSE`).

## 3. Definição de C0 / C1 / C2 / C3 nesta etapa

- **C0 — Baseline**: rodar a suíte de testes/build/typecheck da branch candidata como está, sem
  nenhuma alteração, e registrar PASS/FAIL/BLOCKED por área. Concluído — ver `C0-BASELINE.md`.
- **C1 — Porte isolado**: trazer os quatro diretórios de `feature/conversation-crm-pilot-v0`
  (na verdade, da branch descendente mais evoluída `fix/b2-human-reality-hotfix` — ver
  `C1-PORT.md`) mais as dependências reais de `apps/deliveryos-ai-node/**`, sem integração, sem
  wiring em navegação/Home, sem merge cego. Código chega ao repositório mas não é ativado.
  Concluído nesta sessão — commits detalhados em `C1-PORT.md`.
- **C2 — concluído**: reaplicar semanticamente o hardening B2, sem merge cego, e recertificar.
  Resultado registrado em `C2-HARDENING.md`. A reaplicação se mostrou **desnecessária**: os 301
  arquivos portados pelo C1 são byte a byte idênticos à origem `3549327`, logo os 14 commits de
  hardening já estavam aplicados. O FAIL real estava na fronteira do porte, não na semântica — o C1
  deixou de fora quatro grupos de arquivos dos quais o código depende, causando 115 falhas
  inexistentes na origem. Fechados byte a byte, sem edição de código: targeted B2 84/84 verde, suíte
  isolada de 119 para 6 falhas, produto sem regressão. Nenhuma integração real do CRM foi feita — ela
  esbarra em `Q-004` em aberto (ver `BLOQUEIO-Q-004.md`), e os 3 testes que exigiriam tocar
  `package.json`/`.gitignore` ficaram parados por decisão explícita do César.
- **C3 — CONCLUÍDO** (`docs/etapa-4-8/C3-INTELLIGENCE-SPINE.md`): Intelligence Spine montada no
  runtime assíncrono, sem novo Copiloto nem supermotor. **Esta é uma reconstrução:** uma execução
  anterior produziu oito commits que nunca chegaram ao remoto e se perderam com o container; o
  remoto nunca saiu de `4974cf5`. Nenhum número daquele relato foi reaproveitado como prova.
  Auditoria de topologia executável (`test:platform:topology`) mediu que as setas 5–9 (adapter
  Conference → observer → conclusões → bridge Copiloto → recomendação Shadow) existiam **só em test
  harness**; agora existem no runtime, e o crítico continua alcançando os mesmos 17 arquivos de
  antes. Um arquivo novo de runtime e 39 linhas no `async-runtime`; sem tabela, migration, fila ou
  event bus. Flag `DELIVERYOS_INTELLIGENCE_SPINE` **falsa por padrão em local, pilot e production**.
  Provas **remedidas na sessão do PB19**: `spine` **29** · `spine:mutacoes`
  **31/31 com zero mutações cegas** · `spine:processos` **7/7 contra PostgreSQL 16.13 real,
  com os binários de `dist/`** · `cb4b5` **37** · `copiloto` **40** · `topology` OK.
  As guardas `15b`/`18`/`G1`, que varriam TEXTO de `async-runtime.ts`, foram trocadas por
  guardas de GRAFO (`15c`, `18c`, `G1`) depois de medido que ficavam verdes com a dependência
  real montada e vermelhas com só a palavra numa constante inerte.
  Dois defeitos encontrados e corrigidos durante a escrita: (a) a imagem não levaria os módulos do
  Conference Brain — mesma classe do D3 —, resolvido com `tools/copiar_conference_brain.js`;
  (b) a montagem ingênua gerava **N recomendações ativas na passada N** sobre a mesma fonte,
  resolvido honrando a regra que `conclusoes.js` já declara (saúde vigente = ciclo mais recente),
  com o corte contável em `conclusoes_vigentes`. `Q-003` e `Q-004` continuam abertas, travadas por
  guarda executável. Abertas por esta etapa: **`Q-015`** (retenção do histórico da espinha, medido
  em ~0,34 KB por passada por escopo) e **`Q-016`** (replay da projeção após restart —
  `reconstruirPorReplay` só aparece em comentário no worker). **D1, D2 e D3 do PB19 foram
  REPRODUZIDOS** e deixados como bloco independente, sem correção — endereçados em
  `docs/etapa-4-8/PB19-DEPLOY-REALITY.md`.

- **PB19 — Deploy Reality Closure · CONCLUÍDO** (`docs/etapa-4-8/PB19-DEPLOY-REALITY.md`):
  fazer a composição oficial sustentar as promessas que o código faz. **D3b fechado na classe**
  — o contrato de eventos era lido de `process.cwd()` e `docs/` não entra na imagem, o que
  produzia `/ready` 200 com TODO lote de GPS em 503 e nenhuma linha de log; agora o asset entra
  no `dist` por `tools/copiar_contratos.js`, a resolução é relativa ao módulo, e contrato
  ausente/corrompido/incompatível faz o crítico **falhar fechado no boot** (`exit 78`).
  Gate `test:platform:pb19` 7/7 com controle positivo (imagem íntegra aceita GPS, medido no
  banco) e três controles adversariais. **Fase 0** reconciliou a continuidade e classificou
  `data/conference-brain/live_cycle_runs.runtime.jsonl` como **resíduo** (origem provada em
  `a6e38ed`, escrito pela mutação MS21): a regra de ignore que `store.js` prometia nunca
  existiu, agora existe, e `test:platform:higiene` (5/5) impede a volta.
  **D2 fechado**: o compose EXIGE `DELIVERYOS_DEVICE_TOKEN_SECRET`, escopado só ao crítico, e o
  segredo nunca aparece em log nem em `describe()`. **D1 fechado**: TLS só é dispensado por
  **igualdade exata** de hostname contra `DELIVERYOS_DATABASE_PRIVATE_HOST`, com os dois atos
  declarados — nenhuma regra larga do tipo "hostname sem ponto é local". **D3a fechado**: o
  carimbo escrito em `dist/` guarda o SHA-256 do fecho de imports dos três binários mais os
  assets e a identidade de commit, e o gate recalcula e compara.
  **A composição oficial subiu de verdade**, com `deploy/Dockerfile.platform` e
  `deploy/compose.platform.yaml` reais: crítico saudável, migration concluída, ingestão real
  aceita/duplicada/rejeitada com os números lidos no banco, outbox drenada depois de restart do
  assíncrono, e três controles negativos saindo `78` dentro da rede da composição. Empacotamento
  (`dumb-init`, `USER node`, `prune --omit=dev`, tamanho) fica **BLOCKED e declarado** — a
  política de rede do sandbox recusa todo repositório Debian.
  Suíte adversarial `test:platform:pb19:mutacoes`: **14/14, zero mutações cegas**, cada mutação
  restaurando o defeito e exigindo a assinatura certa.
  **Regressão integral 41/45, zero `FAIL_NOVO`**: três falhas pré-existentes byte a byte iguais
  ao baseline C0 (`governanca` G6b+G9, sua suíte de mutações por cascata, e `entregas` por
  fixture com data fixa) e um gate bloqueado por servidor ausente (`m1b-perceptual`, porta 5292).
  Duas falhas da execução anterior foram investigadas até a causa e **não eram do produto**:
  `spine:processos` presumia a outbox vazia — reproduzido plantando 25 mensagens alheias mais
  velhas, corrigido com espera pela própria mensagem e provado com controle negativo; e
  `test:lab` caía por descompasso de build do Playwright, destravado **fora do repositório**.
  `D4` foi reproduzido e teve a causa localizada na linha exata; ficou sem correção por estar
  fora do escopo declarado, e foi fechado depois, em missão própria.

- **D4 — política de evidências do Lab V4 · CONCLUÍDO** (`docs/etapa-4-8/D4-EVIDENCIA.md`):
  fechado **na classe**, não só na ordem das linhas. Rodar teste e publicar evidência viraram
  superfícies separadas: `test:lab:v4:browser` grava em temporário e descarta, e **recusa** ser
  apontado para o diretório versionado por comparação de caminho real;
  `evidence:lab:v4:refresh` é o único que substitui o conjunto, com estágio adjacente,
  conferência nome a nome e troca por dois `rename` — inteiro ou nada. `procedencia.json` mede o
  executável que de fato rodou; as 12 imagens atuais ficam `UNKNOWN_FOR_EXISTING_BASELINE` e
  **preservadas**, sem eleger build canônico. `test:lab:v4:evidencias` 11/11 e
  `test:lab:v4:evidencias:mutacoes` **6/6 com zero controles cegos**. A primeira versão da suíte
  de controle **destruiu o patrimônio que existia para proteger** — uma corrida entre `listen()`
  e `spawnSync` — e a correção não foi consertar aquele caso, e sim passar todo exercício do
  refresh para uma raiz espelho. Regressão **42/46**, zero `FAIL_NOVO`.

- **Q-016 — replay da Operação Viva · RESPONDIDA** (`docs/etapa-4-8/Q016-REPLAY.md`): o gap foi
  provado antes de corrigir (dois fatos iguais menos no modo viravam a MESMA linha no event log,
  com os controles que dão sentido a isso). `source_mode` virou contrato durável do log pela
  migration 0003 — sem default, obrigatório para fato novo pelo banco, histórico `NULL` = UNKNOWN
  e sem backfill; `pg_dump`/`pg_restore` reais restauram o histórico sem violar a restrição. A
  porta de leitura roda em `READ ONLY`, usa o MESMO reconstrutor do consumo vivo e não depende da
  ordem do banco. O assíncrono reconstrói no boot, antes de o runtime existir; log ilegível
  recusa (78), linha corrompida degrada declarada — decidido pelo append-only. Restart real com
  PostgreSQL e binários: memória idêntica antes de qualquer fato novo, GPS que cruzou 120 s
  desligado chega `aging`, mensagens pendentes de fatos relidos contam como duplicatas. 12
  mutações, zero cegas — duas provas (P11, A6) foram escritas porque duas mutações seriam cegas.
  Um ponto cego do grafo de imports (`import()` dinâmico) foi fechado com impacto zero medido
  pelo carimbo. O `spine:processos` caiu na regressão porque presumia log vazio: reproduzido com
  um fato alheio plantado, e corrigido na classe — a suíte passou a criar banco próprio.
  **Q-015 continua aberta.**

- **Q-017 — modo da instância · RESPONDIDA** (`docs/etapa-4-8/Q017-SOURCE-MODE.md`): o defeito
  foi provado antes de corrigir, e era mais estreito que a premissa — só a AUSÊNCIA virava `real`
  (vazio e `REAL` já saíam 78) — e de DEFAULT, não de propagação. O contrato do envelope já
  recusava ausência; o padrão entrava antes dele. A recusa foi para a borda da configuração e
  para ANTES de conexão e migration (o código antigo conferia depois) — provado com banco vazio
  que continua vazio e banco inalcançável que dá 78 do modo, cada um com controle positivo. O
  boot declara o modo; valor com cara de credencial não é ecoado. Compose `:?` só no crítico.
  Troca de modo entre processos: reenvio de fato antigo é duplicata e o replay usa o modo
  gravado, mesmo com a variável vazada de propósito para o assíncrono. Em containers, 31
  medidas — e a ferramenta recusa rodar onde houver composição, porque termina em `down -v`
  sobre volumes de nome fixo. 15 mutações, zero cegas. Achado: o G6c da governança nasceu no
  commit final da própria Q-016 e passou porque a regressão rodou antes do commit — fechado.

- **Append-Only Closure · CONCLUÍDO** (`docs/etapa-4-8/APPEND-ONLY.md`): correção de invariante
  existente, não decisão nova. O buraco foi reproduzido antes de fechar (`TRUNCATE` esvaziava o
  log num banco na 0003, com UPDATE e DELETE recusados no mesmo banco) e tinha dependentes: três
  suítes oficiais montavam fixture limpando o banco compartilhado, desde 2026-07-26. A classe veio
  antes da trava; na ordem inversa, o push da 0004 sairia vermelho. A 0004 fecha com trigger de
  comando e a mesma função, e a proteção sobrevive a `pg_dump`/`pg_restore`, provada executando.
  O gate de backup passou a ter patrimônio próprio, medido de fora com a referência trancada. 11
  mutações, zero cegas. A fronteira de privilégio foi medida e declarada: dono e superusuário
  ainda sabotam, e no compose oficial o runtime é superusuário (IAM, fora do escopo).

- **Cadeia canônica de realidade · CONCLUÍDA e CERTIFICADA** (`docs/etapa-4-8/CADEIA-REAL.md`): UM
  fato de campo acompanhado de ponta a ponta — aparelho, Room, credencial, sincronização, crítico,
  PostgreSQL, `platform.event_log`, Operação Viva, restart/replay, `/entregas`. O elo que faltava era o
  primeiro token: reproduzido (404 no crítico, 200 sem token no piloto) e fechado por vínculo de
  segredo do aparelho (0005), sem sistema novo. Difference Check: ingestão de GPS e autenticação do
  aparelho SUPERSEDE para a plataforma; `identity.device` e `platform.event_log` PRESERVE; viagem,
  termo, comandos e rider-mobile KEEP_PARALLEL no piloto; `/entregas` ADAPT. Certificada em
  2026-09-25: papéis mínimos ligados à composição oficial e provados em containers; o runtime deixou
  de ser superusuário. Android BLOCKED (a rede nega `dl.google.com`); relógio do aparelho registrado,
  não corrigido (corrigido depois: abaixo).

- **Relógio do aparelho · CORRIGIDO** (`docs/etapa-4-8/RELOGIO.md`): CAPTURADO ≠ HORÁRIO
  CONFIÁVEL, política do César. Reproduzido antes de corrigir, com os binários e PostgreSQL: o ponto
  de +24 h entrava `trusted` pelo padrão da coluna, prendia a última posição e ficaria `fresh` no dia
  seguinte, também depois do replay. O crítico julga o relógio contra a hora do servidor, com o
  vocabulário e a tolerância que Entregas já tinha e regra assimétrica; o ponto suspeito é aceito e
  preservado, e o frescor usa a hora do servidor. Sem migration e sem sistema temporal novo; 12
  mutações, zero cegas. O Android segue BLOCKED pela rede; o gate físico tem roteiro pronto, todo
  `NOT_RUN` (`docs/etapa-4-8/FIELD-GATE-ANDROID.md`). Próxima etapa: o aparelho físico.

A redução de superfície de `apps/deliveryos-ai-node` (reescrever os 6 root-requires para subpath)
**não é C2** — é tarefa futura fora do escopo de ambos, registrada em `C1-PORT.md`.

## 4. Preservation Set — nada disso pode ser alterado ou respondido implicitamente pelo código

- **Copiloto M1** — motor de atenção do Copiloto. `Q-003` (qual motor é dono da atenção,
  `decisao.js` ou `shadow.ts`) segue aberta; D43 mantém os dois desligados até I1-I10 verdes.
- **Entregas** — domínio operacional de entregas (`src/entregas/**`), incluindo seu próprio
  Event Log de fundação (`src/entregas/foundation/event-log.ts`).
- **Home M1** — superfície visual da home, sob a ordem de autoridade visual de
  `docs/design/VISUAL_REFERENCE_HIERARCHY.md` e `VISUAL_SOURCE_OF_TRUTH.md`.
- **Event Log append-only** — o log canônico é `platform.event_log`
  (`src/platform/migrations/0001_platform_foundation.sql`), com trigger de banco que rejeita
  `UPDATE`/`DELETE` (`platform.impedir_mutacao_event_log`) e, desde a 0004, `TRUNCATE`, pela
  mesma função (`docs/etapa-4-8/APPEND-ONLY.md`). Qualquer novo event log introduzido por
  trabalho futuro deve seguir o mesmo padrão append-only, mas nunca escrever nessa tabela sem
  decisão explícita.
- **Distinção FACT ≠ INFERENCE ≠ SIMULATION ≠ UNKNOWN** — expressão vinculante no CLAUDE.md:
  "dado sintético nunca vira real · carimbo ausente = não observado". Nenhum código pode colapsar
  esses estados.
- **Autoridade humana final** — nenhuma automação decide o que CLAUDE.md §7 reserva ao César.
  Pergunta sem resposta vira linha em `PERGUNTAS.jsonl` com `default_behavior` — ausência de
  resposta nunca é consentimento.
- **Q-001** — Ambiente pode carregar orientação de ação? (aberta, PAUSE)
- **Q-002** — Quem é Operação Viva: o núcleo cognitivo ou a projeção de viagens? (aberta, PAUSE)
- **Q-003** — Qual motor é dono da atenção do Copiloto: `decisao.js` ou `shadow.ts`? (aberta, PAUSE)
- **Q-004** — CRM, Evolução, Treinamento, RH e Gestão são módulos do DeliveryOS? (aberta, PAUSE —
  ver `BLOQUEIO-Q-004.md`, diretamente relevante ao C1/C2 deste trabalho)
- **Q-005** — Notificação fora da tela é permitida? (aberta, PAUSE)
- **Q-007** — A cota do plano Figma cortou leitura/escrita no meio da sincronização: como
  prosseguir? (aberta, PAUSE, segura Q-006)
- **Q-008** — Sushi Quentes é ambiente canônico ou subárea? (aberta, PAUSE)
- **Q-009** — Existirá fonte que meça a capacidade da Caixa? (aberta, PAUSE)

(Q-006, Q-010, Q-011, Q-013 e Q-014 têm resposta ou `PROCEED_REVERSIBLY` e não fazem parte do
conjunto travado explicitamente listado para esta etapa.)
