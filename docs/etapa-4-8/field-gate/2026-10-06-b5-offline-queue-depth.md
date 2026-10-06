# B5 — profundidade da fila offline do telefone

Data: 2026-10-06
Base auditada: `a117c433390e7d1631b0d8d85d3e9346a9503376`
Escopo: código + runtime local isolado; sem produção e sem cutover.

## Estado

**B5 = TEST_PASS / LOCAL_RUNTIME_PROVEN / FIELD_PROOF_PENDING.**

O gap técnico “fila offline = integração pendente” foi fechado. A prova física em
telefone real de campo ainda não aconteceu e não é inferida a partir dos testes.

## Implementação

- Android já mede `pendingCount()` separadamente para GPS e eventos.
- `POST /api/device/queue-depth` aceita **exatamente**:
  - `pending_points`;
  - `pending_events`.
- Ambos precisam ser inteiros entre 0 e 1.000.000.
- Campo extra é recusado. `device_id` não entra no corpo: vem somente do Bearer autenticado.
- Coordenadas, localização, `trip_id`, payload operacional, rider/customer PII não entram no contrato.
- O servidor carimba `queue_depth_reported_at` e grava somente o estado técnico mais recente em `identity.device`.
- A telemetria não entra no `event_log` e não altera `source_mode` dos fatos operacionais.
- Revogação concorrente é fail-closed: o UPDATE condicionado precisa afetar a linha; caso contrário a rota retorna 403.
- O papel `deliveryos_critical` ganha UPDATE somente nas três colunas B5, sem autoridade para unidade, ator, revogação ou segredo.
- O Product System mostra total + pontos + eventos; nunca reportado continua `nao_observado`, não zero.

## Provas

- `npx tsc --noEmit`: **PASS**.
- `test:platform:queue-depth`: **10/10 PASS**.
- `test:platform:queue-depth:pg`: **12/12 PASS** em PostgreSQL real isolado.
- `test:platform:queue-depth:http:pg`: **8/8 PASS** com `critical` compilado + HTTP + PostgreSQL.
- Android `gradlew testDebugUnitTest`: **BUILD SUCCESSFUL**, 30 tarefas, exit 0.
- Product System: **51/51 PASS**.
- Device auth: **26/26 PASS**.
- B7 Human Action Gate: **13/13 PASS**.
- `build:platform`: 9 migrations copiadas; contrato e build stamp gerados.
- Cadeia real: D3 atualizado para a nova semântica B5 e P1–P5 de privilégios passaram.
  A suíte ficou 35/36 por C17–C20 (encerramento não gracioso do worker assíncrono), fora do caminho B5; a falha foi preservada como aberta, não mascarada.

## Fronteiras

- produção: **não tocada**;
- cutover: **não executado**;
- migration remota: **não aplicada**;
- telefone físico em campo: **ainda não WORLD_PROVEN**;
- B7: **CONTRACT_PREPARED / NOT_EXECUTABLE**, sem mudança;
- gasto novo: **nenhum**.

## Próxima prova segura

Em teste controlado, um telefone físico autorizado deve reportar uma fila conhecida e o
Product System deve refletir exatamente os mesmos `pending_points` e `pending_events`.
Só essa prova pode promover o B5 de runtime local para WORLD_PROVEN de campo.
