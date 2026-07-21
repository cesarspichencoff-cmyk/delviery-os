# Auditoria independente — Conference Brain Sprint 2 (Live Observer)

| Campo | Valor |
|---|---|
| Data da auditoria | **2026-07-21** |
| Auditor | Grok 4.5 (sessão independente; worktree isolado) |
| Branch auditada (produto) | `feature/conference-live-observer-v1` |
| Branch de auditoria | `audit/conference-live-observer-v1` |
| Worktree | `C:\Users\italo\Desktop\Claude\deliveryos-audit-conference-live-v1` |
| HEAD auditado | `8e29055b13fa4fc74f5affe323f22d0ab148be83` |
| Base declarada | `32ca889` (`feature/conference-brain-foundation-v1`) |
| Commits no intervalo | **8** (linear, sem merge, sem squash) |
| Sessão real iFood | **não realizada** (proibida nesta missão) |
| Alteração de produto nesta auditoria | **nenhuma** |

---

## VEREDITO

# AUDITORIA APROVADA COM CORREÇÕES — SPRINT 2

**Classificação real do coletor: Categoria B — Adaptador executável aguardando mapeamento real.**

Não é Categoria A (coletor validado ao vivo): não houve sessão autorizada nem ciclos reais no Gestor.

Não é Categoria C (apenas framework/simulação): existe loop de ciclo, contratos, reconciliação por campo, saúde da fonte, relógio, painel, modo de mapeamento estrutural, adaptador Playwright lazy e 79 testes de lógica com driver falso. Falta o DOM real e o modelo multidimensional alinhado ao Gestor oficial.

**Resposta à pergunta principal da missão:**

> A arquitetura implementada está preparada para mapear corretamente o Gestor atual, sem confundir visualização, ação operacional, estado do pedido e evento logístico?

**Parcialmente.** O esqueleto de observação passiva, o tratamento de PRONTO/SAÍDA e a reconciliação por campo estão preparados para *descobrir e acumular* sinais sem inventar saída ou clicar no portal. Porém o modelo canônico atual **ainda concentra produção e logística em um único eixo de status** e **não trata como first-class** os dois modos oficiais (Expedição / Quadros), a ação “Avisar Pedido Pronto”, tags logísticas, agrupamentos, agendados e QR de chegada. Isso cria risco material de, no mapeamento ao vivo, **colar coluna visual, botão disponível e evento de entregador no mesmo campo `status`**. As correções abaixo são pré-condições de modelo (não de seletor) antes de tratar o coletor como semanticamente seguro no Gestor atual.

**O coletor NÃO é declarado funcional ao vivo.** Validação em sessão real permanece pendente.

---

## 1. Isolamento

| Item | Resultado |
|---|---|
| Worktree | `deliveryos-audit-conference-live-v1` |
| Branch | `audit/conference-live-observer-v1` @ `8e29055` |
| Base ancestral | `32ca889` **é ancestral** de HEAD (`git merge-base --is-ancestor` exit 0) |
| Commits ENTREGAS | **ausentes** como ancestral (ex.: `05b6efa` / ramo entregas não está no caminho) |
| Merges no intervalo | **0** |
| Squash aparente | **não** — 8 commits individuais preservados |
| Upstream da branch de auditoria | **nenhum** (sem push desta auditoria) |
| Remote | `origin` = repositório do produto (sem push executado nesta sessão) |
| Status | working tree limpo no momento da verificação inicial; apenas este relatório de auditoria adicionado depois |
| Diff base→HEAD | **28 arquivos**, +3019 / −9 linhas |
| Deploy / merge / push | **não realizados** |

Confirmação de isolamento: o produto em `feature/conference-live-observer-v1` e o worktree de implementação compartilham o mesmo HEAD `8e29055`; a auditoria não reescreve commits de produto.

---

## 2. Commits e escopo

Ordem cronológica (base `32ca889` → HEAD `8e29055`):

| # | SHA curto | Propósito |
|---|---|---|
| 1 | `6ab7dc7` | docs: alinhamento documental Sprint 1 com auditoria |
| 2 | `35d001d` | feat: contratos do observador ao vivo e saúde da fonte |
| 3 | `302c85d` | feat: adaptador de navegador e observador incremental |
| 4 | `83e2596` | feat: reconciliação incremental por campo |
| 5 | `f2065ac` | feat: relógio mínimo da Conferência |
| 6 | `07c34eb` | feat: painel interno mínimo do relógio |
| 7 | `d986eb1` | test: cobertura do observador ao vivo |
| 8 | `8e29055` | docs: documentação e validação do observador |

### Arquivos novos (A)

- `src/conference-brain/contracts/live-states.js`
- `src/conference-brain/live/*` (browser-adapter, clock, evidence, health, mapping-mode, metrics, observer, operator-panel, ready-departure, reconciliation, status-map)
- `tests/conference-brain/live-observer.test.js`
- `tools/conference-brain/operator-panel-server.js`
- docs: `LIVE_OBSERVER_V1`, `LIVE_VALIDATION_V1`, `IFOOD_SCREEN_SOURCE_MAP_V1`, `RECONCILIATION_V1`, `STATUS_MAPPING_V1`, `CONFERENCE_CLOCK_V1`, `OPERATOR_PANEL_V1`, `PRIVACY_AND_SESSION_SAFETY_V1`

### Arquivos modificados (M)

- `.gitignore`, `flags.js`, `schemas.js`, e pequenos ajustes em docs Sprint 1 (`IMPLEMENTATION_SPEC`, `INGESTION`, `VALIDATION`)

### Arquivos excluídos

- nenhum no diff

### Segredos / PII no diff

| Tipo | Presente no diff? |
|---|---|
| Cookies / tokens / sessões / storageState | **não** |
| Perfis de navegador | **não** (apenas paths documentados fora do Git) |
| Credenciais | **não** |
| HTML com PII de clientes | **não** |
| Screenshots reais | **não** |
| Dados pessoais de clientes | **não** |

Única menção a “session/privacy” no name-only: documento `PRIVACY_AND_SESSION_SAFETY_V1.md` (documentação, não credencial).

---

## 3. Classificação real do Sprint e o que ocorre ao executar o entrypoint

### Categoria B — Adaptador executável aguardando mapeamento real

| Verificação | Resultado |
|---|---|
| Playwright no `package.json` deste worktree | **ausente** |
| `node_modules/playwright` | **ausente** |
| `tryLoadPlaywright()` | reporta `playwright_nao_instalado` sem lançar |
| Seletores hardcoded | **nenhum** — contrato pluggável em `extractCycleObservation(driver, selectors)` |
| Loop / ciclo | `createLiveObserver().runCycle()` implementado |
| Checkpoint / store | observações e `live_cycle_runs` no store append-only |
| Backoff | exponencial, base 5s, teto 120s; intervalo mínimo 10s |
| Sem sessão | driver incompleto → saúde `unavailable` / layout_changed / login_required conforme sinais |
| Flag `CONFERENCE_LIVE_OBSERVER_V1` | **strict** — só liga com `1`/`true` explícito |
| Flag `CONFERENCE_IFOOD_MAPPING_MODE_V1` | **strict**, padrão off |
| CLI de coletor “um comando e observa o Gestor” | **não há entrypoint completo de produção** que amarre Chromium + selectors + loop; painel tem server em `tools/conference-brain/operator-panel-server.js`; mapping-mode é função pura sobre HTML |

**Comportamento hoje, sem sessão e sem Playwright:**

1. Importar módulos não falha.
2. `createPlaywrightDriver` devolve `{ ok: false, reason: "playwright_nao_instalado:..." }`.
3. Testes usam driver falso → 79/0.
4. Observação real do Gestor **não ocorre**.

Isso confirma Categoria B, não A.

---

## 4. Estudo oficial consultado (base funcional)

**Data de consulta: 2026-07-21.** Fontes: **blog-parceiros.ifood.com.br** (oficial iFood para parceiros). Materiais públicos **não** são documentação de DOM.

| Título / tema | URL | Atualização observada | O que comprova | O que NÃO comprova |
|---|---|---|---|---|
| Conheça a Nova jornada de Pedidos no Gestor | https://blog-parceiros.ifood.com.br/painel-de-expedicao-gestor-de-pedidos/ | 16/07/2026 | Modos Expedição e Quadros; tags de tempo/logística/pendências; pedidos agrupados; URLs expedition/kanban | Seletores, classes, HTML |
| Gestor de Pedidos iFood: saiba como funciona | https://blog-parceiros.ifood.com.br/gestor-de-pedidos-ifood/ | 17/07/2026 | Jornada aceitar→preparar→despachar; Quadros (Novos, Em preparo, Prontos, Entregando); agendados; loja aberta/fechada; chat; entrega própria/sob demanda | DOM real da conta TATÁ |
| Botão Pronto: como otimizar a chegada do entregador | https://blog-parceiros.ifood.com.br/botao-pronto/ | 07/07/2025 | Ação “Avisar Pedido Pronto” em detalhes; aciona entregador / treina IA de tempo | Estado canônico no código DeliveryOS |
| Confirmação de chegada QR Code | https://blog-parceiros.ifood.com.br/confirmacao-de-chegada-qr-code/ | 20/07/2026 | QR **opcional**; indica entregador na loja; fallback geolocalização | Se TATÁ tem o recurso ativo |
| Ferramentas para parceiros integrados | busca em domínio oficial | parcial / não usada como base DOM | Integrações ERP podem alterar fluxo do Gestor | Layout da loja TATÁ |

**Separação obrigatória usada nesta auditoria:**

| Camada | Conteúdo |
|---|---|
| Funcionalidade oficial documentada | modos, colunas, botão Pronto, tags, agrupamento, agendados, QR opcional, loja aberta/fechada |
| Hipótese de implementação | textos canônicos em `status-map.js` (`Pronto`, `Saiu para entrega` etc.) |
| Comportamento observado no código | loop, health, ready/departure, clock free transition, reconciliação |
| Só sessão real | seletores, layout TATÁ, recursos habilitados, textos exatos de tag logística |

---

## 5. Compatibilidade com Modo Expedição

| Critério | Oficial | Código Sprint 2 | Gap |
|---|---|---|---|
| Alta densidade de pedidos | documentado | um `containerSelector` + `orderCardSelector` genéricos | sem perfil `layout_mode=expedition` |
| Detalhes no mesmo fluxo | documentado | extração de card; sem “abrir detalhes” modelado | detalhes sob demanda não modelados |
| Tags de tempo / logística | documentado | não há campos first-class para tags | risco de colapsar tag em `raw_status` |
| Ações no card | documentado | **proibido clicar** (correto); sem modelar ação disponível | falta `action_availability` |

**Conclusão Expedição:** o adaptador *pode* ser configurado com seletores descobertos na sessão, mas a arquitetura **pressupõe um contêiner único** e não declara o modo Expedição. Correção necessária de modelo: `layout_mode` + perfil de seletores por modo.

---

## 6. Compatibilidade com Modo Quadros

| Critério | Oficial | Código | Gap |
|---|---|---|---|
| Colunas Novos / Em preparo / Prontos / Entregando | documentado | status textual → `LIVE_ORDER_STATUS` | coluna ≠ status canônico (não modelado) |
| Cartão movido entre colunas | documentado | só se o *texto* de status mudar | posição visual sem campo próprio |
| Alternância com Expedição | documentado | assinatura estrutural pode detectar mudança como `layout_changed` | alternância legítima pode ser tratada como falha de layout |

**Conclusão Quadros:** risco de tratar mudança de modo ou de coluna como `layout_changed` ou de mapear **nome de coluna → evento exato**. Correção necessária: `visual_column` separado de `order_state`; perfis de layout; não converter coluna em evento sem evidência.

---

## 7. Jornada e colunas

Referências oficiais candidatas: Aceitar / Em preparo / Pronto(s) / Entregando / Finalizados / Agendados / Cancelados.

O código normaliza rótulos textuais para:

`received | accepted | preparing | ready | awaiting_pickup | picked_up | departed | completed | cancelled | unknown`

**O que está bem:**

- desconhecido → `unknown` (não adivinha vizinho);
- `ready` e `awaiting_pickup` são marcos de pronto;
- `departed` ≠ `completed`;
- sumiço → `missing_from_view`, não saída.

**O que falta para não confundir jornada:**

| Dimensão | Separada no modelo? |
|---|---|
| Posição visual (coluna / lista) | **não** |
| Status textual | **sim** (`raw_status` + canônico) |
| Ação disponível | **não** |
| Ação já realizada | **não** (só status) |
| Evento observado vs inferido | **parcial** (clock origin; status confidência) |
| Logística de entregador | **não** (misturada no status) |

---

## 8. Ação “Avisar Pedido Pronto”

**Oficial:** botão em detalhes do pedido; “Avisar Pedido Pronto” + confirmação; aciona/notifica entregador e alimenta IA de tempo; **não é o mesmo fato** que “estar na coluna Pronto”.

| Distinção exigida | Suporte no código |
|---|---|
| Botão disponível | **não modelado** |
| Botão indisponível / já usado | **não modelado** |
| Coluna Pronto | apenas se texto virar `ready` |
| Texto “pronto” | mapeado para `ready` |
| Entregador notificado | **não** |
| Entregador sendo procurado | **não** |
| Observador nunca clica | **sim** (contrato + testes + docs) |
| Presença do botão ≠ ação executada | **não testável** — campo inexistente |
| Ausência do botão ≠ prova de execução | **idem** |

**Risco:** se o mapeamento colocar o rótulo do botão ou da coluna no mesmo `raw_status`, o sistema **confundirá visualização e ação**. Correção: `actions.ready_notify = { available | unavailable | unknown }` separado de `order_state` e de `readiness_state`.

---

## 9. Status canônicos e multidimensionalidade

### Estados implementados

Lista em `LIVE_ORDER_STATUS` (seção 7). Suficientes como *esqueleto de produção*, **insuficientes** como mapa logístico completo.

### Produção

| Fato | Coberto? |
|---|---|
| Recebido / aceito / em preparo / pronto | sim (aproximado) |
| Pronto **informado** à plataforma (botão) | **não** (só `ready` genérico) |

### Logística iFood

| Fato | Coberto? |
|---|---|
| Procurando entregador / alocado / a caminho / próximo / na loja | **não** como estados |
| Coletado | `picked_up` (parcial) |
| Em rota | `departed` (parcial) |
| Entregue / finalizado | `completed` |

### Logística própria

| Fato | Coberto? |
|---|---|
| Aguardando despacho / despachado pela loja / em rota própria | **não** (sem `dispatch_mode`) |
| Saída manual | **sim** (origem `operator_manual` no relógio) |

### Avaliação

O modelo **mistura dimensões independentes** em um único rank linear (`STATUS_RANK` em reconciliação). Ex.: `picked_up` rankeado depois de `ready` e antes de `departed` — correto como progressão grossa, mas inadequado para “entregador na loja enquanto ainda em preparo” (sinal logístico paralelo à produção).

**Recomendação (não implementar nesta auditoria):** evoluir para estado multidimensional:

- `order_state` (produção)
- `readiness_state` (inclui “pronto informado”)
- `courier_state` (logística iFood)
- `dispatch_state` (própria / parceira)
- `completion_state`
- `visual_placement` (coluna / modo)
- `actions_available[]`

---

## 10. Sinais operacionais dos cartões (classificação conceitual)

Sinais oficiais × classificação × suporte no modelo:

| Sinal oficial | Classificação | No Sprint 2 |
|---|---|---|
| Tempo disponível para preparo | indicador | não |
| Metade do tempo (tag amarela) | alerta | não |
| Pedido atrasado (tag vermelha) | alerta | não |
| Entregador sendo procurado | informação logística | não |
| Previsão de chegada | estimativa / logístico | não |
| Entregador próximo | logístico | não |
| Entregador na loja | logístico / evento | não (QR opcional documentado, sem campo) |
| Pendência de chat | alerta / atributo | não |
| Negociação | atributo / ação | não |
| Pedido agrupado | atributo de agrupamento | não |
| Pedido agendado | atributo + previsão | não |
| Modalidade de entrega | atributo | não |

O modelo **não obriga** converter todos em um único status *por código de extração* (só `raw_status` → status). Mas **não oferece slots** para carregá-los sem abuso de `raw_status`. Isso é gap de contrato, não de seletor.

---

## 11. PRONTO — três regimes

Implementados em `status-map.js#buildStatusEvent`:

| Regime | Comportamento | Confiança |
|---|---|---|
| 1. Horário explícito na tela (`screen_event_time`) | `event_time` da tela | high |
| 2. Mudança entre ciclos | `event_time=null`, `observed_interval=[prev,curr]` | medium/low |
| 3. Observação isolada | sem intervalo | low |

**Confirmado:**

- horário da observação **não** vira horário do evento (exceto regime 1 com carimbo de tela);
- intervalo entre ciclos preservado;
- `raw_status` permanece;
- confiança proporcional.

### Casos de auditoria (conceituais — sem alterar produto)

| Caso | Comportamento esperado do modelo ideal | Comportamento atual |
|---|---|---|
| Coluna Pronto + botão ainda disponível | `order_state=ready`, `action.ready_notify=available` | só `ready` se texto casar; botão ignorado |
| Coluna Pronto sem botão | `ready` + action unknown/unavailable | só `ready` |
| Botão em detalhes, card em Em preparo | preparing + action available | só preparing |
| Status muda para Pronto entre ciclos | ready_observed com intervalo | **ok** se raw_status mudar |
| “pronto” só em tooltip/mensagem | não promover a ready sem evidência | depende do seletor de status; risco se seletor for amplo |

---

## 12. Logística e saída

### Separações no código (`ready-departure.js`)

| Regra | Status |
|---|---|
| `completed` ≠ `departed` | **ok** — completed sozinho não comprova saída |
| Sumiço ≠ saída | **ok** — `missing_from_view` |
| `picked_up` ≠ saída automática | **ok** — handoff only |
| Saída manual possível | **ok** — `operator_manual` no clock |
| Origem e confiança | **ok** no relógio |

### Defeito corrigido `ready_observed → departed_observed`

Documentado e testado: `departed_observed` e `cancelled` são **transições livres** (`FREE_TRANSITION_EVENTS`). Evento externo comprovado **não é descartado** por falta de `conference_started` / `released`.

**Lacuna restante:** estados intermediários de courier (procurando, alocado, na loja) não existem; tudo que não for texto de status canônico vira `unknown` ou se perde.

---

## 13. QR Code de chegada

| Capacidade | Presente? |
|---|---|
| Recurso indisponível / desativado | **não modelado** |
| Entregador confirmado na loja | **não** |
| Indicação textual sem QR | **não** |
| Horário de chegada observado | **não** (genérico) |
| Origem / confiança do sinal | genérico no clock, sem tipo `courier_at_store` |

**Correto na documentação de produto do Sprint 2:** não hardcodar QR.  
**Insuficiente no modelo:** não há como representar o sinal se a sessão o mostrar.

Presunção proibida: ausência de QR ≠ ausência de entregador — o código **não** implementa essa falácia ativamente, mas também **não** tem onde guardar o fato positivo.

---

## 14. Pedidos agrupados

Oficial: pedidos do mesmo entregador agrupados com ícone de link.

| Requisito | Código |
|---|---|
| ID próprio por pedido | sim (`external_id`) |
| ID/evidência de agrupamento | **não** |
| Cartão agrupado ≠ pedido único | depende do seletor; sem teste de agrupamento |
| Coleta de grupo não apaga eventos individuais | reconciliação por ID ajuda; sem fixture de grupo |
| Sinais logísticos compartilhados | **não** |
| Onda conjunta na Conferência | **não** |

Fixtures específicas de agrupamento (2 no mesmo cartão, 3 no mesmo courier, remoção, alteração entre ciclos): **ausentes** no suite. Gap de teste e de modelo.

---

## 15. Agendados

Oficial: aba Agendados; previsão futura.

| Requisito | Código |
|---|---|
| Não entrar como carga ativa cedo | **não** — se aparecer no container, conta como order |
| Horário agendado preservado | **não** first-class |
| Transição agendado→produção | **não** |
| Previsão de onda futura sem pressão atual | **não** |

Risco: pedidos agendados no DOM do container ativo podem inflar carga operacional se o seletor não os excluir.

---

## 16. Loja aberta / fechada / conexão vs saúde da fonte

Oficial: loja aberta/fechada no canto superior (horário, internet, atraso operacional).

Saúde implementada:

`available | partial | stale | layout_changed | login_required | captcha_present | inconsistent | unavailable | recovering`

| Condição | Separada? |
|---|---|
| Loja fechada | **não** (pode parecer `partial` se zero pedidos) |
| Sessão desconectada | `login_required` |
| Internet / portal | `unavailable` / `stale` (genérico) |
| Nenhuma venda vs operação vazia | `partial` com reason `nenhum_pedido_encontrado` — **honesto mas ambíguo** |
| Layout alterado | `layout_changed` — **ok** |
| Modal / detalhes / chat / multi-loja | **não** modelados |

**Confirmado:** layout alterado não afirma carga (`mayAffirmOperationalLoad` só com `available`); login/CAPTCHA suspendem coleta; seletor ausente de container → layout_changed, não “calmo”.

**Falta:** `store_closed`, `mode_unknown`, `ui_blocked` (modal), `scheduled_only`.

---

## 17. Reconciliação multidimensional

Pontos fortes (`reconciliation.js`):

- histórico completo preservado;
- horário mais preciso não é sobrescrito por menos preciso;
- itens add/remove com registro;
- observação do cliente versionada;
- regressão de status e conflito de identidade como anomalias;
- **36 IDs históricos** reprocessados no teste sem perda.

Limitações:

| Cenário | Suporte |
|---|---|
| Cartão compacto → detalhe completo | parcialmente (campos nulos não apagam se reconcileField só considera valores presentes) |
| Detalhe → compacto | depende de não reintroduzir vazio como vencedor — confiança/antiguidade ajudam |
| Quadros ↔ Expedição | **sem** reconciliação por modo |
| Status visual ≠ logístico compatível | **não** — um eixo só |
| Agrupamento / modalidade | **não** |

Não é reconciliação destrutiva no sentido Sprint 1 (vencedor inteiro); é **por campo**. Risco residual: campo único `status` usado para dimensões distintas.

---

## 18. Relógio da Conferência

Eventos: `ready_observed`, `conference_started`, `waiting_for_item`, `conference_resumed`, `conference_completed`, `released`, `departed_observed`, `cancelled`.

| Dimensão | Separada? |
|---|---|
| `ready_observed` (portal) | sim |
| eventos internos de Conferência | sim |
| `departed_observed` (portal ou manual) | sim + free transition |
| `courier_at_store` | **não existe** |

O relógio **não depende** de interpretar indevidamente o iFood para `conference_started` (nunca auto-inicia a partir de ready — testado). Coexistência portal/interno está correta no núcleo; logística fina de courier ainda não entra no relógio.

---

## 19. Painel interno

| Item | Resultado |
|---|---|
| Bind local | server em `127.0.0.1` implícito via `http` local; porta 5183 |
| Feature flag | `CONFERENCE_OPERATOR_PANEL_V1` (não strict como o coletor; default off em produção via readFlag) |
| Ações válidas / confirmação | sim; irreversíveis exigem `confirmToken` |
| PII | linha do painel sem campos pessoais (teste) |
| Ação no portal | **nenhuma** |
| Extensão futura (courier / agrupado) | possível no UI; **sem poluição** se o modelo ainda não tiver campos — não implementar agora |

---

## 20. Modo de mapeamento

`mapping-mode.js` é **puro**: HTML → assinatura estrutural (classes, contagens em faixas, textos curtos de badge/status, flags de atributos PII-like). **Não** abre navegador, **não** clica, **não** persiste HTML bruto.

| Capacidade desejada para sessão TATÁ | Hoje |
|---|---|
| Identificar Expedição vs Quadros | **não** (só mudança de assinatura genérica) |
| Cartões / colunas / botões / tags | candidatos genéricos (div/card/button counts) |
| Sinais de entregador / agrupamentos / agendados | **não** |
| Status da loja / modais / chat / a11y | **não** |
| Export de candidatos a seletor | parcial (classes sample, status texts) |
| Configuração externa de seletores | **sim** (contrato no adapter) |
| PII | mitigado (não extrai valores PII-like) |

**Utilizável para a sessão TATÁ?** Sim como **ferramenta de assinatura e apoio**, **não** como mapeador completo do Gestor. A sessão supervisionada ainda precisa de humano para rotular seletores e modos.

### Comando exato para futura sessão supervisionada

Pré-requisitos (humanos, fora do Git):

1. Playwright instalado no worktree (`npm i -D playwright` + `npx playwright install chromium`) — **não feito nesta auditoria**.
2. Perfil Chromium com sessão **já autorizada** do Gestor, **fora do repositório**, ex.:  
   `C:\Users\italo\AppData\Local\DeliveryOS\ifood-browser-profile\`  
   (caminho ilustrativo; nunca commitado).
3. Flags estritas e fundação.

```powershell
# A partir do worktree do produto (ou desta auditoria), COM sessão já logada no perfil:
$env:NODE_ENV = "development"
$env:CONFERENCE_BRAIN_FOUNDATION_V1 = "1"
$env:CONFERENCE_IFOOD_MAPPING_MODE_V1 = "1"
# NÃO ligar CONFERENCE_LIVE_OBSERVER_V1 até seletores e modos estarem validados

# 1) Humano: abrir o Gestor logado no perfil persistente (Expedição e, em seguida, Quadros)
# 2) Capturar HTML sanitizado da área de pedidos (sem PII) para arquivo FORA do Git, ex.:
#    %LOCALAPPDATA%\DeliveryOS\ifood-evidence\map-expedition.html
#    %LOCALAPPDATA%\DeliveryOS\ifood-evidence\map-kanban.html

# 3) Assinatura estrutural (somente leitura de arquivo local):
node -e "const m=require('./src/conference-brain/live/mapping-mode');const fs=require('fs');const html=fs.readFileSync(process.env.MAP_HTML,'utf8');console.log(JSON.stringify(m.captureStructuralSignature(html,{sourceLabel:process.env.MAP_LABEL||'map'}),null,2))"
# com:
#   $env:MAP_HTML = "$env:LOCALAPPDATA\DeliveryOS\ifood-evidence\map-expedition.html"
#   $env:MAP_LABEL = "expedition"
# repetir para kanban

# 4) Painel interno (opcional, local, sem portal):
#   $env:CONFERENCE_OPERATOR_PANEL_V1 = "1"
#   node tools/conference-brain/operator-panel-server.js
```

**Proibições na sessão:** não aceitar pedido, não clicar Pronto, não despachar, não contornar CAPTCHA/login, não commitar HTML/screenshots com PII, não ligar o coletor em produção sem config de seletores revisada.

---

## 21. Loop incremental

Implementado em `observer.js#runCycle` na ordem:

1. observar (`fetchOrders`)  
2. saúde  
3. suspender se login/captcha  
4. normalizar status  
5. reconciliar (via store + módulos)  
6. emitir eventos só em mudança  
7. persistir observações / clock  
8. ciclo run  
9. saúde  
10. painel (separado)

Testado com fixtures (driver falso): primeiro ciclo, idêntico, mudança, departed real, missing, login suspende, falha → unavailable, idempotência.

**Não testado com fixtures dos dois modos oficiais, agrupamento, agendado, QR, ação Pronto** — gap listado nas correções.

---

## 22. Privacidade e segurança

| Item | Avaliação |
|---|---|
| Sessão / perfil fora do Git | **ok** (gitignore + docs) |
| Cookies/tokens no repositório | **não encontrados no diff** |
| Screenshots / snapshots brutos | evidence sanitizada; HTML bruto proibido no mapping |
| Logs com PII | painel e schemas proíbem campos pessoais |
| Retenção | `retentionDays` default 7 + `purgeExpired` documentado |
| Mapeamento sem identidade do cliente | **desenho correto** |

Nenhum risco de painel público inseguro no sentido de bind Internet documentado; painel é processo local. Flag de painel é menos strict que o coletor (default off em production via NODE_ENV) — aceitável se operação nunca setar NODE_ENV=development em host exposto.

---

## 23. Testes executados nesta auditoria

| Suite | Resultado | Observação |
|---|---|---|
| Sprint 2 live-observer | **79/0** (1ª) | `node --test tests/conference-brain/live-observer.test.js` |
| Sprint 2 live-observer | **79/0** (2ª) | reexecução |
| Sprint 1 foundation | **55/0** | `tests/conference-brain/foundation.test.js` |
| Live (completo incl. simulator) | **243/0** | `tests/live/**/*.test.js` |
| Copiloto | **53/0** | `node tests/copiloto/run.js` |
| Capacidade Viva | **43/0** | `node tests/capacidade-viva/run.js` |
| Validação histórica (36 IDs) | **coberta no teste de reconciliação** | suite live-observer |

### Testes de auditoria isolados (conceituais — não modificam implementação)

Representados nesta seção e na §11–15; **não** foram adicionados ao suite de produto para não alterar o código testado. Cenários cobertos analiticamente:

- Expedição vs Quadros (layout_mode ausente)
- Avisar Pedido Pronto (ação vs status)
- Pronto observado (3 regimes — já no suite)
- Entregador procurando / na loja (sem modelo)
- Agrupamento / agendado / entrega própria
- Finalizado sem saída comprovada (já no suite: completed ≠ departed)

---

## 24. Documentação Sprint 2 — revisão

| Documento | Distingue oficial vs hipótese vs fixture vs sessão real? | Afirmação ampla demais? |
|---|---|---|
| `IFOOD_SCREEN_SOURCE_MAP_V1.md` | **sim** — excelente (hipótese ≠ DOM) | não |
| `LIVE_OBSERVER_V1.md` | sim; “implementado, testado com dublê” | “validação legítima” do dublê é correta *para lógica*, não para DOM |
| `LIVE_VALIDATION_V1.md` | **sim** — veredito honesto “VALIDAÇÃO AO VIVO PENDENTE” | não |
| `STATUS_MAPPING_V1.md` / `RECONCILIATION_V1.md` | razoável | não eleva seletor a fato |
| `PRIVACY_AND_SESSION_SAFETY_V1.md` | sim | não |
| `OPERATOR_PANEL_V1.md` / `CONFERENCE_CLOCK_V1.md` | sim | não |

**Afirmações a vigiar:** qualquer leitura de “coletor pronto” fora de Categoria B; a documentação interna do Sprint 2, no geral, **não** finge validação ao vivo — alinhada a esta auditoria.

Não documenta com profundidade: modos Expedição/Quadros oficiais, botão Pronto como ação distinta, QR, agrupados, agendados. Gap documental + de modelo.

---

## 25. Bloqueadores e correções necessárias

### Não bloqueiam a *sessão de mapeamento supervisionada*

- Playwright ausente (instalável na máquina da sessão)
- Seletores desconhecidos (objetivo do mapeamento)
- Ausência de validação ao vivo (declarada)

### Bloqueiam declarar o coletor “pronto para operação semântica” no Gestor atual

1. **Sem `layout_mode` (Expedição / Quadros / unknown)** e perfis de seletor por modo.  
2. **Status unidimensional** misturando produção e logística.  
3. **Sem modelo de ações** (`Avisar Pedido Pronto` available/unavailable/unknown).  
4. **Sem slots** para tag logística, QR/chegada, agrupamento, agendado, modalidade.  
5. **Sem separar** loja fechada de tela vazia / partial.  
6. **Sem fixtures** de modo dual, agrupamento e ação Pronto no suite.  
7. **Sem entrypoint CLI** documentado que amarre driver real + selectors + loop (só painel e função de assinatura).  
8. Alternância de modo pode ser lida como `layout_changed` sem política de “modo mudou de propósito”.

### Correções recomendadas (ordem; **não implementadas** aqui)

1. Introduzir estado multidimensional mínimo (order / readiness / courier / visual / actions).  
2. `layout_mode` + assinaturas por modo + tolerância a alternância legítima.  
3. Campos opcionais: `group_id`, `scheduled_for`, `store_open_state`, `courier_signals[]`.  
4. Nunca mapear botão Pronto para `status` sem `actions`.  
5. Testes de auditoria no suite do produto (pós-decisão de implementação).  
6. Entrypoint de mapeamento/coleta com checklist de proibições.  
7. Documentar explicitamente paridade com as páginas oficiais consultadas em 2026-07-21.

---

## 26. Diff e commits (resumo executivo)

```
base:  32ca889
head:  8e29055
range: 8 commits lineares
diff:  28 files, +3019/-9
merges: 0
secrets: 0
ENTREGAS no ancestral: não
```

---

## 27. Resposta consolidada à missão

| Pergunta | Resposta |
|---|---|
| Categoria do coletor | **B** |
| Pronto para mapeamento ao vivo supervisionado? | **Sim, com correções de modelo em paralelo** (descoberta de seletores pode começar; interpretação semântica plena ainda não) |
| Pronto para operação confiante no Gestor atual? | **Não** |
| Confunde visualização / ação / estado / logística? | **Risco material se seletores forem colados em `raw_status`** — arquitetura atual **não impede** essa confusão no contrato de dados |
| Validação real | **Pendente** |
| Veredito | **AUDITORIA APROVADA COM CORREÇÕES — SPRINT 2** |

---

## 28. Encerramento

- Nenhuma alteração de código de produto.
- Nenhum merge, push ou deploy.
- Mapeamento ao vivo **não iniciado**.
- Próximo passo humano: sessão autorizada TATÁ + instalação Playwright + captura de assinaturas Expedição e Quadros + decisão de correções de modelo **antes** de ligar `CONFERENCE_LIVE_OBSERVER_V1=1` em rotina.

**PARAR.**
)
