# Primeira viagem real pela interface — identidade, motoboy e posse (31/10/2026)

Branch isolada `claude/deliveryos-v1-trip-identity-20261031`, base `5a705b5c` (HEAD da PR #126 em
29/10, CI produto `40967021522` e Android `40967021524` verdes nesse SHA). Sem merge, deploy,
instalação, aparelho, banco operacional, dado real ou mudança na loja.

## O bloqueio que estava escondido

As provas anteriores montavam viagens por HTTP com identidades escolhidas à mão
(`command_id: ct-${tripId}`, `courier_actor_id: "rid-1"`). A interface real faz outra coisa. Dirigindo
o console e a rider-mobile **reais**, no Chromium, contra o piloto real (`run-real-trip-ui-tests.ts`),
o HEAD `5a705b5c` reprovou **9 de 10** provas:

| Defeito | Onde | Efeito no piloto |
|---|---|---|
| `command_id` de contador por página (`ct-1`, `dep-1`) | `console.js`, `rider.js`, `handoff.js` | O piloto recusa `command_id` repetido no processo: o **segundo terminal** recebia `DUPLICATE_COMMAND` na primeira viagem; app reaberto tinha a saída recusada |
| Console montava toda viagem para `rid-demo` | `console.js` | Motoboy que não existe no piloto. O motoboy real nunca tinha GPS (`viagem_de_outro`) |
| Domínio aceitava motoboy agindo em viagem de outro | `application-service.ts` | Saída/entrega de uma viagem confirmada pelo motoboy errado |
| Snapshot do motoboy trazia a casa inteira | `pilot-facade.ts` | Motoboy 2 via viagem e pedido do motoboy 1, fila de prontos com rótulos de endereço, ocorrências e expedições |
| Reenvio após queda de rede gerava nova ação | as três telas | Resposta perdida + novo toque = `command_id` e `occurrence_id` novos (segundo registro) |
| Último erro da casa ia a todo terminal | `pilot-facade.ts` + `console.js` | O tablet exibia, como se fosse dele, o `DUPLICATE_COMMAND` do caixa — em código técnico |

Reprodução manual adicional no mesmo HEAD (antes da suíte): tablet monta a viagem; o caixa, com a
página recém-aberta, recebe `DUPLICATE_COMMAND`; a viagem criada fica com `courier: rid-demo`; o
motoboy `rid-1` confirma a saída dessa viagem e ela vai a `em_rota`.

## O que mudou

- **Identidade de ação** (`shared/client.js`): `newCommandId` usa `crypto.randomUUID` ou
  `getRandomValues`; sem gerador seguro, falha. `createPendingCommands` congela o corpo de cada
  intenção (command_id, ids gerados, horário do toque) até haver resposta do servidor. Sem resposta
  ou 5xx sem resultado do domínio, o toque seguinte reenvia **o mesmo corpo**. `DUPLICATE_COMMAND`
  para um reenvio é a confirmação de que já estava registrado — não erro nem segunda ação.
- **Motoboy da casa no console**: o servidor expõe `internal_riders` (só `actor_id` e rótulo, da mesma
  fonte que autentica) a quem expede. Um motoboy: já escolhido. Mais de um: o operador escolhe;
  não há padrão silencioso. A fachada recusa `CreateTrip`/`AssignInternalRider` para quem não é
  motoboy cadastrado (`UNKNOWN_INTERNAL_RIDER`).
- **Posse** (`auth.ts` `assertOwnTrip`): motoboy só age na própria viagem e no próprio estado; líder,
  gerente e sistema seguem agindo em nome dele pelo papel. Vale para `/api/command` e para
  `/api/events/batch` (recusa definitiva, sem retry).
- **Snapshot mínimo do motoboy**: só a própria viagem e o próprio estado; sem fila de prontos,
  expedições, ocorrências ou erro de outro ator. Linha do tempo de viagem alheia: 403.
- **Erro por ator**: cada terminal recebe só o próprio último erro; o console mostra o erro da
  própria ação, em linguagem humana.
- **Prova da ponte revivida**: `test:entregas:rider-bridge` estava fora de todo workflow e morta desde
  `02554be4` (arquivo de unidade declarado ausente, termo de outra unidade, limpeza antes da saída do
  piloto). Corrigido só o harness: **31/31**. O cenário E2 afirmava como esperado que um motoboy
  confirmasse a saída da viagem de outro; agora prova que ela não aparece, não sai por ele e nada liga.
  A mutação MR4 (trava `viagem_de_outro` da regra) passou ao gate da regra: no navegador essa trava
  virou a terceira camada.

## Medido (contêiner de nuvem, Node 22.22, Chromium 1243, PostgreSQL 16.15 descartável)

| Prova | `5a705b5c` (antes) | `30c7a2ea` (depois) |
|---|---|---|
| `test:entregas:real-trip-ui` (nova) | **1/10** | **10/10** `REAL_TRIP_UI_GREEN` |
| `test:entregas:real-trip-ui:mutacoes` (nova) | — | **12/12, cegas: 0** (controle + MT1–MT10 + restauração) |
| `test:entregas` (cadeia inteira) | EXIT 0, 242 linhas OK | EXIT 0, 242 linhas OK, resumos idênticos |
| `test:entregas:rider-bridge` | não sobe (boot ITAIM-only) | **31/31** (harness corrigido; E2 reescrito) |
| `test:entregas:rider-capture` | 38/38 | 38/38 |
| `test:entregas:ui` · `session` · `dispatch` | 24 · 20 · 33 | 24 · 20 · 33 |
| `test:entregas:device-api` · `pilot-gate` · `acceptance` | 50 · 15 · 45 | 50 · 15 · 45 |
| PG local: despacho canônico · cluster de dois pilotos | — | 6/6 · 6/6 (fixture antigo: `false !== true`, linha 365) |
| `build` · `typecheck` · governança · `run-sem-fail-novo` | — | verdes · 14 guardas · m1-bridge 40 PASS |

Cada mutação devolveu um defeito e foi acusada pela prova certa: contador por página → R1;
reenvio com ação nova → R6; `DUPLICATE_COMMAND` do reenvio como erro → R7; console para
`rid-demo` → R1; servidor aceitando motoboy fora do cadastro → R9; motoboy na viagem de outro → R5;
snapshot da casa inteira → R3; tela pegando a primeira viagem → R4 (snapshot forjado); erro de um
terminal em todos → R9; linha do tempo alheia → R3. A camada R4 com snapshot forjado nasceu
vermelha na primeira versão desta correção (a tela pintava antes de saber quem era o motoboy) e foi
corrigida usando o ator do próprio snapshot.

**CI no HEAD exato `a2df795d`:** produto
[41158789335](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41158789335) e Android
[41158789415](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41158789415), ambos
`success`. Conferido passo a passo (o workflow tem `continue-on-error`): passo 42 "Primeira viagem
real pela interface" e 43 "Ponte da rider-mobile" `success`; passo 14 (cluster PostgreSQL, com o
fixture novo) `success`; passo 17 (P0 idempotência HTTP) `success`; gates finais P0 `skipped`.

**Mutações antigas da ponte** (`test:entregas:rider-bridge:mutacoes`, fora do CI): **25/26, cegas 0**.
MR4 passou ao gate da regra e foi acusado. **MS4** ("caminho absoluto de configuração ignorado") é
acusado, mas não pela assinatura `term_not_publishable`: a suíte para antes, por timeout. O mesmo
acontece em `fde3af8f`, antes das correções de produto — a assinatura envelheceu nos dias em que a
suíte esteve morta. Pendente; não afrouxada.

**Demo** (`tools/entregas_ui_server.ts`): o console passou a exigir a lista de motoboys do servidor;
a demonstração declara o seu (`rid-demo`, "Carlos"). Conferido no Chromium: um motoboy
pré-escolhido, viagem montada, sem erro de script.

Reprodução: `npm run -s test:entregas:real-trip-ui` e `npm run -s test:entregas:real-trip-ui:mutacoes`
(Chromium do Playwright do projeto; no contêiner sem a revisão 1228, `PLAYWRIGHT_BROWSERS_PATH`
apontando links para a 1243).

## O que isto NÃO prova

- Nada rodou em aparelho, tablet ou caixa físicos; Chromium em contêiner não é WebView de Xiaomi.
- Não houve PostgreSQL operacional; as suítes PostgreSQL usaram cluster descartável local.
- Comandos offline nativos continuam **NOT_IMPLEMENTED** (`BLOCKERS.md` C5): o reenvio idêntico cobre
  queda de rede com a página aberta; app fechado durante a queda ainda perde a intenção.
- Em modo PostgreSQL, `/api/events/batch` segue `503 DURABLE_RECEIPTS_UNAVAILABLE` (sem recibos por
  unidade). A deduplicação legada de `command_id` é por processo: dois pilotos no mesmo banco não a
  compartilham.
- "Abrir rota" da rider-mobile procura o `order_ref`: o rótulo com endereço sai da fila de prontos
  quando a viagem nasce. Levar endereço para a viagem é decisão de dado pessoal (LGPD) do César.

## Próximo passo seguro

CI no HEAD exato desta branch; depois, com aprovação, levar o mesmo percurso ao tablet e ao Xiaomi
no laboratório Mooca: dois terminais, um motoboy, saída→chegada→entrega→retorno, com queda de rede.

## Continuação (31/10)

César respondeu "Ok pode continuar" a este relatório. Registrado como autorização para seguir na
branch isolada — **não** como aprovação de release da regra de posse nem da escolha de motoboy no
console, que seguem como decisões dele antes de qualquer merge. A continuação fechou o C5 em
`docs/execution/COMANDOS_OFFLINE_NATIVOS_2026-10-31.md`.
