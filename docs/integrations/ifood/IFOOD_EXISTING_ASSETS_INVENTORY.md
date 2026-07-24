# Inventário de ativos existentes relacionados a iFood — Fase 0

> Levantamento feito por busca no repositório inteiro (código e documentação)
> antes de escrever qualquer linha da fundação de integração oficial. Nenhum
> arquivo foi alterado nesta fase.

## 1. Achado estrutural (leia antes da tabela)

Tudo que existe hoje sob o nome "iFood" neste repositório **não é uma
integração com a API oficial**. É um de três padrões:

1. **Scraper de tela via Playwright** (`src/conference-brain/live/*`) —
   observa passivamente o portal web "Gestor de Pedidos" (DOM/HTML), nunca a
   API REST oficial. Sem OAuth, sem client_id/secret, sem webhook, sem
   polling de endpoint, sem token de acesso — a fonte nunca foi um endpoint
   HTTP autenticado. `playwright`/`playwright-core` **não está instalado**
   (zero deps de runtime em `package.json`); o adaptador tenta `require()`
   em runtime e falha graciosamente se ausente — confirmado que hoje não
   roda. `data/conference-brain/` não existe em disco — nenhum ciclo real
   foi executado.
2. **Parsers de relatórios exportados em lote** (`src/ingest/*`,
   `tools/parse_*ifood*.js`) — consomem HTML/XLSX baixados manualmente do
   painel administrativo, não uma API.
3. **Lógica de embalagem/sacola interna** (`src/perfil-delivery/motor.js`) —
   real e testada, mas alimentada por composição de pedido **sintética**
   (rotulado explicitamente no próprio cabeçalho do arquivo).

Consistente com `docs/conference-brain/IFOOD_SCREEN_SOURCE_MAP_V1.md`:
*"não existe hoje, em nenhum lugar do patrimônio, uma observação real da
tela de gestão de pedidos do iFood"*; *"nenhum arquivo de sessão, cookie,
token ou perfil de navegador existe no repositório"*.

## 2. Tabela por termo pesquisado

| Termo | Onde aparece | Classificação |
|---|---|---|
| `ifood` (geral) | 158 arquivos — ver §2.1 | Misto |
| `merchant` | `conference-brain/live/store-state.js:56-93` (`merchantId`, rótulo de conta capturado da tela); `docs/Inventario_Dados_Primarios.md:21` (`merchant_id` real, achado num export HTML) | Código real (rótulo de tela) + dado real isolado |
| `order`/`pedido` | Onipresente em `conference-brain/contracts/*`, `live/*`, `src/live/*`, `src/core/*` | Contrato/schema + código real — nunca ligado a API |
| `event`/`evento` | `conference-brain/contracts/live-states.js:84-103` (`CLOCK_EVENT_TYPES`); `conference-brain/live/dimension-events.js`; `src/live/contrato.js:18-27` (`EVENT_TYPES` do envelope PréLoja) | Código real, vocabulário interno próprio, não nomenclatura de webhook do iFood |
| `webhook` | Nenhuma ocorrência | Inexistente |
| `polling` | `docs/Fonte_Real_Itens_Plano.md` (1 menção de planejamento) | Documentação/hipótese |
| `authentication`/`oauth` | Nenhuma ocorrência | Inexistente |
| `token` | Nenhum é token de API (teste genérico, `merchant_id` em doc) | Inexistente |
| `acknowledgement` | Nenhuma ocorrência | Inexistente |
| `dispute` | Nenhuma ocorrência | Inexistente |
| `cancellation`/`cancelamento` | `src/copiloto/canonical-model.js:80`; `src/live/idempotencia.js:31-33`; `src/ingest/ifoodRelatorio.ts:31` (`motivoCancel`, coluna de export); `tests/live/cancelamento.test.js` | Código real, sempre a partir de export em lote, nunca webhook/evento de API |
| `delivery`/`courier` | `conference-brain/live/multidimensional-observation.js:172-209` (`buildCourierDimension`); `clock.js:156-163` (relógio nunca lê logística) | Código real, dimensão derivada de texto de tela hipotético |
| `package`/`bag`/`volume`/`sacola` | `src/perfil-delivery/motor.js:32-322`, `decisao.js:138-153` (`sacolas`, `temQuente`/`temFrio`); `docs/Logica_Embalagens_DeliveryOS_V0.md` | Código real mas fonte de composição SINTÉTICA (rotulado no cabeçalho) |
| `"Volume 1 de 2"`/`package_count` | Nenhuma ocorrência literal | Inexistente — vocabulário equivalente é `sacolas`/`segundaSacola`, próprio do DeliveryOS |
| `inbox`/`outbox` | Nenhuma ocorrência | Inexistente |
| `idempotency`/`idempotência` | `conference-brain/storage/store.js:90-107` (`put()`, chave natural); `conference-brain/contracts/schemas.js:152-157` (`naturalKey`); `src/live/idempotencia.js` (chaves por prefixo); `conference-brain/live/clock.js:72-118` (`isSameFact`) | Código real — **duas implementações distintas, não unificadas** |
| `reconciliation`/`reconciliação` | `conference-brain/live/reconciliation.js` (535 linhas, campo a campo); `docs/conference-brain/RECONCILIATION_V1.md` | Código real e testado — reconcilia observações de TELA sucessivas, não reconciliação de eventos de API |

### 2.1 Detalhamento de "ifood" por área

| Área | Classificação |
|---|---|
| `src/conference-brain/live/*` (observer, browser-adapter, playwright-preflight, reconciliation, multidimensional-observation, clock, grouping, dimension-events, legacy-compat, pii-guard, evidence, mapping-mode, status-map, store-state, health, indicators, schedule, ready-departure, operator-panel) | Código real implementado, com testes (79+) — scraper de portal, nunca executado contra sessão real |
| `src/conference-brain/contracts/*` (schemas.js, live-states.js, states.js, rule-version.js) | Contrato/schema — validação de forma, sem I/O |
| `src/conference-brain/storage/store.js` | Código real implementado, com testes — JSONL append-only |
| `docs/conference-brain/IFOOD_FUNCTIONAL_MODEL_V1.md` | Documentação — fontes públicas de marketing (blog-parceiros), não documentação de DOM/API |
| `docs/conference-brain/IFOOD_SCREEN_SOURCE_MAP_V1.md` | Documentação/auditoria — conclui que nada foi observado ao vivo ainda |
| `src/ingest/parserRelatorioIfood.js`, `src/ingest/ifoodRelatorio.ts` | Código real — consome export manual, não API |
| `tools/parse_lote_ifood_2026-07-01.js`, `tools/parse_relatorio_pedidos_html.js`, `tools/parse_relatorio_pedidos_com_itens_html.js` | Código real — mesma natureza (lote) |
| `docs/descoberta-conferencia/PROPOSTA_A_COLETOR_IFOOD_SEM_API.md` | Documentação/hipótese — proposta arquitetural deliberadamente SEM API |
| `docs/Checklist_Fonte_Continua_iFood.md`, `docs/Pedido_iFood_Fonte_Continua_Composicao_Logistica.md`, `docs/Mensagem_iFood_Pedido_Fonte_Continua.md` | Documentação/hipótese — pedido por e-mail ao iFood, sem resposta/contrato fechado |
| `tools/live/simulator/*`, `mocks/copiloto/fixtures/*`, `data/descoberta-conferencia/*` | Simulador/fixture — dados fabricados |
| `src/perfil-delivery/motor.js`, `decisao.js` | Código real, fonte de composição SINTÉTICA |

## 3. Reaproveitável vs. construir do zero

### 3.1 `storage/store.js` (JSONL append-only) — resposta direta

**O padrão vale a pena repetir; o arquivo NÃO é importado diretamente.**

O que já resolve bem e é transferível como *padrão de engenharia*: append-only
real, idempotência por chave natural, falha segura de I/O, linha corrompida
nunca descartada em silêncio (`corrupted[]`), `health()` auditável.

O que impede reuso 1:1:
1. Acoplado a `conference-brain/contracts/schemas.js` — misturar o registro
   de schemas da integração oficial ali seria acoplar dois domínios que a
   missão explicitamente pede para manter independentes.
2. Sem conceito de redelivery/at-least-once (status de processamento por
   evento, acknowledgement) — essencial para inbox/outbox de webhook,
   ausente no store do conference-brain.
3. Sem particionamento por merchant/loja.

**Decisão tomada nesta missão:** implementar uma cópia independente e
autocontida do MESMO padrão (append-only, chave natural, `corrupted[]`
nunca silencioso, `health()`) em
`src/integrations/ifood-official/storage/store.js`, sem nenhum `require` de
`conference-brain/*` — isolamento total, zero acoplamento, conforme exigido.

### 3.2 Reaproveitável como *princípio*, não como import

- Separação rígida "vocabulário oficial documentado" × "hipótese de
  implementação" × "comportamento observado" (`IFOOD_FUNCTIONAL_MODEL_V1.md`).
- Guard de PII por allowlist, nunca blocklist (`pii-guard.js`).
- Reconciliação campo a campo, nunca "registro inteiro vence"
  (`reconciliation.js`).
- Relógio de eventos append-only com transições validadas e identidade de
  fato além do tipo (`clock.js`, lição do Sprint 2.4).
- Desempate determinístico por metadado causal, nunca por posição no array,
  com estado de conflito explícito quando não há causalidade (lição do
  Sprint 2.4, `grouping.js#resolveTie`).

Todos esses princípios são REIMPLEMENTADOS de forma independente nesta
missão — nenhum código é importado do `conference-brain`.

### 3.3 Construir do zero (nada reaproveitável)

Autenticação OAuth2/client credentials · cliente HTTP para Merchant/Order/
Events API · consumo de webhook ou polling de endpoint real ·
acknowledgement de eventos · modelo de disputa/negociação via API ·
persistência de token/credencial · `package_count`/volumes no formato que a
API do iFood usaria (o que existe, `sacolas`, é vocabulário interno sobre
dado sintético).

### 3.4 Confirmado fora de escopo (não colide)

CRM/conversas/WhatsApp: nenhum código existe (`grep -rli "\bcrm\b"` vazio);
só `docs/Estudo_Conversas_WhatsApp.md` (análise histórica, não feature).
Nada para colidir com `feature/conversation-crm-pilot-v0`.

## 4. Confirmação das pastas de destino

| Pasta | Existe? |
|---|---|
| `src/integrations/` | Não existia — criada nesta missão |
| `tools/ifood-simulator/` | Não existia — criada nesta missão |
| `docs/integrations/ifood/` | Não existia — criada nesta missão |

Nenhuma colisão de nome com trabalho paralelo.

## 5. Resumo executivo

1. Não existe hoje nenhuma integração real com a API oficial do iFood —
   zero webhook, zero polling de endpoint, zero OAuth, zero token, zero
   acknowledgement, zero disputa via API.
2. Existe um scraper de tela (20+ arquivos, 79+ testes) desenhado
   deliberadamente para NÃO usar API — resolve um problema diferente.
3. Existem parsers de exports em lote — dado real, mas o oposto de
   contínuo/tempo real.
4. Existe lógica de embalagem real e testada, alimentada por composição
   sintética — sem ligação com campo real de volumes do iFood.
5. O padrão de storage JSONL append-only é sólido e repetido como
   *princípio*, nunca como import direto — evita acoplar os dois domínios.
6. As três pastas de destino estavam livres, sem colisão.
