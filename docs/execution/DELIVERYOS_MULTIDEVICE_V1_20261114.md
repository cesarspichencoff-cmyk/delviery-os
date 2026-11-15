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

