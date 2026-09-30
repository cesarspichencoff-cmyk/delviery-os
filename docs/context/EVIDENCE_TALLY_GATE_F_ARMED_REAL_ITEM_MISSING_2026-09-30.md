# Tally Gate F — armed live webhook + real Item faltando serialization — 2026-09-30

## Scope
This receipt continues the authorized Gate F cutover without creating any synthetic production occurrence and without authorizing restaurant operational effects.

## Cloudflare side — PROVEN
- Edge shadow webhook tests passed 40/40.
- `tata-edge-cloud-shadow` was deployed as version `de70431e-f01a-4563-8490-8f6a5a3cbaa2`.
- `TALLY_CAPTURE_ENABLED=true`.
- `TALLY_EXPECTED_FORM_ID=ZjVv1a`.
- Worker health returned `status=ok` and `external_effects_authorized=false`.
- An unsigned POST to `/sources/tally/occurrence-barrier` returned HTTP 401 `invalid_signature`.
- The last machine-read D1 state after Worker deployment and before manual Tally connection was 1 shadow row and 0 live `ZjVv1a` rows.

## Tally side — HUMAN_CONFIRMED, WORLD DELIVERY NOT YET PROVEN
César confirmed completion of the manual Tally `Connect` step after the endpoint and signing-secret fields were prepared.

This is `HUMAN_CONFIRMED_ACTION`, not `WORLD_PROVEN` live delivery. World proof requires the next real post-connect form submission to cross the signed webhook into D1.

The temporary local transfer artifact used for the signing secret was zeroized after the Connect confirmation.

## New live source evidence — real Item faltando is now PROVEN
A fresh read-only Google Sheets read of `Caixa Executivo / ocorrencias_respostas` observed real production `Item faltando` rows that were not available at the prior Gate E receipt.

- `kb1OKyo` — submitted 2026-09-29 01:31:12 — M:P = Sim | Sim | Sim | Sim.
- `o91lKJx` — submitted 2026-09-29 01:35:16 — M:P = Não consegui confirmar | Sim | Sim | Não consegui confirmar.
- `rD1qDER` — submitted 2026-09-29 18:59:27 — M:P = Sim | Sim | Sim | Sim.
- `9NyrN0X` — submitted 2026-09-29 19:01:13 — M:P = Sim | Não se aplica | Não | Não se aplica.

For these rows, the inactive Item errado matrix Q:T remains empty.

Therefore `REAL_ITEM_MISSING_SERIALIZATION = PROVEN`.

## Current boundary
The latest live Sheet submission observed in this read is 2026-09-29 19:01:13, which predates the 2026-09-30 Gate F connection.

Therefore there is not yet a real post-connect event available to prove signed live delivery, one persisted live D1 observation, idempotency on that production event, exact live event/submission identity linkage, or minimized-envelope delivery into Context Kernel v0.11.

## State
`GATE_F_ARMED_WAITING_REAL_EVENT`

This is not DONE and not WORLD_PROVEN end-to-end.

## Next proof gate
Wait for the next real `ZjVv1a` production submission. Then, without synthetic production data: prove signed Tally delivery; prove exactly one persisted live D1 observation; prove replay/idempotency; preserve `OPERATOR_SELF_REPORT` and causal status `UNPROVEN`; feed the minimized envelope into Context Kernel v0.11; verify attention authority remains NONE and external effects remain false.
