# Auditoria Congelada do Módulo ENTREGAS

> Correção obrigatória da auditoria geral. A conclusão anterior ("Entregas sem código
> executável / apenas Gate Zero") estava **desatualizada** — foi feita sobre um HEAD antigo
> (`5ac221b`) enquanto um processo paralelo evoluía o worktree. Esta auditoria é uma
> **fotografia fixa**, imune a alterações paralelas.

## 1. Fotografia (fixa e imune a processo paralelo)

| Campo | Valor |
|---|---|
| Worktree | `deliveryos-entregas-v1` |
| Branch | `feature/entregas-v1` |
| **Commit auditado (congelado)** | `bb567a6142672d2d7648fbb4b94be00f19afe343` — "fix(entregas-ui): finaliza Expedição iFood com FIFO e bloqueio real" (07:03) |
| Método de congelamento | `git worktree add --detach` num SHA fixo + junction de `node_modules` — auditei um checkout destacado, **não** o worktree vivo |
| HEAD vivo no início | `bb567a6` |
| HEAD vivo ao final | `9479a7e` (processo paralelo avançou 2 commits durante a auditoria — **sem efeito** sobre a fotografia congelada) |
| Working tree da fotografia | limpo (checkout destacado) |
| Build | `npx tsc` → **exit 0** (sem erros de tipo) |

## 2. Suíte executada (na fotografia congelada)

Comando: `npm run test:entregas` (decomposto abaixo). Todos verdes.

| Suíte | Comando | Testes |
|---|---|---|
| Foundation | `run-tests.js` | **11** |
| Integration | `run-integration-tests.js` | **14** |
| Gate-close | `run-gate-close-tests.js` | **12** |
| Aceitação A01–A39 | `run-acceptance-a01-a39.js` | **45** (31 diretos + 3 P0x + 11 equivalentes automatizados) |
| UI | `run-ui-tests.js` | **11** |
| Mapa | `run-map-tests.js` | **6** |
| **Total ENTREGAS** | | **99 testes — 100% verde** |

**Nota honesta sobre A01–A39:** 31 cenários são diretos; 11 (A17, A18, A24, A25, A28, A29, A31, A33, A35, A36, A37) são marcados "equivalente automatizado — coberto por A08/A15/A16/A30/A05/A09/G-policy", não testes individuais diretos. O runner soma 45 casos ok (diretos + P01–P03 + equivalentes). A cobertura A01–A39 é real, mas parte dela é por equivalência declarada, não 39 testes 1:1.

## 3. Superfícies executáveis (verificadas ao vivo, na fotografia)

Servidor `dist/tools/entregas_ui_server.js` (env `ENTREGAS_UI_PORT`, bind **`127.0.0.1`** — seguro por padrão). Todas responderam **200**:

| Superfície | Rota | HTTP | Conteúdo |
|---|---|---|---|
| Console de expedição | `/console/` | 200 | HTML real |
| Rider mobile | `/rider-mobile/` | 200 | HTML real |
| Expedição iFood (handoff) | `/ifood-handoff/` | 200 | HTML real |
| Mapa (POC) | `/map-poc/` | 200 | HTML real |
| API saúde | `/api/health` | 200 | JSON |
| API snapshot | `/api/snapshot` | 200 | JSON com domínio real (trips[], handoffs[], occurrences[], riders[], ready_orders[], policy `pilot-entregas-v1-default`, actor `operador_expedicao`) |
| API comando/ator/conexão | `/api/command`, `/api/actor`, `/api/connection` (online/offline/syncing) | — | rotas presentes |

Banner explícito no snapshot: **"AMBIENTE DE DEMONSTRAÇÃO — ApplicationService only · zero licença paga de mapa"** — honesto sobre ser demo.

## 4. Domínio e arquitetura presentes (não é protótipo visual — é domínio real)

- **Agregados** (`docs/entregas/DOMINIO_OPERACIONAL.md`, autoridade **COR-ENTREGAS-V1 @ 1.0.3**): Trip, Delivery, Handoff, Occurrence, RiderOperationalState.
- **Commands vs Events** separados (`operational/commands.ts` × catálogo público de eventos imutáveis).
- **ApplicationService** (`operational/application-service.ts`) + **UiApplicationFacade** (`ui/adapters/`).
- **Outbox** de confiabilidade (`integration/outbox.ts`, `integration/health-from-outbox.ts`).
- **Persistência**: `FileUnitOfWork` (`persistence/file-store.ts`, escrita atômica via tmp) + `memory-uow` para testes.
- **Contratos públicos congelados**: `docs/entregas/PUBLIC_CONTRACTS_FREEZE.json`; teste garante `SCHEMAS_HASH` estável.
- **Consumidor simulado do Copiloto** (`contracts/consumers/SimulatedCopilotoConsumer.ts`) — integração por eventos, sem acoplamento.

## 5. Regras soberanas — verificadas por teste (na fotografia)

| Regra COR | Verificação | Resultado |
|---|---|---|
| Pedido iFood não cria Trip | `handoff público não cria trip_id` | ✅ passou |
| Capacidade Viva/Copiloto não entra em Entregas | `nenhum import do Copiloto/Capacidade Viva dentro de src/entregas` | ✅ passou |
| Entrega confirmada por humano, sem culpa automática | `G3 emite delivery_unconfirmed público sem culpa` | ✅ passou |
| Handoff verificado conclui sem Trip | `Handoff: sem verificação falha; com verificação conclui sem Trip` | ✅ passou |
| Mapa sem PII / sem licença paga | `demo points anonimizados sem PII` · `fallback OSM web` | ✅ passou |

## 6. Limitações reais (fotografia bb567a6)

1. **Ambiente de demonstração** — snapshot carrega `demo_banner`, marca provisória "TATA", `ready_orders` são dados de demo/seed, não operação real.
2. **Persistência é arquivo local** (`FileUnitOfWork`) — adequada para demo/piloto assistido, **não** é banco de produção (sem concorrência multiusuário, sem réplica).
3. **Mapa é POC** — `MapProvider.ts`: "Implementação POC: MapLibre + estilo demo (não produção)"; navegação externa via links OSM. Não há tiles de produção nem licença.
4. **Aceite parcialmente por equivalência** — ver §2.
5. **Sem dado real integrado** — planilha de motoboy / comandas / mensagens ainda não alimentam o runtime; a fonte é seed/demo.
6. **Sem auth / monitoramento / rollback operacional** — é demo local, não piloto.

## 7. Veredito do ENTREGAS (corrigido)

O ENTREGAS **não é mais "só Gate Zero"**. Na fotografia `bb567a6` é um **módulo com domínio real, executável e testado**: 99 testes verdes, 4 superfícies servindo, ApplicationService + outbox + persistência de arquivo, regras soberanas do COR verificadas por teste, bind seguro por padrão. É **demo executável honesta** — não produção, não piloto (falta dado real, auth, banco, mapa de produção). A evolução é rápida e ativa (o HEAD avançou durante a própria auditoria), então qualquer conclusão só vale **atrelada ao commit**: esta vale para `bb567a6`.

## 8. Nota de transparência (incidente de auditoria)

Durante a limpeza do worktree destacado, a remoção forçada seguiu o junction de `node_modules` e **esvaziou temporariamente** o `node_modules` do worktree vivo `deliveryos-entregas-v1` (0 pacotes). Foi **restaurado imediatamente** via `npm install` (14 pacotes; typescript + playwright confirmados; working tree limpo). Nenhum arquivo versionado foi afetado; nenhuma perda permanente. Registro aqui por honestidade — foi um efeito colateral da minha limpeza, não do código do Entregas.
