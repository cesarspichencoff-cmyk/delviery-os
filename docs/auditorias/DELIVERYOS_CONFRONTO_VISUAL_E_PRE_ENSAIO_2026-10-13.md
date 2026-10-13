# DeliveryOS — confronto visual real e pré-ensaio Android (13/10/2026)

**Estado: EVIDÊNCIA DE BANCADA · ACEITE VISUAL HUMANO PENDENTE · ANDROID FÍSICO NÃO EXECUTADO.**

## Identidade e fronteira

- Código do Product System e testes: commit exato `9121c252d864a8b74ef33e8c9e5c0d81d687ffa3`, branch de Q-019 da PR #108; a PR #106 permanece DRAFT/HOLD, com sua implementação visual/funcional intocada por Q-019.
- Referência: `docs/design/canonical/deliveryos-visual-v2/extracted/DeliveryOS Organismo Operacional.dc.html`, Sprint Visual DeliveryOS V2, V3.3, hierarquia visual e checkpoint Entregas 20/07/2026.
- Bancada: Foxxy, Chromium `149.0.7827.55`, 1440×900, 390×844 e 320×844, `reducedMotion: reduce`; servidor de apresentação em `127.0.0.1`, **sem URL PostgreSQL, sem fonte LIVE, sem GPS e sem produção**.
- O HTML original V2 foi renderizado com seu `support.js` e dependências React 18 carregadas do CDN público. Duas capturas iniciais offline do original **falharam por dependência externa** e foram descartadas; a segunda execução renderizou o original corretamente (3 tamanhos, sem erro JS).
- **Não houve leitura atual do Figma Recovery**: a prova visual local não equivale à comparação direta com seus frames editáveis nem ao aceite de César.

## Capturas auditáveis

Todas as capturas abaixo mostram **somente conteúdo de demonstração**. Os arquivos estão nesta branch de auditoria e não na PR #106 ou #108.

| Referência / tela | Evidência | Observação |
|---|---|---|
| Handoff V2 · introdução · 390 px | [Original](evidencias/visual-preflight-2026-10-13/original-rendered-390.png) | Documento de design, não Home operacional |
| Handoff V2 · Quentes → Conferência · 1440 | [Original](evidencias/visual-preflight-2026-10-13/referencia-v2-quentes-conferencia-1440.png) | Cenário de referência com relações e duas ligações âmbar |
| Handoff V2 · Quentes → Conferência · 390 | [Original](evidencias/visual-preflight-2026-10-13/referencia-v2-quentes-conferencia-390.png) | Prancha **desktop** do handoff; não é adaptação mobile aprovada do runtime |
| Home Calmo · 390 | [Runtime](evidencias/visual-preflight-2026-10-13/home-calmo-390.png) | Declara demonstração e Caixa sem medição |
| Home Ambiente · 1440 | [Runtime](evidencias/visual-preflight-2026-10-13/home-ambiente-1440.png) | Organismo com Sushi/Cozinha e relação de atenção |
| Home Ambiente · 390 | [Runtime](evidencias/visual-preflight-2026-10-13/home-ambiente-390.png) | Layout mobile próprio sem overflow |
| Home Foco · 390 | [Runtime](evidencias/visual-preflight-2026-10-13/home-foco-390.png) | Foco dominante e demais tensões abaixo da dobra |
| Home degradada · 390 | [Runtime](evidencias/visual-preflight-2026-10-13/home-degradado-390.png) | Estado de medição ausente em demo |
| Entregas sem banco · 390 | [Runtime](evidencias/visual-preflight-2026-10-13/entregas-no-db-390.png) | Declara que a build não leu banco; não apresenta rua real |
| Copiloto / Shadow · 390 | [Runtime](evidencias/visual-preflight-2026-10-13/copiloto-shadow-390.png) | Inspetor auxiliar, não a Home |

## Resultado do confronto

**Comprovado na captura (não equivale a aceite):**
1. **15 capturas de runtime**: 12 Home (Calmo, Ambiente, Foco, Degradado × 1440/390/320) + 2 Entregas (1440/390) + 1 Copiloto (390). HTTP 200, ausência de erros JavaScript e `document.documentElement.scrollWidth <= innerWidth` em todas.
2. A Home mantém fundo verde profundo, títulos em tipografia serifada, microtexto mono, acentos lima/âmbar, diagramas circulares e organização por tensão; conserva identidade geral V2/V3.3. Comparação **qualitativa**: o handoff é uma galeria de cenários, enquanto a implementação é uma aplicação com shell, navegação e estados distintos. Não existe aqui equivalência pixel a pixel nem paridade de *mesmo estado, mesma cena, mesmo viewport* para todas as pranchas.
3. A Home de demonstração e Entregas sem banco exibem avisos de origem sintética / fonte ausente. **Atenção de linguagem:** a Home sintética também usa o rótulo visual `● ao vivo · leitura 17h40`, herdado da gramática V2. Mesmo acompanhada dos avisos de demonstração, a combinação merece veredito humano de clareza antes de uso operacional; não a classificar automaticamente como dado LIVE nem alterar o texto sem preservar o cânone.
4. A prancha de galeria V2 tem overflow a 320 px; isso **não** é regressão da aplicação mobile (que não teve overflow em 320 px) nem reprovação da referência desktop.
5. `prefers-reduced-motion: reduce` foi solicitado ao Chromium; sem inspeção física nem julgamento de movimento em uso real.

**Testes executados no commit exato:**

| Gate | Resultado | Limite |
|---|---|---|
| `run-figma-parity-tests.ts` | **24/24 PASS** | Verifica contratos da matriz/implementação, não frames Figma atuais |
| `run-visual-order-tests.ts` | **6/6 PASS** | Ordem de leitura estrutural |
| `run-rider-bridge-tests.ts` | **30/30 PASS** | Chromium + ponte falsa; não Android físico |
| `run-source-mode-tests.ts` | **5/5 PASS** | Modo/fonte do piloto de bancada |
| `run-android-project-tests.ts` | **43/43 PASS** | Verificação estrutural de 33 Kotlin, não APK instalado |
| `run-native-consent-tests.ts` | **79/79 PASS** | Regras nativas e consentimento em bancada |
| `run-termo-sintetico-tests.ts` | **10/10 PASS** | Termo apenas em laboratório local |
| `test:platform:m1-bridge` | **40/40 PASS** (prova anterior do PR #108) | Regularização histórica Q-019 |

**Exceção não mascarada:** `run-rider-bridge-mutation-tests.ts` foi iniciado, mas **travou durante a bateria adversarial** e NÃO recebeu veredito PASS. A execução interrompida havia apagado temporariamente o guard `ack.status === "accepted"` em `src/entregas/ui/rider-mobile/capture-rule.js`. A alteração foi imediatamente **restaurada** do HEAD, o link temporário de dependências removido e o servidor de screenshots local encerrado. `git status --porcelain` limpo, HEAD intacto. Não reexecutar essa mesma rota sem corrigir isolamento, supervisão/timeout e rollback no Windows.

## Pré-ensaio Android: decisão operacional

ADB local encontrado: `platform-tools 37.0.0`. Comando `adb devices -l` → **nenhum dispositivo conectado**. Logo **NÃO FOI POSSÍVEL executar o primeiro ensaio físico sintético**. Nem APK, nem autorização de localização, nem GPS foram tocados.

Roteiro seguro preparado em [Pré-ensaio GPS OFF](DELIVERYOS_PRE_ENSAIO_ANDROID_GPS_OFF_2026-10-13.md): identidade, fonte `simulated` declarada, Trip de motoboy próprio demonstrativa, saída, offline/reenvio, retorno e Copiloto inspecionando o mesmo evento; GPS desativado e sem pedidos reais. É um plano, **não prova de viagem**.

## Fronteira de aprovação

- **Revisão do visual por César pendente:** conferir as imagens e a leitura sem ambiguidade de `ao vivo` com dados sintéticos; o original V2 e a implementação atual são superfícies diferentes.
- **Figma Recovery ao vivo: NÃO VERIFICADO.**
- **Android físico: SEM APARELHO ADB.**
- **Mutação Q-018: NÃO PROVADA nesta execução.**
- **Produção, merge, LIVE, pedido Neemo/Teknisa, GPS e novas despesas: NÃO AUTORIZADOS POR ESTA AUDITORIA.**

**Próxima ação de maior valor:** homologar visualmente as capturas e conectar um Android de piloto à bancada isolada; somente então executar o roteiro sintético GPS OFF e guardar evidência do mesmo evento em Entregas e Copiloto.
