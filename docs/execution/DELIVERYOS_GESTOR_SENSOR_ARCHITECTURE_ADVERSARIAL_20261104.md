# Delivery OS Itaim — decisão executável: Gestor como sensor principal, não como segundo motor
**Data:** 04/11/2026 · **PR:** #137 DRAFT/HOLD · **Escopo:** Delivery OS somente. TATÁ Comandas continua em frente separada.  
**Referência da decisão:** César pediu observação do Gestor com pedidos/itens/status/sacolas/praças/ranking/risco e atualização desejada até 60 s, alimentando o motor e a Home planejados desde o início.  
**Anexo analisado:** *Delivery OS alimentado pelo Gestor: arquitetura de captura em tempo real sem depender da API oficial*, 9 pp., fornecido por César. A pesquisa defende sensor de navegador + fatos + journal + motor existente + Copiloto. **Esta nota cruza o anexo com a instalação, código e provas reais.**

## 1. Veredito adversarial

**Direção APROVADA para laboratório:** Gestor como fonte de maior velocidade para fatos de pedidos, TATÁ Comandas como confirmação/enriquecimento/divergência, motor existente da Operação Viva + sinais S1–S22 + Home como único Copiloto. Entregas continua módulo alimentador/consumidor. **Não** criar segundo motor, Home paralela, API oficial, backend pago ou novo Reader.

**A correção decisiva do anexo:** observação de rede pelo Playwright/CDP/WebDriver BiDi é possível **somente quando a sessão do navegador estiver disponível ao instrumento**. A existência de um Edge aberto e autenticado não implica que seja possível anexar um debugger; iniciar o Edge operacional de novo para habilitar CDP é uma mudança de efeito e uma rota com regressão já conhecida. A promessa “reconciliação completa em 60 s” exige cobertura e tempo medidos: **não é comprovada por ter um timer de 60 s**.

**Arquitetura:** interface autenticada e legitimamente acessível do Gestor → observador passivo, com provas de loja e completude → fatos com procedência, identidade, revisão e frescor → contratos/journal existentes → Operação Viva/única arbitragem de Foco → Home/Copiloto → Entregas. TATÁ Comandas entra como testemunha adicional; identidade cruzada forte somente onde realmente necessária (Conferência/vínculo com pedido externo).

## 2. Fatos de campo — 04/11/2026, somente leitura no CAIXA_MOOCA

- Host correto online; processos presentes: **25 `msedge.exe`, 6 `Gestor de Pedidos.exe`, 19 `msedgewebview2.exe`**. Contagens de processos auxiliares, não número de sessões/lojas.
- Verificação de argumentos do processo (somente booleanos, sem exportar linhas de comando, cookies, tokens ou URLs): **0 com flag de depuração remota** nas três famílias. Isso NÃO comprova ausência de toda via de instrumentação, mas bloqueia presumir anexação CDP pronta.
- Executei **uma única** execução do script existente `tools/gestor-window-diagnostics/probe-qualified-windows.ps1` em processo PowerShell iniciado oculto pela sessão Node, sem cliques/teclas/foco/rede/publicação. Resultado: `edgeProcessCount=1` para o perfil específico, `windowsFound=0`, `state=HOLD`, `reason=WINDOW_COUNT_UNBOUNDED`, `ordersPublishable=0`. No momento medido, **não existia uma janela de lista qualificada visível** nesse perfil. Não insistir com perfis extras ou watchdog.
- Status já existente de `C:\ProgramData\DeliveryOS-Itaim-Observer\status.json` (07:23:40Z) relata `sourceMode=CONTROL_DIAGNOSTIC_NOT_REAL_PROOF`, `liveSourceVerified=false`, `state=OUTSIDE_SERVICE_WINDOW`. Não trata de prova de pedido Gestor.
- Acesso via conectores Browser/Opera nesta conversa: indisponível; portanto não houve leitura de DOM do Gestor autenticado, rede HTTP, WebSocket, pedido, status ou merchant real.
- **Nenhuma** alteração no caixa, no Edge, no Gestor, serviços, tarefas, SQL, impressora, iFood, dados de clientes ou rede. As seis tarefas Edge/UIA antigas permanecem deliberadamente desligadas.

**Evidência NÃO obtida:** identidade autenticada merchant Itaim, pedido completo, UUID, itens/observações, paginação total, mudança de status, duas sacolas, disponibilidade de rede, timing de 60 s, compatibilidade do visual real ou ausência de efeitos de abrir detalhes. **Todos UNKNOWN/HOLD.**

## 3. Laboratório independente — provas reproduzidas no Foxxy

Worktree detached da PR #137 no commit `c55f8c344b10c08c6aec71c96a5718cff818528e`, dependências existentes instaladas por `npm ci --offline --ignore-scripts --no-audit --no-fund`. Nenhum iFood real acessado.

| Prova | Resultado | Limite |
|---|---|---|
| `node tests/gestor-shadow/run-visible-detail-probe-tests.cjs` | **22/22 PASS** | DOM mockado, seletor futuro hipotético |
| `node tests/gestor-shadow/run-window-selector-tests.cjs` | **20/20 PASS** | Metadados fictícios; sem janela real |
| `node tests/gestor-shadow/run-status-bridge-tests.cjs` | **13/13 PASS** | Diagnóstico sintético; zero pedidos reais |
| `node tests/gestor-shadow/run-visible-detail-browser-fixture.cjs` | **18/18 PASS** | Edge real com página fictícia, nenhum Gestor |
| `node tests/gestor-shadow/run-visible-detail-benchmark.cjs` | p95 **2,3 ms**, 200 leituras de 20 itens/20 opções fictícias, 0 requisições | Tempo **de DOM fictício**, não de captura de 20 pedidos |
| `npm run build && node dist/src/platform/run-gestor-dom-fixture-tests.js` | **10/10 PASS** | Chromium com página fictícia; MutationObserver, dedupe, stale, fail-closed |
| `npx tsx src/platform/run-gestor-dom-fixture-tests.ts` | Falhou em `__name is not defined` | Erro do *runner* tsx/esbuild ao serializar callback para o browser; compilado JS passou. **Não atribuir à lógica do sensor** |

CI da PR #137 foi **ampliada para executar automaticamente os 55 cenários Node puros** (22+20+13) quando esses arquivos mudarem, mediante workflow `.github/workflows/deliveryos-silent-fixture-windows.yml`. CI do novo HEAD deve ser verificada separadamente antes de marcar CI_PASS.

## 4. Comparação de rotas — menor custo, maior prova

| Rota | Vantagem | Restrição de mundo real | Decisão |
|---|---|---|---|
| UI Automation do Gestor/Edge instalado | Zero conta extra, lê sem clicar/alterar janela; há código e testes | Sem janela acessível agora; só prova visível, não todos os itens | **Sensoriamento secundário e diagnóstico**, quando qualificado |
| Playwright/CDP/BiDi em Edge **isolado e autenticado regularmente** | Observa respostas já recebidas, WebSocket, mudanças/DOM; permite provas de detalhe sem interferir no Edge do caixa | Precisa conta/sessão legítima, proteção de credenciais e provar ausência de ações no Gestor; não anexar perfil de produção por força | **Preferência para detalhe completo**, após gate de autenticação |
| Extensão restrita com content script/MutationObserver | Reage a mudanças na interface sem polling na aba | Extensão precisa ser permitida/instalada; UI virtualizada limita cobertura; `webRequest` não garante acesso ao corpo JSON | **Plano B** em perfil dedicado, nunca ativar silenciosamente na janela da equipe |
| OCR/captura visual | Pode observar dado sem DOM acessível | Custo/fragilidade/PII, conteúdo oculto, virtualização | **Último recurso por campo**, nunca fonte de completude |
| Polling de endpoints internos sem contrato | Talvez pareça rápido | Efeito/termos/autorização/repetição/segredos não comprovados | **NÃO ADOTAR** |

Não instalar extensão nova no perfil da operação. Não habilitar porta CDP na rede: se uma sessão isolada autenticada vier a ser homologada, depuração somente em loopback e protegida. Nunca copiar perfil, cookies ou `storageState` do operador, interceptar senha/2FA, contornar login ou emitir chamadas de API internas por fora da navegação permitida.

## 5. Contrato para uma linha de pedido observada

**Do Gestor — fatos condicionais, sem extrapolar:** `source=gestor`, `merchant_verified` externo à autodeclaração, `order_identity` com força declarada, `observed_at`, `source_updated_at` quando mostrado, `revision/digest`, `status` e o **significado** da etapa, `service_promise` se mostrado, `items[]` com quantidade, modificadores e notas **apenas quando realmente acessíveis**, `pagination_coverage` (`VISIBLE_ONLY` vs `FULL_VERIFIED`), `detail_completeness`, `no_side_effect_receipt`, e estado de frescor. Não exportar nome/telefone/endereço/chat cliente em observação ou log. Hash de payload sem valor de cobertura não transforma parcial em completo.

**Do motor JÁ EXISTENTE:** classificar cada item segundo catálogo e mapa de estações aprovado; `enrolados_quentes` pertence a Sushi Quentes e `cozinha_quentes` pertence a Cozinha; deduplicar por revisão; somar quantidades de pedidos **ativos cujo estado e cobertura sejam sustentados**. Para ranking em tela, distinguir `itens de pedidos ativos` de `itens fisicamente em preparo` (o segundo exige sinal de praça/KDS). Interpretação de promessa não é início ou fim físico de preparo.

**Exclusões importantes:** não inferir `pronto` por item de status do cabeçalho; duas sacolas só como fato quando volume/recibo observado ou regra operacional comprovada, nunca heurística fraca; pedido de quatro dígitos não vira UUID; 20 cartões renderizados não comprovam 20 pedidos totais. Atualização ausente não significa zero. Cancelamentos/edições geram nova revisão; nunca deixam carga fantasma acumulada.

**Home:** usar `homeVM`, sinais S1–S22 e árbitro Foco existentes. Se a fonte só é parcial/stale, exibir `sem medição automática` e *não* promover verde, ranking completo, throughput real ou nova ação automática. O foco pode usar outros fatos comprovados, mas não uma ficção.

## 6. Frequência-alvo de 60 segundos — critérios de aceite mensuráveis

- Evento detectável → atualizar fato incrementalmente; evitar abrir de novo todo pedido a cada minuto.
- A cada 60 s, **tentar** reconciliar lista ativa, paginação e detalhes novos/alterados; verificar denominador contra total apresentado pela própria fonte. Sem denominador verificável, marcar `coverage=UNKNOWN`, jamais "100% lido".
- Medir separadamente `source_event_lag` (somente se timestamp de origem comprovado), `capture_lag`, `projection_lag`, `max_age`, cobertura de detalhes, UI drift, duplicatas e CPU/memória. Se o observador perder sessão/conectividade, sinalizar `STALE` em vez de inventar atualização.
- **SLA desejado (não provado):** capturas atuais vistas no Copiloto com idade ≤60 s durante operação estável, em conjunto variado de pedidos. Não é promessa absoluta durante falha de rede/Gestor ou paginação ilimitada; a condição degradada deve ser visível.
- Kill switch local, um único observador, nenhum pop-up, nenhum relançamento de janela, logs sem PII, orçamento de recursos e rollback comprovado. Manter as seis tarefas antigas desativadas.

## 7. Sequência mínima para desbloquear campo

1. **Nível 0 — já feito:** pesquisa/anexo, diagnóstico OS sem efeito, fixtures Edge/Chromium, 55 asserts, isolamento de erro do runner.
2. **Nível 1 — primeiro bloqueio real:** quando houver uma sessão Itaim comprovada e autorizada em perfil de teste (ou janela original já visível e qualificada para UIA somente leitura), obter **um** pedido atual, sem qualquer ação que altere estado. Registrar provas sanitizadas de origem/loja/status/itens/quantidades/modificadores/tempo/completude. Se clicar para abrir detalhe, verificar previamente semântica/efeitos e habilitar só em sessão própria depois de aprovação operacional.
3. **Nível 2:** cinco pedidos heterogêneos; atualização de estado, edição/cancelamento, pedidos agrupados, observação crítica, itens de mais de uma praça, dois volumes quando declarados; comparar visual vs adaptador.
4. **Nível 3:** conjunto representativo do pico; medir taxa real, cobertura de lista/paginação e idade de 60 s; provar zero foco roubado/janelas/sons no caixa e ausência de alteração nos pedidos.
5. **Nível 4:** publicar fatos autenticados no pipeline de **shadow** e projetá-los na Home existente; mostrar ranking por item e por praça, atraso real e risco apenas com dados calibrados; cruzar TATÁ Comandas separadamente na Conferência; teste iPhone/Xiaomi, rollback e aceite de César.

**Status exato:** `TECHNICAL_DIRECTION_DECIDED` · `PURE_TEST_PASS` · `EDGE_FIXTURE_PASS` · `CHROMIUM_FIXTURE_PASS` · `GESTOR_AUTHENTICATED_ITAIM=UNKNOWN` · `REAL_ORDER_DETAILS=UNKNOWN` · `60S_SLA=NOT_PROVEN` · `DEPLOY=HOLD` · `10/10_WORLD=NO`.

## Fontes externas checadas
- [iFood — nova jornada de pedidos (atualizada 05/05/2026)](https://blog-parceiros.ifood.com.br/painel-de-expedicao-gestor-de-pedidos/) — dois modos, cartões, detalhamento, tags e agrupamento.
- [Microsoft — depuração de navegador já iniciado](https://code.visualstudio.com/docs/nodejs/browser-debugging) — browser precisa começar com modo debug; janela adicional não ativa debug.
- [Chrome Security — proteção de remote debugging](https://developer.chrome.com/blog/remote-debugging-port) — perigo de extração de credenciais; isolamento de perfil.
- [Playwright — eventos de rede e Service Workers](https://playwright.dev/docs/network) — observabilidade com limitações de worker/roteamento.
- [Chrome — extensões webRequest](https://developer.chrome.com/docs/extensions/reference/api/webRequest) — permissões, limites e cache; não equiparar a um proxy de corpo JSON.
- [Playwright — autenticação segura](https://playwright.dev/docs/auth) — `storageState` e cookies são sensíveis; não enviar ao repositório.
- [Toast KDS — estações e expedição](https://support.toasttab.com/en/article/Basic-Kitchen-Configuration) e [All Day](https://support.toasttab.com/en/article/KDS-All-Day-1493055871075) — soma por item e responsabilidade por estação, não prova de prontidão física no TATÁ.
