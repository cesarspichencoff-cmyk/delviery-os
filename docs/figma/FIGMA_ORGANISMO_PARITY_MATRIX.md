# Matriz de paridade — organismo operacional · Figma ↔ código ↔ movimento

> **Escopo.** Esta matriz cobre o **organismo operacional** (a home: Calmo, Ambiente, Foco,
> aproximação, ausências e falha técnica). A matriz das superfícies técnicas da Unidade 6
> — Entregas, Operação Viva, Conference Brain, Copiloto — continua em
> [`FIGMA_CODE_PARITY_MATRIX.md`](FIGMA_CODE_PARITY_MATRIX.md) e **não** é substituída por esta.
>
> **Autoridade visual**, nesta ordem: Sprint Visual DeliveryOS V2 → Organismo Operacional V3.3 →
> handoffs canônicos → Design System → `app-v1` como história.
> Ver `docs/design/VISUAL_REFERENCE_HIERARCHY.md`. **`app-v1` não define nada aqui.**
>
> **Autoridade de movimento:** `docs/figma/MOTION_SYSTEM.md` + `MOTION_TOKENS.json`, deste
> repositório. O OriginKit é referência externa **não bloqueante** (D54, PB12) e **não** é fonte
> de nenhuma linha desta matriz.
>
> Guarda executável: `npm run test:platform:figma-parity`.

---

## 0. A condição que decide a coluna Node ID — leia antes de usar esta matriz

**O acesso de escrita e de leitura ao Figma foi cortado por cota do plano no meio desta missão.**
Medido em 2026-08-03, contra o arquivo `IMWH8ZKMF5ra3QJYiR6vGa`:

| Chamada | Resultado |
|---|---|
| `use_figma` (leitura de fontes e da capa) | `You've reached the Figma MCP tool call limit on the Starter plan` |
| `get_metadata` (`nodeId: 0:1`) | idem |
| `whoami` | responde: seat **View**, tier **starter** |

As três páginas **foram inspecionadas antes do corte** e o inventário está na §5. O que **não**
aconteceu: nenhum frame de organismo foi criado, nenhuma página foi reescrita, nenhum screenshot de
Figma foi tirado.

**Nenhum node ID foi inventado.** A coluna traz `PENDENTE-PB13` onde o nó ainda não existe, e um ID
real (`\d+:\d+`) onde ele já existe e foi lido. Preencher a coluna por suposição faria esta matriz
mentir sobre qual é a expressão vigente — que é exatamente o defeito que ela existe para impedir.
Ver **PB13** em `docs/execution/BLOCKERS.md`.

---

## 1. Classificação de conteúdo — o vocabulário desta matriz

| Classe | Significado |
|---|---|
| **real** | Sai do motor/contrato com regra real, sobre fixture declarada de demonstração |
| **derivado** | Calculado a partir de conteúdo real, sem fonte própria |
| **demonstração** | Existe só para mostrar a linguagem; nunca representa operação |
| **futuro** | Desenhado como visão; **não** implementado |
| **contrato preparado** | A propriedade que mudaria já declara transição; falta o evento que a dispara |
| **sem integração** | Fonte externa existe e não está conectada |
| **sem fonte** | Nenhuma fonte mede isto hoje; a ausência é declarada, nunca preenchida |

**Regra dura:** nenhuma linha classificada como `demonstração`, `futuro` ou `contrato preparado`
pode aparecer como produção. A guarda `npm run test:platform:figma-parity` derruba a matriz se isso
acontecer.

---

## 2. Cenários obrigatórios — desktop

| Cenário | Página | Node ID | Rota/estado | Arquivo/componente | Origem | Real/demonstração | Movimento | Token | Reduced motion | Teste | Divergência |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Calmo | 02 | `PENDENTE-PB13` | `/?cena=calmo#/` | `surfaces/home.js` · `.org-organismo` | V3.3 prancha 13 · `home-vm.ts` | real | pulso de vida (1 ambiente) | `--org-pulso` ← `motion-ambient` | medido: 1 → **0** animando | O1, O3, O10, O22 | Figma ausente |
| Ambiente | 02 | `PENDENTE-PB13` | `/?cena=ambiente#/` | idem · `.org-area[data-degrau]` | V3.3 · `sinais.ts` | real | pulso de vida | `--org-pulso` | 1 → **0** | O4, O4b, O5, O10 | Figma ausente |
| Ambiente com duas pressões | 02 | `PENDENTE-PB13` | `/?cena=ambiente#/` (Sushi, Cozinha e Motoboy em degrau 2) | idem | D42 · V3.3 | real | nenhum próprio | — | 1 → **0** | O10 | Figma ausente |
| Foco | 02 | `PENDENTE-PB13` | `/?cena=foco#/` | idem · `.org-foco` | V3.3 painel que emerge | real | entrada do Foco (`reveal`) + fluxo nas ligações carregadas | `--org-chegada` ← `motion-base`+`motion-rise`; `--org-fluxo` | 4 → **0** | O11, O22 | Figma ausente |
| Aproximação de Sushi | 02 | `PENDENTE-PB13` | `/?cena=ambiente&area=sushi#/` | `.org-aprox` · `minimapa()` | V3.3 mobile geral→área | real | chegada do painel de área | `--org-chegada` | 3 → **0** | O12 | Figma ausente |
| Aproximação de Cozinha | 02 | `PENDENTE-PB13` | `/?cena=ambiente&area=cozinha#/` | idem | idem | real | idem | `--org-chegada` | 3 → **0** | O12 | Figma ausente |
| Informação parcial | 02 | `PENDENTE-PB13` | Caixa e Conferência em qualquer cena | `areas.ts` `sem_medicao_automatica` | PB5, PB6 · D42 | sem fonte | nenhum — ausência não anima | — | inalterada | O7, O9 | Figma ausente |
| Sem integração | 02 | `PENDENTE-PB13` | fonte `comanda_odhen` `indisponivel` | `seed-home-demonstracao.ts` · `.org-fonte` | PB8 (fonte externa) | sem integração | nenhum | — | inalterada | O9 | Figma ausente |
| Falha persistente | 02 | `PENDENTE-PB13` | `/?cena=degradado#/` | `.org-degradado` · ardósia | Contrato Visual dos Estados Técnicos | real | **nenhum, por regra** | — | 0 → **0** | O8, O21 | Figma ausente |
| Recuperação | 02 | `PENDENTE-PB13` | — | — | V3.3 · `connection_recovery` | **contrato preparado** | não implementado | `--org-troca` declarado | n/a | O26 | **Divergência D-O1** |

## 3. Cenários obrigatórios — mobile

| Cenário | Página | Node ID | Rota/estado | Arquivo/componente | Origem | Real/demonstração | Movimento | Token | Reduced motion | Teste | Divergência |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Visão geral | 02 | `PENDENTE-PB13` | 375×812 · `/?cena=ambiente#/` | `home.css` `@media (max-width: 900px)` | V3.3 fluxo mobile | real | pulso de vida | `--org-pulso` | 1 → **0** | O13 | Figma ausente |
| Calmo | 02 | `PENDENTE-PB13` | 375×812 · `?cena=calmo` | idem | idem | real | pulso de vida | `--org-pulso` | 1 → **0** | O13 | Figma ausente |
| Ambiente | 02 | `PENDENTE-PB13` | 375×812 · `?cena=ambiente` | idem | idem | real | pulso de vida | `--org-pulso` | 1 → **0** | O13 | Figma ausente |
| Foco | 02 | `PENDENTE-PB13` | 375×812 · `?cena=foco` | `.org-foco` mobile | idem | real | entrada do Foco | `--org-chegada` | 4 → **0** | O11, O13 | Figma ausente |
| Aproximação | 02 | `PENDENTE-PB13` | 375×812 · `?area=sushi` | `.org-aprox` | idem | real | chegada | `--org-chegada` | 3 → **0** | O12 | Figma ausente |
| Retorno | 02 | `PENDENTE-PB13` | `← Visão geral` (`home.js:466`) | `.org-aprox__voltar` | V3.3 "recuar nunca é sumir" | real (estado) · movimento **futuro** | não animado — recarrega a página | — | n/a | O12 | **Divergência D-O2** |
| Sem medição | 02 | `PENDENTE-PB13` | Caixa em 375×812 | `areas.ts` | PB5 | sem fonte | nenhum | — | inalterada | O7, O13 | Figma ausente |
| Falha técnica | 02 | `PENDENTE-PB13` | 375×812 · `?cena=degradado` | `.org-degradado` | Contrato dos Estados Técnicos | real | **nenhum, por regra** | — | 0 → **0** | O8, O13 | Figma ausente |

## 4. Estrutura das áreas — taxonomia que os dois lados precisam falar igual

| Nome exibido | Identificador interno | Ambiente | Papel | Medição |
|---|---|---|---|---|
| Caixa | `caixa` | Caixa | ambiente | `sem_medicao_automatica` — **nunca verde** |
| Sushi | `sushi` | Sushi | ambiente geral (D46) | `carga_por_praca` |
| Combinados | `combinados` | Sushi | subárea visível | `carga_por_praca` |
| Duplas | `duplas` | Sushi | subárea visível | `carga_por_praca` |
| Enrolados | `enrolados` | Sushi | subárea visível | `carga_por_praca` |
| Sushi Quentes | `enrolados_quentes` | Sushi | subárea visível (D45) | `carga_por_praca` |
| Cozinha | `cozinha_quentes` | Cozinha | produção (D45) | `carga_por_praca` |
| Conferência | `conferencia` | Conferência | ambiente | `sinal_por_pedido` |
| Motoboy | `motoboy` | Motoboy | ambiente | `expedicao` |

**Cozinha ≠ Sushi Quentes**, e nenhum identificador interno chega a uma pessoa (`areas.ts` é o
único lugar onde um id vira rótulo; ids desconhecidos **lançam**, nunca vazam). Guarda: O17 e R1.

## 5. Inventário do Figma — lido em 2026-08-03, antes do corte de cota

| Página | ID | Conteúdo lido |
|---|---|---|
| `00 — Overview & Architecture` | `0:1` | `2:4` capa (1440×900) · `27:2` `00.1 — Arquitetura do produto` (1660×100) |
| `01 — Design System` | `2:2` | `8:64` `01.1 Foundations` · `8:65` `01.2 Severidade e estados de RUNTIME` · `8:66` `01.3 Estados de CONEXAO e OBSERVACAO` · `8:67` `01.4 Componentes` |
| `02 — Product Flows & Screens` | `2:3` | `24:2` / `24:108` Entregas · `24:171` / `24:290` Operação Viva · `25:2` / `25:119` Conference Brain · `25:193` / `25:311` Copiloto · `26:2` `02.5 Estados essenciais` |

Componentes existentes em `01.4` (**preservar**): `ds-state` `22:27` · `campo` `22:44` ·
`metric` `22:57` · `bloco-evidencia` `22:65` · `bloco-limitacao` `22:69` · `estado-tela` `22:102`.
Coleção de variáveis `DeliveryOS` (`VariableCollectionId:8:2`), **56 variáveis**, 1 modo.
9 estilos de texto, 0 estilos de cor.

**O que falta no Figma, e é exatamente o que PB11 pede:** a paleta do organismo (verde profundo,
verde vivo, creme, âmbar, neutro tracejado, ardósia), os degraus de pressão, as ligações `ativa` e
`carregada`, o pulso de vida, a entrada do Foco, e os 18 frames das §2 e §3.

## 6. Movimento — o que pode e o que não pode ser prototipado

| Movimento | Classe | Prototipar no Figma? | Motivo |
|---|---|---|---|
| Pulso discreto de vida | real | **sim** | roda hoje: `orgPulso`, `--org-pulso` |
| Mudança de degrau | contrato preparado | **sim, como transição declarada** | a cor troca no carregamento; a transição existe para o dia em que houver atualização em vigor |
| Aparecimento de ligação ativa | real | **sim** | `.org-fio[data-intensidade="ativa"]` — tracejado **parado** (D55) |
| Propagação em ligação carregada | real | **sim** | `orgFluxo`, `--org-fluxo` — tracejado **em movimento** (D55) |
| Entrada do Foco | real | **sim** | `orgChegada`, `--org-chegada` |
| Aproximação | real | **sim** | chegada do painel de área |
| Retorno | futuro | **como demonstração marcada** | hoje é link com recarga (D-O2) |
| Recuperação | contrato preparado | **como demonstração marcada** | nenhum texto evolui no lugar (D-O1) |
| Perda e retorno de fonte | contrato preparado | **como demonstração marcada** | idem |
| **Text Morph** | futuro | **não** | exige estado persistente que não existe |
| **Confirmação de ação** | futuro | **não** | nada executa |
| **Progresso de ação** | futuro | **não** | idem |
| **Fechamento de turno** | futuro | **não** | não implementado |
| **Previsão** | futuro | **não** | não implementado |
| **Voz** | futuro | **não** | não implementado |
| **Resolução automatizada** | futuro | **não** | idem — e D43 mantém os dois motores desligados |

**D55, registrado para os dois lados:** ligação `ativa` = tracejado **parado** (espera) ·
ligação `carregada` = tracejado **em movimento** (fluxo). Animar as duas perde a distinção.

**Regras que valem em código e precisam valer no Figma:** pulso de vida **ativo em Calmo** ·
pulso de vida **interrompido em Foco** · **estado crítico vence movimento** · **falha técnica não
pulsa** · **movimento não existe sem significado**.

## 7. Reduced motion — validação REAL, não só CSSOM

O checkpoint anterior mediu cobertura pelo CSSOM. Esta missão exercitou a **preferência real do
navegador** (`Emulation.setEmulatedMedia` via Playwright 1.61.1, Chromium 1228), nos dois valores.
Evidência: `docs/execution/EVIDENCE.jsonl`, `figma-parity-reduced-motion-real`.

| Cena | `no-preference` animando / infinitas | `reduce` animando / infinitas | caracteres de texto | áreas visíveis |
|---|---|---|---|---|
| Calmo | 1 / 1 | **0 / 0** | 8524 = 8524 | 5 = 5 |
| Ambiente | 1 / 1 | **0 / 0** | 10947 = 10947 | 5 = 5 |
| Foco | 4 / 3 | **0 / 0** | 12133 = 12133 | 5 = 5 |
| Degradado | 0 / 0 | **0 / 0** | 8474 = 8474 | 5 = 5 |
| Aproximação Sushi | 3 / 1 | **0 / 0** | 11244 = 11244 | 1 = 1 |
| Aproximação Cozinha | 3 / 1 | **0 / 0** | 10882 = 10882 | 1 = 1 |

`matchMedia("(prefers-reduced-motion: reduce)")` devolveu `true` nas seis cenas do segundo passe e
`false` nas seis do primeiro — a preferência foi de fato exercitada, não simulada por classe.

**O que isso prova, item a item:** pulsos repetidos cessam (infinitas 1→0, 3→0) · fluxo contínuo
cessa e vira tracejado estático · a informação permanece (contagem de caracteres **idêntica**) ·
nenhuma área desaparece (5 = 5, e 1 = 1 na aproximação) · a pressão continua identificável (o
degrau é atributo, não animação) · o Foco continua legível (`.org-foco` presente nos dois passes) ·
nenhum significado depende só de movimento.

**Falha técnica não anima nem sem preferência**: degradado mediu 0 animações nos dois passes.

## 8. Divergências ABERTAS desta matriz

| # | Divergência | Estado |
|---|---|---|
| **D-O1** | Recuperação e perda/retorno de fonte não existem como movimento | **aberta, com motivo estrutural.** A home recarrega a cada leitura e nenhum texto evolui no lugar. Implementar hoje seria encenação (MOTION_SYSTEM §1). No Figma, só como demonstração marcada. |
| **D-O2** | Retorno da aproximação é link com recarga, não transição | **aberta.** Mesma causa de D-O1. |
| **D-O3** | Nenhum frame do organismo existe no Figma | **aberta — PB11.** Bloqueada por **PB13** (cota do plano Figma). Nenhum node ID foi inventado. |
| **D-O4** | A paleta do organismo não existe como variável no Figma | **aberta.** Depende do mesmo acesso de escrita. |
| **D-O5** | O shell (nav lateral, topo, seletor de unidade) segue no Design System da Unidade 6 | **aberta — PB9 para superfícies não migradas.** O organismo dentro dele está no Nível 1/2; a moldura, não. |

## 9. O que esta matriz proíbe afirmar

- Que o Figma representa a expressão canônica do organismo. **Não representa** — D-O3.
- Que qualquer node ID desta matriz existe. Os `PENDENTE-PB13` **não existem**.
- Que recuperação, retorno, Text Morph, confirmação, progresso, fechamento de turno, previsão, voz
  ou resolução automatizada estão implementados. **Nenhum está.**
- Que o OriginKit foi analisado. **Não foi** — PB12, revisão externa adiada, não bloqueante.
- Que a home mostra dado real de operação. Ela mostra **fixture declarada**; as regras, o cardápio e
  os limiares é que são reais.
