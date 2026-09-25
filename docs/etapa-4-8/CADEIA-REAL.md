---
lifecycle:
  artefato: docs/etapa-4-8/CADEIA-REAL.md
  status: ACTIVE
  authority_scope: cadeia_canonica_de_realidade
  superseded_by: null
  atualizado_em: "2026-09-25"
  state_basis: e51c34d
  question_refs: ["Q-003", "Q-004", "Q-015"]
---

# Cadeia canônica de realidade — por onde um fato real entra no DeliveryOS

Construída em 2026-09-24 sobre `0b8803cdbf0bab78c7ffb52399fbcb79caa2bb58` (commits `b5b7f0c`,
`be73e1c`, `1de5b28`, `5effdbe`). **Certificada em 2026-09-25** (§0), que também fechou as pontas
mecânicas: papéis mínimos na composição oficial, e o Android medido no toolchain certo até onde
a rede deixa. Nenhuma pergunta nova. Q-003, Q-004 e Q-015 continuam intocadas.

**A resposta, em uma linha:**
1. um ponto de GPS nasce no aparelho e é gravado no Room antes de qualquer rede;
2. o aparelho prova quem é com um segredo próprio e recebe um token do runtime crítico;
3. o lote entra por `POST /api/gps/batch`, autenticado;
4. o crítico grava fato e mensagem na mesma transação em `platform.event_log`;
5. o assíncrono consome a outbox e projeta a Operação Viva;
6. um reinício reconstrói a projeção a partir do log (Q-016);
7. a superfície `/entregas` lê esse fato do banco, separado da demonstração, com a procedência dele.

Provado de ponta a ponta com os binários de `dist/` e PostgreSQL real (`test:platform:cadeia`,
**35/35**), sem telefone físico. O aparelho é LÓGICO: `src/platform/aparelho-logico.ts` replica o
contrato do Kotlin sobre um Room de arquivo. **Não é prova física do Android.**

## 0 — Certificação (2026-09-25)

A certificação refez as medidas, sem refazer o trabalho. Nenhum número do relato de construção foi
aceito sem ser reproduzido. Todas as medidas foram feitas sobre `5effdbe` intocado, antes de
qualquer edição:

| o quê | medido |
|---|---|
| `test:platform:cadeia` | **35/35** |
| `test:platform:cadeia:mutacoes` | **14/14: 1 controle positivo e 13 mutações, zero cegas**, árvore restaurada |
| regressão dirigida (37 gates) | 35 PASS, 1 `FAIL_NOVO` (m1-bridge C6), 1 `FAIL_PREEXISTENTE` (governança G6b e G9) |

**Correção de relato.** O commit `5effdbe` diz "3 controles + 13 mutações". A suíte tem **um**
controle positivo e treze mutações. O número de mutações estava certo; o de controles, não.

| frente | resultado | onde |
|---|---|---|
| `FAIL_NOVO` do m1-bridge C6 | `1de5b28`/`5effdbe` tocaram `entregas-vm.ts` e `entregas.js`, caminhos protegidos pelos gates de congelamento, **sem registrar autorização**. Em `0b8803c` o C6 era verde. A autorização existia: o César a deu na própria missão (item 8, porta READ-ONLY; item 12, revisão visual de Entregas). Foi **registrada**, não inventada: exceção estreita no envelope M1, fora de M1B, dois arquivos, uma classe, linha exata; o C6 a nomeia no código, e o C6c prova que sem o registro os dois reprovam. **Reversível** (rollback no envelope). **Confirmada pelo César em 2026-09-25**, só para os dois arquivos e a classe já executada. | `3993ab4`; `docs/design/M1_VISUAL_CHANGE_ENVELOPE.md` |
| papéis mínimos na composição oficial | ligados, no desenho provado; ver §6 | `e51c34d` |
| Android | JDK 17 instalado; build do app, testes de unidade e instrumentados **BLOCKED**: a política de rede nega `dl.google.com`, de onde vêm o AGP e o SDK; ver §4 | — |
| `occurred_at` no futuro | reproduzido com o binário, impacto medido, **registrado como problema separado e não corrigido**; ver §10 | `docs/execution/BLOCKERS.md` |
| regressão integral final | ver §8 | — |

## 1 — O mapa: antes e depois

| elo | antes (`0b8803c`) | depois |
|---|---|---|
| Android → `POST /api/device/session` | crítico: **404**; piloto: 200 **sem `device_token`**; o `SyncWorker` fica em laço "falhou temporariamente" e nenhum ponto sobe, nunca | crítico emite token por **vínculo de segredo** (`rota-sessao.ts`, `device-session.ts`, migration 0005) |
| credencial do aparelho | só existia dentro de teste, com o segredo de assinatura na mão | o aparelho gera um segredo próprio (128 bits), guardado no Room; sai dele só no bootstrap; o servidor vincula o hash no primeiro contato de um aparelho **autorizado por humano** |
| Android → `POST /api/gps/batch` | crítico já autenticava token assinado e gravava fato + outbox na mesma transação | igual; agora o token existe |
| URLs no Android | uma só (`ENTREGAS_BASE_URL`, o piloto) | duas, com fronteira explícita: `ENTREGAS_PLATFORM_URL` (sessão, GPS) e `ENTREGAS_BASE_URL` (WebView, termo, comandos, políticas); o token da plataforma nunca viaja para o piloto |
| `identity.device` | cadastro | + `secret_hash`, `secret_bound_at`, `last_session_at` (0005); revogar e cadastrar continuam humanos |
| Operação Viva ← restart | Q-016 | igual; provado de novo dentro da cadeia (C17–C20) |
| `/entregas` (Product System) | só o facade de demonstração; aparelho = integração pendente | + bloco **Realidade** lido de `identity.device` + `platform.event_log`, separado do demo, procedência por item (`leitura/realidade-de-entregas.ts`) |
| privilégio do runtime | superusuário (compose oficial) | papéis mínimos (`deploy/sql/papeis_minimos.sql`), provados em P1–P5 e **ligados à composição oficial na certificação**, provados em containers (§6) |

## 2 — Difference Check

| responsabilidade | classificação | por quê |
|---|---|---|
| ingestão de GPS (`/api/gps/batch`) | **SUPERSEDE** → plataforma | o crítico grava fato durável, transacional, com `source_mode`; o piloto guardava em memória (`pointsByTrip`) |
| autenticação do aparelho | **SUPERSEDE** → plataforma | token assinado + registro + segredo do aparelho; o piloto exigia credencial humana no APK e nunca emitiu token de aparelho |
| `identity.device` como identidade do aparelho | **PRESERVE** | única identidade; a 0005 só acrescenta o vínculo |
| `platform.event_log` como verdade durável | **PRESERVE** | append-only (0001, 0004), replay (Q-016) |
| `FileUnitOfWork` / `entregas.*` do piloto | **KEEP_PARALLEL** | viagem, parada, ocorrência, termo e comandos (`/api/events/batch`, `/api/term/acknowledge`, `/api/policies`) continuam no piloto. Migrar é outra fronteira. Hoje **nenhuma viagem nasce na cadeia canônica**: a viagem que existe pelo GPS aparece com estado `desconhecido`, e o selo diz por quê |
| rider-mobile (WebView do piloto) | **KEEP_PARALLEL** | é a interface do motoboy; `src/entregas/**` está no Preservation Set |
| Product System `/entregas` | **ADAPT** | demo preservado, com selo; bloco real ao lado |
| `test:platform:pb19` controle positivo | **ADAPT** | criava fato no banco compartilhado e dependia de outra suíte tê-lo migrado; agora tem banco próprio |
| `/api/device/session` no piloto (`handleDeviceSession`) | **UNKNOWN** | fica sem uso pelo app; retirá-lo é edição em `src/entregas` (preservado) |

## 3 — A cadeia, provada (`test:platform:cadeia`)

| passo | prova | medido |
|---|---|---|
| A. o buraco | A1 | resposta do piloto replicada byte a byte → o cliente retorna `retry` três vezes, 0 token, 1 ponto pendente. O 404 do crítico foi medido com o binário de `0b8803c` |
| B. decisão de sessão | B1–B7 | desconhecido 401 `aguardar_humano` (nunca 403: o Kotlin marca 403 como revogação local e para); sem segredo/fraco 401 `corrigir_cliente`; revogado 403 antes de olhar o segredo; primeiro contato vincula, mesmo segredo renova, outro segredo 403 `segredo_divergente`; corrida do vínculo; claims do cadastro, nunca do pedido; validade 12 h; nada de segredo no corpo |
| 1–4 aparelho, autorização, token, sessão | C1–C4 | identidade e segredo persistidos; antes da autorização 401 e o ponto fica; autorizado: token verificável, `secret_hash` = sha256 do segredo, `last_session_at`, `app_version`, 1 linha em `platform.audit` com o `jti`; reabrir o Room não custa bootstrap |
| 5–7 queda de rede | C5–C7 | 3 pontos `failed`, `attempts` 1, nenhum apagado, credencial intacta, nenhum fato chegou |
| 8–13 reconexão, autenticação, banco, fato, modo | C8–C13 | 4 fatos `gps_batch_received`, `object_id` = viagem, chave gerada NO aparelho, `origin device`, coordenada, `captured_offline`, `recorded_at`; `source_mode` = o da instância em log e outbox, zero `real` |
| 14 duplicata | C14 | recibo perdido → reenvio: `duplicado`, 4 fatos, 4 mensagens, fila limpa |
| 15–16 consumo e projeção | C15–C16 | outbox drenada; viagem com `ultima_posicao_em` = último ponto, `fresh`, 4 eventos, estado `desconhecido` |
| 17–20 restart e replay | C17–C20 | SIGTERM → 0; novo boot: replay `completo`, 4 aplicados, 1 escopo {unidade, simulated, 4 fatos, 1 viagem}; `mesmoEstadoLogico`; digest idêntico no terceiro boot |
| expiração | E1 | token vencido → 401, credencial limpa, ponto fica; a renovação é com o segredo, sem humano; ponto sobe |
| A não fala como B | E2 | token de A com ponto de B: `rejected 1`, motivo "diverge do aparelho autenticado"; segredo de A no bootstrap de B: 403 `segredo_divergente` |
| revogação | R1 | token vigente recusado (403), renovação recusada, cliente se marca revogado e para, ponto fica |
| controles | N1, N2 | `is_mock` recusado; o segredo nunca aparece no log do crítico nem em claro no banco |
| leitura | D1–D5 | ver §5 |
| papéis mínimos | P1–P5 | ver §6 |
| fronteira no Kotlin | K1 | ver §4 |

## 4 — O Android

Só o necessário (`android/`):
- `device_secret` gerado com `SecureRandom`, guardado no Room e enviado em `authenticateDevice`;
- `limparCredencial` continua apagando só token e validade: o segredo é identidade, não sessão;
- duas URLs, com validação de variante de campo para as duas;
- no `SyncWorker`, o token da plataforma vai só para a plataforma;
- a recusa do piloto deixou de derrubar a credencial da plataforma. Antes, um 401 do piloto apagava a
  credencial boa a cada ciclo e forçava um bootstrap por sincronização.

**Certificação, no toolchain certo, até onde a rede deixa** (2026-09-25):

| medida | resultado |
|---|---|
| JDK 17 | instalado pelo repositório Ubuntu: OpenJDK **17.0.20.1** |
| Gradle wrapper do repositório | **8.9**, baixado e funcionando. `android/gradlew` está versionado sem bit de execução (100644); roda com `sh gradlew`, e o modo não foi alterado |
| `:app:testDebugUnitTest`, `:app:assembleDebug` | **BLOCKED — motivo externo.** O AGP 8.5.2 não resolve. O atalho `google()` do Gradle aponta para `dl.google.com/dl/android/maven2`, e `maven.google.com` responde 301 para o mesmo host. A política de rede deste ambiente nega `dl.google.com:443` (o gateway responde 403 ao CONNECT, medido às 06:51Z). O Android SDK 34 e os build-tools vêm de `dl.google.com/android/repository`, também negado. `dl-ssl.google.com` e `redirector.gvt1.com` também caem |
| testes instrumentados | **BLOCKED** — mesmo motivo, e não há emulador nem aparelho |
| `android/gate-verification` (build JVM do próprio repositório) | **FAIL_PREEXISTENTE desde `4456f2e` (2026-07-27)**: `EntregasApi.kt` chama `DeviceSession.semSegredo`, e `DeviceSession.kt` importa o Room, que este build não alcança. `Unresolved reference 'DeviceSession'` idêntico em `0b8803c` (linhas 86/92) e em `HEAD` (92/98 — só as seis linhas de comentário do Fable no meio). O build nunca rodou desde então: pedia JDK 17, que não existia aqui |
| o diff do Fable em `EntregasApi.kt`, isolado | com um *stub* de `DeviceSession` **fora do repositório**, o arquivo real compila em JDK 17 / Kotlin 2.0.20, e o `CaptureGateTest` passa **12/12**. Isto não é a compilação do app |
| `test:entregas:android` (estrutural) e K1 (textual) | verdes na regressão final |

Nenhuma linha do app foi alterada. `DeviceSession.kt` e `SyncWorker.kt` dependem do Android e só
compilam com o SDK.

## 5 — A superfície Entregas

Quando o Product System tem `DELIVERYOS_DATABASE_URL`, o bloco é lido do banco a cada requisição
de `/api/entregas`.

**Separado da demonstração por construção:** é outra lista, e a procedência de cada item vem do
fato. Lote `simulated` vira `simulado`, nunca real. A demonstração não perde selo; ganha `parcial`.

**Ausência declarada, nunca zero, nunca saudável:**
- aparelho autorizado sem lote fica sem GPS, sem sincronização e sem modo, com selo de ação humana
  (aguardando o primeiro contato);
- fila offline, permissão e serviço de captura moram no telefone e seguem `integracao_pendente`;
- viagem que só existe pelo GPS aparece `desconhecido`, com o selo que explica;
- sem banco: `integracao_pendente`;
- banco fora do ar ou sem a 0005: `indisponivel`, com o motivo (medido antes de migrar o banco do
  sandbox).

**Revisão visual (secundária).** O bloco é um território de leitura, não uma pilha de cartões: duas
tabelas, quem tem fato primeiro e o mais recente no topo, quem nunca falou colapsado num inspetor
contado. Não houve redesenho, nem toque em Home, Calmo/Ambiente/Foco ou no cânone.

O que foi medido em navegador real (Chromium, pelo Fable, em 2026-09-24): sem erro de página em
1280 e 390 px, sem rolagem horizontal no telefone. As capturas daquela sessão **não foram
versionadas** (CLAUDE.md §9: dado gerado não entra no Git sem aprovação), e a medida não foi
refeita na certificação. O que a regressão final cobre é `test:platform:product`.

Os dois arquivos são caminhos protegidos pelos gates de congelamento. A autorização está
registrada no envelope M1 como exceção estreita, fora de M1B (§0).

## 6 — Privilégio mínimo (`deploy/sql/papeis_minimos.sql`)

| processo | precisa | e SÓ isso |
|---|---|---|
| crítico | `platform.event_log` SELECT+INSERT · `platform.outbox` SELECT+INSERT · `platform.inbox` SELECT+INSERT · `platform.audit` INSERT · sequências · `identity.device` SELECT + UPDATE **só** de `secret_hash, secret_bound_at, last_session_at, last_seen_at, app_version` · `platform.schema_migration` SELECT+INSERT+UPDATE (a sonda de escrita do `/ready`) | não pode revogar, cadastrar, apagar, truncar, alterar fato, desligar trava, `session_replication_role` |
| assíncrono | `platform.event_log` SELECT · `platform.outbox` SELECT+UPDATE · `platform.job` SELECT+INSERT+UPDATE · `platform.audit` INSERT · sequências · `platform.schema_migration` SELECT | não grava fato, não enfileira, não lê aparelho |
| migrate | dono do schema | DDL é dele |

Provado na construção: a cadeia inteira roda com esses papéis (P2, P3), e a sabotagem que o dono
consegue é recusada por **privilégio**, antes de qualquer trigger (P4, P5).

**Ligado à composição oficial na certificação**, com o desenho provado e sem redesenhar IAM:

- **`deliveryos-papeis`**: job novo com `postgres:16`, `psql` e `ON_ERROR_STOP`.
  - Roda como **dono** depois da migration, a cada subida.
  - Aplica `papeis_minimos.sql` e `senhas_dos_papeis.sql`.
  - As senhas chegam por ambiente e o psql as lê com `\getenv`, nunca em argumento de processo.
- **Uma URL por serviço.** `DELIVERYOS_DATABASE_URL` saiu de `x-ambiente`:
  - a migration conecta como dono;
  - o crítico, como `deliveryos_critical`;
  - o assíncrono, como `deliveryos_async`.
- **Senha administrativa.** `POSTGRES_PASSWORD` chega só a banco, migration, papéis e backup.
- **Ordem.** Crítico e assíncrono esperam papéis **e** migration.
- **Senhas em hex.** `deploy/.env.platform.example` traz as duas senhas novas, vazias, e pede hex.
  - Uma `/` do base64 invalida a URL de conexão (medido: `ERR_INVALID_URL`).
  - O conselho antigo de base64 para `POSTGRES_PASSWORD` tinha esse defeito latente.

| prova | medido |
|---|---|
| `test:platform:papeis:compose` (novo, pelo renderizador do compose) | **10/10** — quem recebe cada senha; papel de cada URL = papel que o SQL provado cria; `:?` recusa ausente e vazia; ordem; volume somente leitura; nenhuma senha em argumento. **P1c** é o controle adversarial: a URL comum de antes, reposta, é acusada nos dois runtimes |
| `tools/papeis_compose_real.sh` (novo, containers reais) | **44/44**. Sem a senha do papel nada sobe (0 containers). Papéis: `super/createrole/createdb/bypassrls=false`, donos de nada, herdam de ninguém. **Conexões reais** (`pg_stat_activity` pelo IP de cada container): o crítico é `deliveryos_critical`, o assíncrono é `deliveryos_async`. Cadeia de campo por eles: sessão 200 com vínculo e auditoria, lote 200 aceito, outbox drenada, replay `completo` depois de reinício. **Sabotagem com a credencial do próprio runtime**, de dentro do container dele: `DISABLE`/`DROP TRIGGER` → `must be owner`; `session_replication_role`, `DELETE`, `TRUNCATE`, revogar, cadastrar, `CREATE TABLE`, virar `SUPERUSER` → 42501; trava intacta e 1 linha no log. Senha administrativa ausente do ambiente e do processo do crítico. Nenhuma senha em log. Subir de novo reaplica os papéis sem erro |
| controle adversarial do real | a mesma ferramenta com os runtimes de volta na URL do dono (override fora do repositório): **RED com 20 acusações**, exatamente nas famílias C, X e K. A cadeia funcional (F) seguiu verde, como devia |
| `tools/q017_compose_real.sh` | **30/30**, as mesmas 30 medidas da Q-017, agora com os runtimes nos papéis |
| `tools/append_only_compose_real.sh` | **10/10**. `PAPEL_DO_RUNTIME` virou `PAPEL_DO_DONO`, porque o runtime deixou de conectar como o dono |

A imagem foi construída no estágio `build` (override de sandbox). O empacotamento final
(`dumb-init`, `USER node`, prune) continua BLOCKED como no PB19: a rede recusa o Debian.

Achado no caminho, da construção: a sonda do `/ready` escreve em `platform.schema_migration`
(`probe:escrita`). Funciona, mas obriga o runtime a ter escrita na tabela de migrations. Não
alterado.

## 7 — Mutações (`test:platform:cadeia:mutacoes`, 14/14: 1 controle positivo + 13 mutações, zero cegas)

As acusações abaixo são as **medidas** na reprodução da certificação:

| ID | defeito devolvido | acusaram |
|---|---|---|
| M1 | aparelho desconhecido recebe token | B1 C2 C3 C5–C7 C8–C11 C12 C13 C14 C15–C16 C17–C20 E1 E2 R1 N2 D1 D3 P3 |
| M2 | revogado continua ingerindo. As **duas** camadas foram derrubadas: com uma só, a mutação passa verde (medido) | R1 D1 D3 |
| M2b | revogado continua renovando | B3 R1 |
| M3 | token expirado passa | E1 |
| M4 | token de A envia como B | E2 D1 D3 |
| M5 | falha de credencial apaga o GPS local | E1 E2 R1 D1 D3 P3 |
| M6 | 401 vira sucesso definitivo | E1 E2 R1 D1 D3 P3 |
| M7 | lote repetido duplica fato (chave trocada no reenvio) | C12 C14 C15–C16 C17–C20 D1 D3 |
| M8 | simulated vira real | C13 C15–C16 C17–C20 D1 D3 |
| M9 | restart perde a projeção | C17–C20 P3 |
| M10 | a UI chama o demo de real | D3 |
| M11 | ausência vira saudável | D4 |
| M12 | piloto e plataforma com autoridade juntos (token vaza para o piloto no Kotlin) | K1 |

Nas mutações M2 e M4, `false && x` derrubava o **build**, não o gate: o tsc perde a narrativa de
nulo. Por isso as mutações comparam com um valor impossível. Um build que cai não é uma mutação
acusada, e o harness distingue os dois casos.

## 8 — Regressão integral final (certificação)

Árvore limpa no commit de código final `e51c34d`, 62 gates, cada um isolado
(`timeout 3000 npm run <gate>`), com o `DELIVERYOS_PG_URL` do sandbox: a cobertura da regressão
final da Append-Only (57), mais `cadeia`, `cadeia:mutacoes`, `papeis:compose`, `entregas:android`
e `entregas:device-api`. Cada falha foi comparada, log contra log, com a da regressão final da
Append-Only (`5e60596`), normalizando só SHA, tempo e caminho temporário: as linhas de falha são as
mesmas.

| classe | n | gates |
|---|---|---|
| **PASS** | **58** | todos os outros |
| FAIL_PREEXISTENTE | 3 | `test:entregas` (as mesmas 2 falhas de "Persistência sobrevivendo à recriação"); `test:platform:governanca` (G6b do `STATE.json` — agora nomeia `5effdbe`, mesmo artefato e mesma base `274141e` — e G9 da Q-014); `test:platform:governanca:mutacoes` (aborta em cascata pelas mesmas duas) |
| BLOCKED | 1 | `test:platform:m1b-perceptual`: `ECONNREFUSED 127.0.0.1:5292`, servidor ausente, igual |
| **FAIL_NOVO** | **0** | |

O que a certificação pediu, dentro dos 58:

| pedido | gate | resultado |
|---|---|---|
| cadeia real | `test:platform:cadeia` | 35/35 |
| mutações da cadeia | `test:platform:cadeia:mutacoes` | 14/14 · 0 mutacao(oes) cega(s) |
| papéis na composição | `test:platform:papeis:compose` | 10/10 |
| platform | `test:platform` · `test:platform:deploy` | 44 OK · 30 OK |
| PostgreSQL | `test:platform:pg` | 17 OK |
| append-only | `test:platform:append-only` | 20/20 |
| PB19 | `test:platform:pb19` | 27/27 |
| Q-016 | `test:platform:q016` · `q016:processos` | 27/27 · 14/14 |
| Q-017 | `test:platform:q017` · `q017:compose` | 18/18 · 7/7 |
| backup | `test:platform:backup` · `backup:patrimonio` | 19/19 · 7/7 |
| Entregas | `test:entregas` · `test:entregas:device-api` | as mesmas 2 falhas pré-existentes · 29 OK |
| product | `test:platform:product` | 44 OK |
| Android estrutural | `test:entregas:android` | 35 OK |
| deploy-audit | `test:entregas:deploy-audit` | 36 OK |
| governança | `test:platform:governanca` | só G6b e G9, pré-existentes |
| m1-bridge | `test:platform:m1-bridge` | 35 passaram (C6c novo) |

Suítes adversariais, todas verdes e sem mutação cega: `test:platform:append-only:mutacoes` 14/14 · 0 mutacao(oes) cega(s); `test:platform:q016:mutacoes` 14/14 · 0 mutacao(oes) cega(s); `test:platform:q017:mutacoes` 17/17 · 0 mutacao(oes) cega(s); `test:platform:pb19:mutacoes` 14/14 · 0 mutacao(oes) cega(s); `test:platform:spine:mutacoes` 31/31 · 0 mutacao(oes) cega(s); `test:lab:v4:evidencias:mutacoes` 6/6 · 0 controle(s) cego(s).

Em containers, fora da cadeia npm (§6): `tools/papeis_compose_real.sh` 44/44 (e RED com 20
acusações no controle adversarial), `tools/q017_compose_real.sh` 30/30,
`tools/append_only_compose_real.sh` 10/10, com a imagem deste commit construída no estágio `build`.

**NOT_RUN, por desenho:** `evidence:lab:v4:refresh`, que substitui a evidência versionada e é ato
explícito (D4). **Governança depois do commit** (L45): medida no commit da documentação.

## 9 — O que fica para depois

1. ~~Ligar `papeis_minimos.sql` ao compose~~ — **feito na certificação** (§6).
2. **Compilar e testar o Android com SDK.** Precisa de `dl.google.com` liberado na rede do
   ambiente, ou de uma máquina com SDK: `./gradlew testDebugUnitTest assembleDebug`,
   `assemblePilot` com as duas URLs, e os instrumentados num aparelho. É a próxima missão
   (aparelho físico).
3. **Consertar o `gate-verification`** (FAIL_PREEXISTENTE desde `4456f2e`): levar `semSegredo`
   para um arquivo Kotlin puro que o build JVM inclua. Tem de ser feito onde o app compila, porque
   toca `DeviceSession.kt`.
4. **Ferramenta humana de autorização** (`tools/aparelho.ts autorizar|revogar`) sobre
   `identity.device`. Hoje é SQL.
5. **Retirar `handleDeviceSession` do piloto**, quando `src/entregas` puder ser tocado.
6. **Cadeia dos comandos** (`/api/events/batch` → `trip_created` etc.). É a próxima coluna de
   realidade, não esta.
7. **Relógio do aparelho** (§10): decidir e corrigir o carimbo `clock_trust` e o frescor.
   Registrado em `docs/execution/BLOCKERS.md`.

## 10 — UNKNOWNs e limites declarados

- **Janela do primeiro contato.** Entre o humano autorizar e o aparelho se apresentar, quem souber
  o `device_id` e chegar antes vincula o próprio segredo. E2 mede o "depois"; o "antes" é o limite.
  Mitigação: revogar e reautorizar. Um código de enrolamento fecharia a janela, mas exige UI no
  telefone.
- **`jti` por segundo.** O identificador de emissão deriva de (`device_id`, `iat`); duas emissões
  no mesmo segundo compartilham `jti`.
- **Relógio do aparelho — reproduzido na certificação, NÃO corrigido.**
  - **Reprodução:** binário crítico, PostgreSQL real, dois aparelhos.
    - A: t−30 s, **t+24 h**, t−5 s;
    - B, controle: t−30 s, t−5 s.
  - **Achados:**
    - o crítico aceita o ponto adiantado (200 `aceito`);
    - todo fato fica `clock_trust='trusted'`, **o default da coluna** (0001): o writer da
      plataforma nunca o preenche. Num log append-only, o carimbo não se corrige depois;
    - a projeção e a porta de leitura pegam o maior `occurred_at` como última posição. A fica preso
      no ponto adiantado: `unknown` agora, com os pontos reais mais novos escondidos atrás dele;
    - daqui a 24 h, sem nenhum ponto novo, A leria `fresh` (frescor falso de aparelho parado) e B
      leria `stale`;
    - o replay reproduz o mesmo estado, em qualquer ordem: a distorção sobrevive a reinício.
  - **Classificação:** material para a verdade (carimbo fabricado, e "saudável por ausência"
    atrasado). **Não bloqueia o teste de campo:** um telefone com hora automática não gera ponto
    mais de 60 s à frente.
  - **O que o teste de campo precisa conferir:** que o aparelho está com data e hora automáticas.
- **Segredo em trânsito** depende de TLS na borda (Caddy no piloto; o crítico escuta 8080 em claro
  dentro da composição). Não medido.
- **Sem telefone físico.** Tudo acima é o contrato do Kotlin executado em TypeScript, mais o Kotlin
  lido e o diff do `EntregasApi.kt` compilado isolado (§4).
- **Modelo de papéis de banco hospedado** (Supabase ou outro): não medido. O job de papéis supõe o
  dono com `CREATE ROLE`.
- **Rotação das senhas dos papéis:** não medida.
- **Dono e superusuário** continuam capazes de desligar a trava. É o limite da Append-Only Closure,
  agora só do lado administrativo: o runtime não é mais nenhum dos dois.

## 11 — Decisões do César

Nenhuma nova pergunta. Q-003, Q-004 e Q-015 continuam `open`/`PAUSE`.

- **Ligar os papéis ao compose** mudou a composição oficial. Foi feito por instrução explícita do
  César na certificação ("Agora falta integrar isso à COMPOSIÇÃO OFICIAL").
- **Confirmada por ele em 2026-09-25:** a exceção estreita registrada no envelope M1, para a
  superfície Entregas (§0). Vale só para os dois arquivos e a classe já executada; não amplia o
  envelope. Ver `docs/design/M1_VISUAL_CHANGE_ENVELOPE.md`.
- **Pede decisão dele:** a direção de correção do relógio (§10). Recusar o ponto, ou aceitar marcado
  e fora do frescor.
- **Segue fora desta missão:** migrar viagem, termo e comandos do piloto para a plataforma
  redefine o domínio de Entregas, que está no Preservation Set.
