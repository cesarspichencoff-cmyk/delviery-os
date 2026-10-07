# Shadow safety gate: allergy notes (2026-10-07)

## Scope
A shadow-only guard prevents an event with an explicit allergy or anaphylaxis mention in a proven, joined observation from receiving `ready=true`. It does not print, write to the POS, alert kitchen staff, release an order, or perform a fiscal operation.

## Installed on CAIXA_MOOCA
Runtime: `C:\ProgramData\TataComandaReader\shadow\live_shadow_consumer_v1.cjs`.
Old SHA256: `CEE9CCE820C1C8E2C081C700394CC0A3F9254882606CBF0AB1468CD279B5EAE2`.
Installed SHA256: `DF478079CAE1C9A28D92BBF4B78D8EE554C173727A11B3EF79A4EF4E9C9ED84E`.
Backup: `live_shadow_consumer_v1.cjs.backup-pre-allergen-gate-20261007`.

## Shadow-only read-only replay, six cases
- iFood 6407: allergy to shrimp was observed; `ready=false`, blocker `ALLERGEN_NOTE_REQUIRES_HUMAN_REVIEW`.
- iFood 1577: lactose allergy was reported; `ready=false`, same blocker.
- iFood 2435, 6370, 1161: `ready=true`; no new blocker.
- iFood 6534: `ready=false`, expired upstream service state remains blocked.

Result: 6/6; node syntax passed; service running; `print=false`, `fiscal_action=false`.

## Source divergence / do not overwrite
The GitHub file `runtime/shadow/live_shadow_consumer_v1.cjs` differs materially from the running CAIXA_MOOCA consumer: the installed version includes item/order observation preservation, current aliases and operational combo bridging. The GitHub file gained an equivalent conservative allergen guard but is not byte-identical. **Do not deploy GitHub file over the operational file** without reconciling and proving all differences.

A textual allergy notice is not confirmation that the kitchen was informed or that safe preparation occurred. The shadow does not implement a verified human acknowledgment workflow.