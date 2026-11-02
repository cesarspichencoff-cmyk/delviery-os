# DeliveryOS V1 — árvore conectada, rastreabilidade e gates (02/11/2026)

**Estado:** CANDIDATE / DRAFT / HOLD. Unidade operacional: ITAIM. Esta árvore não é deploy, aceitação humana, uso no caixa, GPS de campo ou migração SQL. Produção inalterada.

## Fonte única de continuidade

- Produto: `docs/product/DELIVERYOS_CANONICAL_SOURCE_INDEX.md` (autoridade sobre telas, papéis e contratos).
- Missão V1: issue #103. TATÁ Comandas permanece frente independente (#102).
- Base antes da integração: `f915161a6d71d2292d957845df382fc3c1623a9e` (CI `41390278990` SUCCESS).
- Consolidação revisável: PR #133, branch `integration/deliveryos-v1-connected-20261102`.
- Inventário de patrimônio e hashes: PR #132, `docs/execution/evidence/DELIVERYOS_WORK_PRESERVATION_MANIFEST_20261102.json`, 2.069 blobs e 118 PRs. Nunca copiar indiscriminadamente os 17 arquivos `main`-only como workflows ativos.
- VÉRTICE atual: `cesarspichencoff-cmyk/vertice-runtime.` / `vertice-active` / `VERTICE_ENTRY.md`. Revalidar antes de novo plano que mude direção.

## Ligações de código

```text
Motoboy autorizado, viagem própria e consentimento
  -> Android TripLocationService (Fused GMS ou LocationManager nativo)
  -> CanonicalPoint / sessão vigente / somente ponto não-mock
  -> Room persistente e fila offline -> SyncWorker
  -> contrato de dispositivo, HTTPS e recibo do piloto [release gate]
  -> domínio Entregas (Trip, Delivery, retorno, idempotência)
  -> outbox de eventos públicos -> leitura de Copiloto
  -> vínculo EXPLÍCITO delivery_added: (unit_id, source_mode, delivery_id) -> trip_id
  -> eventos de entrega/chegada e visão read-only da mesma Trip

Navegador rider -> gps-status.js: watch por geração + Trip; STOP e callback antigo não reabrem viagem
Caixa/tablet -> console/leitura Entregas e Copiloto, sem assumir GPS do computador
Reader TATÁ -> adaptador de origem comprovada -> motor TATÁ -> pedidos do Copiloto
Gestor iFood -> sensor externo (contagens sem IDs não viram pedidos individuais)
Toqan -> agregado Shadow opcional, nunca fonte de Trip/GPS/prontidão
```

**Fronteira crítica:** o segmento Copiloto de correlação portado da PR #109 é `SimulatedCopilotoConsumer` e permanece **SIMULADO**, não fornece autorização para ligar consumo ao vivo. O sistema já contém projeções e ensaios PG/HTTP, porém a ligação operacional real exige identidade, proveniência e autorização próprias. Não representar esta árvore como cadeia produtiva física completa.

## Origem e tratamento das alterações

| Origem | Aplicação nesta candidata | Critério |
|---|---|---|
| #128 | Kotlin Room, provider alternativo, rejeição de mock, JUnit e workflow | Manter bugs P0 fechados; JVM/Room sob CI |
| #129 | Watch de navegador por geração, testes e workflow | Sem GPS atrasado entre viagens |
| #109 | Correlacionar `delivery_id` pela aresta pública `delivery_added`, testes originais | Sem inferir vínculo, sem ler domínio privado |
| Revisão #133 | Rejeitar `trip_id` ambíguo entre unidades/modos; teste adversarial | Escopo explícito ou falhar fechado |
| Base `f915161a` | R5-D2 anti-falso-positivo preservado | Não restaurar varredura antiga |
| #126 prevalece sobre #125 | Papel compartilhado sem permissões de recibo sem segregação comprovada | Segurança; não executar migration 0011 |
| #111 e #115 | Comportamentos já presentes na candidata (401 em SyncWorker e AsyncLocalStorage na facade) | Conferir regressão, não copiar patch antigo |
| #132 | Manifesto, diffs, genealogia e 17 arquivos só da `main` | Preservar conhecimento, não ativar sistemas antigos |

## Gates

1. **Git:** `git diff f915161a...HEAD` inclui só integração declarada e teste estrutural que aceita fallback seguro; nenhuma exclusão de fonte histórica.
2. **Node e CI integrado:** `deliveryos-product-ux` nesta branch, com TypeScript, PostgreSQL descartável, HTTP, migrações em laboratório, R5, Copiloto, Gate Close e watcher/rider tests.
3. **Android:** workflow `deliveryos-android-gps-persistence-review`, JUnit real Room/Robolectric. Teste estrutural **deve exigir** fallback GMS→nativo com permissão vigente **ou** parar serviço; não aceitar silêncio com GPS fictício.
4. **Navegador:** workflow `deliveryos-rider-gps-watch-review`, watcher gerações e regressão capturador.
5. **Ponta a ponta LAB:** autenticação individual, privilégios RLS, recibos, offline/reenvio, fonte de pedidos e mesmas projeções no Copiloto; qualquer falha RED mantém HOLD.
6. **Campo e release separados:** Android de vários fornecedores, GMS/no-GMS, permissão revogada, viagem real autorizada, caixa/tablet, backup/rollback/consentimento e aceite explícito de César. Nenhum teste automatizado converte `FIELD_UNKNOWN` em `PROVEN`.

## Regras de convergência

- Não mesclar #125 ou todas as 97 PRs sem análise semântica. PR fora da genealogia não implica perda nem obrigação de instalar código antigo.
- Não confundir host remoto `CAIXA_MOOCA` com loja Mooca: é o caixa do Itaim.
- Foco V1: motoboys internos com Trip; motoboy externo como Handoff. Copiloto continua produto central; Entregas módulo operacional.
- Sem SQL/rede/serviço de loja, impressão, escuta de localização ou custo novo por inferência.
- Uma entrega só conta como completa se prova do SHA, aprovação de campo e efeito humano relevante estiverem presentes. Antes disso, estado parcial visível.
