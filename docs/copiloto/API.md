# API de referência

- OpenAPI: `openapi/copiloto-openapi.yaml`
- Mock: `node mocks/copiloto/server.js` → http://localhost:5188
- Schemas: `schemas/copiloto/*.json`

## Recursos
state, areas, focus, forecast, anomalies, briefing, closing, voice/intents, playbooks, scenarios, shadow/gates, metrics

## Versionamento
Path `/v1` + `schema_version` nos payloads.

## Idempotência
Escritas futuras: header `Idempotency-Key`.

## Latência esperada (mock/local)
state/focus <100ms; forecast <150ms; closing <200ms.

## Fallback
degraded → menos interrupção; failed → sem Foco operacional.
