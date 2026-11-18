# Delivery OS Itaim — V1 em vários aparelhos: o menor caminho a partir do que já existe (14/11/2026)

**Escopo:** código, testes e bancada no Foxxy, sobre `5afe3597` (PR #137, rascunho). No CAIXA_MOOCA só
houve **leitura** pela API de arquivo do conector remoto: nenhum processo iniciado, nenhum arquivo
gravado, nenhuma tarefa registrada. Nenhum pedido real, nenhum aparelho físico, nenhuma mudança em
proxy, firewall, banco ou conta de provedor.

## 1. O que sabemos (medido nesta data)

**O canal remoto existe.** O conector Desktop Commander lista `Foxxy` e `CAIXA_MOOCA` online, ambos na
versão 0.3.2. A cota mensal de chamadas remotas estava em **7 % restantes**: cada leitura no caixa foi
contada.

**Não existe Delivery OS hospedado em nuvem.** Leitura dos provedores da conta: o único banco Supabase
ativo é de outro produto (estoque/preços, tabelas `public.*`, zero linhas de operação); os projetos
Railway são provas antigas de outro sistema. Criar banco ou serviço hospedado continua decisão do César
(`docs/cloud/FUNDACAO_NUVEM.md` §6) e **não foi feito**.

**O sistema central já existe — no próprio caixa.** Registrado em `MOOCA_ACESSO_REMOTO_2026-10-26.md` e
`INVENTARIO_CAIXA_MOOCA_2026-11-01.md`, e reconfirmado hoje no que deu para ler sem processo:

| Peça | Estado lido em 14/11 |
|---|---|
| Pasta `C:\Users\Tata\DeliveryOS-Ensaio` | presente, com `app\`, `pgdata\`, `postgres16\`, guard do NetBird e recibo `netbird-guard-committed.json` |
| `runtime-pids.json` | `critical`, `async`, `pilot`, `pilotMode: remote-lab` — **arquivo**, não prova de processo vivo hoje |
| Origem pública do piloto | `https://deliveryos-piloto.eu1.netbird.services` responde **401** sem login do proxy, TLS válido (medido de fora) |
| Perfil dedicado do Edge | `DevToolsActivePort` presente (porta registrada) — não prova que o Edge está vivo agora |
| Pasta do observador | `C:\ProgramData\DeliveryOS-Itaim-Observer\` presente, **sem** os três arquivos do executor novo |
| Servidor de apresentação (Home) no caixa | **não instalado** (inventário de 01/11; nada lido hoje o contradiz) |

Não observado hoje: se piloto, crítico, assíncrono e PostgreSQL estão **vivos** (a listagem de
processos do conector voltou sem conteúdo e não foi repetida, para não gastar cota), o build instalado,
o estado do firewall.

**A autenticação de operador já existe, em duas camadas.** O piloto do Entregas é o único processo
exposto, atrás do proxy HTTPS do NetBird (login do proxy) e com códigos por terminal, papéis e limite de
tentativas. Há ainda o acesso individual por e-mail (`src/platform/auth/operator-*.ts`), construído em
27/10 e **nunca provisionado** no provedor.

**Vários motoboys já são suportados pelo desenho.** Cada motoboy é um usuário `motoboy_interno`; cada
aparelho é pré-vinculado pelo humano (`device_id + device_proof_sha256`); a regressão de três
identidades em paralelo existe. O que nunca rodou é aparelho físico.

## 2. A direção — uma só

**Uma origem, vários aparelhos, o caixa como fonte.** Nada de sistema novo:

```
Edge do Gestor ─ executor ─ feed ─┐                              ┌─ navegador do caixa (loopback)
Reader Teknisa ───────────────────┼─ apresentação (Home) ─ loopback ─ PILOTO ─ proxy HTTPS ─┬─ iPhone (Safari)
                                  │      só GET/HEAD, sem rede      (única porta exposta)   ├─ Android (Chrome)
celulares dos motoboys ─ HTTPS ───┴──────────────► piloto + crítico ─ PostgreSQL            └─ tablet
```

- **Fonte única de verdade:** a que já é — `platform.event_log` no PostgreSQL para Entregas, e a
  leitura do Gestor/Reader feita **na máquina onde eles vivem** (mesmo relógio). Nenhum aparelho calcula
  nada: todos leem a mesma resposta do mesmo processo.
- **Home em outros aparelhos:** o piloto serve a Home num **hostname próprio**, na mesma porta que já
  está atrás do proxy. Sem sessão, nada sai. Com código de **gerente ou líder**, abre sessão em cookie
  `__Host-`; a cada requisição o piloto confere de novo se aquele código ainda é daquela pessoa naquele
  papel. Só GET/HEAD segue para o loopback, sem cookie nem credencial do visitante. A apresentação não
  ganha porta de rede, nem código de autenticação.
- **Recusado:** Cloudflare Tunnel/Access e Tailscale (outro agente no caixa, outra conta, e o NetBird já
  está lá, protegido por guard); abrir a 5290 na rede (a apresentação não sabe quem pede); montar a Home
  num prefixo do piloto (a interface usa caminhos absolutos — exigiria reescrever o que está aprovado);
  hospedar em nuvem agora (decisão de custo e de credencial que é do César, e que não é pré-requisito
  para ver a V1 funcionar).

Decisão registrada como **D99** em `DECISIONS.md`.

## 3. O que foi construído e provado hoje (sintético)

| Peça | Arquivo | Prova |
|---|---|---|
| Porta de operador da Home | `src/platform/auth/home-operator-gateway.ts` | `npm run test:home:gateway` → **14/14**, HTTP e sockets reais |
| Ligação no piloto (21 linhas) | `tools/entregas_pilot_server.ts` | desligada sem `ENTREGAS_HOME_PUBLIC_URL` + `ENTREGAS_HOME_UPSTREAM`; parcial ou insegura derruba o boot |
| Cadeia com processos reais | `src/platform/run-home-multidevice-chain-tests.ts` | `npm run test:home:multidevice` → **11/11**: executor real → apresentação real → piloto real → "caixa", "celular" e "tablet" |
| Mutações | `tests/home-gateway/run-home-gateway-mutation-tests.cjs` | **25/25 mortas, 0 cegas** (22 na porta, 3 na ligação) |
| Navegador real | `labs/home-multidevice/browser-proof.cjs` | **NOT_RUN no Foxxy** (ver §4); roda na CI |
| Preparação do caixa | `tools/windows-local-lab/preparar-feed-do-gestor.ps1` | ensaiada no Foxxy em pasta de laboratório: download no commit fixado, 3/3 blobs conferidos, idempotente, recusa arquivo adulterado; **registro da tarefa NOT_RUN** |

O que a cadeia mede: sem código ninguém vê a operação; motoboy e caixa de expedição não entram na Home;
os três aparelhos veem **os mesmos pedidos, itens, opções e observações**, marcados como demonstração;
pedido novo e quantidade alterada chegam a todos; **fonte parada → todos passam a "Sem leitura"**, sem
pedido antigo na tela; a leitura volta sem novo login; apresentação morta → `apresentacao_indisponivel`,
nunca tela velha; o limite de tentativas do piloto vale na entrada da Home e não derruba quem já entrou.

Guardas vizinhas depois da mudança: observador da fila, M1 (40), R5A, R5B, R5D1, operador-piloto (9),
produto (53) e governança verdes. `npm run test:platform` segue com **1 falha anterior** (`pilot-delegation-issuer.ts`,
arquivo de 13/10, não tocado aqui).

## 4. O que é hipótese e o que NÃO foi provado

- **Hipótese central, não testada:** o proxy do NetBird entrega ao piloto o `Host` do segundo serviço.
  A porta escolhe a Home pelo `Host`. Se o proxy reescrever o cabeçalho, a Home não abre (falha fechada:
  quem pede cai no piloto, que não entrega pedido). Só o proxy real responde.
- **Navegador real:** no Foxxy o antivírus intercepta HTTPS e bloqueia o certificado de bancada; não foi
  contornado. A prova foi escrita para a CI (Edge em runner Windows) — resultado na §8 quando houver.
- **Safari no iPhone, Chrome no Android, Wi-Fi e rede móvel:** nada medido. Não há WebKit na bancada.
- **Caixa:** nenhum código novo instalado; nenhuma tarefa registrada; nenhum processo iniciado.
- **Pedidos reais:** nenhum passou por este caminho. O executor do Gestor continua sem rodar no caixa.
- **Quando o caixa ou a internet dele cai:** os aparelhos de fora recebem erro do proxy, não a tela de
  "sem leitura". Fora do alcance desta arquitetura enquanto o caixa for o hospedeiro.
- **Tela de entrada:** funcional, com as cores do organismo, **sem passar por desenho**. Não é V3.3.
- **Sessão:** vive na memória do piloto; reinício exige entrar de novo. Sem aviso na Home quando a
  sessão vence no meio do uso (a interface aprovada não foi alterada): a tela mostra falha de leitura
  até recarregar.
- **Entregas multiaparelho:** ver o relatório da frente Android (§7).

## 5. Riscos

| Risco | Tamanho | Contenção |
|---|---|---|
| Home exposta a quem tem o login do proxy mas não é operador | alto se a porta falhar | sessão exigida antes de qualquer byte; 25 mutações; falha fechada |
| Código curto por terminal (4 dígitos, decisão de 31/10) adivinhado | médio | limite de 5 erros / 15 min por origem — **mas atrás do proxy toda a rede sai de 2 origens**: um ataque trava a entrada de todos (quem já entrou segue). Recomendo código longo para gerente/líder antes de abrir a Home |
| Carga da Home no computador do caixa | baixo, não medido | só leitura; medir CPU/memória no ensaio |
| Janela visível no caixa ao instalar | **não aceito** | `start_process` remoto segue bloqueado (decisão de 09/11); ver §6 |

## 6. O que depende do César — pedido objetivo

**(a) Um comando no caixa, com você presente** (ou a sua autorização expressa para eu dispará-lo pelo
conector, aceitando o risco conhecido de uma janela do PowerShell aparecer por instantes):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File preparar-feed-do-gestor.ps1 -Mode Stage
```

- **Efeito:** grava três arquivos conferidos em `C:\ProgramData\DeliveryOS-Itaim-Observer\` e registra a
  tarefa `DeliveryOS-Itaim-Gestor-Demand-Feed` **desativada**. Zero processo iniciado; nada toca Edge,
  Gestor, Reader, pedidos ou impressão.
- **Reversão:** o mesmo script com `-Mode Rollback` (remove a tarefa desativada e os três arquivos).
- **Por que não fiz sozinho:** a API de arquivo do conector não transfere 49 KB de código com garantia
  byte a byte (o conteúdo passaria por mim, sem conferência de hash do outro lado), e registrar tarefa
  exige um processo. O script baixa do repositório público no commit fixado e confere cada arquivo.

**(b) Instalar o candidato (piloto com a porta da Home + apresentação) em pasta própria no caixa** —
é a autorização nº 1 do `ENSAIO_SUPERVISIONADO_V1_2026-11-01.md`, agora com a Home incluída. Efeito e
reversão estão naquele documento; nada muda nele além de duas variáveis de ambiente do piloto.

**(c) No painel do NetBird:** um segundo serviço HTTPS (hostname novo) apontando para o **mesmo** destino
do atual (`100.107.78.202:5193`). Sem regra nova de firewall: mesma porta, mesmos dois proxies.
Reversão: apagar o serviço.

**(d) Códigos de gerente e de líder** para quem vai abrir a Home no celular — recomendo longos.

**(e) Rede dos motoboys** — decisão que é sua, e a única que ainda separa o Entregas de "qualquer
celular na rua": hoje o plano de 01/11 põe cada celular como *peer* do NetBird (app e inscrição por
aparelho). A alternativa é um serviço do proxy **sem** login do proxy só para as rotas de aparelho, que
têm autenticação própria (token de aparelho + pré-vínculo + delegação assinada). A primeira exige
configuração em cada celular; a segunda expõe rotas autenticadas à internet. Não decidi por você.

## 7. Roteiro da homologação conjunta — tudo `NOT_RUN`

| # | Passo | PASS quando |
|---|---|---|
| H1 | Inventário somente leitura do caixa, antes | retrato gravado; guard `Verify` verde |
| H2 | Executor do Gestor habilitado | em 10 s existe o feed com `source_mode: "real"`; nº de pedidos = cartões na tela; nenhuma janela |
| H3 | Home no navegador do caixa | pedidos reais do Itaim com itens, opções e observações; "Leitura parcial" |
| H4 | Home no iPhone (Safari), rede móvel | login do proxy → código → mesma lista do caixa, sem rolagem lateral |
| H5 | Home em Android (Chrome), Wi-Fi e depois rede móvel | idem; os três aparelhos com a mesma lista no mesmo minuto |
| H6 | Pedido novo no Gestor | aparece nos três em até 15 s |
| H7 | Edge do Gestor fechado / minimizado por 10 min | os três mostram retenção e depois "Sem leitura"; nenhum pedido antigo como atual |
| H8 | Código revogado (reinício revisado do piloto) | o aparelho cai para a entrada na requisição seguinte |
| H9 | Dois Android, dois motoboys, duas viagens simultâneas | cada um só vê e só envia a própria viagem; console e Home mostram as duas |
| H10 | GPS real, estados e recibos | pontos de A só na viagem de A; recibo na tela de cada aparelho |
| H11 | Um aparelho em modo avião por 10 min e de volta | fila local envia sozinha; zero duplicata no `event_log` |
| H12 | Silêncio do caixa durante tudo | nenhuma janela de CMD, PowerShell ou Edge; operador do caixa confirma |
| H13 | Reversão e inventário depois | igual ao de antes; guard `Verify` verde |

Aceite é do César, com a operação usando. CI verde, emulador e bancada não contam como aceite.

## 8. Continuação de 14/11 — CI e a frente Entregas multiaparelho

**CI em `ed47d6b9`** (primeira com a porta de operador): Gestor→Home, fixture silenciosa e Room Recovery verdes;
quatro jobs vermelhos.

| Job | Causa | Situação |
|---|---|---|
| Home multiaparelho / porta-e-cadeia | guarda M1 em clone raso — reproduzido aqui com `git clone --depth 1` (5 falhas C2/C3) | `fetch-depth: 0`; aguardando CI |
| Home multiaparelho / navegador-real | **defeito da própria prova**: `fetch()` disparado da página de entrada, cuja CSP é `default-src 'none'` | sonda pela pilha HTTP do navegador; aguardando CI |
| Android HTTPS ponta a ponta | **não lido** (log exige credencial); nenhum arquivo Android mudou entre `adbdf0a1` (verde) e `ed47d6b9` | tratado como intermitente **sem prova**; próxima CI é a segunda amostra |
| Android WebView, API 34 | idem; a API 29 do mesmo run passou | idem |

**Frente Entregas (integrada no merge `7608a207`).** Dois aparelhos lógicos pré-vinculados a dois motoboys, um
terceiro nunca autorizado, duas viagens ao mesmo tempo, contra os binários de `dist/` e PostgreSQL real:
`src/platform/run-cadeia-multiaparelho-tests.ts` → **13/13** (refeito aqui contra PostgreSQL 18 local); mutações
`run-cadeia-multiaparelho-mutation-tests.ts` → 8, nenhuma cega (medido pela frente). Provado: sessões e claims
próprias; envios simultâneos sem mistura de aparelho, motoboy, viagem e sequência; aparelho sem rede não atrasa o
outro e volta com os pontos marcados offline; reenvio simultâneo não duplica; token e segredo de um não valem pelo
outro; não autorizado fica de fora; revogar um não toca o outro. Dois emuladores Android 14 ao mesmo tempo contra
um laboratório HTTPS (`LAB_HTTPS_SCENARIO=two-riders`): 4 rodadas verdes no Foxxy, **fora de workflow**.

**Lacuna aberta X1 — posse da viagem.** O aparelho de A, autenticado, consegue gravar posição na viagem de B.
Registrada em `BLOCKERS.md` com a direção proposta (concessão assinada pelo piloto na saída). É a próxima
correção de código antes de dois motoboys reais na rua.

**Não provado:** aparelho físico, fabricantes, economia de bateria, rede móvel, imagem de outra API no emulador
(só há a 34 no Foxxy). A frente parou no limite do modelo dela antes do roteiro de N aparelhos e do levantamento
de instalação em outros Android; esses dois itens seguem **abertos**.

**Achado do navegador real (CI, Edge em runner Windows), corrigido.** O login pela porta de operador era recusado
com 403 em navegador de verdade: a página de entrada declarava `Referrer-Policy: no-referrer`, e com essa política o
navegador manda `Origin: null` no POST do formulário — a conferência de origem recusava toda entrada. Nenhum teste
HTTP pegava isso, porque o cliente de teste mandava o `Origin` à mão. Diagnóstico lido na anotação do job
(`403 POST /entrar` duas vezes, página na entrada com o aviso de origem). Corrigido para `same-origin` (para fora
do site continua sem mandar nada); a suíte da porta agora exige o cabeçalho e recusa `Origin: null`; mutação G23
(volta a `no-referrer`) morta — **26/26, 0 cegas**. A conferência de origem não foi afrouxada.

**Android HTTPS ponta a ponta:** vermelho de novo em `a5310d5f`, verde em `f3673938` e `fb1e7c53`, sem mudança
Android entre eles — intermitente, com causa não lida (log exige credencial). Registrado, não atribuído.

**CI em `564bdac0`: os seis workflows verdes**, inclusive a Home em Edge real pela porta de operador (celular e
desktop) e os dois labs Android. A linha "Navegador real — NOT_RUN no Foxxy; roda na CI" da §3 fica provada na CI;
Safari, aparelho físico, rede móvel e proxy real seguem sem prova.

## 9. Missão final (14/11, noite) — X1 fechada, conectividade decidida, caixa ainda sem execução

| Item | Estado | Prova |
|---|---|---|
| X1 — posse da viagem na ingestão | **TESTE_PASS** (bancada, PostgreSQL 18) | concessão 23/23; piloto 8/8 + 6; rota delegada 6/6; dois motoboys 14/14; mutações 18/18 + MA8/MA9 |
| App guarda e anexa a concessão | **TESTE_PASS** (JVM) | 310/310 no `testDebugUnitTest`; labs instrumentados não rodados |
| Teto de corpo do piloto (1 MiB) | **TESTE_PASS** | rota delegada 6/6 |
| Conectividade dos motoboys | **CÓDIGO_PRONTO parcial** — decisão D101 | pré-requisitos de exposição listados na D101; três ainda abertos |
| Preparação do caixa | **NÃO EXECUTADA** | rota invisível provada só no Foxxy; ver §10 |
| Labs Android intermitentes | **causa não lida** | anotação pública sanitizada acrescentada; a próxima falha fica legível |

Separação exigida: nada aqui é INSTALADO, CAMPO_COMPROVADO ou ACEITE_HUMANO. Três motoboys e cinco simultâneos foram exercitados só
até dois aparelhos lógicos com processos reais; o limite de cinco não foi medido.

## 10. O que depende do César

1. **Preparação do caixa (já autorizada em tese, sem execução):** a única rota medida como invisível é a do conector, e foi medida no
   Foxxy, não no caixa. Recomendo: você roda no caixa, com a operação parada, `powershell -NoProfile -ExecutionPolicy Bypass -File
   preparar-feed-do-gestor.ps1 -Mode Stage` (grava três arquivos conferidos, registra a tarefa DESATIVADA, não inicia nada; reverte
   com `-Mode Rollback`). Alternativa: autorizar UM disparo pelo conector num horário sem atendimento, com o medidor de janelas rodando
   antes, aceitando que a prova invisível do Foxxy pode não valer no caixa.
2. **Serviço de campo no NetBird (D101):** criar o serviço com `/` em Block e a lista fechada em Bypass — só depois dos três
   pré-requisitos abertos da D101.
3. **Códigos longos** para gerentes, líderes e motoboys (revê a decisão de 31/10 de quatro dígitos), por causa da exposição.
4. **Dois Androids físicos de pessoas diferentes** ligados ao Foxxy para começar a homologação; nenhum aparelho estava conectado.

## 11. Portão de campo e o que muda na superfície pública (14/11, noite)

| Item | Estado | Prova |
|---|---|---|
| Portão de campo (`src/platform/campo/portao-de-campo.ts`, binário `start:campo`) | **TESTE_PASS** | 10/10 com processos reais; mutações 10/10 |
| Piloto: só motoboy pela porta de campo | **TESTE_PASS** | mesmo código de gerente: recusa idêntica ao código errado; snapshot 403 |
| Composição oficial com a concessão | **TESTE_PASS** parcial | deploy-audit 30/30; PB19 verde; testes de container não rodados (sem Docker) |
| Home em WebKit com perfil de iPhone | **na CI** | job novo `navegador-webkit-iphone`; motor do Safari, não Safari num iPhone |
| Fila offline de ações no caixa | **BLOQUEADO por configuração** | piloto em PostgreSQL recusa lote nativo; ver `BLOCKERS.md` |

Com o portão, a configuração do NetBird fica simples: **um** serviço novo, sem login do proxy, com alvo único no portão (IP do `wt0`,
porta nova). A regra do guard precisa liberar essa porta só para os dois proxies — mesma forma da regra da 5193.

**Pré-requisitos da D101 agora:** X1 ✔ · teto de corpo ✔ · só motoboy no campo ✔ · portão/encaminhador ✔ (em bancada) · códigos
longos ✘ (decisão do César) · limite de tentativas atrás do proxy ✘ (todos chegam de 2 origens; com códigos longos o risco cai) ·
confirmar na conta real que o serviço sem login aponta para o portão ✘.

**CI em 90c807c4/286f2bd3:** seis workflows verdes, inclusive a Home em Edge e em WebKit com perfil de iPhone 13 e os labs Android. No workflow da X1, todas as asserções passaram no Linux; caíram a limpeza da rota delegada (piloto filho sem grupo próprio) e a mutação C9 (camada redundante por desenho) — ambas corrigidas no commit seguinte, CI a reler.

**CI em `19bea59a`: 7/7 workflows verdes** — X1 (com PostgreSQL e mutações), portão de campo (com mutações), Home em Edge e em
WebKit/iPhone 13, Gestor→Home, fixture silenciosa e os três labs Android. Continua sem prova de campo: caixa, celulares físicos,
proxy real, Safari num iPhone de verdade.

## 12. Caixa — preparação feita (15/11, ~23:57 no relógio do caixa)

Três arquivos do executor conferidos por blob em `C:\ProgramData\DeliveryOS-Itaim-Observer\` e a tarefa
`\DeliveryOS-Itaim-Gestor-Demand-Feed` registrada **desativada** e nunca executada; recibo `gestor-demand-feed-stage-receipt.json`.
Nenhum processo do produto iniciado. Medidor de janelas no próprio caixa: nenhuma janela nem troca de foco durante a execução; os
eventos registrados antes e depois são de uma pessoa usando o computador. A 1ª tentativa falhou sem efeito colateral (o Agendador
recusou o XML); a correção foi reproduzida no Foxxy e publicada (`0103ad23`). Reversão: `preparar-feed-do-gestor.ps1 -Mode Rollback`.

Decisões do César em 15/11 registradas como **D102**.

## 13. Instalação do candidato — autorizada em 15/11, parada antes da troca

César autorizou instalar o candidato no caixa. A troca NÃO foi feita: a cota do conector remoto caiu para **2%**. Trocar os
processos do ensaio com verificação e reversão pede de 8 a 10 chamadas supervisionadas; sem cota no meio, o caixa ficaria com o
ensaio parado e sem como reverter remotamente.

Pronto e ensaiado no Foxxy: `tools/windows-local-lab/preparar-candidato-v1.ps1 -Commit <sha>` — baixa o commit publicado,
confere a raiz do zip, roda `npm ci` e a compilação numa pasta NOVA (`C:UsersTataDeliveryOS-Ensaio-V1`), confere o carimbo e
grava recibo; não toca processo, porta, firewall nem banco; reverter = apagar a pasta. Medido: 65 s, idempotente, recusa outro commit.

**Conflito com a decisão de 15/11 (códigos de 4 dígitos):** o piloto já RECUSA subir em modo remoto com código de menos de 24
caracteres (`cloud-config.ts`, decisão de 01/11: código curto só no próprio caixa). Pela porta de campo o piloto roda em modo
remoto; logo, os motoboys precisam de código longo lá, ou essa trava precisa ser revista explicitamente.

**Ainda impede o GPS de campo, independente da instalação:** o termo de localização do caixa não é publicável (decisão do César).

## 14. Missão mestre (15/11, madrugada) — candidato preparado no caixa, troca não feita

Correção da seção 13: o destino é `C:\Users\Tata\DeliveryOS-Ensaio-V1`.

- **Executor do Gestor:** reverificado só lendo; continua como em §12 (FACT).
- **Script de preparação endurecido** (`0359e304`): cada arquivo conferido pelo blob do Git contra a árvore fixada (`-Tree`, tirada
  do git local e cruzada com a API); tudo ou nada por rename; prioridade baixa; tempo máximo com encerramento da árvore de
  processos; uma execução por vez; modos Verify e Remove. Foxxy: 18/18 casos negativos; lançador pelo conector sem janela
  (medidor 0, controle positivo 1) (FACT, TEST_PASS).
- **Caixa:** candidato `0359e304` preparado em pasta isolada em 52 s; Verify no próprio caixa verde; medidor 300 s: 0 janela, 0
  troca de foco; 0 processo, porta, tarefa ou firewall alterado (FACT, STAGED). Nenhum processo do ensaio foi tocado.
- **Migrations idênticas** entre o app ativo (`be5a3e3`) e o candidato: a troca não migra e a volta encontra o mesmo schema (FACT).
  O que o banco do ensaio aplicou não foi lido (UNKNOWN).

A troca de processos (crítico, assíncrono e piloto do ensaio para o candidato) **não está autorizada** pela missão mestre e não foi
feita. A cadeia supervisionada para fazê-la, com reversão local, é a próxima seção.

## 15. Cadeia supervisionada de ativação — pronta e ensaiada, não executada no caixa

`tools/windows-local-lab/ativar-candidato-v1.cjs` (`68db4e47`). Comandos: `plano` (só lê; testa a configuração do candidato com os
carregadores reais dele, sem porta nem conexão), `segredos` (cria o segredo da concessão de viagem sem imprimir), `ativar` e
`reverter` (exigem `--autorizacao "<quem e quando>"`, gravada no diário) e `estado`. `ativar`/`reverter` entregam o trabalho a um
executor destacado: se a conexão remota cair, ele termina sozinho — conclui ou reverte. A reversão usa os lançadores da própria
pasta ativa (`local-control.cjs start` e `switch-pilot.ps1 -Mode Remote`), os mesmos que puseram o caixa no estado de hoje.

Escopo da troca: só os três processos do ensaio, mesmo endereço, porta e modo de teste. Muda o código (X1, restrição de papel do
campo) e o armazenamento do piloto (arquivo novo, D102). **Não** faz migration (idênticas), firewall, NetBird, portão de campo,
Home por hostname, GPS, pedido, impressão, Edge nem Reader. A delegação `pt1` fica desligada no caixa (o crítico é `http` local); a
concessão chega ao app pelo `capture-state`.

Bancada no Foxxy com a topologia do caixa: **13/13**; piloto fora do ar 1,2 s; reversão 6,5–6,8 s; pelo conector, com medidor:
0 janela. Dois defeitos achados e corrigidos antes da contagem (pipe herdado pelo processo destacado do lançador antigo; despacho
concorrente trocando o pedido pendente). Achado à parte: um `run-portao-de-campo-tests.ts` de 14/11 ficou vivo com o piloto dele
(porta 56844) até hoje — encerrado; a causa da execução presa não foi investigada.

**Roteiro no caixa, quando o César autorizar (Q-029):**

1. `baixar-fixado.ps1` traz `ativar-candidato-v1.cjs` do commit publicado, conferindo o blob, para `C:\Users\Tata\DeliveryOS-Ensaio-V1\`.
2. `node ativar-candidato-v1.cjs segredos` e `node ativar-candidato-v1.cjs plano` — precisa sair `"pronto": true`.
3. Medidor de janelas `-PermitirCaixa` ligado; `node ativar-candidato-v1.cjs ativar --autorizacao "<texto do César>"`.
4. `estado` até `ATIVO` (ou `REVERTIDO`, que já devolve o caixa como estava). Reverter depois: `reverter --autorizacao "..."`.

Revisão adversarial da própria cadeia (depois da contagem): o teste de porta livre ESCUTAVA no endereço do NetBird por
milissegundos — trocado por teste de conexão (nada escuta), reensaiado pelo conector: ATIVO (rota 401, /ready 200) e REVERTIDO
(rota 404, saúde 200). E a identidade dos processos depende do contexto: processos subidos pelo conector (elevado) têm o
caminho do executável ilegível para um shell comum, e o plano RECUSA (falha fechada). No caixa, plano e ativar rodam pelo
conector, o mesmo contexto dos processos de lá.

O que continua não provado: a troca no próprio caixa (tempos de lá), o piloto do candidato com o Reader real do caixa e o
banco do ensaio do caixa (o que ele aplicou de migration não foi lido).

## 16. CI do Gestor corrigida pela causa; o caixa está parado; pedido único de ensaio supervisionado (15/11)

**CI.** A falha do run 43682025339 era a asserção da linha 321 exigindo `<LogonType>ServiceAccount</LogonType>`, que o
`0103ad23` tirou do XML porque o Agendador o recusa — commit `[skip ci]`, e o XML nem estava nos `paths` do workflow. O XML
de produção não mudou. O contrato agora é medido no Agendador real (`run-task-xml-registration-tests.ps1`): SYSTEM por SID
registra como ServiceAccount; LogonType explícito e declaração de codificação são recusados. Foxxy 14/14, job Windows da CI
verde, caixa só leitura 11/11. Workflow do Gestor verde em `399dd2ca` (3 jobs). O Android HTTPS falhou no mesmo commit:
intermitência conhecida (4 de 30), uma amostra com diagnóstico, causa UNKNOWN; a anotação agora mostra a asserção.

**O caixa (FACT, só leitura).** O ensaio está parado desde 29/10 01:29: o PostgreSQL do ensaio terminou e nada voltou depois do
boot de 11/11; banco com desligamento sujo (64,5 MB). Logo, não há processo do DeliveryOS para trocar. `plano` no caixa:
`pronto: true`, linha de base **parada**. O conector roda como administrador (`CAIXA_MOOCA\Tata`).

**A cadeia** (`5a370435`) mede a linha de base. Parada: cópia a frio do banco com manifesto SHA-256 → PostgreSQL sobe →
schema conferido pelas funções do próprio candidato → crítico, assíncrono e piloto → observação. Reversão: para tudo e devolve
o diretório de dados **byte a byte**. Um **vigia** destacado reverte se o executor morrer; `recuperar` cobre os dois mortos.

**Perder a conexão ≠ executor interrompido.** Perder a conexão não afeta nada: o processo do conector termina na hora e o
executor e o vigia seguem sozinhos (medido). Executor interrompido (morto, travado): o vigia assume em ~2 s e reverte (medido
depois de subir o crítico e no meio da reversão). Os dois mortos (ex.: o Windows reiniciar no meio): nada do ensaio volta
sozinho no boot — o caixa fica parado, como hoje —, o estado fica EXECUTANDO, `plano` acusa e `recuperar` devolve o banco.

**Intocados por construção** (código lido, não suposto): a cadeia só para processos que ELA subiu (pid + executável + script +
horário); grava só em `DeliveryOS-Ensaio-V1\` e no diretório de dados do ensaio (devolvido); o piloto **lê** o Reader e nunca
escreve nele; nada de Edge, Gestor, pedido, impressão, tarefa agendada, firewall ou NetBird. Os servidores TATA Caixa RC4 QA e o
consumidor do Reader não são tocados (não passam na identidade).

### Pedido ao César (um só)

**Ensaio supervisionado curto no caixa:** subir o PostgreSQL do ensaio e o candidato `0359e304`, observar, e reverter com
comprovante de restauração. Sem migration, sem firewall, sem NetBird, sem GPS, sem tarefa.

- **Janela proposta:** madrugada, com o caixa sem uso e a loja fechada — por exemplo entre 03:00 e 05:00. O horário de
  funcionamento da loja não está no repositório: **a janela é sua**. Em 15/11 às 01:38 o caixa estava sem uso; às 23:57 de 14/11
  havia alguém usando.
- **Duração:** menos de 10 minutos. Na bancada: candidato saudável 3,7 s após o início, 60 s de observação automática, alguns
  minutos de conferência (saúde, termo exigindo sessão, rota do candidato), reversão 5,9 s; no caixa, mais lento (banco de 64,5
  MB contra 48 MB, disco e CPU do caixa).
- **Indisponibilidade esperada:** nenhuma para a loja. Gestor, Reader, impressão e pedidos não são tocados. O ensaio do
  DeliveryOS já está fora do ar desde 29/10 e volta a ficar fora no fim (é o estado de hoje, devolvido).
- **Risco residual:** (1) por alguns minutos o piloto de teste volta a escutar em `100.107.78.202:5193`, o que torna o endereço
  de campo do NetBird acessível de novo — contas sintéticas de 64 caracteres, modo de teste, GPS desligado (como era antes de
  29/10); (2) carga breve de disco e CPU na cópia de 64,5 MB e na recuperação do banco; (3) se o Windows reiniciar no meio, o
  banco pode ficar alterado até alguém rodar `recuperar` (a cópia de antes fica guardada em `DeliveryOS-Ensaio-V1\`); (4) o
  candidato não tem a correção do preflight nem a do login por origem compartilhada (vieram depois) — irrelevantes para o ensaio.
- **Reversão exata:** automática em qualquer falha (executor ou vigia) e manual no fim: `node ativar-candidato-v1.cjs reverter
  --autorizacao "<texto>"`. Para os três processos que ela subiu, `pg_ctl stop -m fast`, troca o diretório de dados pela cópia
  de antes e confere o manifesto (arquivos e SHA-256 iguais); o diretório usado no ensaio fica guardado para análise.
- **Comprovante:** o `REVERTIDO` do diário com manifesto antes = depois, nenhuma porta do ensaio escutando, e o medidor de
  janelas do caixa (0 janela) cobrindo do início ao fim.

Fora deste pedido, e não feito: deixar o candidato rodando, portão de campo, NetBird, GPS real, aparelhos físicos.

## 17. Q-029 executado no caixa — candidato ATIVO no laboratório, só em loopback (15/11, 05:03 local)

- **Condição:** caixa sem entrada de teclado/mouse havia 3 h 38 min (`caixa-em-uso.ps1`), fora do horário da loja (almoço
  11–15/16:30, jantar 18–23, lido da política de serviço do próprio Reader). Medidor de janelas ligado do início ao fim.
- **1ª tentativa:** defeito real — a guarda do NetBird descarta conexão ao endereço do wt0 e o teste de porta por conexão lia
  "ocupado"; reverteu e a reversão falhou pelo mesmo motivo. Corrigido (ocupação pela tabela de escutas do sistema) e ensaiado
  9/9 na bancada; `recuperar` devolveu o banco do ensaio **byte a byte no caixa** (1412 arquivos, SHA-256 igual) em 10,7 s.
- **2ª tentativa: ATIVO** em 74,7 s (saudável em 14,5 s, 60 s de observação). Crítico, assíncrono e piloto do candidato `0359e304`
  e o PostgreSQL do ensaio escutam **só em 127.0.0.1**; nada no endereço do NetBird nem em curinga. Piloto em arquivo com recibos
  nativos duráveis (D102 resolvido no laboratório). Medidor: 0 janela.
- **Mantido ativo** pelas condições do César (isolado, sem exposição, NetBird inalterado — já não servia nada). Desligar:
  `node C:\Users\Tata\DeliveryOS-Ensaio-V1\ativar-candidato-v1.cjs reverter --autorizacao "<texto>"`.
- **Reader real, leitura passiva pelo laboratório:** 20/20 arquivos do Itaim, legíveis; **20/20 bloqueados pelo produtor** com
  código fora da lista conhecida; estado de serviço do Reader parado em 14/10. Provável (não provado): o produtor declara que não
  lê as tabelas filhas de itens e observações (PR #135). Sem isso a Home não pode mostrar produtos, complementos e observações
  reais com verdade: é mudança no serviço produtivo do Reader, fora do que posso fazer sozinho.

## 18. Entregas na Home do gerente (D103) e o que vem a seguir (15/11)

**Feito e provado (CODE_READY, TEST_PASS):** `/api/home` traz a leitura da rua da própria plataforma (a mesma da tela /entregas); a
Home desenha uma linha calma e uma dobra com cada viagem, o aparelho, o ciclo conhecido, a idade da última posição confiável e a
procedência. Viagem despachada pelo piloto chega como "na rua" (cadeia integrada 10/10). Sem banco ou com o banco fora, a Home
segue de pé e diz "indisponível". Não instalado no caixa: o laboratório de lá roda o candidato 0359e304, anterior a isso.

**Frente B — convite por QR (desenho decidido, a executar primeiro):** hoje o vínculo do aparelho é ato humano com a credencial
de dono do banco (ferramenta administrativa), e os papéis de runtime não podem vincular, por desenho. O convite que dispensa o
motoboy de digitar exige: (1) o gerente gera no piloto um convite de uso único, 10 min, preso ao motoboy e à unidade (o ato
humano passa a ser o convite); (2) o app troca o convite pela credencial do motoboy, guardada no Keystore, e registra o pedido
de vínculo com a prova do aparelho; (3) um papel novo e estreito (`deliveryos_device_binder`) grava SÓ `secret_hash` de aparelho
convidado e ainda não vinculado, nunca revoga nem troca motoboy. Isso muda a matriz de papéis mínimos (só no laboratório até
aprovação) e toca Kotlin, piloto e plataforma. Troca de celular = convite novo + revogação do antigo (já provada em A2).

**No caixa, a seguir:** ligar o source-ingest e a chave do produtor no laboratório (para o ciclo da viagem chegar à Home de lá) e
preparar um candidato novo com Entregas na Home, a correção do preflight e o login por origem compartilhada.

## 19. Pedido consolidado ao César (Q-030) — o que falta para sair do laboratório

O laboratório do candidato está ativo no caixa (só loopback, ~300 MB, CPU desprezível; desligável por `reverter`). O que segue
depende de decisão humana, em ordem de impacto no uso real:

1. **Reader (pedidos reais na Home).** Leitura passiva: 20/20 arquivos do Itaim, legíveis, mas **20/20 bloqueados pelo próprio
   produtor** (provável: não lê as tabelas filhas de itens e observações); o estado de serviço do Reader está parado em **14/10**; e
   o consumidor sombra do Reader roda a **~70% de um núcleo** desde 11/11. Recomendação: autorizar uma investigação SÓ LEITURA do
   produtor instalado (sem mudar o serviço) e, com o diagnóstico, uma mudança supervisionada fora do horário (almoço 11–15/16:30,
   jantar 18–23). Sem isso a Home não mostra produto, complemento e observação reais com verdade.
2. **Campo e outros celulares (HTTPS).** O portão de campo e a Home por hostname estão prontos e provados; falta expor pelo serviço
   do NetBird que já existe (sem porta nova na internet, sem custo). Recomendação: autorizar quando o candidato novo estiver no
   laboratório do caixa, primeiro só a Home para os gerentes, depois o campo dos motoboys.
3. **Termo de GPS.** Minuta r2, procedimento de consentimento e recomendação de retenção em `docs/entregas/pilot/` (técnica, não
   jurídica: ponto detalhado 30 dias, evento operacional 365 dias). Faltam razão social, CNPJ, canal, responsável, vigência, os dois
   prazos e a aprovação. **Duas travas antes de aprovar:** (a) nada apaga ponto de GPS hoje — o `platform.event_log` é append-only
   contra UPDATE, DELETE e TRUNCATE (lei do projeto); cumprir "apagar no prazo" exige decidir como (ex.: guardar o ponto detalhado
   fora do log append-only, ou particionar e descartar por prazo), e isso mexe na invariante — decisão sua (liga-se à Q-015);
   (b) não há retirada do aceite dentro do sistema (só desligar a permissão ou revogar o aparelho); se a base legal for
   consentimento, é lacuna (LGPD art. 8º §5º). Sem o termo aprovado o GPS real fica desligado, por código.
4. **Aparelhos físicos.** Roteiro pronto em `docs/entregas/pilot/ROTEIRO_TESTE_FISICO_V1.md`; faltam a data e os três motoboys.
5. **Convite por QR.** Exige um papel novo e estreito no banco (`deliveryos_device_binder`): no laboratório faço sozinho; no banco
   operacional, só com o cutover que você aprovar.

Sem resposta, `default_behavior: PAUSE`: nada disso é feito; o trabalho de código e de laboratório continua.

