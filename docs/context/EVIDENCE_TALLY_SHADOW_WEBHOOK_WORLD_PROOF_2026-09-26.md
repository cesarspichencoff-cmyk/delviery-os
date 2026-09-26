# EVIDENCE — Tally shadow webhook world proof — 2026-09-26

## Boundary

This receipt records a controlled SHADOW transport proof only.

- source form: `eq4lae` (shadow copy of the Caixa Pulse occurrence form)
- live production form `ZjVv1a`: not modified
- live Caixa Executivo workbook: not modified
- source truth class: `OPERATOR_SELF_REPORT`
- attention authority: `NONE`
- external effects authorized: `false`

## Code and CI

The signed Tally intake is implemented in the TATÁ Edge shadow runtime with:
- dedicated POST route `/sources/tally/occurrence-barrier`;
- exact HMAC-SHA256 / base64 verification of `Tally-Signature`;
- exact expected form identity gate;
- subtype and matrix allow-lists;
- inactive-matrix fail-closed behavior;
- idempotent event/submission persistence;
- replay conflict detection by payload SHA-256;
- no path to management interruption or restaurant operational action.

Implementation commits:
- `2042bcf` — signed Tally barrier shadow intake
- `6de60d2` — portable storage proof for CI

GitHub Actions Edge Shadow CI run `36237801515` completed successfully for `6de60d2eb46d6aa08716348a22090bb9e50571ec`.

## World proof

The shadow Tally integration was connected to the deployed TATÁ Edge endpoint and a controlled submission was sent from `eq4lae`.

Remote D1 `tata-edge-tally-shadow` (`13b7d2ef-e119-4a2b-8745-46ee3acedb35`) then contained exactly one proof row.

Observed row properties:
- form ID: `eq4lae`
- operator marker: `VERTICE_SHADOW_WEBHOOK_PROOF`
- business date: `2026-09-26`
- shift: `Manhã`
- category: `Problema no Delivery`
- subtype: `Item faltando`
- truth class: `OPERATOR_SELF_REPORT`
- item-missing vector serialized as:
  - Item identificado antes de seguir → `REPORTED_DONE`
  - Todos os volumes reunidos → `REPORTED_NOT_DONE`
  - Conferência física após impressão/ajuste → `UNABLE_TO_CONFIRM`
  - Conferência final antes da saída → `REPORTED_NOT_APPLICABLE`
- wrong-item matrix: absent, as required by conditional exclusivity
- the source payload hash was persisted
- no operational action was authorized

This proves the real chain:

`Tally shadow eq4lae → signed webhook → deployed Edge route → signature/form/schema gates → remote D1 persistence`.

It does not prove a production cutover, real-team operational adoption, barrier compliance/failure, cause, guilt, or action effectiveness.

## Remaining production gate

Safe preparation may continue with a copy of the live Caixa Executivo workbook and read-only live preflight.

Explicit near-action authorization from César is still required before:
- editing or publishing `ZjVv1a`;
- changing the live Caixa Executivo workbook;
- wiring a live `ZjVv1a` webhook;
- submitting synthetic data to the live operational form.
