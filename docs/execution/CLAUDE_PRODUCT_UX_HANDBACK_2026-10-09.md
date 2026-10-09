# HANDBACK — Product System / UX real (Claude) → César e integração revisada

**Missão:** `docs/execution/CLAUDE_PRODUCT_UX_SOLO_MISSION_2026-10-09.md` · **Execução:** 2026-10-09.
**Ambiente:** Claude Code Remote (container Linux), modelo configurado `claude-opus-5-5`. Nenhum recurso cobrado.
**Branch:** `feat/claude-product-ux-autonomous-20261009` — sem merge, sem PR, sem deploy.
**Base validada:** `2782b310ef9fe813917ba49134309287ae83c9f2` (remoto = local antes do primeiro commit; worktree limpa).
**VÉRTICE:** `cesarspichencoff-cmyk/vertice-runtime.` @ `vertice-active` = `e81b6d8`, `VERTICE_ENTRY.md` lido; usado como disciplina interna, nenhuma marca no produto.
**Frente paralela:** Android/Room/SyncWorker/fila (ChatGPT). Nenhum arquivo dela foi tocado: `android/**`, `src/platform/run-device-queue-depth-*.ts`, `src/platform/persistence/pg-repositories.ts`, `package.json` e o TATÁ Comanda ficaram intactos (conferido no `git diff --stat 2782b31..HEAD`).

## 0. Leitura em 60 segundos

1. **O atrito, medido** na tela Entregas com banco (1440×900 e 390×844): a primeira dobra inteira era de
   números da **demonstração**; a leitura do servidor começava abaixo de ~1100 px; carimbos ISO em UTC
   em vez de idade; unidades misturadas; viagem **encerrada** marcada `stale` ao lado das que estavam na
   rua; o texto do aparelho da demonstração dizia "não existe rota de leitura" enquanto a mesma tela
   mostrava o aparelho lido do banco; e **rolagem lateral em tablet** (documento de 1034 px a 768 px).
2. **A direção que sobreviveu: "a rua, lida agora".** Entregas abre pela leitura do servidor, na anatomia
   do Contrato Visual de Estados Técnicos (Nível 1): camada técnica (`Leitura do servidor as 09h43 · lida
   agora`), **linha de sinal** cuja forma é a confiança (cheia/tracejada/pontilhada/interrompida),
   **título humano** (`3 viagens na rua em ITAIM; 1 sem posicao recente.`), explicação e restrição. Depois:
   o que **pede conferência** (sem botão, sem Foco), as viagens **na rua** como células cuja borda é a
   solidez do sinal, as sem ciclo de vida, as encerradas recolhidas, os **aparelhos** com idade de cada
   fato e o último relato de fila B5. A demonstração mora numa **faixa própria**, recolhida quando há
   leitura. Sem banco, o lugar da rua é do **estado técnico** com linha interrompida.
3. **Nada de fonte nova.** Tudo é função pura da porta de realidade que já existia
   (`src/platform/leitura/realidade-de-entregas.ts`, intocada) e da `projetar()` da Operação Viva
   (intocada). Nenhuma janela, regra, sinal, Foco ou ação nova.
4. **Provado com vermelho antes:** leitura da rua **2/20 → 23/23**, navegador **1/9 → 11/11** (o N10
   prova a correção de classe em Home, Operação Viva, Conference Brain, Copiloto e Entregas, de 320 a
   1920 px — vermelho contra a UI da base), servidor + PostgreSQL real **5/5**; cadeia real **36/36**;
   mutações da cadeia **15/15, zero cegas** (M10 e M11 mutam o `entregas-vm.ts` novo e foram acusadas, e
   de novo depois da 2ª iteração); **zero `FAIL_NOVO`** — o C6 do `m1-bridge` segue com os **mesmos 12
   caminhos** da Q-019, conferido depois do commit. **CI da branch no GitHub verde** (run `37939179462`,
   Chromium 149 — outra versão que a local, 141).
5. **Pede decisão do César:** `Q-025` (aprovar a composição visual — a skill do produto exige a sua
   aprovação antes de integrar), `Q-022` (confirmar a exceção estreita no envelope M1), `Q-023` (o relato
   de fila B5 não declara modo e era rotulado `real`), `Q-024` (o que é um turno — a missão pediu filtro
   por turno e não há contrato). A Figma conectada é de **outra pessoa** (`BoAlexandre`) — ver §7.

## 1. Commits

| commit | o que entrega |
|---|---|
| `c886f87` | **fix(product-ui):** `.shell__conteudo { position: relative }` (o `.sr-only` dos selos esticava o documento) e inspetor recolhido sem vazamento de 24 px e fora da ordem de tabulação |
| `d722ec0` | **feat(entregas):** a leitura da rua — VM, superfície, `entregas.css` (novo), `index.html` (1 linha), `app.js`, servidor; 4 suítes de teste; exceção no envelope M1 + C6d; D93–D95, L58–L59, Q-022–Q-024 |
| `4091d17` | **ci(product-ux):** workflow só desta branch (PostgreSQL de serviço, Chromium do Playwright) e `run-sem-fail-novo.ts` |
| `2c4fc75` | registros: este handback, `STATE.json#product_ux_leitura_da_rua_20261009`, 5 linhas de EVIDENCE, 1 de LEDGER, capturas — **CI `37939179462` verde** |
| `02b56c3` | **2ª iteração:** ocorrência registrada na leitura (L13); N10 em todas as superfícies; etiqueta de fontes nas capturas |
| _(este)_ | registros da 2ª iteração: matriz de linhagem (§5.1), `Q-025`, EVIDENCE, STATE |

## 2. Arquivos

| arquivo | mudança |
|---|---|
| `src/product/viewmodels/entregas-vm.ts` | `leitura: LeituraDaRuaVM` (frase, solidez, idades, grupos por ciclo de vida, conferência, unidades, qualidade); 5º argumento opcional `{ unidade }` — chamadas antigas inalteradas; textos do aparelho da demonstração e das limitações corrigidos. As duas linhas-âncora do suíte de mutações da cadeia ficaram intactas |
| `src/product/ui/surfaces/entregas.js` | reescrita na ordem leitura → demonstração → limitações; aceita VM antiga sem `leitura` (a prova B5 usa uma) |
| `src/product/ui/surfaces/entregas.css` | **novo**, só tokens existentes; nenhuma cor literal; nada anima |
| `src/product/ui/app.js` | `#/entregas?unidade=`, botão de reler, idade da leitura por `performance.now()`, foco devolvido ao filtro. A linha "a rota inicial abre a home" (H30) intacta |
| `src/product/ui/index.html` | `<link>` de `entregas.css` |
| `src/product/ui/shell/shell.css` · `components/components.css` | as duas correções de classe de `c886f87` |
| `tools/product_system_server.ts` | repassa `unidade` (≤ 64 chars, só igualdade; nunca SQL) |
| `src/platform/run-m1-bridge-tests.ts` · `docs/design/M1_VISUAL_CHANGE_ENVELOPE.md` | exceção `ENTREGAS_STREET_READING_ONLY` + controle **C6d** |
| `tests/product/entregas-fixture.ts` | fixture determinística, toda `simulated`, viagens pela `projetar()` real |
| `tests/product/run-entregas-leitura-da-rua-tests.ts` | 22 testes de VM e superfície (L1–L12) |
| `tests/product/run-entregas-browser-tests.ts` | 10 testes no Chromium (N1–N9) |
| `tests/product/run-entregas-servidor-pg-tests.ts` | 5 testes com servidor real e PostgreSQL isolado (S1–S5) |
| `tests/product/run-sem-fail-novo.ts` | classifica `m1-bridge` e governança por igualdade |
| `.github/workflows/deliveryos-product-ux.yml` | CI desta branch |

## 3. Provas — resultados exatos

| gate | antes (base `2782b31`) | depois |
|---|---|---|
| `npx tsx tests/product/run-entregas-leitura-da-rua-tests.ts` | **2/20** (só as guardas L8/L9); L13 **22/23** antes da ocorrência | **23/23** |
| `PRODUCT_UI_CHROMIUM=/opt/pw-browsers/chromium npx tsx tests/product/run-entregas-browser-tests.ts` | **1/9** (só N6); N9 vermelho antes da correção do inspetor; N10 vermelho contra a UI da base | **11/11** |
| `DELIVERYOS_PG_URL=… npx tsx tests/product/run-entregas-servidor-pg-tests.ts` | — (rota sem `unidade`) | **5/5** (S4: sha256 de `event_log` + `identity.device` idêntico depois de 6 leituras; POST 405) |
| `test:platform:queue-depth` (B5, frente Android) | 12/12 + smoke | **12/12 + smoke** (nenhum arquivo do B5 tocado) |
| `test:platform:product` | 52 | **52** |
| `test:platform:cadeia` (PostgreSQL 16 + `dist/`) | — | **36/36** |
| `test:platform:cadeia:mutacoes` | — | **15/15, 0 cegas** (M10 → D3, M11 → D4, no `entregas-vm.ts` novo); depois da 2ª iteração, `CADEIA_MUT=M10,M11`: **3/3, 0 cegas** |
| **CI da branch** (GitHub, run `37939179462`, `2c4fc75`) | — | **verde**: tsc, build, leitura 22/22, navegador 10/10 (Chromium 149), PostgreSQL 5/5, product 52, B5 12/12 + smoke, home 44, organismo 27, visual-order 6, figma-parity 24, skills 12, r5, cadeia 36/36, governança PASS, m1-bridge só o C6 idêntico |
| `test:platform:home` · `organismo` · `visual-order` · `figma-parity` | 44 · 27 · 6 · 24 | **44 · 27 · 6 · 24** |
| `test:platform:r5` · `skills` · `m1b-mutations` · `platform` · `entregas:ui` · `saude-fontes` · `lab:v4` | verdes | **verdes** (9 gates · 12 · 11/11 · 44 · 23 · 10/10 · 9 mutações 0 cegas) |
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
vermelho). Na 2ª iteração o `state_basis` passa a `02b56c3`, pelo mesmo motivo.

## 4. Capturas (antes → depois)

`docs/execution/evidencias/product-ux-2026-10-09/` (procedência no `README.md` da pasta; todo fato
`simulated`):

- `antes-desktop-dobra.png` → `depois-desktop-dobra.png`
- `antes-celular-dobra.png` → `depois-celular-dobra-itaim.png`
- `antes-desktop-inteira-50.png` → `depois-desktop-inteira-50.png`
- estados novos: `depois-sem-banco-*-dobra.png` (linha interrompida, demonstração depois) e
  `depois-leitura-envelhecida-celular-dobra.png` (6 min depois: linha pontilhada, "Esta leitura nao e a
  mais recente").

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
lento" (Lei 4); recarga automática (D95); filtro por turno (sem contrato — `Q-024`); tocar Home,
Copiloto, Operação Viva, Conference Brain, `estados.ts`, tokens, `sinais.ts`, `areas.ts`.

## 6. Estados

| estado | o quê |
|---|---|
| `CODE_READY` | tudo de §2 |
| `TEST_PASS` | §3 neste container (Linux, Node 22.22, PostgreSQL 16 local descartável, Chromium 141) e no CI da branch (GitHub, run `37939179462`, Chromium 149) |
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
2. **`/api/health` sempre `demo: true`.** Com banco configurado, a faixa do shell continua "AMBIENTE DE
   DEMONSTRACAO". É verdade para Home/Copiloto (cenas de demo), mas não para a leitura de Entregas, que
   se declara por conta própria. Mudar o shell é decisão de produto.
3. **`Q-021` — linhagem divergente.** `entregas.js`, `entregas-vm.ts` e `product_system_server.ts` estão
   na lista dos 9 conflitos do merge de ensaio com `tmp/product-reader-official-wiring-20261005`; esta
   missão aumenta a divergência nesses três arquivos. Decidir a Q-021 antes de integrar as duas.
4. **`Q-019`** continua: 12 caminhos protegidos mudados sem registro (nenhum desta missão).
5. **Fuso de exibição** fixo em `America/Sao_Paulo` (declarado na tela): a porta de realidade não devolve
   `identity.unit.timezone`.

## 9. Custo real

Zero. PostgreSQL 16 e Chromium já estavam no container; nenhum serviço pago, nenhuma chave, nenhuma
permissão nova. O CI da branch roda em runner padrão de repositório **público** (conferido: `private:
false`), sem cobrança.

## 10. Integração — cherry-pick ou merge revisado

Os três commits de código são independentes da frente Android e aplicam limpo sobre `2782b31`:

```bash
git cherry-pick c886f87   # correção de classe do shell/inspetor (só CSS; serve a todas as superfícies)
git cherry-pick d722ec0   # a leitura da rua (exige o anterior para o N2/N9 do navegador)
git cherry-pick 4091d17   # CI desta branch — opcional fora dela (o gatilho é o nome da branch)
git cherry-pick 02b56c3   # 2ª iteração: ocorrência registrada, N10, etiqueta de fontes
```

Antes de integrar: responder `Q-025` e `Q-022`; decidir `Q-021` se a outra linhagem entrar; rodar
`npx tsx tests/product/run-sem-fail-novo.ts` (aceita só o C6 da Q-019, idêntico).

**Delta opcional para `package.json`** (não aplicado, para não colidir com a frente Android):

```json
"test:product:entregas": "npx tsx tests/product/run-entregas-leitura-da-rua-tests.ts",
"test:product:entregas:browser": "npx tsx tests/product/run-entregas-browser-tests.ts",
"test:product:entregas:pg": "npx tsx tests/product/run-entregas-servidor-pg-tests.ts",
"test:product:sem-fail-novo": "npx tsx tests/product/run-sem-fail-novo.ts"
```

## 11. Próximo passo seguro e pequeno

1. César: olhar as capturas e responder `Q-025`; depois `Q-022`, `Q-023`, `Q-024`.
2. Abrir `/entregas` com o banco da plataforma de teste e o aparelho do Foxxy mandando lote; conferir
   que a frase, a idade e a conferência batem com o que se vê no telefone.
3. Numa sexta de pico, o gerente da expedição usar a tela e dizer o que faltou — só isso vira
   `WORLD_PROVEN`.
