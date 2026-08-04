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
> **ATUALIZADO 2026-08-03 — R5-D0-C CONCLUIDO. `R5D_BLOCKED_EVENT_LINEAGE`.**
> `DELIVERYOS_R5D0_CONFIDENCE_CONTRACT_COMPLETE` · `MACRO2_CHECKPOINT_REACHED`
> HEAD inicial `b100943`. Gate: `npm run test:platform:r5d0-confidence` — **12 testes**.
>
> **A CONFIANCA DEIXOU DE SER INVENTADA.** `Recomendacao.confidence: number` obrigatorio deu lugar a
> uma **uniao discriminada** (**D70**):
> ```ts
> | { estado: "nao_estimada" }
> | { estado: "apurada"; valor; politica; versao_da_politica; evidencias }
> ```
> **Nao foi `confidence?: number`**, e o motivo e o de sempre neste repositorio: um campo opcional
> deixaria a ausencia AMBIGUA — ninguem saberia se nao apuraram, se falhou, ou se esqueceram. Com o
> discriminante, nao estimar e uma decisao declarada.
>
> **`nao_estimada` nao e zero e nao e confianca baixa.** O ramo **nem tem campo `valor`**, entao a
> confusao e estruturalmente impossivel. Zero apurado continua legitimo e distinto.
> **`apurada` exige politica, versao e evidencias** — numero sem as tres e palpite com aparencia de
> medicao, e agora tem motivo proprio de recusa.
>
> **O DEFEITO DA HOME FOI CORRIGIDO (D71).** `home-vm.ts` fazia `severidade >= 3 ? 0.8 : 0.6` e
> apresentava aquilo como confianca observada. Nao faz mais: declara `nao_observado` com motivo, e a
> superficie **nao apresenta o campo** — mostrar um bloco de ausencia ocuparia espaco para dizer "nao
> sei" numa tela cuja regra e dar a unica coisa e esconder o resto.
>
> **O PREFLIGHT MUDOU DE FORMA, NAO DE VEREDITO.** Confianca **SUPORTADA** · validador
> **COMPARTILHADO** · linhagem **BLOQUEADA**. O preflight devolve agora **exatamente um** bloqueio:
> `event_lineage_unavailable`. Era o objetivo — sobrar um so, e ele ser o verdadeiro.
>
> **ADVERSARIAL: 8 mutacoes, 8 acusadas, 0 cegas, restauracao byte a byte.** MC5 precisou de duas
> tentativas, e a primeira e uma L39 ao vivo: ela removeu a **primeira** ocorrencia de
> `qualitative_label_not_convertible`, que e o membro da uniao de **TIPO** — o `tsx` nao avalia tipo,
> entao o mutante carregou sem alterar execucao. Corrigida para a ultima ocorrencia, acusou em C05.
>
> **REGRESSOES:** R5-A 30 · R5-B 30 · R5-C 38 · R5-D0 28 · R5-D0-C 12 · copiloto 39 · bridge 45 ·
> home 44 · organismo 27 · Product System 44 · R1 24 · ordem visual 6 · `tsc` exit 0.
> **CONGELAMENTO:** CSS, tokens de movimento, `sinais.ts`, `areas.ts` e `docs/figma/` com diff vazio.
> `home.js` e `home-vm.ts` mudaram por autorizacao explicita, e a mudanca e semantica.
>
> **RUNTIME CONFIRMADO INEXISTENTE.** Sem conexao, sem flag, sem recomendacao real. O schema do store
> **nao** mudou. **R5-D nao iniciado. D43 de pe. D29 preservada.**
>
> **PROXIMA ACAO SEGURA:** o unico bloqueio que sobra e **event lineage**. Ele exige decidir se a
> leitura operacional passa a nascer do event log — mudanca de runtime amplo, ja registrada como
> minima necessaria em `CONTRATO_LINHAGEM_EVIDENCIA.md` §2 e **nao** implementada.
>
> ---
>
> > **ATUALIZADO 2026-08-03 — R5-D0 CONCLUIDO. VEREDITO: `R5D_BLOCKED`.**
> `DELIVERYOS_R5D0_READINESS_CHECKPOINT` · `R5D_BLOCKED` · `MACRO2_CHECKPOINT_REACHED`
> HEAD inicial `27ccfd2`. **R5-D NAO iniciado, e agora com motivo tipado.**
>
> Contrato: `docs/product/CONTRATO_LINHAGEM_EVIDENCIA.md` · preflight:
> `src/product/atencao/prontidao-r5d.ts` · gate: `npm run test:platform:r5d0` — **28 testes**.
>
> **AS TRES RESPOSTAS, e duas sao NAO:**
>
> **1. De quais eventos reais virao os `input_event_ids`? — BLOQUEADO.** Existem dois caminhos:
> ```
> A  event log -> projetar() -> ViagemProjetada.eventos[] -> input_event_ids   PRESERVA
> B  LeituraOperacional -> sinaisDe() -> causa -> politica -> decidir()        NAO TEM
> ```
> O Caminho B e o que produz o **Foco**. `LeituraOperacional` (`sinais.ts:91`) **nao tem campo de
> evento**, `sinais.ts` tem **zero** ocorrencias de `event_id`, e a `Evidencia` do produto e
> `{tipo, referencia, observado_em}` — `referencia` e alvo de dominio, nunca id do log.
> **A identidade nao se perde no meio: ela nunca entra** (**D68**). A diferenca importa, porque
> "perdeu" sugere um ponto para consertar, e o que existe e uma fonte que nasceu sem o campo.
> **Todos os sinais de `sinais.ts` ficam `eligible_for_shadow: false`.** Nenhum backfill sintetico.
>
> **2. Como a confianca sera representada? — BLOQUEADO, Caso C.** `Recomendacao.confidence` e
> `number` **obrigatorio** e **nao existe politica canonica** que o produza a partir do Caminho B.
> A regra **nao foi inventada**: `ConfiancaDeclarada` tem `nao_estimada` (ausencia explicita, que
> **nao e zero**) e `apurada` com regra declarada, e `conferirConfianca` recusa regra que mencione
> **severidade** ou **rotulo qualitativo**. As tres alternativas reais estao registradas com impacto
> e risco, **para o Cesar decidir** (**D69**).
>
> **DEFEITO REAL ACHADO E NAO CORRIGIDO:** `home-vm.ts:474` faz `severidade >= 3 ? 0.8 : 0.6` —
> **severidade virando confianca**, que e a conversao que a separacao conceitual proibe. Nao foi
> corrigido porque as view models estao congeladas nesta missao. A guarda **D16** impede a regra de
> entrar no caminho novo.
>
> **3. O harness e o runtime usam o mesmo validador? — RESOLVIDO (D67).** `validarDraftShadow` mora
> em `shadow.ts`, `recomendar()` monta a candidata e **a chama**, e o tradutor **reexporta** a mesma
> referencia. A prova que texto nao daria: o teste compara **identidade de referencia** entre as duas
> importacoes — duas copias parecidas passariam em qualquer comparacao textual e falham nesta.
> Equivalencia: os **39** testes do Shadow seguem verdes, sem regra alterada, reduzida ou
> acrescentada.
>
> **ADVERSARIAL: 15 mutacoes, 15 acusadas, 0 cegas, 0 nao carregadas, restauracao byte a byte.**
> Duas rodadas. **MD12** nao aplicou na primeira — ancora em `
` contra `shadow.ts` em **CRLF**,
> L37 outra vez. **MD05** saiu cega porque a pureza do tradutor era provada no gate de R5-C e nao
> neste — **L40**: cobertura e propriedade de cada gate, nao do repositorio. O gate ganhou **D-PUR**.
>
> **RUNTIME CONFIRMADO INEXISTENTE.** Sem conexao, flag, recomendacao real, store ou evento. O
> preflight **devolve veredito e nao liga nada**. **D43 de pe. D29 preservada.**
>
> **CONGELAMENTO VISUAL VERDE.** `git diff 27ccfd2` vazio em `src/product/ui/`,
> `src/product/viewmodels/` e `docs/figma/`. Regressoes: R5-A 30 · R5-B 30 · R5-C 38 · R5-D0 28 ·
> copiloto 39 · home 44 · organismo 27 · Product System 44 · R1 24 · ordem visual 6 · `tsc` exit 0.
>
> **PROXIMA ACAO SEGURA — e ela e uma PERGUNTA, nao um bloco de codigo.** R5-D so comeca quando as
> duas respostas forem executaveis. A de confianca depende do Cesar escolher entre as tres
> alternativas da §3 do contrato. A de linhagem depende de decidir se a leitura operacional passa a
> nascer do event log — mudanca de runtime amplo, ja registrada como minima necessaria e **nao**
> implementada.
>
> ---
>
> > **ATUALIZADO 2026-08-03 — R5-C CONCLUIDO.**
> `DELIVERYOS_R5C_TRANSLATION_CONTRACT_COMPLETE` · `MACRO2_CHECKPOINT_REACHED`
> HEAD inicial `ad3b1bc`. **R5-D NAO iniciado.**
>
> Contrato: `docs/product/CONTRATO_TRADUCAO_MOTOR_SHADOW.md` · tradutor:
> `src/product/atencao/traducao-motor-shadow.ts` · gate: `npm run test:platform:r5c` — **38 testes**.
> Agregador `npm run test:platform:r5` = A + B + C, e **nao** significa R5 completo.
>
> **AS TRES INCOMPATIBILIDADES, achadas comparando os dois lados ANTES de escrever o tradutor:**
> 1. **O motor nao conhece o event log.** `input_event_ids` e a evidencia que o Shadow exige, e o
>    motor trabalha sobre a fotografia do minuto. Evidencia vem tipada do chamador **ou bloqueia** —
>    nenhuma e inventada.
> 2. **Confianca e rotulo de um lado e numero do outro**, e nao existe regra canonica ligando
>    `"alta"` a `0,9`. O tradutor **nao converte** (**D66**). Mapear seria fabricar precisao.
> 3. **O Shadow NAO TEM SUJEITO** — `recommended_action` e texto. Entao **D29 nao e protegida pelo
>    contrato do Shadow**: ela e protegida no `EscopoDoSujeito` da entrada, **antes de o draft
>    nascer** (**D65**).
>
> **RESULTADOS DISCRIMINADOS, nunca `null` ambiguo:** `traduzida` · `retida` (3 motivos) ·
> `bloqueada` (15 motivos) · `incompativel` (versao). Motivo e **enum**, nunca texto livre.
>
> **Calmo** retem `modo_sem_orientacao`. **Ambiente** retem `ambiente_informa_sem_orientar` —
> inclusive quando o chamador **diz** que a orientacao esta liberada. **So o Foco traduz**, e ainda
> assim precisa de causa coincidente, escopo valido, evidencia vinculada, procedencia estruturada,
> confianca com lastro, validade e retirada.
>
> **I1 na fronteira:** a causa da acao e conferida contra a causa do Foco — defesa em profundidade,
> que **nao substitui** `dentroDoEscopo()`. Divergiu, bloqueia, e **a causa nunca e reescrita**.
> **I2:** sem acao candidata o Foco continua **puro**; o tradutor retem sem recomendacao e **nao
> retira o Foco** — a permanencia continua sendo da politica temporal.
>
> **VALIDADE nunca reutiliza DEBOUNCE, COOLDOWN, MAXFOCUS nem STALE.** O tradutor **nao importa** a
> politica temporal, e a guarda prova isso estruturalmente **e** por comportamento.
>
> **A CADEIA ISOLADA, provada ponta a ponta sem runtime:**
> `saida legada -> tradutor -> serializar -> restaurar -> validarDraftShadow`. O validador aplica as
> **mesmas** recusas de `recomendar()`, importando `exigirConfianca` em vez de reescrever — e
> **rejeita seis adulteracoes distintas**, entao ele nao e carimbo.
>
> **ADVERSARIAL: 18 mutacoes, 18 acusadas, 0 cegas, 0 mutantes nao carregados, restauracao byte a
> byte.** Precisou de duas rodadas, e as duas cegas ensinaram coisas diferentes:
> **L38** — MT01 saiu cega porque T02 estava protegido pela guarda **vizinha**, nao pela que a
> mutacao removia. O conserto foi reforcar o teste, nao afrouxar a mutacao.
> **L39** — MT15 aplicou, o mutante carregou, e ainda assim nao valia: acrescentar campo opcional
> nao lido **nao e material**. Trocada por mutacao que devolve duas recomendacoes.
>
> **RUNTIME CONFIRMADO INEXISTENTE.** Nenhuma conexao, nenhuma flag, nenhuma recomendacao real,
> nenhum store, nenhum evento. O gate prova por `git grep` que os **unicos** lugares que citam
> `traduzirParaShadow` sao o proprio modulo e o gate. **D43 de pe.**
>
> **CONGELAMENTO VISUAL VERDE.** `git diff ad3b1bc` vazio em `src/product/ui/`,
> `src/product/viewmodels/` e `docs/figma/`. Regressoes: R5-A 30 · R5-B 30 · R5-C 38 · copiloto 39 ·
> home 44 · organismo 27 · Product System 44 · R1 24 · ordem visual 6 · paridade Figma 23 ·
> `tsc` exit 0.
>
> **LIMITACOES:** nenhum chamador real existe — a fronteira esta provada como **contrato**, nao em
> uso. O adaptador da saida legada e um tipo fiel, mas **nenhuma chamada real de `decidir()` foi
> convertida por ele**. E o validador de fronteira reproduz as recusas de `recomendar()` sem
> executa-lo: se o Shadow mudar as suas regras, ele precisa acompanhar.
>
> **PROXIMA ACAO SEGURA:** **R5-D** — a conexao em sombra, atras de flag desligada por padrao. Ela e
> a unica etapa que ainda exige runtime, e so deve comecar com o chamador que hoje nao existe:
> alguem que produza `input_event_ids` reais e confianca com lastro.
>
> ---
>
> **ATUALIZADO 2026-08-03 — R5-B CONCLUIDO.**
> `DELIVERYOS_R5B_INVARIANTS_GATE_COMPLETE` · `MACRO2_CHECKPOINT_REACHED`
> HEAD inicial `bd1ad55`. **R5-C e R5-D NAO iniciados.**
>
> **Os dez invariantes do contrato da consciencia viraram executaveis.** O proprio contrato dizia,
> em letra propria, *"Nenhuma destas foi testada ainda"*. Matriz com o texto canonico **transcrito**:
> `docs/product/MATRIZ_INVARIANTES_I1_I10.md`. Gate: `npm run test:platform:r5b` — **30 testes**.
> Agregador `npm run test:platform:r5` (R5-A + R5-B) — ele **nao** alega R5 completo.
>
> **I1 E I2 NAO PRECISAVAM DE R5-C, e essa foi a descoberta que destravou a missao.** O contrato
> supunha integracao; `src/perfil-delivery/decisao.js` esta **neste repositorio** e `decidir()` e uma
> funcao chamavel. Um harness isolado monta a fotografia do minuto, chama e inspeciona o retorno —
> **nunca regex sobre `dentroDoEscopo`**. Com foco ativo em `combinados` e um candidato mais forte em
> `enrolados` disponivel, a acao eleita e `combinados`; **sem** foco ativo, e `enrolados`. Foco de
> conferencia sem candidato compativel devolve `null`, e o **mesmo snapshot** com foco de praca
> devolve acao. Nenhuma conexao foi criada — **D43 de pe** (D64).
>
> **CLASSIFICACAO HONESTA DO QUE MUDOU.** I1 e I2 estavam **sem gate**. I3, I4 e I7 estavam
> comprovados **somente na superficie** — verdes desde R2 e nao provados no dominio. Agora os dez tem
> dono, prova positiva **e** negativa. **Nenhum ficou `inaplicavel antes de R5-C` ou `bloqueado por
> contrato ausente`.**
>
> **Por que prova negativa em todos:** metade destes invariantes e uma AUSENCIA (`null` de
> orientacao, nenhuma acao, nenhum segundo foco), e um cano entupido devolve a mesma ausencia que a
> recusa deliberada.
>
> **ADVERSARIAL: 11 mutacoes semanticas (10 invariantes + bypass), 11 acusadas, 0 cegas, 0 mutantes
> nao carregados, restauracao byte a byte.** O gate imprime `ARTEFATOS {arquivo: sha256}` e o harness
> compara com o original — marca igual significa que o teste rodou copia limpa, e a mutacao **nao
> conta**. Foi essa checagem que pegou a primeira tentativa de I1: a ancora estava em `\n` e
> `decisao.js` esta em **CRLF**, entao a mutacao **nao aplicou**. Registrada como `nao_aplicada`,
> **nunca** como invariante verde. Ver **L37**.
>
> **BYPASS TEMPORAL FECHADO (D63).** `home-vm.ts` recebe `OrigemDaLeitura` — tipo discriminado
> `{demonstracao, motivo}` ou `{real, temporal}`. Leitura com `procedencia === "real"` sem
> `tipo: "real"` **lanca**. Omitir nao passa; disfarcar de demonstracao nao passa. `motivo` e
> obrigatorio: "nao passei" e omissao, nao motivo. **Nenhum runtime foi conectado** — a fronteira vale
> para quem ainda nem foi escrito.
>
> **ALTERACAO DE PRODUCAO, e foi a unica:** o tipo `OrigemDaLeitura` e a recusa em `home-vm.ts`. A
> §13 permite tornar explicito um contrato que ja existe. Um unico teste precisou mudar — o controle
> positivo **H28b**, que passou a fornecer a eleicao temporal.
>
> **CONGELAMENTO VISUAL VERDE.** `git diff bd1ad55` vazio em `src/product/ui/`, `sinais.ts`,
> `areas.ts` e `docs/figma/`. Regressoes: R5-A 30 · R5-B 30 · home 44 · organismo 27 · Product System
> 44 · R1 24 · ordem visual 6 · paridade Figma 23 · copiloto shadow 39 · `tsc` exit 0.
>
> **D29 PRESERVADA, NAO RESOLVIDA.** Sem `order_id` real nao existe recomendacao de pedido, e o gate
> recusa numero visual, indice, posicao, texto ou hash improvisado como identidade.
>
> **LICOES NOVAS — L36 e L37.** Presenca textual nao prova codigo: tres guardas deste gate nasceram
> erradas, e uma reprovava porque `rota: "/conference-brain"` **contem** a palavra. E uma mutacao que
> nao aplica nao e invariante verde — o harness precisa distinguir *aplicada*, *mutante carregado* e
> *acusada*, tres coisas separadas.
>
> **LIMITACAO REGISTRADA:** o harness de I1/I2 constroi `sits` e `INFO` na mao. Ele prova a **regra de
> escopo**, nao a producao de situacoes pelo `MOTOR.step`.
>
> **PROXIMA ACAO SEGURA:** **R5-C** — o contrato de traducao motor→Shadow como TIPO, sem ligar nada.
> A lacuna ja esta nomeada: o motor devolve 4 linhas + sussurro, o Shadow valida recomendacao
> versionada, e **nada converte um no outro**.
>
> ---
>
> **ATUALIZADO 2026-08-03 — R5-A CONCLUIDO.**
> `DELIVERYOS_R5A_TEMPORAL_POLICY_COMPLETE` · `MACRO2_CHECKPOINT_REACHED`
> HEAD inicial `4365c61`. **R5-B, R5-C e R5-D NAO iniciados.**
>
> **A eleicao deixou de ser fotografia.** `home-vm.ts:607` decidia o modo por severidade
> instantanea, sem uma unica dimensao de tempo. Agora existe
> `src/product/atencao/politica-temporal.ts` — funcao PURA, relogio injetado pela entrada,
> estado JSON serializavel, replayable e idempotente. Contrato em
> `docs/product/CONTRATO_TEMPORAL_ATENCAO.md`. Gate: `npm run test:platform:r5a` — **30 testes**.
>
> **A SEMANTICA FOI LIDA, NAO PRESUMIDA — e tres achados mudaram o desenho.**
> Unidade: **minuto** (`motor.js:200`, *"fotografa o minuto t"*).
> - **DEBOUNCE 3** · inicio na troca da chave do topo · comparacao `>=` · topo ausente **apaga** o
>   pendente, nao pausa · continua correndo durante um Foco ativo.
> - **MAXFOCUS 8** · `ate_min` fixado na eleicao e **nunca renovado** · a retirada por teto **grava**
>   a marcacao.
> - **COOLDOWN 45** · por causa, nunca global · comparacao **estrita `>`**, diferente do `>=` do
>   debounce · gravado na eleicao **e** na retirada por teto. **Assimetria comprovada:** retirada por
>   **desaparecimento** nao grava — nao inicia cooldown.
> - **STALE 120 NAO e frescor de fonte** (**D62**). E teto de plausibilidade da **espera observada de
>   um pedido** (`motor.js:212` e `:218`). **Nenhum limiar de frescor foi inventado**: a
>   obsolescencia entra como estado observado mais idade da leitura, e a politica decide so a
>   consequencia.
> - **NAO EXISTE PREEMPCAO.** A eleicao so ocorre com o slot livre (`motor.js:277`). Uma causa mais
>   severa **nao rouba** o Foco. Nenhuma excecao foi criada — a missao proibia inventar, e as fontes
>   nao tem nenhuma.
>
> **C1 e C3 executados como TIPO, nao como disciplina.** `orientacao_permitida` so e `true` no Foco,
> com **caminho unico** no codigo (R5A-20 conta as atribuicoes). O slot e `FocoAtivo | null` — o tipo
> nao admite dois. A view model recebe um parametro **opcional** de dois campos e apenas consome
> (**D61**); ela nao guarda estado temporal, nao chama relogio e nao decide permanencia.
>
> **ADVERSARIAL: 8 mutacoes, 8 acusadas, 0 cegas, restauracao byte a byte.** Remover debounce caiu em
> 11 testes · remover cooldown em R5A-08/09/10 · permitir dois Focos em R5A-06 e 07 · stale virar
> Calmo em R5A-14 · texto na identidade em R5A-22 · relogio global em 17 testes · perda na
> serializacao em R5A-17 · orientacao no Ambiente em R5A-20.
>
> **CONGELAMENTO VISUAL RESPEITADO.** `git diff 4365c61` vazio em `home.js`, `home.css`,
> `organismo-tokens.css`, `sinais.ts`, `areas.ts` e `docs/figma/` — e a guarda **R5A-30** roda a
> mesma comparacao. Gates: visual-order 6 · R1 24 · home 44 · organismo 27 · Product System 44 ·
> paridade Figma 23 · `tsc` exit 0.
>
> **O QUE R5-A NAO PROVA, e precisa ser dito:** nenhuma sequencia foi exercitada contra fonte real —
> as do gate sao construidas. As cenas de demonstracao **continuam elegendo por severidade**, porque
> sao instantes isolados sem eixo de tempo; semea-las para caírem em Foco produziria um Foco que
> nenhum debounce sustentou. Nao ha persistencia real: o estado e serializavel e foi provado em
> round-trip, mas nenhum banco, fila ou runtime foi criado.
>
> **DIVERGENCIA REGISTRADA, NAO CORRIGIDA:** os pisos de severidade discordam — motor tem Ambiente
> em qualquer situacao e Foco em `sev>=2`; o produto tem 2 e 3. A politica **parametriza** e usa os
> do produto, porque corrigir mudaria o modo visivel de cenas aprovadas. Isso e **PB2**.
>
> **MOTORES DESCONECTADOS. D43 DE PE.** A politica nao importa `decisao.js` nem `shadow.ts`
> (guarda R5A-29). **Flag inexistente. Nenhuma recomendacao real emitida.**
>
> **PROXIMA ACAO SEGURA:** **R5-B** — o gate I1-I10 com mutacao dirigida por invariante. Os dois que
> continuam sem gate sao **I1** e **I2**, e agora ha onde ancora-los.
>
> ---
>
> **ATUALIZADO 2026-08-03 — R5 PREPARADO, NAO INICIADO. Decisao do Cesar.**
>
> **O FIGMA FICA PENDENTE.** Sem upgrade de plano, sem redesenho manual dos 18 cenarios.
> **PB11 reclassificado (D59):** bloqueia **somente** o fechamento documental e a paridade NATIVA
> com o Figma. **Nao bloqueia a continuidade tecnica do DeliveryOS e nao bloqueia R5.** A autoridade
> visual nunca foi o Figma — e o Sprint Visual V2 e o Organismo V3.3, e a expressao vigente ja esta
> implementada e coberta por 27 + 44 + 23 testes.
>
> **CONGELADO DURANTE R5, sem excecao:** frontend (`home.js`, `home.css`, `organismo-tokens.css`),
> Figma, `sinais.ts`, `areas.ts`, identidade visual e tokens do organismo. R5 e uma missao de
> **motor**, e nao encosta em expressao.
>
> **I1-I10 REVALIDADOS contra o codigo de hoje** (o contrato dizia "nenhuma foi testada"; parte foi,
> desde entao, e parte continua sem gate):
>
> | | Estado | Onde |
> |---|---|---|
> | **I1** ação nunca troca a causa raiz | **NAO VALIDADO** | `dentroDoEscopo()` existe (`decisao.js:46`, usado em `:175`) e **nenhum gate o exercita** |
> | **I2** sem candidato no escopo → foco puro | **NAO VALIDADO** | nenhuma fixture |
> | **I3** Calmo devolve `null` | verde **na superficie** | `orientacao` e campo de `foco` (`home-vm.ts:129`); inalcancavel em Calmo. Nao validado no motor |
> | **I4** Ambiente sem bloco de ação | verde **no codigo**, travado em **produto** | conflito **C1** continua aberto |
> | **I5** dois vermelhos nao se escondem | **verde** | gate home · organismo O10 |
> | **I6** area sem fonte nunca verde | **verde** | gate home · organismo O7 · `areas.ts` |
> | **I7** exclusividade de slot | verde **na superficie** | UMA orientacao principal; a exclusividade **temporal** de `motor.js` nao e exercitada |
> | **I8** nada executa | **verde** | H25/H26 · `shadow.ts` sem estado `executed` |
> | **I9** confianca sem evidencia | **verde** | gate Product System |
> | **I10** procedencia declarada | **verde** | H27 · gate Product System |
>
> **O ACHADO QUE MUDA O ESCOPO DE R5 — D60, e ele veio de olhar o codigo.** O contrato diz que a
> Operacao Viva e dona do estado cognitivo com mecanismos que "nao se negociam": DEBOUNCE 3 ·
> COOLDOWN 45 · MAXFOCUS 8 · STALE 120 · exclusividade de slot. Eles existem em
> `src/perfil-delivery/motor.js:42-46` e `:274-278`. **E a superficie que hoje e dona de
> Calmo/Ambiente/Foco nao os tem:** `home-vm.ts:607` elege o modo por **severidade instantanea**,
> sem debounce, sem cooldown, sem teto, sem histerese. Nao aparece porque cada cena e fixture
> estatica — ao vivo, a mesma operacao oscilaria entre Calmo e Foco a cada leitura.
>
> **Consequencia:** R5 **nao** comeca ligando `decisao.js` a `shadow.ts`. Comeca dando a Operacao
> Viva a dimensao temporal que o contrato ja lhe atribui. Ranquear orientacao dentro de um Foco sem
> persistencia garantida e refinar uma causa raiz que pode ter mudado entre duas leituras — a mesma
> familia do defeito de **30,8%** corrigido em `37ca1c9`.
>
> **A LACUNA DE INTEGRACAO, nomeada.** O motor devolve **orientacao de 4 linhas + sussurro**; o
> Shadow valida **recomendacao com dimensao, evidencia, procedencia, confianca em faixa, validade e
> retirada**. **Nao existe traducao entre os dois formatos em lugar nenhum do repositorio.** Agrava:
> **D29** — a cadeia real nao propaga `order_id`, entao ela e estruturalmente incapaz de gerar
> recomendacao de PEDIDO hoje; gera recomendacao de FONTE.
>
> **ESCOPO FECHADO RECOMENDADO — quatro blocos, nesta ordem, com parada entre eles:**
> **R5-A** dimensao temporal da Operacao Viva (D60) · **R5-B** gate I1-I10 com mutacao dirigida em
> cada invariante · **R5-C** o contrato de traducao motor→shadow, como TIPO, sem ligar nada ·
> **R5-D** a conexao em sombra, atras de flag desligada por padrao.
> **Gate de conclusao proposto:** `npm run test:platform:r5`.
>
> **R5 NAO FOI INICIADO NESTA SESSAO.** Nenhum arquivo de motor, contrato ou runtime foi tocado.
>
> ---
>
> **ATUALIZADO 2026-08-03 — FECHAMENTO CANONICO DO FIGMA: CHECKPOINT.**
> `DELIVERYOS_FIGMA_CANONICAL_SYNC_CHECKPOINT` · `MACRO2_CHECKPOINT_REACHED`
> HEAD inicial `ae607ca`. Commits: matriz e gate · memoria.
>
> **O ORIGINKIT DEIXOU DE SER BLOQUEIO — `OriginKit external review deferred — non-blocking`
> (D57).** A evidencia de PB12 continua inteira em `BLOCKERS.md`; o que caiu foi o peso. Ele e
> **referencia externa opcional de qualidade**: nao e autoridade visual, nao e dependencia, nao
> prevalece sobre V2/V3.3, e nao trava Figma, paridade nem fechamento visual. **Nenhuma tentativa de
> acesso foi feita nesta missao**, de proposito. A matriz de referencia em
> `CANONICAL_MOTION_PARITY.md` §1 segue **vazia**, e isso agora e um estado aceito, nao uma divida.
>
> **O QUE ESTA MISSAO ENTREGOU, e esta provado:**
> - `docs/figma/FIGMA_ORGANISMO_PARITY_MATRIX.md` — a matriz canonica do organismo: **18 cenarios
>   obrigatorios** (10 desktop, 8 mobile), 12 colunas, taxonomia das 9 areas conferida contra
>   `areas.ts` uma a uma, movimento classificado item a item, e a §9 dizendo em letra propria o que
>   a matriz **proibe afirmar**.
> - `npm run test:platform:figma-parity` — **23 testes**, `FIGMA_PARITY_GATE_GREEN`. Protege
>   presenca, semantica, rastreabilidade e classificacao; **nao** mede pixel.
> - **ADVERSARIAL: 6 mutacoes na matriz, 6 acusadas, 0 cegas, restauracao byte a byte por sha256.**
> - **REDUCED MOTION REAL, e o checkpoint anterior nao tinha isso.** Chromium 1228 via Playwright
>   1.61.1, `Emulation.setEmulatedMedia` nos dois valores, seis cenas: `no-preference` anima
>   1/1/4/0/3/3 e `reduce` anima **0 em todas**, com **contagem de caracteres identica** cena a
>   cena, **nenhuma area sumindo** (5=5 e 1=1) e o Foco presente nos dois passes. Nenhum significado
>   vive so no movimento — agora medido, nao inferido do CSSOM.
>
> **O QUE ESTA MISSAO NAO ENTREGOU, e o motivo e externo: PB13.** A cota do plano Figma cortou
> `use_figma` **e** `get_metadata` na quarta chamada (`mcp_rate_limit_paywall`), e nao voltou minutos
> depois. As tres paginas foram inspecionadas ANTES do corte — o inventario esta na §5 da matriz.
> Depois disso: **zero frames criados, zero paginas reescritas, zero screenshots de Figma.**
>
> **NENHUM NODE ID FOI INVENTADO.** As 18 linhas trazem o token `PENDENTE-PB13`, e o gate aceita
> **so** um ID real `\d+:\d+` ou esse token exato — vazio, tracinho e "TBD" reprovam (**D58**). O dia
> em que os frames existirem, trocar o token pelo ID deixa o gate verde sozinho.
>
> **PB11 CONTINUA ABERTO.** Ele so fecha com Figma, screenshots e matriz com IDs reais — as tres
> coisas juntas. **R2 visual NAO esta concluido integralmente**, porque paridade exige o desenho.
> **PB9 preservado** para Entregas, Operacao Viva, Conference Brain, Copiloto, modulo futuro e o
> **shell** que emoldura o organismo (D-O5 da matriz). **R5 nao iniciado. D43 de pe.**
>
> **NADA DE FRONTEND FOI TOCADO.** `home.js`, `home.css`, `organismo-tokens.css`, `home-vm.ts`,
> `sinais.ts` e `areas.ts` tem diff vazio nesta missao — conferido.
>
> **PROXIMA ACAO SEGURA:** (1) destravar o acesso ao Figma — cota renovada, plano com mais chamadas
> de MCP, ou o desenho feito na interface pelo Cesar; (2) as paginas 00/01/02 sobre a expressao ja
> aprovada, preservando `01 — Design System` e os 6 componentes de `01.4`; (3) trocar os 18
> `PENDENTE-PB13` por IDs reais e rodar o gate; (4) so entao R5, depois de I1-I10.
>
> ---
>
> **ATUALIZADO 2026-08-03 — SINCRONIZACAO CANONICA DE MOVIMENTO: CHECKPOINT.**
> `DELIVERYOS_FIGMA_MOTION_CANONICAL_SYNC_CHECKPOINT` · `MACRO2_CHECKPOINT_REACHED`
> HEAD inicial `c055535`. Commits: `9f3b115` (movimento), `d9a7438` (guardas e mutacoes),
> mais o commit que carrega este checkpoint.
>
> **CORRECAO DE CONTAGEM.** O relatorio do bloco anterior disse "cinco commits" e listou **seis**
> hashes. A contagem certa e **6** (`git rev-list --count 678c61a..c055535`). A lista estava certa,
> a prosa estava errada. **O historico nao foi alterado por causa disso.**
>
> **O ORIGINKIT NAO PODE SER INSPECIONADO DESTE AMBIENTE — PB12.** A navegacao abre e o titulo da
> pagina chega; **toda leitura de conteudo falha**: `screenshot`, `get_page_text`, `read_page` e
> `javascript_tool` devolvem `Policy check temporarily unavailable`, e o `WebFetch` devolve **403**.
> Controle: o mesmo navegador le `localhost:5290` normalmente na mesma sessao. **A etapa de motion
> NAO e declarada completa**, nada foi reconstruido de memoria, e a matriz de referencia OriginKit
> em `docs/design/CANONICAL_MOTION_PARITY.md` §1 ficou **deliberadamente vazia**. Preenche-la e o
> primeiro trabalho de quem retomar.
>
> **A DIVERGENCIA QUE ESTA MISSAO ACHOU.** A home tinha **movimento proprio** — `1.6s`, `2.8s` e
> `0.18s ease` escritos a mao — enquanto `MOTION_TOKENS.json` ja era o sistema canonico do produto.
> Nenhum dos tres valores existia no canone. Era um sistema de movimento paralelo, **a mesma
> especie de erro que PB9 registrou para a cor**. Agora todos os tokens do organismo derivam dos
> canonicos, e o unico derivado — o fluxo do fio — declara a derivacao no proprio arquivo (O19).
>
> **DUAS CORRECOES DE SIGNIFICADO, e as duas vieram de olhar a tela.**
> O Foco tinha **oito animacoes infinitas simultaneas**. O canone separa fluxo de espera com a
> MESMA linha — *"o tracejado em movimento indica fluxo; parado, indica espera"* — e as duas
> intensidades estavam animando. Nao era so agitacao: **era informacao perdida**. Agora `ativa` e
> tracejado parado e `carregada` e tracejado em movimento (**D55**). E o pulso de vida do cabecalho
> **para no Foco**, porque estado critico vence movimento e as areas em pressao ja respiram.
> Medido: Calmo **1** · Ambiente **1** · Foco **5** · Degradado **0**.
>
> **GATES.** R1 24 · home 44 · Product System 44 · ordem visual 6 · organismo visual **27**
> (18 + 9 de movimento) · `tsc` exit 0.
> **ADVERSARIAL: 6 mutacoes de movimento, 6 acusadas, 0 cegas, restauracao byte a byte.**
>
> **REDUCED MOTION:** cobertura medida no CSSOM — 21 elementos animam, **0 descobertos**. Sem
> `display:none`, sem opacidade zerada. **Nao** exercitado com a preferencia real do sistema.
>
> **NAO FEITO:** **Figma** (PB11 continua aberto) e a coluna de node IDs da matriz. A §18 da missao
> proibe abrir nova categoria depois de 60% do contexto. **Nenhum node ID foi inventado** — um
> Figma sincronizado pela metade mente sobre qual e a expressao vigente. **R5 nao iniciado.**
>
> **NAO IMPLEMENTADO, com motivo estrutural:** Text Morph e recuperacao estao **bloqueados** porque
> a home recarrega a cada leitura e **nenhum texto evolui no lugar**; confirmacao e progresso sao
> **futuro** porque nada executa. Implementa-los agora seria encenacao.
>
> **PROXIMA ACAO SEGURA:** (1) OriginKit, quando o acesso existir — preencher a matriz §1;
> (2) Figma, paginas 00/01/02 sobre a expressao ja aprovada, preservando `01 — Design System`;
> (3) node IDs na matriz; (4) so entao R5, depois de I1-I10.
>
> ---
>
> **ATUALIZADO 2026-08-03 — RECUPERACAO DA EXPRESSAO VISUAL CANONICA: CHECKPOINT.**
> `DELIVERYOS_CANONICAL_VISUAL_RECOVERY_CHECKPOINT` · `MACRO2_CHECKPOINT_REACHED`
> HEAD inicial `678c61a`. HEAD final = o commit que carrega este proprio checkpoint (`git log -1`).
> Commits: `32270ea` (ordem de leitura e guarda), `245ac38` (expressao canonica),
> `01b6de2` (gate do organismo e rodada adversarial), `07a8776` e `3c331d5` (memoria).
>
> **A CAUSA DE PB9 ESTA FECHADA, E ELA ERA DE PROCESSO.** `CLAUDE.md` §11 ganhou o **item 4**
> e o indice canonico ganhou a **§2.1**: a ordem visual vinculante e **Sprint Visual V2 ->
> Organismo V3.3 -> handoffs -> Design System -> app-v1 como historia**, e o Nivel 5 nao define
> expressao. Guarda: `npm run test:platform:visual-order` (6). Decisao **D52**.
>
> **Vale saber como a guarda quase nasceu inutil.** A primeira versao lia a secao 11 inteira e
> passou na mutacao que apagou a hierarquia do item 4 — o caminho continuava citado na prosa logo
> abaixo. Agora ela le so a lista numerada. **L33** atualizada.
>
> **A EXPRESSAO DA HOME FOI REFEITA sobre o Nivel 1/2.** `home.css` e `home.js` inteiros, mais
> `src/product/ui/tokens/organismo-tokens.css` com os valores literais do canone. A superficie e
> UMA so, na forma do caminho do pedido — Caixa, depois Sushi e Cozinha, depois Conferencia,
> depois Motoboy — com as quatro subareas do Sushi visiveis e a causadora nomeada. A area cresce
> em **degraus**, e o degrau e a `cor` que o motor da: a pressao em porcentagem nunca vira
> tamanho. `home-vm.ts` ganhou `ligacoes` e `areas.ts` ganhou `CAMINHO_DO_PEDIDO` (**D53**);
> nenhuma regra de sinal mudou.
>
> **Dois defeitos reais so apareceram olhando a tela, e nenhum teste estrutural os pegaria.**
> O painel de Foco, absoluto como no V3.3, **cobria a Conferencia e o Motoboy** — a regra
> "nenhum outro ambiente vermelho fica escondido" morre quando o painel tapa o caminho. E a
> **evidencia mostrava `enrolados_quentes` para uma pessoa**: cinco pontos de `sinais.ts`
> montavam a referencia com o identificador cru. E o mesmo defeito que R1 fechou no motor, vivo
> em outro lugar. Ver **L34**.
>
> **GATES.** R1 **24** · home comportamental **44** · Product System **44** · ordem visual **6**
> (novo) · organismo visual **18** (novo) · `tsc --noEmit` exit 0.
> Agregado: `npm run test:platform:recuperacao`.
>
> **ADVERSARIAL: 6 mutacoes, 6 acusadas, 0 cegas, restauracao byte a byte por sha256.**
> Uma delas achou um buraco de verdade: converter `sem_medicao` no degrau saudavel deixou a suite
> inteira verde, porque os testes mediam o **CSS dos degraus** e nunca o degrau **aplicado** no
> HTML. Fechado por O4b. **L35** — medir a regua nao e medir o que foi medido com ela.
>
> **NAO FEITO, e virou bloqueio PB11 em vez de nota de rodape:** **Figma** e a **matriz
> Figma-codigo**. A missao proibe abrir superficie nova depois de 60% de contexto, e o Figma so
> podia comecar **depois** da revisao visual do frontend — que consumiu o orcamento. O arquivo
> `IMWH8ZKMF5ra3QJYiR6vGa` segue intocado. **R5 nao foi iniciado. D43 continua de pe.**
>
> **PB9 continua valendo para as OUTRAS superficies.** Entregas, Operacao Viva, Conference Brain,
> Copiloto e modulo futuro seguem desenhadas no Design System da Unidade 6 — Nivel 4. Nenhuma foi
> tocada.
>
> **PROXIMA ACAO SEGURA, nesta ordem:** (1) Figma — pagina 00 e 02 do arquivo existente, sobre a
> expressao ja aprovada localmente, preservando `01 — Design System`; (2) matriz Figma-codigo;
> (3) so entao R5, e so depois de I1-I10 do contrato da consciencia.
>
> ---
>
> **ATUALIZADO 2026-08-02 — RECUPERACAO OPERACIONAL BLOCO 1: CHECKPOINT.**
> `DELIVERYOS_OPERATIONAL_HOME_SIGNALS_CHECKPOINT` · `MACRO2_CHECKPOINT_REACHED`
> HEAD inicial `e308835` -> final `d07493b`. Commits: `61e0495` (R1), `d07493b` (R2+R4).
>
> **LEIA TAMBEM, ANTES DE QUALQUER TRABALHO VISUAL:**
> `docs/design/VISUAL_REFERENCE_HIERARCHY.md`. Ele NAO estava na ordem de leitura, e por
> isso a Unidade 6 e este bloco desenharam sobre a referencia errada. Ver **PB9**.
>
> **R1 CONCLUIDO.** `DISPLAY.cozinha_quentes` deixou de valer `"Quentes"` — o nome que a
> operacao usa para OUTRA praca. Hoje: `cozinha_quentes -> Cozinha`,
> `enrolados_quentes -> Sushi Quentes`. Os identificadores internos NAO foram renomeados
> (D49): eles sao chave do seed, do baseline e dos replays. `src/product/viewmodels/areas.ts`
> passa a ser o unico lugar onde id de praca vira nome humano.
> Gate proprio: `npm run test:platform:r1` — **24 testes**.
>
> **Achado de R1 que vale guardar:** o campo `temperatura` do seed marca Ceviche, Tartar de
> Salmao e Tuna Shiso Tartar como `"quente"` — pratos frios. Ele e sombra do nome da praca,
> nao classificacao independente (43 itens quentes contra 31 na Cozinha). Nenhuma heuristica
> termica pode substituir o mapa canonico.
>
> **R4 CONCLUIDO — 11 sinais.** S1, S2, S3, S4, S5, S6, S7, S8, S12, S18, S22. Mais dois
> condicionais: **S14 duas sacolas so com motivo comprovado** (a heuristica de 47-61% nunca
> preenche a lacuna) e **risco de conferencia POR PEDIDO**, que existe mesmo sem medicao da
> area. Os **9 sem fonte** (8 tecnicos + S19 bloqueado por SAC) sao DECLARADOS na tela com
> motivo e fonte que falta. **Nenhuma pausa automatica.**
>
> **R2 — comportamento CONCLUIDO, expressao visual INVALIDA.**
> Gate: `npm run test:platform:home` — **44 testes**. Estao provados: Calmo nao e tela vazia ·
> uma unica orientacao principal · dois vermelhos simultaneos que nao se escondem · Sushi geral
> E as quatro subareas · a subarea causadora identificavel · area sem fonte nunca verde ·
> ausencia nunca zero · degradado que nomeia a fonte parada · nenhum identificador interno
> chegando a uma pessoa · nada executando.
>
> **MAS a expressao esta errada, e o motivo e estrutural.** A home foi desenhada sobre o
> Design System da Unidade 6 e sobre `app-v1`, que a hierarquia oficial classifica como
> **Nivel 5, `historical_reference_only`, NAO pode definir direcao visual**. A autoridade e o
> **Sprint Visual V2 (Nivel 1)** e o **Organismo Operacional V3.3 (Nivel 2)** —
> superficie escura, areas que crescem em degraus, ligacoes que so aparecem com dependencia
> ativa, pressao que se espalha pelo caminho do pedido. O V3.3 esta no repositorio inteiro em
> `docs/design/canonical/deliveryos-visual-v2/extracted/`. Ver **PB9**.
>
> **O que sobrevive e o que se refaz.** Sobrevivem `home-vm.ts`, `sinais.ts` e `areas.ts` —
> nada neles depende de paleta. Refazem-se `src/product/ui/surfaces/home.css` e `home.js`.
>
> **Tres defeitos reais achados pelos testes e corrigidos no caminho:** sinal informativo
> pintava ambiente e uma operacao calma aparecia inteira em atencao (D50) · o cardapio estava
> modelado como fonte de CARGA de Sushi e Cozinha, quando sustenta composicao e roteamento ·
> identificadores crus vazavam para a tela nos alvos de sinal e nas categorias.
>
> **NAO FEITO, e o motivo e honesto:** Figma · rodada adversarial dirigida · matriz Figma-codigo.
> A sessao chegou ao orcamento de contexto, e PB9 tornaria o desenho invalido de qualquer forma.
> **R5 nao foi iniciado.** D43 continua de pe.
>
> **PROXIMA ACAO SEGURA, nesta ordem:** (1) por `docs/design/VISUAL_REFERENCE_HIERARCHY.md` na
> ordem obrigatoria de leitura de `CLAUDE.md` §11 e do indice canonico; (2) refazer a expressao
> da home sobre o Nivel 1/2, preservando as view models; (3) so entao o Figma; (4) rodada
> adversarial.
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
