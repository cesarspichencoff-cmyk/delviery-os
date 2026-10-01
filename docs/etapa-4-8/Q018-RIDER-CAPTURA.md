---
lifecycle:
  artefato: docs/etapa-4-8/Q018-RIDER-CAPTURA.md
  status: ACTIVE
  authority_scope: captura_pela_rider_mobile
  superseded_by: null
  atualizado_em: "2026-10-01"
  state_basis: ea3745a
  question_refs: ["Q-018"]
---

# Q-018 — a rider-mobile liga a captura; o Kotlin captura

Decisão do César, 2026-09-25, literal:

> A rider-mobile é dona da interação com o motoboy e deve acionar a captura através da ponte
> EntregasNative. O Android/Kotlin continua dono das capacidades nativas — permissão, GPS,
> foreground service, persistência e sincronização. Não criar uma segunda UI nativa para iniciar a
> viagem. Integrar na rider-mobile as capacidades de consentimento e status GPS já existentes,
> preservando uma única experiência e uma única verdade de domínio. A captura só inicia após saída
> validamente confirmada e consentimento/permissão válidos.

> **Laboratório — estado histórico de 26/09.** Naquela data, piloto/Chromium estavam provados,
> mas o Kotlin ainda não tinha compilado nem rodado em Android. **Esse limite foi superado em
> 30/09/2026 no Foxxy; a evidência atual está na §14.** O texto histórico das §§9–13 foi preservado
> para não reescrever a força da prova antiga.

## 0 — Respostas

| pergunta | resposta |
|---|---|
| quem liga a captura | a página, pela ponte, depois da regra da §3. O `CaptureGate` do Kotlin continua sendo a última palavra no aparelho |
| "saída validamente confirmada" | a viagem **deste motoboy** em `em_rota` ou `retornando` no snapshot do servidor — depois de o domínio aceitar `ConfirmTripDeparture`. O clique não conta |
| "consentimento válido" | o registro que o **servidor** guarda para este motoboy, este termo (hash) e este aparelho, com `status: accepted` |
| "permissão válida" | o que o Android respondeu, lido pela ponte |
| UI nativa nova | nenhuma |
| status de GPS | o indicador que já existia (`gps-status.js`), agora refletindo o serviço nativo |
| Kotlin | três mudanças pequenas (§2); **compiladas e exercitadas no Foxxy/AVD em 30/09/2026** |
| primeiro fato do app | **PROVEN no emulador** — captura/persistência, sequência durável, restart, retry/sync e encerramento; aparelho físico segue `NOT_RUN` |

## 1 — A lacuna, reproduzida antes

A prova com navegador (`src/entregas/ui/run-rider-bridge-tests.ts`) foi escrita **antes** do código,
contra o piloto real e o `rider-mobile` de `a9b7e1b`.

Primeiro ela nem rodava: a página ficava presa em "Carregando…". O trecho que põe o token no
`fetch` era um módulo no fim do `<body>`, e módulos rodam na ordem do documento — o `rider.js` fazia
a primeira leitura **sem** `Authorization` e recebia 401. Defeito anterior a esta missão (§5).

Com ele corrigido, **9 de 22** passaram, e quatro dos nove pelo motivo errado — B1, C6, C8 e D1:
nada ligava nunca, então "nada liga antes da saída" era verdade vazia. Falhavam 13: a ponte nunca
chamada (B2, B3, C7), nenhuma política entregue ao nativo (C1), nenhuma tela de termo (C2–C5, D2,
D3), nenhum aceite no servidor (C9), D4 no primeiro passo, e B4 — que naquela execução caiu antes,
num defeito da própria prova: fechar viagem é de gerente, e ela usava o token do operador
(corrigido). A saída gravada dessa execução está no registro de evidência `q018-lacuna-reproduzida`.

## 2 — Quem é dono de quê

| parte | faz | não faz |
|---|---|---|
| página (`rider-mobile`) | lê sessão, políticas, termo e registro do servidor; mostra o termo e o status; decide quando **pedir** a captura; repassa ao Kotlin as políticas e o registro | liga GPS do navegador; manda ponto ao servidor; calcula hash ou id de aceite |
| servidor do piloto | serve o termo (`GET /api/term`); monta o aceite com o motoboy da sessão; diz se ele já respondeu neste aparelho | aceita aceite em nome de outro (D89) |
| Kotlin | guarda as políticas (`applyServerPolicies`); expõe o `device_id`; recusa aceite de outro aparelho; roda o portão; captura, persiste e sincroniza | decide viagem, termo ou saída |

**Preservation Set.** Entregas (`src/entregas/**`) mudou por decisão explícita do César nesta
pergunta, e só em três lugares: a interação (`ui/rider-mobile/`), a API do aparelho no piloto
(`pilot/device-api.ts`, `tools/entregas_pilot_server.ts`) e a ponte nativa. Domínio, comandos,
máquina de estados e `ApplicationService` não foram tocados.

As três mudanças no Kotlin (`EntregasBridge.kt`, `MainActivity.kt`):

- **K1** — `capabilities()` leva o `device_id` (o pseudônimo, nunca o segredo);
- **K2** — `applyServerPolicies(json)`: a página repassa o corpo de `/api/policies` e o Kotlin guarda
  pelo mesmo `PolicyStore.applyServerPolicies` de sempre (D88);
- **K3** — `recordTermAcknowledgement` recusa registro de outro aparelho **antes** de gravar o aceite
  e o motoboy (`aparelho_divergente`).

## 3 — A regra (`src/entregas/ui/rider-mobile/capture-rule.js`)

Função pura. Na ordem — o primeiro motivo que falha é o que o indicador mostra:

| condição | motivo | o indicador diz |
|---|---|---|
| há ponte | `sem_ponte` | GPS DESLIGADO — SÓ PELO APLICATIVO |
| a sessão é de motoboy | `sem_motoboy` | GPS DESLIGADO — ACESSO NÃO É DE MOTOBOY |
| `flags.gps_capture_enabled === true` | `gps_desligado` | GPS DESLIGADO — DESLIGADO NA CONFIGURAÇÃO |
| termo publicável, com hash | `termo_indisponivel` | GPS DESLIGADO — TERMO AINDA NÃO LIBERADO |
| registro do servidor, deste motoboy e deste aparelho | `sem_aceite` | GPS DESLIGADO — FALTA ACEITAR O TERMO |
| registro do hash vigente | `termo_desatualizado` | GPS DESLIGADO — TERMO NOVO PARA ACEITAR |
| registro `accepted` | `termo_recusado` | GPS DESLIGADO — TERMO NÃO ACEITO |
| permissão concedida | `sem_permissao` | GPS DESLIGADO — FALTA A PERMISSÃO DE LOCALIZAÇÃO |
| há viagem na tela | `sem_viagem` | GPS DESLIGADO — SEM VIAGEM ATIVA (o texto de sempre) |
| a viagem é deste motoboy | `viagem_de_outro` | GPS DESLIGADO — VIAGEM DE OUTRO MOTOBOY |
| `em_rota` ou `retornando` | `saida_nao_confirmada` | GPS DESLIGADO — AGUARDANDO A SAÍDA |

Tudo verdadeiro: a página pede `startTripCapture(viagem)` e o indicador diz "LIGANDO NO APARELHO"
até o Kotlin confirmar; aí, "GPS ATIVO — VIAGEM …". Se o portão nativo recusar, "BLOQUEADO NO
APARELHO", com a frase do próprio `CaptureGate` na linha de baixo.

## 4 — O fluxo na página (`rider.js`)

1. **Ao abrir:** sessão (`/api/session`), `device_id` e estado do nativo (`capabilities()`,
   `status()`), políticas (`/api/policies`, repassadas ao Kotlin como vieram), e — com flag ligada e
   termo publicável — o termo e o registro deste motoboy neste aparelho (`/api/term?device_id=`).
2. **Sem registro:** a tela do termo que já existia (`consent-screen.js`): checkbox nasce
   desmarcado, CONCORDAR desabilitado até o dedo marcar, recusar com o mesmo peso.
3. **Resposta:** a página manda só a escolha e o aparelho; o servidor monta o registro; o Kotlin o
   guarda. **Só então** a página pede a permissão do Android — nunca antes do termo.
4. **Recusa:** fica. Reabrir não oferece o termo de novo (o id não inclui a escolha); a frase
   neutra que já existia encaminha ao responsável.
5. **Permissão negada:** a frase do portão e um botão "Abrir configurações do aparelho".
6. **Saída confirmada pelo domínio:** `startTripCapture` da viagem, **uma vez** por página.
7. **Fim:** enquanto há captura, a página relê a viagem a cada 15 s (e ao voltar ao primeiro
   plano); fora de `em_rota`/`retornando`, `stopTripCapture`. GPS só durante viagem ativa (L6).
8. **Ao reabrir:** reconcilia com o serviço (`status().active_trip_id`) — viagem ainda válida,
   reafirma uma vez; viagem acabada, desliga.
9. **Navegador comum:** sem ponte, sem GPS nenhum. O indicador diz "SÓ PELO APLICATIVO".

## 5 — Defeitos anteriores achados no caminho

| defeito | reproduzido | tratamento |
|---|---|---|
| trecho de sessão rodava depois do primeiro `fetch` | página presa em "Carregando…" (cenário A) | corrigido: script clássico no começo do `<head>` |
| `join(cwd, caminho)` ignorava caminho absoluto do ambiente (`ENTREGAS_TERM_CONFIG`, `ENTREGAS_UNIT_CONFIG`) | flags absolutas com `true` → `gps_production=False`; depois, `True` | corrigido (L52) |
| aceite legado gravava para qualquer `rider_id`, de qualquer sessão | operador plantou `accepted` em nome do motoboy: **200** | corrigido: 403 `not_rider` (D89); formato continua 400 antes |
| `SyncWorker` fala com o piloto sem credencial: 401 em políticas e aceites | leitura + teste "sem sessão" | contornado pela página (D88); registrado em `BLOCKERS.md` |
| a ponte falsa desta prova tinha dois nomes errados (`receiptJson`, `requestSyncNow`) | lendo o `.kt`, antes de a página existir | corrigido e travado por S1/S2 de `rider-capture` (L53) |
| `rider.js` manda `actor: rid-demo` fixo nos comandos | leitura | **não corrigido** — fora do escopo; o domínio aceita |
| a tela mostra a primeira viagem ativa de qualquer motoboy | leitura | **não corrigido na tela**; a captura exige a viagem do motoboy da sessão (E2) |
| o WebView do app cancelava o `confirm()` da saída e da entrega (sem `WebChromeClient`, desde `7ff4d50`) | ensaio com o diálogo modelado pela `MainActivity`: RED na saída (2026-09-26) | corrigido em `9966ab5` (D92, §13); Kotlin não compilado |

## 6 — Provas

| gate | resultado |
|---|---|
| `test:entregas:rider-bridge` — piloto real, Chromium, ponte falsa com o portão do Kotlin | **27/27** |
| `test:entregas:rider-capture` — regra (cada garantia removida uma a uma), adaptador, nomes da ponte iguais no Kotlin, na página e na falsa, status de GPS byte a byte | **38/38** |
| `test:entregas:device-api` — servidor compilado, 11 novos | **40/40** |
| `test:entregas:android` — estrutural, 3 novos | **38/38** |
| `test:entregas:rider-bridge:mutacoes` | §7 |

Cenários da prova com navegador: **A** navegador sem ponte (saída confirma, zero `watchPosition`);
**B** aparelho já liberado (nada antes da saída, uma chamada depois, indicador ativo, desliga quando
o console encerra); **C** caminho completo (políticas → termo → aceite do servidor → permissão →
saída → captura, nessa ordem, e o registro no arquivo do servidor); **D** o que não liga (saída
recusada, termo recusado, permissão negada, flag desligada); **E** telefone de outro aparelho,
viagem de outro motoboy, reabrir com o serviço preso a viagem encerrada, reabrir no meio da viagem,
recusa que fica.

## 7 — Mutações

`npm run test:entregas:rider-bridge:mutacoes` (`src/entregas/ui/run-rider-bridge-mutation-tests.ts`):
cada mutação devolve ao código UMA garantia removida, roda o gate que deveria acusar e exige a
reprovação **pelo teste certo**; restauração byte a byte por sha256, também em SIGINT/SIGTERM.
Controle positivo antes e fecho depois. **26 verificações, 26 ok, zero cegas**, 13 min 28 s — e os
26 são exatamente:

| elementos | quantos | quais |
|---|---|---|
| controles positivos | **4** | os gates `regra`, `navegador`, `servidor` e `android`, verdes sem mutação |
| mutações | **21** | MR1–MR13 (página), MS1–MS5 (servidor), MA1–MA3 (Kotlin, estrutural) — tabela abaixo |
| verificação de fecho | **1** | `git status` vazio nos seis arquivos mutados |
| **total** | **26** | 4 + 21 + 1; conferido no código da suíte e no registro da execução (26 `ok`, 0 `XX`) |

A reconstrução final de `dist/` é ação, não verificação: só entraria na conta como falha, e não falhou.

| id | garantia removida | gate | acusado por |
|---|---|---|---|
| MR1 | saída confirmada antes de ligar | navegador | B1 |
| MR2 | termo recusado não vale como aceite | navegador | E5 |
| MR3 | permissão do Android | navegador | D3 |
| MR4 | a viagem é deste motoboy | navegador | E2 |
| MR5 | aceite deste motoboy e deste aparelho | regra | R3 "aceite de outro aparelho" |
| MR6 | flag do servidor (`=== true`) | regra | R3 "flag desligada" |
| MR7 | desligar quando a viagem acaba (L6) | navegador | B4 |
| MR8 | nenhum GPS do navegador | navegador | B2 (`watchPosition` chamado) |
| MR9 | ligar pelo domínio, não pelo clique | navegador | D1 |
| MR10 | permissão só depois do termo | navegador | C2 |
| MR11 | políticas repassadas ao nativo | navegador | C1 |
| MR12 | uma chamada por viagem | navegador | B2 (várias chamadas) |
| MR13 | reconciliar ao reabrir | navegador | E3 |
| MS1 | legado só grava para o próprio motoboy | servidor | "caminho legado: operador…" (200 ≠ 403) |
| MS2 | o motoboy vem da sessão, não do corpo | servidor | "o SERVIDOR monta o registro" (`rid-intruso`) |
| MS3 | a consulta usa o aparelho | servidor | "/api/term devolve o registro DESTE motoboy…" |
| MS4 | caminho absoluto respeitado | navegador | a prova aborta: `term_not_publishable` para um termo publicável |
| MS5 | sessão antes do primeiro `fetch` | navegador | a prova aborta: página presa em "Carregando…" |
| MA1 | aceite de outro aparelho recusado no Kotlin | android | "aceite com aparelho divergente…" |
| MA2 | `applyServerPolicies` exposto ao JavaScript | android | "a ponte repassa as políticas…" |
| MA3 | `device_id` nas capacidades | android | "capacidades levam o pseudônimo…" |

MA1–MA3 provam que a verificação estrutural acusa a falta da trava — não que o Kotlin roda.

## 8 — Textos novos na tela

A tela do termo, o botão de recusa, a frase da recusa e as frases do portão nativo **já existiam**
(`CONSENT_LABELS`, `DECLINE_CONSEQUENCE`, `CaptureGate`). Novos, para o César revisar: os
complementos do indicador da §3, "LIGANDO NO APARELHO", "BLOQUEADO NO APARELHO",
"APLICATIVO DESATUALIZADO", "Abrir configurações do aparelho", "Atualize o aplicativo para a
localização funcionar." e, no navegador, "A localização é capturada só pelo aplicativo Android,
durante a viagem.".

A seção do termo usa classes que já existiam (`card`, `primary big`, `big`, `secondary-link`) e um
bloco curto de CSS para o texto respirar (21 linhas, comentário incluído). **Não houve composição visual nova e a aparência não foi
aprovada**: o redesign de Entregas continua fora, pela regra de fase.

O botão "BAIXAR OU RECEBER UMA CÓPIA" existe como rótulo em `consent-screen.js`, sem comportamento;
não entrou. O recibo existe no servidor e no Kotlin (`receipt`).

## 9 — O que NÃO está provado

- **O Kotlin no emulador não é mais lacuna.** K1–K3, `WebChromeClient`, captura/persistência, sequência durável, restart, retry/sync e encerramento foram exercitados no Foxxy/AVD; o fecho final está na §15.
- **O aparelho físico.** Nenhum passo da bateria física rodou (`docs/etapa-4-8/FIELD-GATE-ANDROID.md`).
- **A página fechada.** O fim da viagem só chega ao serviço quando a página está viva; com o app
  em segundo plano depende de timers do WebView; com o processo morto, só quando o app reabre
  (`BLOCKERS.md`, registrado ABERTO).
- **Flag desligada no meio da viagem.** Chega ao aparelho na próxima abertura da página (D88).
- **Confiança na página.** O Kotlin guarda o que a página repassa. Não é fronteira nova: a página
  já era quem comanda a ponte, e o WebView só carrega a origem do piloto (`OriginLockedClient`).

## 10 — No Foxxy

O procedimento exato, com PASS por item, está em `docs/etapa-4-8/BANCADA-EMULADOR.md` §3.11–3.12
(Q1–Q11). Em resumo: build novo (A1–A3), piloto de laboratório com a fixture sintética e
`ENTREGAS_LABORATORIO=1`, viagem montada para o motoboy da sessão, sessão no WebView por
`chrome://inspect`, posição do emulador por `adb emu geo fix`, e então **pela tela**: termo →
CONCORDAR → permissão → Confirmar saída. A prova é o banco, o Room, o arquivo de aceites do piloto,
o replay e `/api/entregas`. Se Q1–Q11 passarem, a bancada do emulador acabou; o próximo nível é o
aparelho físico.

## 11 — Regressão

Cada gate isolado, sobre `a7699f1` e PostgreSQL real (`127.0.0.1:5433`), agregados abertos em partes
para nada rodar duas vezes (2 023 s de gate). Cada gate está em **uma** classe só:

**70 executados = 66 PASS + 4 FAIL_PREEXISTENTE/BLOCKED + 0 FAIL_NOVO**

| classe | n | gates |
|---|---|---|
| PASS | **66** | 65 verdes na primeira passada — entre eles `test:entregas:rider-bridge`, `test:entregas:pilot-gate`, `test:lab`, `test:platform:product`, `test:platform:m1-bridge` e todas as suítes de mutação da plataforma (`pb19`, `spine`, `q016`, `q017`, `append-only`, `cadeia`, `relogio`, `lab:v4:evidencias`, `m1b`) —, **mais** `test:platform:pb19`: vermelho na primeira passada por ordem de build do roteiro (compilou com `tsc`, não com `build:platform`, e o carimbo D3a ficou para trás, como o próprio gate diz); reexecutado depois de `build:platform`, com PostgreSQL: **27/27** |
| `FAIL_PREEXISTENTE` | **3** | `test:entregas` (a cadeia parava em `persistence-recreate`: data fixa vencida); `test:platform:governanca` (G6b, G9); `test:platform:governanca:mutacoes` (aborta porque o caso legítimo não é verde) — os três idênticos em `a9b7e1b` |
| `BLOCKED` | **1** | `test:platform:m1b-perceptual`: `ECONNREFUSED 127.0.0.1:5292`, servidor ausente — idêntico em `a9b7e1b` |
| `FAIL_NOVO` | **0** | — |

O único `FAIL_NOVO` que apareceu foi fechado **antes** da contagem acima: G2 e G6c da governança,
vindos do registro desta missão — o parágrafo novo do `CLAUDE.md` citava o arquivo de bloqueios sem
o caminho, e a rota da §11 o lia como artefato sem lifecycle; `DECISIONS.md` mudou sem atualizar
`atualizado_em`. Depois da correção (`a7699f1`), a saída da governança ficou idêntica à de
`a9b7e1b`, fora o cabeçalho (+1 artefato e +1 caminho de rota: este documento). O `deploy-audit`,
último da cadeia `test:entregas`, que a cadeia quebrada não alcançava, rodou à parte: 36/36.

**Depois desta regressão:** a data fixa vencida foi corrigida (§12) e a cadeia `test:entregas`
passou inteira. A equação no HEAD final está na §12.

Antes de escolher a regressão, as linhas que o diff removeu foram cruzadas com as âncoras das 33
suítes de mutação: nenhuma ancorava nelas (L51).

## 12 — Depois (2026-09-26)

**Push.** Os 6 commits `dc0b005..a7699f1` foram para `origin/feature/deliveryos-test-rc-convergence-v1`
por autorização explícita do César; remoto = local = `a7699f1`, árvore limpa, sem merge, PR, `main`
ou deploy. Tudo o que segue está em commits locais, esperando nova autorização.

**A data fixa vencida, fechada como classe** (`8e6be1b`). Reproduzida com o próprio harness antes de
mexer: a suíte reprovava hoje e passava 15/15 com a data civil em 2026-07-26. Agora um "agora" lido
uma vez, AT1 = agora − 10 min, AT2 = AT1 + 30 s, e dois controles de janela (mais de 30 dias no
passado, mais de 24 h no futuro: `impossible_timestamp`) — 17/17. O gate
`test:entregas:persistence-recreate:relogio` roda a suíte com a data civil deslocada
(`tools/relogio_deslocado.cjs`, herdado pelo servidor filho) e **12/12**: C0 ×5 (o deslocamento chega
ao filho), S ×5 (verde em 2025-08-22, 2026-07-26, hoje, 2026-11-10 e 2036-09-23), M1 ×2 (a data fixa
devolvida reprova hoje por `impossible_timestamp` e passa só na própria data). Um tropeço do próprio
controle, corrigido e registrado: o mutante rodado às 12:00Z do dia 26 falhava por outro motivo — o
ponto "+25 h" dele caía a 23 h 10 min do agora —, porque o "agora" que a data fixa representa é
10:10Z. A cadeia `test:entregas` voltou a rodar inteira, com `deploy-audit`.

**Termo sintético de laboratório** (`ea3745a`). `tools/bancada_termo_sintetico.json`: a marca "SEM
VALOR LEGAL — APENAS TESTE SIMULADO" no título, no corpo, na vigência e em todo campo legal; nenhum
dado legal inventado; fora de `config/`; o checklist legal intocado. O piloto recusa subir com um
termo marcado sem `ENTREGAS_LABORATORIO=1`, ou em modo remoto mesmo com a flag, e declara
`term_synthetic` na saúde. `test:entregas:termo-sintetico` **10/10**, na cadeia `test:entregas`, com
dois mutantes do servidor compilado provando que as recusas dependem da trava (T9, T10).

**A cadeia do emulador, até a fronteira do Kotlin** (`d499b1b`): `tools/bancada_q018_cadeia.sh`,
**37/37** — `docs/etapa-4-8/BANCADA-EMULADOR.md` §5b.

**Android aqui, revalidado hoje:** a política de rede do ambiente nega `dl.google.com` (403 no
CONNECT); `maven.google.com` responde, mas só redireciona para lá; e o container não tem KVM nem
SDK. Build e emulador seguem no Foxxy. Liberar `dl.google.com` no ambiente permitiria compilar e
rodar os testes de unidade aqui; o emulador continuaria precisando do Foxxy.

**Regressão no HEAD final** (`12582c7`): os 70 gates de antes mais os 3 novos
(`test:entregas:persistence-recreate:relogio`, `test:entregas:termo-sintetico` e
`test:entregas:rider-bridge:mutacoes`, porque o piloto mudou), cada um isolado, PostgreSQL real,
`build:platform` antes de qualquer gate. Cada gate em uma classe só:

**73 executados = 70 PASS + 3 FAIL_PREEXISTENTE/BLOCKED + 0 FAIL_NOVO**

| classe | n | gates |
|---|---|---|
| PASS | **70** | entre eles `test:entregas` inteira (vermelha ontem, pela data fixa; hoje com `persistence-recreate` 17/17, `deploy-audit` 36/36 e `termo-sintetico` 10/10), `test:platform:pb19` 27/27 já na primeira passada, e todas as suítes de mutação, `rider-bridge:mutacoes` incluída (803 s) |
| `FAIL_PREEXISTENTE` | **2** | `test:platform:governanca` (G6b, G9 — saída idêntica à de `a9b7e1b` fora o cabeçalho) e `test:platform:governanca:mutacoes` (aborta pelo mesmo motivo) |
| `BLOCKED` | **1** | `test:platform:m1b-perceptual`: `ECONNREFUSED 127.0.0.1:5292`, servidor ausente |
| `FAIL_NOVO` | **0** | — |

Antes: as três linhas de código que o diff removeu (a cadeia `test:entregas` no manifesto e os dois
carimbos fixos) foram cruzadas com as âncoras de todas as suítes de mutação: nenhuma ancorava nelas
(L51). Os gates que leem documento rodam de novo depois do commit deste registro.

## 13 — O `confirm()` que o WebView cancelava (2026-09-26)

**Achado conferindo o roteiro do Foxxy contra o código.** A saída passa por
`confirm("Confirmar saída da loja?")` (`rider.js:275`; a entrega, `:304`, desde `7ff4d50`). No WebView
do Android, sem `WebChromeClient`, esse diálogo é cancelado em silêncio e a página recebe `false`
(Chromium, `WebViewContentsClientAdapter.handleJsConfirm`: `mWebChromeClient == null` →
`receiver.cancel()`). A `MainActivity` nunca registrou cliente. No aparelho, **Confirmar saída** não
faria nada: o Q6 do Foxxy reprovaria, e a entrega também não confirmaria. As duas provas com
navegador — o ensaio (37/37) e o `rider-bridge` (27/27) — aceitavam todo diálogo no Chromium e o
escondiam (L57).

| passo | medida |
|---|---|
| reproduzido | ensaio com o diálogo tratado como a `MainActivity` de `df481bd` o trata: `BANCADA_Q018_RED` na saída, sem captura nem fato; trava estrutural nova vermelha (38 + 1 falha) |
| corrigido (`9966ab5`, D92) | `webChromeClient = WebChromeClient()`, o padrão, sem override — permissão negada, arquivo abortado, janela fechada (conferido na fonte) |
| verificado | ensaio **39/39**; `rider-bridge` **27/27**; android project **40/40** (o cliente e o próprio modelo) |
| adversarial | sem a linha: ensaio, `rider-bridge` e trava vermelhos; cliente próprio: "desconhecido", vermelho |

O modelo (`src/entregas/android/webview-dialog-model.ts`) lê a `MainActivity` e responde mostra,
cancela ou desconhecido. As duas provas com navegador passam a usá-lo, e ele é testado nos três casos.

**Segunda passada, o mesmo método, nos outros contratos da ponte:** o que o Kotlin LÊ do que a página
entrega. Medido com o termo sintético, montado como o piloto monta. O aceite tem as **9** chaves que
`recordTermAcknowledgement` lê por `getString`, e chave ausente ali vira `registro_invalido`. As
políticas têm as **5** que `PolicyStore.applyServerPolicies` lê (`flags.gps_capture_enabled`,
`term.hash`, `term.material_version`, `term.publishable`, `capture_policy`). Nenhum defeito novo.

**Não provado:** o Kotlin não compilou aqui e nada rodou em aparelho. Quem prova é o Q6 do Foxxy: o
diálogo aparece e, depois do OK, a captura liga.

**Regressão dirigida** (`5e3dfc1`; o diff desde `df481bd` não toca servidor, plataforma, lab, deploy,
migration nem apps): **13 executados = 12 PASS + 1 FAIL_PREEXISTENTE + 0 FAIL_NOVO**. PASS: typecheck,
`build:platform`, `test:entregas` inteira, android 40, device-api 40, `rider-bridge` 27/27, platform
44, skills, visual-order, m1-bridge, ensaio 39/39 e a suíte adversarial 26/26 (4 + 21 + 1, zero
cegas). FAIL_PREEXISTENTE: governança (G6b, G9), saída idêntica à de `df481bd` fora o cabeçalho.

## 14 — Foxxy: Kotlin, Room e recuperação de sync provados (2026-09-30)

A bancada Android finalmente atravessou a fronteira que as §§9–13 mantinham aberta.

**Ambiente observado:** emulador Android `sdk_gphone64_x86_64` no Foxxy, pacote
`br.com.tata.entregas.debug`. Isto prova Android real da bancada; **não** é ainda aparelho físico
de motoboy nem promoção de produção.

### 14.1 Captura nativa → Room

O helper debug de localização recebeu permissão de mock do Android e o Google Play Services confirmou:

- `setMockMode success`;
- `setMockLocation success`;
- `TripLocationService.onLocationResult count=1`.

A checagem antiga que aparentava Room parado em 1–3 estava lendo uma cópia estática em
`Temp/q018-room-summary/entregas.db`. A leitura correta passou a copiar **DB + WAL + SHM vivos**
via `run-as`. Nela, os pontos 4 e 5 já existiam e o contador persistente já estava em 5.

A sequência avançou depois até **10**, sem reciclagem. Os pontos 4–7 atravessaram
`Fused → callback → CanonicalPoint → Room → SyncWorker → runtime crítico`. O PostgreSQL registrou
nova `device_session_issued` para `dev-59e44fa2df6d4ffa` em **2026-09-30 05:59:30 -03**, e o
token local foi renovado. Os pontos mock foram recusados pelo servidor com o motivo esperado:
`localização simulada em lote real`.

Portanto:

`CAPTURA NATIVA → PERSISTÊNCIA LOCAL → AUTENTICAÇÃO → HTTPS → INGESTÃO` = **PROVEN na bancada**.

### 14.2 Defeito encontrado: starvation por backoff

A falha restante não era captura. O `entregas-sync-now` antigo combinava:

- `ExistingWorkPolicy.KEEP`;
- `Result.retry()`;
- backoff **exponencial**.

Depois de falhas transitórias, o WorkManager chegou a `runAttemptCount=10` no imediato
(~40 min de espera observada) e 11 no periódico (~4 h 27 min observadas). Um ponto novo chamava
`requestNow()`, mas `KEEP` preservava o job antigo em backoff: dado seguro, recuperação atrasada.

### 14.3 Correção

`SyncWorker` passou a:

1. usar nomes `entregas-sync-*-v2`, cancelando os jobs legados para não herdar backoff antigo;
2. manter `KEEP` no imediato, evitando cancelar uma sincronização já em curso;
3. usar backoff **linear** (15 s imediato; 30 s periódico);
4. limitar a janela transitória a **3 execuções rápidas**. Na terceira falha o WorkManager recebe
   `success`, mas o item **continua `failed` no Room**. O próximo ponto ou o periódico de 15 min
   abre uma janela nova.

O teste `SyncRetryPolicyTest` trava os limites e os nomes v2. A suíte local Android ficou
**41 testes, 0 falhas, 0 erros, 0 ignorados**, e `assembleDebug` ficou verde.

### 14.4 Prova adversarial do scheduler

Com o TLS crítico da bancada deliberadamente fora do ar:

- ponto **8**: três `ConnectException`; permaneceu `failed`, `attempts=3`;
- o job v2 terminou `SUCCEEDED` após a terceira execução — não ficou em backoff crescente;
- o job periódico legado apareceu `CANCELLED`.

A primeira tentativa de restaurar o TLS estava incompleta; por isso o ponto 9 também fechou uma
janela de três falhas. Isso foi mantido como evidência, não contado como recuperação.

Depois de validar `GET /health = 200` no host e TCP `10.0.2.2:8080` no Android, o ponto **10**
foi inserido. Ele criou **um novo `entregas-sync-now-v2` imediatamente** e a mesma execução drenou:

- ponto 8 → `rejected`, `attempts=7`;
- ponto 9 → `rejected`, `attempts=4`;
- ponto 10 → `rejected`, `attempts=1`.

Os três receberam somente a recusa esperada para mock. O contador persistente ficou em **10** e o
novo WorkSpec `97c538ac-1335-41d3-828b-3cb5a919a7c5` terminou `SUCCEEDED`.

**Conclusão desta subprova:** uma indisponibilidade passada não bloqueia mais um fato novo por dezenas
de minutos. A fila continua durável e a recuperação abre uma janela fresca quando surge novo trabalho.

### 14.5 Limites atuais

- O Foxxy é emulador, não aparelho físico de motoboy.
- Nenhum GPS de produção foi ativado e nenhum deploy/promoção foi feito.
- A sonda temporária `DEBUG_SEED_PENDING_GPS` usada só para a prova foi removida; o APK debug limpo
  foi recompilado e reinstalado. O helper `DEBUG_MOCK_LOCATION` também foi removido da fonte e do APK instalado; o pacote instalado não expõe `MockLocationReceiver`.
- A hipótese de que a UI pudesse iniciar `TripLocationService` sem `trip_id` na reconciliação foi
  reavaliada e **não se sustentou**: não existe ocorrência observada de `intent sem trip_id` no histórico
  da bancada; `captureDecision` só autoriza captura com viagem válida e devolve seu `trip_id`; a ponte
  Kotlin ignora `null`/vazio; e `test:entregas:rider-capture` passou **38/38** na árvore atual. Portanto,
  não há defeito aberto comprovado nessa rota.

## 15 — Fecho final do Android em emulador (2026-09-30)

Depois da remoção completa de `DEBUG_MOCK_LOCATION` / `MockLocationReceiver`, a suíte instrumentada foi executada novamente sobre o APK final de debug no AVD Android 14 do Foxxy.

Resultado observado:

- `connectedDebugAndroidTest`: **10/10 testes instrumentados PASS**;
- `BUILD SUCCESSFUL`;
- APK exercitado sem o helper temporário de mock;
- captura/persistência, sequência durável, restart, retry/sync e encerramento permanecem verdes.

**Fecho:** o checkpoint Android em emulador está tecnicamente encerrado. A bateria em **aparelho físico real** permanece separada e `NOT_RUN`; não há promoção de produção implícita neste resultado.

## 16 — Encerramento remoto sem WebView/processo da UI (2026-09-30)

### Gap medido

A reconciliação anterior dependia da rider-mobile viva ou reaberta. Com a página/processo mortos, o `TripLocationService` podia ser recriado por `START_REDELIVER_INTENT` e recuperar `active_trip_id` do Room, mas não tinha canal autoritativo para saber que a viagem havia sido encerrada no servidor.

### Solução implementada

- o piloto continua sendo a autoridade da viagem; não foi criada segunda máquina de estados;
- o Android continua usando somente sua credencial própria de aparelho; nenhuma credencial humana foi adicionada ao Room;
- a plataforma expõe `GET /api/device/identity`, que apenas atesta Bearer, expiração, cadastro e revogação;
- o piloto expõe `GET /api/device/capture-state?trip_id=...`; ele encaminha o Bearer à plataforma e, após identidade válida, lê a viagem no mesmo `TripRepository` usado pelos comandos;
- estados que mantêm captura: `em_rota`, `retornando`, `sem_atualizacao`;
- `encerrada`, `preparando_saida`, viagem ausente ou reatribuída produzem decisão de parar;
- identidade sem `actor_id`, timeout, 5xx ou indisponibilidade produzem UNKNOWN/KEEP, nunca falso encerramento.
### Android

`TripLocationService` inicia um loop próprio a cada 15 s enquanto há viagem ativa. Esse loop independe de callback de GPS e da WebView:

- 200 com `capture=false` → `stopBecause("viagem_encerrada_remotamente")`;
- 401 → limpa somente token de sessão, agenda renovação e mantém captura;
- 403 terminal → encerra captura;
- 4xx não terminal, 5xx, timeout, rede offline ou 200 incompleto → mantém captura.

`stopBecause()` cancela o loop, remove updates do Fused, limpa `active_trip_id`, remove foreground notification e encerra o serviço.

### Provas

- rota de identidade da plataforma: **4/4 PASS**;
- política pura piloto/identidade: **11/11 PASS**;
- piloto real + plataforma de identidade sintética via HTTP: **2/2 PASS** — viagem `em_rota` respondeu `capture:true`; depois de `CloseTripManually`, a mesma rota respondeu `capture:false`;
- política Android `RemoteCaptureControlTest`: **6/6 PASS**, 0 falhas;
- `:app:testDebugUnitTest :app:compileDebugKotlin`: **BUILD SUCCESSFUL**;
- `connectedDebugAndroidTest`: **10/10 PASS + BUILD SUCCESSFUL** no AVD Android 14;
- TypeScript `npm run build`: **PASS**.

### Fronteira

**CODE_READY + TEST_PASS local.** O APK contém o novo loop e a regressão instrumentada está verde. Ainda não foi observado em bancada o `TripLocationService` realmente cair sozinho por uma resposta remota desta nova rota com a WebView/processo mortos. Essa observação continua `NOT_RUN`; não é substituída pelos testes de política/HTTP acima. A bateria em aparelho físico real também continua separada.


## 17 — Prova runtime do encerramento remoto sem WebView (2026-10-01)

**Status: PROVEN no AVD/Foxxy.** A observação runtime que permanecia `NOT_RUN`
na seção 16 foi executada contra o piloto real do HEAD
`b954bac9f3722eba83fa44f92014a261533aa001`, em bancada isolada.

A viagem `Q018-RUNTIME-20261001` foi colocada em `em_rota`; o Android
manteve `TripLocationService` em foreground com `startRequested=true` e
notificação `foregroundId=4201`, sem Activity do TATÁ resumida. O console
então executou `CloseTripManually`; o piloto passou a devolver
`capture=false / trip_not_active`.

O Android registrou `active_trip=null` 13,286 s depois do recibo remoto.
Na verificação posterior, `TripLocationService` não existia mais em
`dumpsys`, `pidof br.com.tata.entregas.debug` estava vazio e
`cmd notification list` não tinha notificação ativa do app/ID 4201.
Instrumentation: **OK (1 test), 48,369 s**.

Evidência detalhada:
`docs/etapa-4-8/field-gate/2026-10-01-q018-remote-stop-runtime.md`.

**Fronteira atual:** a dependência da WebView para receber o fim remoto está
fechada no AVD. A bateria em aparelho físico real continua `NOT_RUN`; esta
prova não promove produção nem substitui tela bloqueada prolongada, reboot,
troca de rede, bateria e estabilidade de campo.

## 18 — Reavaliação contínua do portão durante a viagem (2026-10-01)

**Status: CODE_READY + TEST_PASS no AVD.**

O bloqueio histórico C2 foi corrigido sem transferir autoridade para a UI.
`TripLocationService` agora reavalia `GateSnapshot` em cada ciclo do controle
nativo de 15 s, antes de verificar rede. Assim, permissão revogada, localização
do sistema desligada, flag local desativada ou termo/aceite local inválido
derrubam a captura sem depender de WebView ou callback novo do Fused.

Com rede, `/api/device/capture-state` passou a exigir também os fatos atuais
do piloto: `gps_capture_enabled=true`, termo publicável e aceite do termo
vigente pelo mesmo motoboy no mesmo aparelho. Viagem ativa sem aceite devolve
`capture=false / term_not_acknowledged`; aceite em outro aparelho não libera.

Provas no Foxxy:

- política de controle: **17/17 PASS**;
- HTTP real piloto + identidade sintética: **6/6 PASS**;
- Android estrutural: **41/41 PASS**;
- consentimento nativo: **79/79 PASS**;
- `connectedDebugAndroidTest`: **10/10 PASS + BUILD SUCCESSFUL**.

Falha de identidade/rede segue `UNKNOWN/KEEP`, não vira falso desligamento.
A prova física de revogar permissão ou desligar localização no celular real
durante uma viagem continua `NOT_RUN` e pertence ao field gate físico.

Evidência detalhada:
`docs/etapa-4-8/field-gate/2026-10-01-q018-gate-reevaluation.md`.
