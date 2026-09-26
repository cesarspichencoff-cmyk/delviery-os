---
lifecycle:
  artefato: CLAUDE.md
  status: ACTIVE
  authority_scope: session_routing
  superseded_by: null
  atualizado_em: "2026-09-26"
  state_basis: 953a3fb
---

# CLAUDE.md — porta de entrada do DeliveryOS

> **Este arquivo roteia. Ele não define.** Encolhido em 2026-08-07 pela Fase 2 do VÉRTICE: tudo que
> já estava escrito em outra autoridade saiu daqui e virou ponteiro. O que sobrou é o que não tem
> outra casa. Em conflito, vence a autoridade apontada — nunca este arquivo.
> Guarda: `npm run test:platform:governanca`.

## 1. Papel: parceiro, não executor

Pensar, questionar, cruzar informação e **proteger o produto — inclusive do César** quando ele pular
etapa por empolgação. Concordância automática é falha de função. Dizer, quando for verdade: "isso
parece dashboard", "isso está virando ERP", "isso é sintético, não é real", "isso é 8/10".

## 2. Ordem de autoridade

`docs/product/DELIVERYOS_CANONICAL_SOURCE_INDEX.md` §2 é quem manda. Documento de execução nunca
revoga documento de produto.

## 3. Antes de qualquer proposta importante

Cruzar o patrimônio inteiro — arquitetura, dados, pedidos reais, conversas de WhatsApp, cardápio,
rotina da equipe, design, as 12 Leis. Os caminhos estão no índice canônico §2 e §4. Nunca desenvolver
olhando só para código ou tela.

## 4. Grandes saltos

Nunca a primeira ideia boa nem a solução comum. Explorar internamente, eliminar o convencional,
entregar **a direção que sobrevive** — uma, não três medianas. Detalhe vai para arquivo; o chat é
síntese: decisão, risco, próximo passo.

## 5. Verdade conservadora, ambição máxima

Dado sintético nunca vira real · carimbo ausente = não observado · nunca integrar sem
bruto → inventário → parser → validação → relatório → **aprovação humana** → integração · parcial
nunca é "completo". Dado incompleto é aceitável; maquiagem, não. Detalhe na skill
`deliveryos-evidence-gate`.

## 6. O que o produto é

Sistema nervoso operacional. Definição vinculante em
`docs/product/DELIVERYOS_PRODUCT_CONSTITUTION.md`. Tríade: foco é raro · ambiente é clima · calmo é
saúde.

## 7. Decisões que exigem o César

As doze da §6 do índice canônico. Nenhuma se toma por conveniência técnica ou inércia de
implementação. Pergunta sem resposta vira linha em `docs/execution/PERGUNTAS.jsonl`, com ID e
`default_behavior` — **ausência de resposta nunca é consentimento**.

## 8. Forma de resposta para decisão importante

(1) o que sabemos · (2) o que é hipótese · (3) o que falta validar · (4) risco · (5) próxima ação
mais segura · (6) o que não fazer agora. Com evidência: arquivo, diff, comando, contagem, hash.
Nunca "parece igual" — diff byte a byte ou contagem exata.

## 9. Git e dados

`git status` ao abrir e depois de todo script que escreve. Arquivo sumido: parar e recuperar por
`git show HEAD:<arquivo>`. Dados brutos e gerados não entram no Git sem aprovação
(`docs/Politica_Dados.md`). Sem push, merge, PR ou deploy sem decisão do César.

## 10. Testes

`npm run build` · `typecheck` · `test:platform` · `test:platform:all` · `test:platform:governanca` ·
`test:platform:r5` · `test:lab`. As suítes que exigem `DELIVERYOS_DATABASE_URL` se declaram
**PULADAS em voz alta** — ausência de banco nunca vira verde silencioso.

## 11. Ordem de leitura — obrigatória no início de qualquer missão

1. `docs/product/DELIVERYOS_CANONICAL_SOURCE_INDEX.md` — o produto: ordem de autoridade, decisões
   canônicas, o que não pode ser redefinido em silêncio, e as decisões que exigem o César.
2. `docs/execution/MISSION_LEDGER.jsonl` — onde a última missão parou, o que ficou provado e o que
   **não** ficou. Uma linha por missão; o detalhe vive nas referências que cada linha carrega.
3. `docs/execution/PERGUNTAS.jsonl` — o que espera decisão humana, com ID, relógio e
   `default_behavior`.
4. `docs/design/VISUAL_REFERENCE_HIERARCHY.md` e `docs/design/VISUAL_SOURCE_OF_TRUTH.md` —
   **obrigatórios antes de qualquer interface, CSS, Figma ou design.** Ordem visual vinculante:
   Sprint Visual DeliveryOS V2 → Organismo Operacional V3.3 → handoffs canônicos →
   Design System atual, para produção e acessibilidade → `app-v1` e protótipos antigos,
   só referência histórica.
   **Nível 5 não pode definir a expressão visual final.** A decisão de expressão de 2026-08-07 está
   na segunda.
5. `docs/execution/STATE.json` — o que está verificado e, mais importante, o campo `nao_comprovado`.
   Com ele: `docs/execution/DECISIONS.md` (decisão + alternativa recusada),
   `docs/execution/PROMPT_LESSONS.md` (o que quase passou),
   `docs/execution/BLOCKERS.md` (infraestrutura) e `docs/execution/EVIDENCE.jsonl` (medições).

Esta ordem existe porque as Unidades 1 a 6 foram executadas sem o produto em contexto, e a home
nasceu do nível visual errado duas vezes. Ver L32, L33 e PB9. As guardas
`test:platform:visual-order` e `test:platform:governanca` reprovam se ela se perder.

## 12. Skills — a disciplina, executável

Sete skills em `.claude/skills/` carregam sozinhas quando a situação aparece: guardrails de
arquitetura · `deliveryos-execution-loop` (reproduzir **antes** de corrigir) · evidence gate ·
figma-code-sync · release-readiness · adversarial-review · tata-product-system.
Verificador: `npm run test:platform:skills`.

## 13. Nesta branch: Etapa 4/8 — convergência de teste/RC (em andamento)

Branch `feature/deliveryos-test-rc-convergence-v1`, base `9e738b11`. **Leia
`docs/etapa-4-8/` inteiro antes de qualquer ação** — `docs/etapa-4-8/PLANO.md` (escopo, método
VÉRTICE, C0/C1/C2/C3, Preservation Set), `docs/etapa-4-8/C0-BASELINE.md`,
`docs/etapa-4-8/C1-PORT.md`, `docs/etapa-4-8/BLOQUEIO-Q-004.md`.

**Restrições permanentes desta missão** (não expiram sozinhas, só por decisão explícita do César):
não tocar em `main`, M1, B2 ou produção · sem merge em `main` · sem deploy · sem push sem
confirmação explícita e específica para o push (uma autorização não vale para a próxima).

**Preservation Set integral** — nada abaixo pode ser alterado ou respondido implicitamente por
código: Copiloto M1 · Entregas (`src/entregas/`) · Home M1 · Event Log append-only
(`platform.event_log`, nunca as réplicas isoladas de outros domínios) · distinção
FACT ≠ INFERENCE ≠ SIMULATION ≠ UNKNOWN · autoridade humana final · `Q-001`, `Q-002`, `Q-003`,
`Q-004`, `Q-005`, `Q-007`, `Q-008`, `Q-009` (todas abertas, `default_behavior: PAUSE`).

**Estágio atual**: C0 concluído (`docs/etapa-4-8/C0-BASELINE.md`). C1 concluído
(`docs/etapa-4-8/C1-PORT.md`) — código portado, não integrado; nada em navegação/Home/runtime real
referencia `conversation-crm`. **C2 concluído** (`docs/etapa-4-8/C2-HARDENING.md`): provado byte a
byte que os 14 commits do hardening B2 já estavam aplicados pelo C1 — reaplicá-los seria no-op ou
conflito. O FAIL real era outro: o C1 deixou de fora quatro grupos de arquivos dos quais o código
portado depende (`evals/`, `scripts/verifiers/chatbot/`, 12 de `apps/deliveryos-ai-node/`,
`docs/execution/chatbot/`), o que produzia 115 falhas inexistentes na origem. Fechados em quatro
commits byte-exatos, **sem editar uma linha de código**: recertificação targeted B2 **84/84 verde**,
suíte isolada de 119 para 6 falhas, produto sem regressão. Sobram 3 falhas idênticas às da origem
(2 presas ao Windows, 1 sem PowerShell) e 3 do grupo E — manifesto npm e arquivo de ignore do
Git, ambos compartilhados do produto —, **paradas por decisão do César para não responder `Q-004`
por conveniência técnica**. A redução de superfície
de `apps/deliveryos-ai-node` continua fora de C1/C2/C3. **C3 concluído**
(`docs/etapa-4-8/C3-INTELLIGENCE-SPINE.md`): Intelligence Spine montada no runtime assíncrono — um
arquivo novo e 39 linhas no `async-runtime`, sem Copiloto, motor, event bus, tabela, migration ou
fila novos. **Reconstrução:** oito commits de uma execução anterior nunca chegaram ao remoto e se
perderam com o container; nenhum número daquele relato foi usado como prova. Flag
`DELIVERYOS_INTELLIGENCE_SPINE` **falsa por padrão em todo ambiente**; a espinha roda depois do tick
e `executar()` nunca lança. Gates novos: `test:platform:topology`, `test:platform:spine` (**29**),
`test:platform:spine:mutacoes` (**31/31**, zero cegas), `test:platform:spine:processos` (7/7 com
PostgreSQL real e os binários de `dist/`). `Q-003` e `Q-004` seguem abertas, travadas por guarda
executável. Abertas por esta etapa: `Q-015` (retenção do histórico) e `Q-016` (replay após
restart). **D1, D2 e D3 do PB19 foram reproduzidos** e deixados sem correção pelo C3.

**PB19 — Deploy Reality Closure concluído** (`docs/etapa-4-8/PB19-DEPLOY-REALITY.md`): a
composição oficial não pode mais declarar prontidão com capacidade operacional estruturalmente
quebrada. **D3b**: contrato de eventos vai ao `dist` por `tools/copiar_contratos.js`, resolução
relativa ao módulo, e ausente/corrompido/incompatível faz o crítico sair 78 no boot. **D2**:
segredo dos tokens de aparelho exigido pelo compose, escopado só ao crítico, nunca em log nem
em `describe()`. **D1**: TLS dispensado só por **igualdade exata** de hostname contra
`DELIVERYOS_DATABASE_PRIVATE_HOST`, e só com os dois atos declarados — nada de regra larga.
**D3a**: o carimbo escrito em `dist/` guarda o SHA-256 do fecho de imports dos três binários,
mais os assets e a identidade de commit. Gates novos: `test:platform:pb19` (27), `test:platform:higiene`
(5) e `test:platform:pb19:mutacoes` (**14/14, zero cegas**). A saída de runtime do Conference
Brain versionada sob `data/conference-brain/` foi classificada como resíduo (origem provada),
removida e travada pela regra de ignore que o `store.js` já prometia. **A composição oficial
subiu de verdade** — `Dockerfile.platform` e `compose.platform.yaml` reais, sem variante que
contorne: crítico saudável, migration concluída, ingestão real aceita/duplicada/rejeitada,
outbox drenada depois de restart, e três controles negativos saindo 78. Empacotamento
(`dumb-init`, `USER node`, `prune --omit=dev`, tamanho) fica **BLOCKED e declarado**: a política
de rede do sandbox recusa todo repositório Debian. Regressão final **41/45**, com zero
`FAIL_NOVO` — três falhas pré-existentes byte a byte iguais ao baseline e um gate bloqueado por
servidor ausente.

**D4 — política de evidências do Lab V4, fechado** (`docs/etapa-4-8/D4-EVIDENCIA.md`): rodar um
teste deixou de poder destruir evidência histórica, e regenerá-la virou ato explícito, completo e
rastreável. `test:lab:v4:browser` grava em **temporário** e descarta; se `LAB_V4_EVIDENCIAS`
resolver para o diretório versionado, o gate **recusa** por comparação de caminho real — symlink
e `..` não contornam. `evidence:lab:v4:refresh` é o único caminho que substitui o conjunto, e
publica inteiro ou nada: estágio adjacente, gate inteiro verde, conferência nome a nome, e dois
`rename`. O manifesto de procedência registra o executável que **de fato rodou** (medido por
`launchServer`, porque `executablePath()` aponta um arquivo inexistente aqui) e guarda os dois
caminhos quando divergem. As 12 imagens atuais ficam **`UNKNOWN_FOR_EXISTING_BASELINE`** e
**preservadas** — nenhum build foi eleito referência canônica. Gates novos:
`test:lab:v4:evidencias` (11/11, agora dentro da cadeia `test:lab`) e
`test:lab:v4:evidencias:mutacoes` (**6/6, zero cegos**). Regressão **42/46**, zero `FAIL_NOVO`.

**Q-016 — respondida** (`docs/etapa-4-8/Q016-REPLAY.md`): `platform.event_log` governa a
reconstrução da projeção da Operação Viva, e o runtime assíncrono a executa no boot, **antes** do
laço da outbox. O log passou a guardar `source_mode` (migration 0003: sem default, obrigatório para
fato novo por `CHECK ... NOT VALID`); histórico sem modo fica **UNKNOWN**, fora do replay e
contado — nenhum backfill, porque o append-only recusa `UPDATE` e a outbox é mutável. Log ilegível
recusa o boot (78); linha corrompida sobe degradado e declarado. Restart real com os binários de
`dist/`: memória idêntica escopo a escopo antes de qualquer fato novo, e sinal que envelheceu
desligado chega envelhecido. Gates novos: `test:platform:q016` (27), `test:platform:q016:processos`
(14) e `test:platform:q016:mutacoes` (**12 mutações, zero cegas**). **Q-015 continua aberta** — o
estado próprio da espinha não sobrevive a reinício.

**Q-017 — respondida** (`docs/etapa-4-8/Q017-SOURCE-MODE.md`): ausente não é real. O crítico
recusa o boot (78) sem `DELIVERYOS_SOURCE_MODE` válido — `real`, `simulated` ou `control`, exatos —
logo depois da configuração, **antes** de conexão, migration ou porta, e o boot declara o modo. O
contrato do envelope já recusava ausência; o `?? "real"` entrava antes do envelope existir, e o
validador recebia um `real` bem formado. Compose: `:?` só no crítico; exemplo com a variável
vazia. Trocar o modo nunca reclassifica fato antigo; histórico `NULL` segue UNKNOWN. Gates:
`test:platform:q017` (18, binários + PostgreSQL), `test:platform:q017:compose` (7, pelo
renderizador do compose) e `test:platform:q017:mutacoes` (**15, zero cegas**); em containers,
`tools/q017_compose_real.sh` (31 medidas; recusa rodar onde já houver composição). **Achado:** o
append-only do event log não cobria `TRUNCATE`; fechado pela Append-Only Closure, abaixo.

**Append-Only Closure — fechado** (`docs/etapa-4-8/APPEND-ONLY.md`): `platform.event_log` é
append-only também contra `TRUNCATE`. Correção de invariante que já existia (L3, D10), por decisão
do César; nenhuma pergunta nova, nada de retenção ou purge. A trava da 0001 é de linha, e
`TRUNCATE` não dispara trigger de linha: reproduzido antes de fechar, num banco na 0003. O buraco
tinha dependentes: backup e repos montavam fixture com `TRUNCATE` no banco compartilhado, e o pg
com `DELETE`. **Primeiro a classe**: as três suítes passaram a criar o próprio banco por
`banco-isolado.ts`, que recusa colisão de nome e só apaga o que criou, também em falha e SIGTERM.
**Depois a trava**: migration **0004**, trigger de comando `BEFORE TRUNCATE` com a mesma função da
0001, que não foi editada. Provado executando, inclusive no banco restaurado por
`pg_dump`/`pg_restore`, com o replay da Q-016 idêntico ao da fonte. Gates:
`test:platform:append-only` (20), `test:platform:backup` (19), `test:platform:backup:patrimonio`
(7, de fora: referência trancada, falha injetada, SIGTERM, nomes hostis) e
`test:platform:append-only:mutacoes` (**11 mutações, zero cegas**); em containers,
`tools/append_only_compose_real.sh` (10 medidas: o job oficial aplica a 0004 e o banco da composição
recusa as três). **Limite declarado:** dono e superusuário ainda desligam a trava, e no compose
oficial o runtime é superusuário. Separar papéis é IAM, fora do escopo. Regressão
**48/52**, zero `FAIL_NOVO`.

**Cadeia canônica de realidade — fechada e certificada** (`docs/etapa-4-8/CADEIA-REAL.md`): por onde um
fato real entra. **Reproduzido antes:** o Android pedia `POST /api/device/session` esperando
`device_token`; o crítico respondia 404 e o piloto 200 sem token — nenhum ponto de campo subia, nunca.
**Fechado no caminho canônico:** o humano autoriza (`identity.device`), o aparelho prova quem é com um
segredo próprio (nunca o segredo de assinatura, nunca credencial humana no APK), o crítico vincula o
hash no primeiro contato (migration **0005**) e emite o token. O Android ganhou `device_secret` e duas
URLs com fronteira explícita (plataforma: sessão e GPS; piloto: WebView, termo, comandos). A cadeia —
aparelho lógico, queda de rede, crítico, `platform.event_log`, outbox, Operação Viva, restart/replay —
está provada com os binários de `dist/` (`test:platform:cadeia`, **35/35**); **não é prova física do
Android**. `/entregas` lê realidade do banco, separada da demonstração.
**Certificação (2026-09-25)**, tudo reproduzido antes de mexer (mutações **14/14: 1 controle + 13, zero
cegas** — o commit dizia 3 controles). Um `FAIL_NOVO`, achado e fechado: os dois arquivos da superfície
são caminhos protegidos e a autorização do César não estava registrada — exceção estreita no envelope
M1, fora de M1B, **confirmada pelo César em 2026-09-25** — só os dois arquivos e a classe executada. Os
**papéis mínimos estão na composição oficial**
(job `deliveryos-papeis`): crítico e assíncrono sem superusuário, donos de nada, sem a senha
administrativa; provado em containers (`tools/papeis_compose_real.sh` **44/44**, e **RED com 20
acusações** no controle que devolve a URL do dono), travado por `test:platform:papeis:compose` (10). O
limite da Append-Only Closure sobre o runtime está fechado. **Android BLOCKED por motivo externo:** a
rede nega `dl.google.com` (AGP e SDK); JDK 17 instalado; `android/gate-verification` quebrado desde
`4456f2e` (pré-existente). **Relógio:** `occurred_at` adiantado entrava carimbado `clock_trust='trusted'`
pelo default da coluna e prendia o frescor — reproduzido e registrado pela certificação em
`docs/execution/BLOCKERS.md`; **corrigido depois**, abaixo.
Regressão integral final **58/62**, zero `FAIL_NOVO`.

**Relógio do aparelho — corrigido** (`docs/etapa-4-8/RELOGIO.md`): CAPTURADO ≠ HORÁRIO CONFIÁVEL,
política do César. **Reproduzido antes**, com os binários e PostgreSQL: o ponto de +24 h entrava
`trusted` pelo padrão da coluna, prendia a última posição e ficaria `fresh` no dia seguinte sem
ponto novo, também depois do replay. Agora o crítico julga o relógio contra a hora do servidor e
grava `clock_trust` explícito — vocabulário e tolerância do contrato de Entregas, regra
assimétrica (atrasado é ponto offline). O ponto suspeito é aceito e preservado (coordenada,
`occurred_at`, `recorded_at`); o frescor usa a hora do servidor, e ao vivo e replay chegam ao
mesmo número. Sem migration: o padrão da coluna fica, e o consumidor confere o carimbo contra
`recorded_at`. Gates: `test:platform:relogio` (**13/13**) e `test:platform:relogio:mutacoes`
(**12 mutações, zero cegas**). **Android segue BLOCKED** — a rede nega `dl.google.com`, revalidado;
o gate físico tem roteiro pronto, todo `NOT_RUN` (`docs/etapa-4-8/FIELD-GATE-ANDROID.md`).
Regressão curta: **55 gates, 53 PASS, zero `FAIL_NOVO`** — 2 `FAIL_PREEXISTENTE` de governança; o
único achado (âncoras da Q-016 sobre as linhas mudadas) foi fechado. **O hardening de servidor
parou aqui: a próxima etapa é o aparelho Android físico.**

**Bancada do emulador** (`docs/etapa-4-8/BANCADA-EMULADOR.md`): o `RETRY` do `SyncWorker` no
emulador vinha do APK de bancada com `http://` — toda variante, `debug` inclusive, recusa cleartext
dentro do processo, e o pedido nunca chegou ao crítico. Caminho de laboratório **sem código novo**:
CA local com SAN `10.0.2.2`, `socat` TLS na frente do crítico e o piloto com o HTTPS nativo dele;
validado com os binários reais (`tools/bancada_tls_real.sh`, verde; vermelho com certificado sem
`10.0.2.2`). No emulador, bootstrap e superfície seguem `NOT_RUN`. **Achado:** nenhuma tela liga a
captura nativa — a ponte `EntregasNative` nunca foi chamada por página nenhuma, em toda a história.
O primeiro fato do app é **BLOCKED** até `Q-018` (`PAUSE`), junto com o termo publicável — `Q-018`
respondida depois, abaixo.

**Q-018 — respondida** (`docs/etapa-4-8/Q018-RIDER-CAPTURA.md`): a rider-mobile liga a captura
nativa pela ponte `EntregasNative`; o Kotlin segue dono de permissão, GPS, serviço, persistência e
sincronização; nenhuma UI nativa nova. **Reproduzido antes:** a prova com navegador (piloto real,
Chromium, ponte falsa com o portão do Kotlin) passou 9/22 no código de antes, quatro deles vazios —
e antes disso a página nem carregava (a sessão entrava depois do primeiro `fetch`, defeito anterior).
A regra (`capture-rule.js`, pura) liga só com flag, termo publicável, aceite **do servidor** para
este motoboy, este aparelho e este hash, permissão, e a viagem dele em `em_rota`/`retornando` — o
domínio, nunca o clique; o `CaptureGate` segue a última palavra. A página repassa ao Kotlin as
políticas que o servidor deu (D88); o servidor monta o aceite com o motoboy da sessão (D89). Desliga
quando a viagem acaba (releitura a cada 15 s enquanto há captura) e reconcilia ao reabrir. **Achados
fechados:** o aceite legado gravava para qualquer `rider_id`, de qualquer sessão (operador → 200,
agora 403); caminho absoluto de configuração era ignorado em silêncio. Gates:
`test:entregas:rider-bridge` (**27/27**), `test:entregas:rider-capture` (**38/38**, na cadeia
`test:entregas`), device-api **40/40**, android **38/38** e `test:entregas:rider-bridge:mutacoes`
(**26 verificações = 4 controles positivos + 21 mutações + 1 fecho; zero cegas**). **Não provado:** o Kotlin alterado não compilou aqui (`dl.google.com`
negado) e nada rodou em aparelho; com a página fechada, o fim da viagem só chega ao serviço quando
ela reabre (`docs/execution/BLOCKERS.md`). O primeiro fato do app passa a `NOT_RUN`: build no Foxxy e termo
publicável, que é do César. Regressão em `a7699f1`: **70 executados = 66 PASS + 4
FAIL_PREEXISTENTE/BLOCKED + 0 FAIL_NOVO** (3 pré-existentes e 1 bloqueado por servidor ausente,
idênticos em `a9b7e1b`; o único `FAIL_NOVO`, G2/G6c da governança vindo do próprio registro, foi
fechado antes da contagem). Um dos pré-existentes era a cadeia `test:entregas`, parada numa data fixa
vencida — corrigido depois, abaixo.
