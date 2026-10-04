# B5 — Device Queue Telemetry

Data: 2026-10-04
Branch: `tmp/device-queue-telemetry-b5-20261004`
Base: `a117c433390e7d1631b0d8d85d3e9346a9503376`

## Lacuna fechada

A rechecagem anterior havia reduzido B5 à profundidade da fila offline do telefone. O Android já
media os contadores no Room, mas o servidor não os recebia.

## Implementação

- migration `0009_device_runtime_status`;
- endpoint autenticado `POST /api/device/status`;
- corpo estrito: `pending_points`, `pending_events`, `rejected_points`;
- `device_id` vem do Bearer;
- `source_mode` vem da instância crítica;
- qualquer campo extra recebe 400 e não persiste;
- nenhum ponto, coordenada ou conteúdo da fila entra na telemetria;
- `SyncWorker` reporta best-effort sem bloquear a sincronização principal;
- realidade de Entregas evolui para `realidade-de-entregas@1.1.0`;
- frescor da fila: 20 min; stale e ausência nunca viram zero atual.

## Provas

- status puro: **10/10 PASS**;
- PostgreSQL 17.11 descartável: **8/8 PASS**;
- Product System: **54/54 PASS**;
- device-admin: **19/19 PASS**;
- database-preflight: **8/8 PASS**;
- auth: **26/26 PASS**;
- runtime-wiring: **21/21 PASS**;
- deploy audit: **30/30 PASS**;
- Android compile e unit tests: **BUILD SUCCESSFUL**;
- Android project: **43/43 PASS**;
- device-api: **43/43 PASS**;
- browser: `B5_UI_RUNTIME_GREEN`, fila fresca 9, stale e nunca reportada distintos, HTTP/page errors 0;
- Figma Full: node `22:2`, screenshot renderizado.

### Limite conhecido do harness

`test:platform:cadeia` executou a cadeia PostgreSQL real e passou os casos B5 `D3b` e o caminho
com papel mínimo, mas terminou **36/37** no gate antigo `C17-C20`: no Windows,
`child.kill("SIGTERM")` encerra o child com exit code `null` em vez de `0`. O mesmo limite
aparece no teste Q-016 de processos. O código desse gate não foi alterado por B5 e a suíte Q-016
de lógica/restore passou **27/27**.

## Fronteira

**B5 está resolvido no escopo técnico/local.** Não há prova de aparelho físico ou produção, e
nenhum deploy/cutover foi realizado.
