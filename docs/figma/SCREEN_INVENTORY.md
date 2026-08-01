# Inventário de superfícies

> Unidade 6 · 2026-08-01. Classificação **medida**, não estimada: cada linha foi verificada
> lendo o arquivo ou executando a superfície.

## 1. Classificação usada

| Classe | Significado |
|---|---|
| `funcional` | roda, consome contrato real, e o dado que mostra foi observado |
| `parcial` | roda e consome contrato real, mas parte do que deveria mostrar não tem fonte |
| `apresentacao` | roda, e todo o dado vem de fixture declarada |
| `contrato` | existe contrato consumível, sem superfície |
| `fixture` | só existe como dado de exercício |
| `futuro` | tem lugar na navegação e não existe |
| `bloqueado` | depende de algo indisponível nesta máquina/missão |

## 2. Superfícies que já existiam (descoberta, antes de qualquer edição)

| Superfície | Caminho | Classe | Nota |
|---|---|---|---|
| Console de expedição | `src/entregas/ui/console/` | `apresentacao` | serve por `tools/entregas_ui_server.ts`, facade em memória |
| Rider mobile | `src/entregas/ui/rider-mobile/` | `apresentacao` | idem |
| Handoff iFood | `src/entregas/ui/ifood-handoff/` | `apresentacao` | idem; tem gate de ambiente demo/operacional |
| Map POC | `src/entregas/ui/map-poc/` | `apresentacao` | sem licença de mapa; sem projeção pseudogeográfica |
| Tokens canônicos | `src/entregas/ui/shared/tokens.css` | — | identidade TATÁ real, reutilizada inteira |
| `app-v1/` | `app-v1/` | — | marcado `historical_reference_only`; **não usado** |
| `prototipos/` (3) | `prototipos/` | — | protótipos antigos, fora do Product System |
| Painel do Copiloto | — | `contrato` | `paraPainel` existe em `shadow.ts` e **não estava ligado** |
| Painel do Brain | — | `bloqueado` | `tools/conference-brain/operator-panel-server` **não foi portado** (4B2) |

## 3. Superfícies criadas nesta unidade

| # | Superfície | Rota | Código | Classe | Por que essa classe |
|---|---|---|---|---|---|
| 1 | App Shell | — | `src/product/ui/index.html`, `app.js` | `funcional` | navegação, unidade e contexto funcionam de verdade |
| 2 | Entregas | `#/entregas` | `surfaces/entregas.js` | `apresentacao` | facade em memória; nenhuma viagem aconteceu |
| 3 | Operação Viva | `#/operacao-viva` | `surfaces/operacao-viva.js` | `apresentacao` | `projetar()` é real; os eventos são de exercício |
| 4 | Conference Brain | `#/conference-brain` | `surfaces/conference-brain.js` | `apresentacao` | cadeia real sobre store temporário |
| 5 | Copiloto Shadow | `#/copiloto` | `surfaces/copiloto.js` | `apresentacao` | ponte real sobre conclusões de exercício |
| 6 | Módulo futuro (×7) | `#/caixa` etc. | `surfaces/modulo-futuro.js` | `futuro` | zero dado, zero métrica, zero tabela |

**Nenhuma superfície desta unidade é `funcional` no sentido de dado real** — e isso está escrito
em cada cabeçalho com o selo `SOMENTE DEMONSTRACAO`, não apenas nesta tabela.

## 4. Dados por origem

| Dado | Origem | Estado na interface |
|---|---|---|
| Viagens de Entregas | `EntregasApplicationService` real, comandos na fixture | `simulado` |
| Dimensões da Operação Viva | `projetar()` real sobre eventos de exercício | `simulado` |
| Ciclos e saúde da fonte | `createLiveObserver` real, store temporário | `simulado`, saúde `partial` |
| Conclusões de fonte | `extrairConclusoes` real | `simulado` |
| Conclusão de pedido | fonte sintética legítima | `controle_positivo_sintetico` |
| Recomendações | `recomendarDeConclusoes` real | `simulado`, escopo `fonte` |
| Credencial / GPS / última sync / fila do aparelho | **não existe rota de leitura** | `indisponivel` · `integracao_pendente` |
| Histórico de mudança (Op. Viva e Copiloto) | **não existe** | `indisponivel` · `integracao_pendente` |
| Qualquer dado dos 7 módulos futuros | **não existe** | `futuro` — nada é desenhado |

## 5. Estados essenciais implementados

Vazio · carregando (skeleton) · offline · sincronizando · degradado · stale · erro recuperável ·
erro bloqueante · evidência insuficiente · indisponível · sombra · expirado · retirado ·
invalidado · decisão humana · planejado · somente demonstração.

Cada um tem frame no Figma (`02.5`) e classe no código (`.estado-tela[data-tipo]`, `.ds-state[data-estado]`).

## 6. O que NÃO foi implementado, e por quê

| Item | Motivo |
|---|---|
| Busca e filtros funcionais | não há volume de dado que os justifique; um controle que não filtra é pior que a ausência dele |
| Permissão / autenticação | não existe nesta superfície, e por isso não existe ação |
| Retirada de recomendação | é função pura; sem autenticação, o botão seria um controle falso |
| Telas profundas dos 7 módulos futuros | proibido pelo escopo da unidade |
| Painel HTTP do Conference Brain | não portado (fronteira estrutural do 4B2) |
