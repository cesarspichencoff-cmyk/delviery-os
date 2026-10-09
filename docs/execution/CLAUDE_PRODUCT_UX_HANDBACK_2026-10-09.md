# HANDBACK — Product System / UX real (Claude) → César e integração revisada

**Missão:** `docs/execution/CLAUDE_PRODUCT_UX_SOLO_MISSION_2026-10-09.md` · **Execução:** 2026-10-09.
**Ambiente:** Claude Code Remote (container Linux). Nenhum recurso cobrado.
**Branch:** `feat/claude-product-ux-autonomous-20261009` — sem merge, sem PR, sem deploy.
**Base validada:** `2782b310ef9fe813917ba49134309287ae83c9f2` (remoto = local antes do primeiro commit; worktree limpa).
**VÉRTICE:** `cesarspichencoff-cmyk/vertice-runtime.` @ `vertice-active` = `e81b6d8`, `VERTICE_ENTRY.md` lido; usado como disciplina interna, nenhuma marca no produto.
**Frente paralela:** Android/Room/SyncWorker/fila (ChatGPT). Nenhum arquivo dela foi tocado: `android/**`, `src/platform/run-device-queue-depth-*.ts`, `src/platform/persistence/pg-repositories.ts`, `package.json` e o TATÁ Comanda ficaram intactos (conferido no `git diff --stat 2782b31..HEAD`).

## 0. Leitura em 60 segundos

1. **O atrito, medido** na tela Entregas com banco (1440×900 e 390×844): a primeira dobra inteira era de
   números da **demonstração**; a leitura do servidor começava abaixo de ~1100 px; carimbos ISO em UTC
   em vez de idade; unidades misturadas; viagem **encerrada** marcada `stale` ao lado das que estavam na
   rua; o aparelho da demonstração dizia "não existe rota de leitura" ao lado do aparelho lido do banco;
   **rolagem lateral em tablet** (1034 px de documento a 768 px); e a **moldura** — faixa de topo, selo
   do shell, unidade ativa — dizia "SOMENTE DEMONSTRACAO" e "demo-unit" sobre fatos lidos do banco.
2. **A direção que sobreviveu: "a rua, lida agora".** Entregas abre pela leitura do servidor, na anatomia
   do Contrato Visual de Estados Técnicos (Nível 1): camada técnica (`Leitura do servidor as 09h43 · lida
   agora`), **linha de sinal** cuja forma é a confiança, **título humano** (`3 viagens na rua em ITAIM; 1
   sem posicao recente.`), explicação e restrição; depois o que **pede conferência** (sem botão, sem
   Foco), as viagens **na rua** como células cuja borda é a solidez do sinal, os **aparelhos** com a idade
   de cada fato. A demonstração mora numa **faixa própria**; sem banco, o lugar da rua é do **estado
   técnico**. A moldura diz a origem do que está em primeiro plano (D96).
3. **A leitura se comporta como leitura.** Envelhece na tela (D95); **reler não a apaga** — a anterior
   fica com "· relendo…", e uma falha a mantém com o motivo escrito (D98); as listas do histórico
   (encerradas, sem ciclo) têm **corte declarado e contagem exata** (D97).
4. **Nada de fonte nova.** Tudo é função pura da porta de realidade que já existia
   (`src/platform/leitura/realidade-de-entregas.ts`, intocada) e da `projetar()` da Operação Viva
   (intocada). Nenhuma janela, regra, sinal, Foco ou ação nova.
5. **Provado com vermelho antes, números finais:** leitura da rua **2/20 → 25/25**; navegador **1/9 →
   16/16** (inclui a correção de classe N10 em todas as superfícies de 320 a 1920 px, a moldura N11 com
   controle N11b, e a releitura N13/N13b); servidor + PostgreSQL real **6/6**; cadeia real **36/36**;
   mutações da cadeia **0 cegas** (15/15, e M10/M11 de novo depois de cada mudança na view model);
   governança verde; **zero `FAIL_NOVO`** — o C6 do `m1-bridge` segue com os mesmos 12 caminhos da Q-019.
   **CI da branch verde** em `2c4fc75`, `c4cdb4f`, `6168223` e `8b62ae7` (Chromium 149; local, 141).
6. **Escala, medida — e o que sobra.** Cada leitura relê e reprojeta o `event_log` inteiro: 1.030.000
   fatos (banco descartável, `simulated`) = **20,5 s** na porta, **23,7 s** no HTTP, **8.253 KiB**,
   **+1,19 GiB** no servidor por clique; o SQL leva 420 ms. O corte das listas reduziu a resposta pela
   metade (300 mil fatos: 2.506 → 1.306 KiB) e deixou a tela constante (45 células com 600 ou 6
   encerradas); a **porta** e o bloco legado `realidade.viagens` não são desta faixa — `Q-026`, §8.6.
7. **Pede decisão do César:** `Q-025` (aprovar a composição visual — a skill do produto exige a sua
   aprovação antes de integrar), `Q-022` (confirmar a exceção estreita no envelope M1), `Q-023` (o relato
   de fila B5 não declara modo), `Q-024` (o que é um turno), `Q-026` (a janela da leitura — o único item
   que piora sozinho com o tempo). A Figma conectada é de **outra pessoa** (`BoAlexandre`) — ver §7.

## 1. Commits

| commit | o que entrega |
|---|---|
| `c886f87` | **fix(product-ui):** `.shell__conteudo { position: relative }` (o `.sr-only` dos selos esticava o documento) e inspetor recolhido sem vazamento de 24 px e fora da ordem de tabulação |
| `d722ec0` | **feat(entregas):** a leitura da rua — VM, superfície, `entregas.css` (novo), `index.html` (1 linha), `app.js`, servidor; 4 suítes de teste; exceção no envelope M1 + C6d; D93–D95, L58–L59, Q-022–Q-024 |
| `4091d17` | **ci(product-ux):** workflow só desta branch (PostgreSQL de serviço, Chromium do Playwright) e `run-sem-fail-novo.ts` |
| `2c4fc75` | registros: este handback, `STATE.json#product_ux_leitura_da_rua_20261009`, 5 linhas de EVIDENCE, 1 de LEDGER, capturas — **CI `37939179462` verde** |
| `02b56c3` | **2ª iteração:** ocorrência registrada na leitura (L13); N10 em todas as superfícies; etiqueta de fontes nas capturas |
| `c4cdb4f` | registros da 2ª iteração: matriz de linhagem (§5.1), `Q-025`, EVIDENCE, STATE — **CI `37940776143` verde** |
| `5dfdb4a` | **3ª iteração:** a moldura (faixa, selo do shell, unidade ativa) segue a origem do primeiro plano; `/api/health` declara a composição; evidência da ocorrência sem nome interno (L14) |
| `ba3aa4b` | **3ª iteração:** as listas do histórico (encerradas; sem ciclo e sem posição) com corte declarado e contagem exata (L15, D97) |
| `6168223` | registros da 3ª iteração: D96, D97, L60, `Q-026`, custo da leitura medido, capturas da moldura — **CI `37944988220` verde** |
| `2b8bbf9` | **3ª iteração:** reler não apaga a leitura que está na tela (N13, N13b, D98) |
| _(este)_ | registros da releitura: D98, EVIDENCE, STATE, LEDGER |

## 2. Arquivos

| arquivo | mudança |
|---|---|
| `src/product/viewmodels/entregas-vm.ts` | `leitura: LeituraDaRuaVM` (frase, solidez, idades, grupos por ciclo de vida, conferência, unidades, qualidade); 5º argumento opcional `{ unidade }` — chamadas antigas inalteradas; textos do aparelho da demonstração e das limitações corrigidos. As duas linhas-âncora do suíte de mutações da cadeia ficaram intactas |
| `src/product/ui/surfaces/entregas.js` | reescrita na ordem leitura → demonstração → limitações; aceita VM antiga sem `leitura` (a prova B5 usa uma) |
| `src/product/ui/surfaces/entregas.css` | **novo**, só tokens existentes; nenhuma cor literal; nada anima |
| `src/product/ui/app.js` | `#/entregas?unidade=`, botão de reler, idade da leitura por `performance.now()`, foco devolvido ao filtro. A linha "a rota inicial abre a home" (H30) intacta. 3ª iteração: `desenharMoldura()` — selo do shell e unidade ativa pela origem do primeiro plano; `relerSemApagar()` e `apiDaRota()` |
| `src/product/ui/index.html` | `<link>` de `entregas.css` |
| `src/product/ui/shell/shell.css` · `components/components.css` | as duas correções de classe de `c886f87` |
| `tools/product_system_server.ts` | repassa `unidade` (≤ 64 chars, só igualdade; nunca SQL); `/api/health` com `leitura_do_servidor` e a faixa da composição real (e o log de boot igual a ela) |
| `src/platform/run-m1-bridge-tests.ts` · `docs/design/M1_VISUAL_CHANGE_ENVELOPE.md` | exceção `ENTREGAS_STREET_READING_ONLY` + controle **C6d** |
| `tests/product/entregas-fixture.ts` | fixture determinística, toda `simulated`, viagens pela `projetar()` real; opção `historico` (semanas de log) |
| `tests/product/run-entregas-leitura-da-rua-tests.ts` | 25 testes de VM e superfície (L1–L15) |
| `tests/product/run-entregas-browser-tests.ts` | 16 testes no Chromium (N1–N13b, com o controle N11b) |
| `tests/product/run-entregas-servidor-pg-tests.ts` | 6 testes com servidor real e PostgreSQL isolado (S1–S6; S5 confere a moldura nas capturas) |
| `tests/product/run-sem-fail-novo.ts` | classifica `m1-bridge` e governança por igualdade |
| `.github/workflows/deliveryos-product-ux.yml` | CI desta branch |

## 3. Provas — resultados exatos

| gate | antes (base `2782b31`) | depois |
|---|---|---|
| `npx tsx tests/product/run-entregas-leitura-da-rua-tests.ts` | **2/20** (só as guardas L8/L9); L13 **22/23** antes da ocorrência; L14 **23/24** e L15 **24/25** antes da 3ª iteração | **25/25** |
| `PRODUCT_UI_CHROMIUM=/opt/pw-browsers/chromium npx tsx tests/product/run-entregas-browser-tests.ts` | **1/9** (só N6); N9 vermelho antes da correção do inspetor; N10 vermelho contra a UI da base; N11/N12 vermelhos antes da moldura (**12/14**; o controle N11b verde antes e depois); N13/N13b vermelhos antes da releitura sem apagar (**14/16**) | **16/16** |
| `DELIVERYOS_PG_URL=… npx tsx tests/product/run-entregas-servidor-pg-tests.ts` | — (rota sem `unidade`); S5/S6 vermelhos antes da moldura (**4/6**) | **6/6** (S4: sha256 de `event_log` + `identity.device` idêntico depois de 6 leituras; POST 405; S6: `/api/health` com banco declara a leitura) |
| `test:platform:queue-depth` (B5, frente Android) | 12/12 + smoke | **12/12 + smoke** (nenhum arquivo do B5 tocado) |
| `test:platform:product` | 52 | **52** |
| `test:platform:cadeia` (PostgreSQL 16 + `dist/`) | — | **36/36** |
| `test:platform:cadeia:mutacoes` | — | **15/15, 0 cegas** (M10 → D3, M11 → D4, no `entregas-vm.ts` novo); depois da 2ª e da 3ª iteração (`ba3aa4b`), `CADEIA_MUT=M10,M11`: **3/3, 0 cegas** |
| **CI da branch** (GitHub, run `37939179462`, `2c4fc75`) | — | **verde**: tsc, build, leitura 22/22, navegador 10/10 (Chromium 149), PostgreSQL 5/5, product 52, B5 12/12 + smoke, home 44, organismo 27, visual-order 6, figma-parity 24, skills 12, r5, cadeia 36/36, governança PASS, m1-bridge só o C6 idêntico |
| **CI da branch** (run `37940776143`, `c4cdb4f`, 2ª iteração) | — | **verde** (mesma lista) |
| **CI da branch** (run `37944988220`, `6168223`, 3ª iteração: moldura e corte das listas) | — | **verde** (mesma lista) |
| **CI da branch** (run `37946401716`, `8b62ae7`, com a releitura sem apagar) | — | **verde** (mesma lista) |
| `test:platform:home` · `organismo` · `visual-order` · `figma-parity` | 44 · 27 · 6 · 24 | **44 · 27 · 6 · 24** |
| `test:platform:r5` · `skills` · `m1b-mutations` · `platform` · `entregas:ui` · `saude-fontes` · `lab:v4` | verdes | **verdes** (9 gates · 12 · 11/11 · 44 · 23 · 10/10 · 9 mutações 0 cegas); rodados de novo contra `2b8bbf9`: todos verdes |
| `tsc --noEmit` · `build:platform` | 0 · 0 | **0 · 0** |
| `test:platform:m1-bridge` | 34 + **C6 vermelho** (Q-019, 12 caminhos) | **35** (+ C6d) + **C6 com os mesmos 12 caminhos** — `FAIL_PREEXISTENTE` |
| `test:platform:governanca` | **G6b vermelho** (`STATE.json` desatualizado desde `52b90c2`) | ver §3.1 |

**Dois `FAIL_NOVO` apareceram no caminho e foram fechados antes da contagem:** H30 (`test:platform:home`
ancora "a rota inicial abre a home" no texto de `rotaDoHash()`; a linha original foi preservada) e o
**C6c cego** (a exceção nova cobria de novo os dois arquivos da Cadeia Real e o controle negativo dela
ficou verde sem o registro — L59; a exceção passou a cobrir só o arquivo novo).

**Ambiente, não código:** com o PostgreSQL local em `scram-sha-256`, P1–P5 da cadeia caem por papel sem
senha; o CI do repositório usa `POSTGRES_HOST_AUTH_METHOD: trust`. Com o cluster descartável alinhado ao
CI: 36/36.

### 3.1 Governança depois deste commit

O G6b estava vermelho na base porque `STATE.json` observa `src/product/` e a base declarada era
`bdcf59d`. Este registro atualiza `state_basis` para `d722ec0` (o último commit que tocou
`src/product/`) e acrescenta o bloco verificado. Medido **depois** do commit `2c4fc75` (L55):
`test:platform:governanca` **14 guardas verdes** e `test:platform:governanca:mutacoes` **13/13 acusadas,
0 cegas** — o suíte de mutações da governança nem rodava antes (abortava: o caso legítimo estava
vermelho). Na 2ª iteração o `state_basis` passa a `02b56c3`; na 3ª, a `ba3aa4b` e depois a `2b8bbf9`,
pelo mesmo motivo (medido: logo depois de `5dfdb4a`, antes do registro, o G6b acusou `observa mudou em
5dfdb4a` — a guarda funciona). Depois de cada registro: governança verde, mutações 13/13, 0 cegas.

## 4. Capturas (antes → depois)

`docs/execution/evidencias/product-ux-2026-10-09/` (procedência no `README.md` da pasta; todo fato
`simulated`):

- `antes-desktop-dobra.png` → `depois-desktop-dobra.png`
- `antes-celular-dobra.png` → `depois-celular-dobra-itaim.png`
- `antes-desktop-inteira-50.png` → `depois-desktop-inteira-50.png`
- estados novos: `depois-sem-banco-*-dobra.png` (linha interrompida, demonstração depois) e
  `depois-leitura-envelhecida-celular-dobra.png` (6 min depois: linha pontilhada, "Esta leitura nao e a
  mais recente").
- 3ª iteração, a moldura: `depois-desktop-dobra.png` (faixa "AMBIENTE DE DEMONSTRACAO", selo "SOMENTE
  DEMONSTRACAO" e "UNIDADE ATIVA · DEMO-UNIT" sobre a leitura do banco) → `depois-moldura-desktop-dobra.png`
  ("DEMONSTRACAO + LEITURA DO SERVIDOR", "UNIDADE DA LEITURA · TODAS", selo "SIMULADO");
  `depois-celular-dobra-itaim.png` → `depois-moldura-celular-dobra-itaim.png` (sem o seletor que não
  agia: uma linha a menos no cabeçalho, e o título da leitura sobe na dobra).

**Fontes:** medido com `document.fonts.check` e as respostas de rede — o Google Fonts responde **200**
neste container e as capturas usam **Spectral, Hanken Grotesk e IBM Plex Mono** (o teste de navegador
imprime a etiqueta a cada execução). Uma hipótese minha, no meio do trabalho, de que as fontes estavam
bloqueadas era **falsa**: o host recusado pelo proxy era `www.google.com` (tráfego do próprio Chromium).

## 5. Decisão visual, explicada

- **Nível 1 manda** (`VISUAL_REFERENCE_HIERARCHY.md`): a anatomia veio do *Contrato Visual de Estados
  Técnicos* e do componente `EstadoTecnico` do Sprint V2 — camada técnica em Plex Mono, linha de sinal,
  título em Spectral (`clamp(1.5rem, 4.4vw, 2.1rem)`, o mesmo do componente), explicação em Hanken,
  restrição com peso 500, marca de evidência 3×13 px cheia/vazada.
- **Confiança = solidez**, nunca semáforo: posição recebida dentro de 2 min = traço cheio verde; 2 a 5 min
  = tracejado âmbar; passou = pontilhado; sem base = interrompido em ardósia. As janelas são `JANELAS` da
  Operação Viva, nunca número novo.
- **Territórios e células** no lugar de cards empilhados (decisão de 2026-08-07): a célula é a viagem; a
  borda esquerda é o sinal; a ordem é a pressão (menos sólida primeiro).
- **A conferência não é alerta nem Foco** (a Operação Viva é a única dona do Foco; o DeliveryOS "nunca
  será lista de alertas"): ela diz o que foi visto, desde quando, a evidência e o que **não** dá para
  concluir ("Isto nao diz que ela parou."). Fala do **sinal e do cadastro**, nunca de quem está na moto
  (Lei 4) — teste L6b e L8.
- **Nunca "ao vivo"** (L9, em todos os estados): a leitura se declara leitura e envelhece na tela (D95).
- **A demonstração não some**: quem avalia a tela ainda precisa dela; ela só deixa de ocupar o lugar da
  rua (o canon: "simulador fora da superfície de consciência").
- **Tokens existentes, nenhum novo**; contraste AA medido por pixel composto no navegador (N7); alvos de
  toque ≥ 44 px (N8); nada anima e `prefers-reduced-motion` não perde informação (N6); celular com fluxo
  próprio: a frase da leitura e o "Atualizar leitura" cabem na primeira dobra de 390×844.

### 5.1 Matriz de linhagem visual (protocolo da skill `tata-product-system`)

Princípios do Sprint V2 usados, declarados: uma atenção dominante por superfície (a frase da leitura);
confiança = solidez; trinca Spectral / Hanken Grotesk / IBM Plex Mono; contexto recuado (aparelhos,
encerradas e qualidade depois); silêncio com intenção (nada pede conferência = uma linha, não um
painel); linguagem humana sem jargão; simulador fora da superfície de consciência; evidência não anima.

| Elemento | Sprint Visual V2 (Nível 1) | Organismo V3.3 (Nível 2) | Leitura da rua (Entregas, Product System) | Justificativa |
|---|---|---|---|---|
| Atenção dominante | uma atenção soberana por estado | Foco central | **a frase da leitura** (`3 viagens na rua em ITAIM; 1 sem posicao recente.`) | Entregas não cria Foco (Operação Viva é a dona); a frase é leitura, não ordem |
| Anatomia | Contrato de Estados Técnicos: camada técnica, linha de sinal, título humano, explicação, restrição | — | a mesma ordem, inclusive no estado sem banco | a leitura é, ela mesma, um estado de informação |
| Confiança | solidez: cheio / tracejado / interrompido | — | linha de sinal e borda das células cheia/tracejada/pontilhada/interrompida | nunca semáforo; janelas da Operação Viva |
| Tipografia | Spectral · Hanken Grotesk · IBM Plex Mono | idem | título Spectral (`clamp(1.5rem, 4.4vw, 2.1rem)`, o do `EstadoTecnico`), UI Hanken, meta/evidência Plex | nenhuma fonte de sistema |
| Cor | verde vivo; âmbar tensão; neutro tracejado incompleto; ardósia falha | idem | âmbar para sem posição/relato velho; ardósia para leitura antiga e sem banco; verde só para posição recente | tokens existentes; texto sempre em `ink` (AA medido) |
| Composição | leitura editorial, não painel | foco + contexto recuado | territórios: frase → conferência → células na rua → aparelhos → recolhidos | "territórios e células" (2026-08-07) |
| Ação | uma ação soberana verde | CTA verde | **nenhuma ação operacional**; só "Atualizar leitura" (GET) | Product System é superfície de leitura (servidor recusa escrita) |
| Vazio | silêncio com presença | "Nada precisa de você agora" | "Nada pede conferencia nesta leitura." / "Nenhuma viagem na rua por esta leitura." | sem afirmar calma; ausência escrita |
| Simulação | simulador em faixa separada, fora da consciência | — | demonstração em faixa própria, tracejada, recolhida quando há leitura | o canon, item 11 |
| Movimento | transição de consciência; evidência não anima | estados cognitivos | **nada anima** | é uma leitura; animar seria fingir fluxo |
| Mapa | — | — | **sem mapa** | a porta não traz coordenada; GPS não é Foco; mapa-first proibido (`DESIGN_RED_TEAM`) |
| Mobile | mobile-first, fluxo próprio | — | frase + reler na 1ª dobra de 390×844; aparelhos em lista, não tabela | "nunca desktop comprimido" |

**Divergência declarada:** a linhagem do módulo ENTREGAS (`docs/entregas/ux/LINHAGEM_VISUAL_CANONICA.md`,
2026-07-20) desenha o **app** do módulo (console com mapa, montar viagem, confirmar parada) e parou à espera
das composições. Esta missão tocou outra superfície — o aprofundamento somente-leitura do Product System —
por ordem explícita do César de 2026-10-09. Mesmo assim, como manda a skill, a aprovação visual fica com
ele (`Q-025`): sem resposta, nada sai da branch.

**O que não foi feito, de propósito:** mapa (proibido como Foco e mapa-first); ranking ou "motoboy
lento" (Lei 4); recarga automática (D95); filtro por turno (sem contrato — `Q-024`); janela da leitura
(`Q-026`); tocar Home,
Copiloto, Operação Viva, Conference Brain, `estados.ts`, tokens, `sinais.ts`, `areas.ts`.

## 6. Estados

| estado | o quê |
|---|---|
| `CODE_READY` | tudo de §2 |
| `TEST_PASS` | §3 neste container (Linux, Node 22.22, PostgreSQL 16 local descartável, Chromium 141) e no CI da branch (GitHub, runs `37939179462`, `37940776143`, `37944988220` e `37946401716` — este último já com a releitura `2b8bbf9` —, Chromium 149) |
| `DEPLOYED` | **nada** |
| `WORLD_PROVEN` | **nada** — nenhuma pessoa da expedição usou a tela; nenhum banco operacional foi lido |

## 7. Fontes Figma verificadas

- Conta do conector: **`BoAlexandre`** (plano de estudante; e-mail omitido de propósito, o repositório é
  público) — **não é a conta do César.** Por isso, e pela `Q-007` em PAUSE, **nenhuma escrita**.
- `dGyF0eRDd4YG8uqyWqU1P4` (*Recovery*): **legível**. Uma página, `0:1 90 — Capture Reference ·
  Recovery`. `20:808 RUNTIME-01 · Entregas` é a **captura da tela antiga** (241 textos idênticos aos do
  código, `Lida em 2026-10-04T07:01:09.998Z`) — não é desenho que oriente a nova. `21:2` = contrato B7,
  `29:2` = contrato B5 ("Sem reporte = NÃO OBSERVADO, nunca zero" — respeitado).
- `IMWH8ZKMF5ra3QJYiR6vGa` (o *file key* de `DESIGN_TOKENS.json`): **recusado** a esta conta. Referência
  salva não é acesso.
- **Consequência:** a paridade Figma da tela Entregas está desatualizada (o nó `20:808` mostra a tela
  antiga). Atualizar exige conta com acesso e decisão sobre a `Q-007`.

## 8. Achados abertos (não corrigidos aqui)

1. **`Q-023` — procedência do relato de fila B5.** O `fila_offline` do VM é `real` fixo, e o contrato B5
   não carrega `source_mode`. A leitura da rua já diz "modo nao declarado" (D94); o campo do B5 é da
   frente Android e não foi alterado.
2. ~~**`/api/health` sempre `demo: true`.**~~ **Fechado em `5dfdb4a`** (D96). Eu tinha deixado este item
   como "decisão de produto"; conferido contra a §6 do índice canônico, não é nenhuma das doze — é uma
   moldura afirmando algo falso (L60). Limite que fica: em Operação Viva e Copiloto o selo continua
   "SOMENTE DEMONSTRACAO" (o primeiro plano é a demonstração), e o histórico lido do servidor declara a
   própria fonte no bloco dele.
3. **`Q-021` — linhagem divergente.** `entregas.js`, `entregas-vm.ts` e `product_system_server.ts` estão
   na lista dos 9 conflitos do merge de ensaio com `tmp/product-reader-official-wiring-20261005`; esta
   missão aumenta a divergência nesses três arquivos. Decidir a Q-021 antes de integrar as duas.
4. **`Q-019`** continua: 12 caminhos protegidos mudados sem registro (nenhum desta missão).
5. **Fuso de exibição** fixo em `America/Sao_Paulo` (declarado na tela): a porta de realidade não devolve
   `identity.unit.timezone`.
6. **`Q-026` — o custo de cada leitura cresce com o log inteiro.** Medido com PostgreSQL 16 descartável,
   20 aparelhos, um lote de GPS a cada 30 s por aparelho, todo fato `simulated`; mediana de 3 leituras
   em processo e de 3 pedidos HTTP ao servidor real (script de medição fora do repositório; nada do
   produto mudou para medir). Com ciclo de vida completo, **antes** do corte de `ba3aa4b`:

   | fatos no log | tamanho | SQL (`EXPLAIN ANALYZE`) | releitura no Node | porta inteira | HTTP `/api/entregas` | resposta | memória do servidor |
   |---|---|---|---|---|---|---|---|
   | 10.300 | 4 MB | 2,7 ms | 106 ms | 232 ms | 206 ms | 133 KiB | +48 MiB |
   | 103.000 | 42 MB | 31,6 ms | 1,3 s | 2,1 s | 2,5 s | 868 KiB | +199 MiB |
   | 309.000 | 129 MB | 135 ms | 3,4 s | 6,7 s | 8,0 s | 2.506 KiB | +456 MiB |
   | 1.030.000 | 414 MB | 420 ms | 12,4 s | 20,5 s | 23,7 s | 8.253 KiB | +1,19 GiB |

   Só-GPS (a cadeia canônica hoje, sem ciclo de vida): 100.000 fatos = porta 2,1 s, 1.156 KiB;
   300.000 = porta 6,1 s. **Depois de `ba3aa4b`**, mesmos 300.000: resposta **3.367 → 1.718 KiB** (só-GPS)
   e **2.506 → 1.306 KiB** (com ciclo); a porta não muda (6,1 s e 6,5 s) — o corte é de apresentação.

   **Onde está o custo:** o SQL é varredura sequencial (não há índice por `event_type`) e leva menos de
   0,5 s mesmo com 1 milhão; o resto é o Node relendo e reprojetando o histórico inteiro a cada clique,
   com memória proporcional a ele. O `statement_timeout` de 15 s não é o limite (o SQL termina rápido);
   o limite é latência e memória. **Hipótese, não medida:** com 20 motos mandando lote a cada 30 s por
   10 h/dia, 1 milhão de fatos são cerca de 6 semanas de operação.

   **O que sobra, e de quem é:** (a) a porta da plataforma lê o log inteiro — uma janela recente (as
   viagens com fato nas últimas N horas, ou o turno da `Q-024`) torna a leitura proporcional à janela,
   mas toca o replay da `Q-016` e conversa com a retenção da `Q-015`; (b) o bloco legado
   `realidade.viagens` vai inteiro no HTTP (**1.246 KiB de 1.306** a 309 mil fatos, depois do corte) e
   nenhuma tela o desenha quando há leitura; as bancadas Android leem `realidade.aparelhos` e `fonte`,
   não `viagens`. Tirá-lo do HTTP é uma linha no servidor, mas é contrato da Cadeia Real. As duas
   decisões estão na `Q-026`; sem resposta, nada muda.

## 9. Custo real

Zero. PostgreSQL 16 e Chromium já estavam no container; nenhum serviço pago, nenhuma chave, nenhuma
permissão nova. O CI da branch roda em runner padrão de repositório **público** (conferido: `private:
false`), sem cobrança.

## 10. Integração — cherry-pick ou merge revisado

Os sete commits de código são independentes da frente Android. **Provado:** numa worktree descartável em
`2782b31`, os sete aplicam limpo, nesta ordem, e a árvore de código resultante (`src`, `tests`, `tools`,
`.github`) é byte a byte igual à da branch (`git diff --stat` vazio):

```bash
git cherry-pick c886f87   # correção de classe do shell/inspetor (só CSS; serve a todas as superfícies)
git cherry-pick d722ec0   # a leitura da rua (exige o anterior para o N2/N9 do navegador)
git cherry-pick 4091d17   # CI desta branch — opcional fora dela (o gatilho é o nome da branch)
git cherry-pick 02b56c3   # 2ª iteração: ocorrência registrada, N10, etiqueta de fontes
git cherry-pick 5dfdb4a   # 3ª iteração: a moldura segue a origem do primeiro plano; L14
git cherry-pick ba3aa4b   # 3ª iteração: listas do histórico com corte declarado (L15)
git cherry-pick 2b8bbf9   # 3ª iteração: reler não apaga a leitura (N13, N13b)
```

Antes de integrar: responder `Q-025` e `Q-022`; decidir `Q-021` se a outra linhagem entrar; rodar
`npx tsx tests/product/run-sem-fail-novo.ts` (aceita só o C6 da Q-019, idêntico). Só os commits de código
não trazem o `STATE.json`: quem integra sem os de registro atualiza o `state_basis` depois, ou o G6b da
governança acusa — é a guarda funcionando.

**Delta opcional para `package.json`** (não aplicado, para não colidir com a frente Android):

```json
"test:product:entregas": "npx tsx tests/product/run-entregas-leitura-da-rua-tests.ts",
"test:product:entregas:browser": "npx tsx tests/product/run-entregas-browser-tests.ts",
"test:product:entregas:pg": "npx tsx tests/product/run-entregas-servidor-pg-tests.ts",
"test:product:sem-fail-novo": "npx tsx tests/product/run-sem-fail-novo.ts"
```

## 11. Próximo passo seguro e pequeno

1. César: olhar as capturas e responder `Q-025`; depois `Q-022`, `Q-023`, `Q-024` e `Q-026` (a janela da
   leitura — o único item desta lista que piora sozinho com o tempo).
2. Abrir `/entregas` com o banco da plataforma de teste e o aparelho do Foxxy mandando lote; conferir
   que a frase, a idade e a conferência batem com o que se vê no telefone.
3. Numa sexta de pico, o gerente da expedição usar a tela e dizer o que faltou — só isso vira
   `WORLD_PROVEN`.
