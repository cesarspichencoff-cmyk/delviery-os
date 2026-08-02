# Retomada — leia este arquivo primeiro

> ## ⚠ LEIA ANTES DESTE ARQUIVO
>
> **1.** `docs/product/DELIVERYOS_CANONICAL_SOURCE_INDEX.md` — o índice vinculante do produto.
> **2.** Os documentos de produto que ele indicar para a sua missão.
> **3.** `docs/auditoria/DELIVERYOS_PRODUCT_REALIGNMENT_AUDIT.md` e
> `docs/auditoria/DELIVERYOS_SOURCE_OF_TRUTH_RECOVERY.md`.
> **4.** Só então este arquivo.
>
> Esta ordem existe porque as Unidades 1 a 6 foram executadas sem o produto em contexto. Não repita.
>
> ---
>
> **ATUALIZADO 2026-08-01 — FASE DE RECUPERACAO DO PRODUTO OPERACIONAL: CHECKPOINT.**
> `DELIVERYOS_OPERATIONAL_PRODUCT_RECOVERY_CHECKPOINT` · `MACRO2_CHECKPOINT_REACHED`
>
> **Tres questoes de produto ENCERRADAS pelo Cesar. Nao perguntar de novo.**
> Elas nao criaram produto novo — confirmaram a arquitetura ja desenhada nos mapas originais.
>
> - **D45** `enrolados_quentes` = **Sushi Quentes** (subarea de Sushi) · `cozinha_quentes` =
>   **Cozinha**. O nome e de PRACA e FLUXO, nunca de temperatura. Provado item a item: os 11 itens
>   da praca cobrem exatamente a lista do Cesar (hot roll, skin, Tuna Shiso, tartar de salmao,
>   ceviche, ebiten, Hot Tata). O mapa original estava certo desde julho.
> - **D46** Sushi e **ambiente geral** com Combinados, Duplas, Enrolados e Sushi Quentes **visiveis
>   como subareas**. "Sushi carregado" nunca esconde qual subarea causa o congestionamento.
> - **D47** "so quentes" e **sinal de ROTEAMENTO**: o pedido nao passa pelo Sushi e **pode ser
>   montado na bancada do caixa**. Nao e etiqueta de temperatura e nao implica prioridade.
>
> **Cinco questoes rebaixadas** — nenhuma bloqueia a recuperacao inicial: limiar amarelo/vermelho
> (usar a calibracao real existente e validar no piloto) · Caixa (`sem medicao automatica`, **nunca
> verde**) · Conferencia (risco por pedido preservado) · duas sacolas (**so com motivo sustentado**;
> a heuristica de 47-61% nao e verdade operacional) · Odhen/Teknisa (bloqueio de **fonte externa**).
>
> **ENTREGUE nesta fase:**
> `docs/product/RECOVERY_MAP.md` — matriz de recuperacao, nomenclatura resolvida por dado, e os 22
> sinais classificados: **11 sao implementaveis hoje**, 8 dependem de fonte inexistente, 1 esta
> bloqueado por fonte externa, 1 e a funcao-mae. **Nenhum implementado ainda.**
> `docs/product/CONTRATO_CONSCIENCIA_COPILOTO.md` — quem decide o que entre Operacao Viva, motor do
> Copiloto, garantias Shadow e Conference Brain, com **10 invariantes (I1-I10)** que precisam estar
> verdes antes de qualquer conexao de runtime.
>
> **NAO ENTREGUE, e o motivo e honesto:** home operacional (R2), sinais (R4), conexao dos motores
> (R5), correcao dos rotulos do motor (R1) e Figma. A sessao chegou ao limite de contexto, e a
> propria missao manda, nesse caso, **concluir os contratos e nao improvisar**. Uma home construida
> as pressas sobre contrato nao testado reproduziria o defeito de 30,8% corrigido em `37ca1c9`.
>
> **DEFEITO REGISTRADO, NAO CORRIGIDO (R1):** `DISPLAY.cozinha_quentes = "Quentes"` no `motor.js`
> exibe a **Cozinha** com o nome que o Cesar usa para **Sushi Quentes**. Implementar ambientes antes
> de corrigir mostraria a area errada. `motor.js` e nucleo — exige gate proprio.
>
> **PROXIMA ACAO SEGURA:** R2 — a home operacional (Calmo/Ambiente/Foco + pulso) sobre o Design
> System que ja existe, seguida de R4 (os 11 sinais sustentados). **R5 so depois de I1-I10.**
> **Nada de codigo foi alterado neste checkpoint.**
>
> ---
>
> **ATUALIZADO 2026-08-01 — CHECKPOINT CANONICO DE REALINHAMENTO.**
> `DELIVERYOS_CANONICAL_REALIGNMENT_CHECKPOINT_COMPLETE` · `MACRO2_CHECKPOINT_REACHED`
>
> **PROXIMA FASE, REGISTRADA E NAO INICIADA:**
> ### FASE DE RECUPERACAO DO PRODUTO OPERACIONAL
>
> Ela devera, quando autorizada: comparar o prototipo original e a plataforma atual · definir a
> arquitetura de integracao entre o motor original e as garantias shadow · restaurar a home
> operacional · recuperar Calmo, Ambiente e Foco · recuperar os sinais e ambientes · reposicionar as
> telas da Unidade 6 · recuperar Memoria Operacional, Resolucao e Evolucao · **preservar toda a
> infraestrutura tecnica valida**.
>
> **O plano detalhado de implementacao NAO foi escrito, de proposito.**
> Pre-requisito: as 8 perguntas materiais do indice canonico §5.
>
> ---
>
> **O que este checkpoint descobriu, e por que ele existe.**
>
> O produto do DeliveryOS nao derivou por decisao de arquitetura. Ele **parou** porque **32 perguntas
> objetivas ao Cesar**, espalhadas por quatro documentos de produto, ficaram sem resposta — e
> **nenhuma delas estava registrada como bloqueio**, porque `BLOCKERS.md` so sabia representar
> infraestrutura. Em paralelo, `CLAUDE.md` §11 mandava ler apenas `docs/execution/`, que nao
> referenciava nenhum documento de produto. Quem retomava o trabalho encontrava o estado tecnico e
> **nao encontrava o produto**. Foi assim que as seis unidades foram executadas.
>
> **O produto que o Cesar descreveu ja estava desenhado.** Os 22 sinais de
> `docs/Mapa_Sinais_Operacionais.md` cobrem praca sobrecarregada (S5), so quentes (S12), duas sacolas
> (S14), itens saindo rapido (S18), pausa (S15/S17), cliente reclamando (S19) e pedido atrasado
> (S1/S3/S4). Os seis ambientes que ele nomeou — **Caixa, Sushi, Quentes, Cozinha, Conferencia,
> Motoboy** — estao em `docs/Mapa_Ambientes_V1.md`, com Verde/Amarelo/Vermelho e a regra
> *"Vermelho nunca fica escondido no Ambiente"*.
>
> **Nao havia contradicao entre o Cesar e o Manifesto.** O prototipo original (porta 5178) mostra
> `em fluxo` + dois rotulos de Ambiente + um Foco com acao, ao mesmo tempo, em 16 elementos de texto,
> **zero tabelas, zero menus, zero botoes, sem scroll**. A exclusividade de slot governa a **acao
> prescrita**, nao a visibilidade.
>
> **Achado que destrava algo parado desde julho:** a comanda **existe e e unica**.
> `docs/Auditoria_Fonte_Viva_Loja_V1.md` §10.3 confirma que o "Relatorio de Entrega" do Odhen/Teknisa
> traz os tres campos e e capturavel na fila de impressao do Windows. Duas das perguntas antigas
> (P1 e P3) ja estavam respondidas dentro do proprio repositorio.
>
> **Decisoes canonicas registradas:** D40 (DeliveryOS e a plataforma; o Copiloto e um ativo dentro
> dela) · D41 (Operacao Viva e a unica dona de Calmo/Ambiente/Foco; nada foi renomeado) · D42 (Calmo
> nao e tela vazia; nenhum problema relevante fica escondido) · D43 (**os dois motores NAO foram
> conectados**) · D44 (bloqueio de produto virou categoria de primeira classe). Licao L32.
>
> **Nada de codigo, Figma, frontend ou arquitetura foi alterado neste checkpoint.**
>
> ---
>
> **ATUALIZADO 2026-08-01 — UNIDADE 6 CONCLUIDA.**
> `PRODUCT_SYSTEM_UNIT_COMPLETE` · `MACRO2_CHECKPOINT_REACHED`
> **419 testes verdes**, `tsc --noEmit` exit 0.
> Gate: `npm run test:platform:product` (44). Ver a superficie:
> `npm run ui:product` → http://127.0.0.1:5290/
>
> **A descoberta que decidiu o desenho.** Nao existe framework frontend neste
> repositorio — `package.json` tem `pg`, `typescript`, `playwright` e `xlsx`, e
> zero arquivos `.tsx`. O frontend real e HTML/CSS/JS vanilla servido por Node.
> A Unidade 6 **estendeu** esse frontend em vez de criar um segundo, e serve
> `src/entregas/ui/shared/tokens.css` pelo **mesmo arquivo**, sem copia (D36).
>
> **O Figma NAO estava vazio, e a memoria dizia que estava.** O registro anterior
> afirmava paginas `01` e `02` vazias e 0 variaveis. O real: `01.1` e `01.2` ja
> completas e **49 variaveis**. Alguma sessao escreveu e nao registrou. O
> trabalho foi **preservado**, nao substituido; `01.3`, `01.4`, `02` inteira e
> `00.1` foram preenchidas. Hoje: 56 variaveis, 6 componentes, 4 variant sets,
> 8 telas e 10 estados essenciais (E154).
>
> **A trava que faz a interface nao mentir e de TIPO, nao de disciplina.**
> `Campo<T>` nao tem campo `valor` quando `observado === false` — nao existe
> caminho que leia um numero sem antes provar que ele foi observado (D37). E o
> servidor de apresentacao **nao tem rota de escrita para desativar**: ele recusa
> todo metodo diferente de GET/HEAD antes de rotear (D38).
>
> **O par que da sentido ao zero atravessou para a tela.** A superficie do
> Conference Brain mostra a cadeia real com **0 observacoes de pedido** e, logo
> abaixo, o **controle positivo sintetico com 1**, pelo mesmo cano. Sem o
> segundo painel, o zero do primeiro seria indistinguivel de defeito — e foi
> exatamente esse par que denunciou um defeito proprio (L31).
>
> **Tres divergencias reais entre design e codigo, achadas por teste e fechadas:**
> `text/on-dark-muted` e `line/on-dark` eram **cores diferentes** no Figma e no
> CSS; `controle` e `planejado` eram indistinguiveis em preto e branco; e as
> cores `signal/*` **reprovam em 4,5:1** como texto (3,72:1), o que criou os
> sete tokens `ink/*` — com controle positivo exigindo que `signal-calm`
> continue reprovando.
>
> **Controle adversarial: 6 mutacoes, 6 derrubaram o teste certo, 0 cegas,
> 6/6 restauradas byte a byte.**
>
> **Proxima unidade: 7.** NAO iniciada — o bloco mandava parar aqui.
>
> **O que a Unidade 6 NAO prova:** nenhuma tela mostra dado real de operacao —
> todas carregam `somente_demonstracao`. Nao ha rota de leitura para credencial,
> GPS, ultima sincronizacao nem fila do aparelho, e os cinco campos aparecem
> como `integracao pendente`. Nao ha historico em superficie nenhuma. Nao ha
> busca, filtro, permissao nem autenticacao — e **por isso** nao ha acao. A
> retirada de recomendacao continua sem UI. No Figma nao ha prototipo
> interativo nem Code Connect.
>
> ---
>
> **ATUALIZADO 2026-07-31 — UNIDADE 5 CONCLUIDA.**
> `COPILOT_SHADOW_UNIT_COMPLETE` · `MACRO2_CHECKPOINT_REACHED`
> **352 testes verdes**, `tsc --noEmit` exit 0.
> Gate: `npm run test:platform:copiloto` (39). Agregado da frente:
> `npm run test:platform:conference`.
>
> A cadeia autorizada esta provada inteira: **Operacao Viva → adapter →
> observer → conclusoes versionadas → Copiloto shadow.**
>
> **A simetria que fecha o desenho.** As duas fronteiras sao espelhos: cada
> subsistema recebe do outro um OBJETO SIMPLES, e **nenhum importa o outro em
> nenhuma direcao**. A extracao de conclusoes mora do lado do BRAIN porque e la
> que vivem `PiiGuard`, `mayAffirmOperationalLoad` e a reconciliacao — leva-las
> para o Copiloto seria reimplementa-las (D33).
>
> **A limitacao semantica atravessou inteira, sem remendo.** O adapter nao
> emite pedido (D29) → o Brain nao tem observacao de pedido vinda dali →
> nenhuma conclusao `order_dimension` nasce → **a cadeia real e
> estruturalmente incapaz de gerar recomendacao de pedido hoje.** Ela gera
> recomendacao de FONTE, e so. Nenhum `trip_id` chega ao Copiloto.
>
> **Dois eixos que nao compartilham campo** (D34): `status` e ciclo de vida,
> `evidence_grade` e qualidade da evidencia. `insuficiente` nunca e atributo de
> recomendacao que existe — e o motivo de ela nao existir, e viaja em
> `recusas`. Fundi-los repetiria o erro que o modelo multidimensional do Brain
> existe para corrigir.
>
> **Sem store paralelo** (D35): `copilot_recommendations` vive no store do
> Conference Brain e herda tudo o que ja foi provado ali. Ganho que nao estava
> no plano: as travas da Unidade 4 passaram a valer **no disco** — o schema
> recusa recomendacao de pedido sem identidade de pedido, e recomendacao de
> fonte COM identidade de pedido.
>
> **O controle adversarial acusou TRES mutacoes cegas, e as tres eram buracos
> reais.** Expiracao (o teste media invalidacao, nao validade vencida); PII (o
> observador ja sanitizava antes, o guard da conclusao nunca era exercitado);
> bloqueio de recomendacao de pedido (a garantia tem DUAS aplicacoes
> independentes, e remover uma nao muda o resultado observavel). Fechados por
> 10b, 17b e por uma fixture que isola a especie. Licoes L28 e L29.
>
> **Nada executa.** `requires_human` e literal no gerador, o estado `executed`
> nao existe, nenhum verbo de acao operacional aparece no codigo, e o schema
> recusa registro que dispense humano.
>
> **Proxima unidade: 6.** NAO iniciada — o bloco mandava parar aqui.
>
> **O que a Unidade 5 NAO prova:** nenhuma recomendacao de PEDIDO nasce da
> cadeia real; o controle positivo usa conclusao sintetica, entao ele prova que
> a ponte funciona, nao que existe fonte real de pedido. Nao ha painel —
> `paraPainel` existe no `shadow.ts` e nao foi ligado. A retirada e funcao
> pura: nao ha UI nem autenticacao para um humano retirar de verdade.
>
> ---
>
> **ATUALIZADO 2026-07-31 — UNIDADE 4 CONCLUIDA.**
> `CONFERENCE_BRAIN_UNIT_COMPLETE` · `MACRO2_CHECKPOINT_REACHED`
> Blocos 4B1 a 4B5 fechados. **149 testes da unidade, 313 verdes no total**,
> `tsc --noEmit` exit 0. Comando agregado: `npm run test:platform:conference`.
>
> A cadeia esta provada ponta a ponta contra a arquitetura atual:
> **Operacao Viva → adapter semantico → observer → nucleo multidimensional →
> store.** O gate do 4B5 tem 36 testes: os 16 itens pedidos mais 8 guardas
> estruturais que impedem a regressao em vez de detecta-la depois.
>
> **O metodo que sustenta o gate — nao remova sem entender.** Metade das
> afirmacoes do 4B5 sao ZEROS (zero pedidos, zero relogio, zero observacao sem
> identidade), e um cano entupido devolve o mesmo zero que a recusa
> deliberada. Por isso cada zero tem, ao lado, a MESMA cadeia alimentada por
> uma fonte legitima de pedido, exigindo 1 observacao e 1 `ready_observed`.
> Sem esse par, o gate inteiro passaria com o observador quebrado (L26, D32).
>
> **Defeito real encontrado e corrigido no caminho:** `put()` validava contra o
> schema e `load()` NAO. Um registro proibido acrescentado ao arquivo por fora
> — com PII — voltava inteiro na memoria no reinicio, e a saude nao acusava
> porque so contava linha ILEGIVEL. Reproduzido antes de corrigir. A carga
> agora usa o mesmo `validate()` da escrita; recusados vao para
> `health().invalid_lines`, com codigo, tamanho e hash — nunca o conteudo
> (D31, commit `a62136a`).
>
> **O controle adversarial acusou um buraco no proprio gate.** Remover a
> idempotencia da chave natural do store deixou a suite verde: os testes de
> duplicacao mediam a guarda do RELOGIO e nunca faziam dois `put` com a mesma
> chave. A garantia estava coberta — no 4B1. Um gate que se apoia no vizinho
> parece completo e nao e. Fechado pelo teste 6c (L27).
>
> **Estado honesto preservado, sem uma unica excecao:** a Operacao Viva produz
> contexto de VIAGEM; o Brain indexa por PEDIDO; `order_id` nao esta propagado
> em `ViagemAcumulada`; por isso o adapter nao emite pedido, `orders` continua
> vazio, os campos ausentes continuam declarados, e nenhuma dimensao de pedido
> foi fabricada. `available` nunca e emitido.
>
> **NAO perseguimos os 309/309 nem o 12/12.** Nada foi importado para
> alcanca-los — sem painel HTTP, sem Playwright, sem mapping mode. O
> patrimonio historico foi usado como REFERENCIA DE COMPORTAMENTO, e os riscos
> que ele cobre estao provados contra o codigo que este repositorio tem. Os
> cinco guardas historicos seguem preservados no WIP `2d298cb`, intocados.
>
> **Proxima unidade: 5.** NAO iniciada — o bloco mandava parar aqui.
>
> ---
>
> **ATUALIZADO 2026-07-31 — Bloco 4B4 CONCLUIDO. MACRO2_CHECKPOINT_REACHED.**
> `CONFERENCE_BRAIN_4B4_COMPLETE` em `fe6c2e5`. 41 testes.
>
> O risco que a forense vinha registrando desde o 4A **se confirmou, e a causa
> era mais funda que vocabulario divergente.** Nao e so que as duas listas de
> nove dimensoes descrevem coisas diferentes: **a projecao da Operacao Viva nao
> carrega identidade de pedido.** `order_id` existe no envelope
> (`contracts/event-catalog.ts:95`) e e chave de particao da outbox
> (`ingest/ingest-service.ts:131`), mas `projetar()` nao o propaga para
> `ViagemAcumulada`. O Brain indexa por PEDIDO; a Operacao Viva, por VIAGEM.
>
> Consequencia, decidida em D29: **o adapter nunca emite pedido.** `orders` e
> sempre vazio, com motivo legivel por maquina, e os dez campos que faltam
> viajam em `signals.criticalFieldsMissing` — que o observador grava em
> `live_cycle_runs.fields_missing`, deixando a ausencia no registro duravel do
> proprio Brain. O que atravessa e escopo, saude, contexto rotulado como
> contexto, inferencia rotulada como inferencia, e procedencia.
>
> A unica ponte semantica real e `integridade_sinal` -> saude da fonte (D30),
> legitima porque os dois lados falam da qualidade da OBSERVACAO. `available`
> nunca e emitido: no Brain ele autoriza afirmar carga, e esta fonte nao
> observa um unico pedido.
>
> **Proximo: 4B5 — gate adversarial do nucleo.** Nao iniciado, de proposito:
> o bloco pedia parar aqui.
>
> **O que destravaria pedido de verdade:** propagar `order_id` em
> `ViagemAcumulada` e decidir, com evidencia, o que uma viagem afirma sobre um
> pedido. E decisao de produto, nao de adapter — se um `order_id` aparecer numa
> viagem hoje, o adapter o registra em `recusas.identidade_de_pedido` e continua
> nao emitindo pedido.
>
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
