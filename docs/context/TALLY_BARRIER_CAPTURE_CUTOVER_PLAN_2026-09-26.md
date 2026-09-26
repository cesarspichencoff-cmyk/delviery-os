# Tally Barrier Capture — Production Cutover Plan — 2026-09-26

## Objective and boundary

Move the barrier-evidence capture proven on shadow form `eq4lae` into the live occurrence form `ZjVv1a` without breaking Caixa Executivo, without weakening truth semantics, and without making the historical Caixa Pulse closing-email source responsible for a data shape it does not currently carry.

This document is a plan only. No live Tally form, live Google Sheet, live webhook, or production runtime is modified by this receipt.

## Current WORLD_PROVEN basis

- Live occurrence form: `ZjVv1a`, workspace `3xP0bd`, 31 blocks, pinned SHA-256 `51f07f02436057199af4d8a9782c37945b9bc38a3f9d54db8104abff9b73d251`.
- Shadow occurrence form: `eq4lae`, 57 blocks, pinned SHA-256 `de5bd059926fb9d5b066ad760adcc7b7e7d0f545534f3186c018fb726d0d2db3`.
- Shadow delta: +26 Tally blocks before `Pedido / Mesa / Referência`.
- Shadow Google Sheet serialization: 20 exact headers, three controlled rows, conditional exclusivity proven.
- Live Google Sheets integration points to `Caixa Executivo` / `ocorrencias_respostas` (`gid=1057855332`).
- Authenticated live Tally editor access for `ZjVv1a` was revalidated read-only on 2026-09-26.
## What must not be conflated

The existing Caixa Pulse mail bridge is a shift-closing source. Its parser and D1 schema currently store only category, operator, status, reference, happened text, and action text.

It does **not** currently ingest:
- Subtipo operacional;
- the four Item faltando barrier answers;
- the four Item errado barrier answers.

Therefore a form-only cutover would capture the new evidence in Tally/Sheets but would not make it available to the Context Kernel.

The closing-email generator is not versioned in this repository and was not discovered as an accessible Apps Script file. Its exact generation path remains UNKNOWN. The live MIME `Message-ID: <autogen-java-...@google.com>` is consistent with Google-generated automation, but does not prove which generator produced it.

Decision: do not couple the new evidence to that unknown generator.

## Preferred transport: signed Tally webhook

Use a separate incident-level source from Tally to the Edge:
- trigger: Tally `FORM_RESPONSE`;
- source identity: live form ID `ZjVv1a`;
- authenticity: verify `Tally-Signature` using a secret;
- idempotency: `eventId` plus `submissionId`;
- truth class: OPERATOR_SELF_REPORT;
- external-effect authority: NONE;
- attention authority: NONE.

The existing closing-email source remains unchanged and continues to provide shift-level occurrence evidence.
## Gate A — code readiness before any live write

Build and prove an observation-only Tally occurrence intake in shadow:
1. Accept POST JSON only on one dedicated endpoint.
2. Verify the signature before parsing or persistence.
3. Reject any `eventType` other than `FORM_RESPONSE`.
4. Reject any form ID other than the configured shadow/live ID for the environment.
5. Parse only the minimum necessary fields.
6. Persist source IDs, source timestamp, subtype, eight optional barrier answers, and safe linkage fields.
7. Preserve missing/hidden matrix answers as missing, never as `Não`.
8. Map answers to operator-report semantics only.
9. Replay of the same event/submission must not create a second observation.
10. Invalid signature, malformed answer, unknown option, or mixed form identity must fail closed.
11. No route may directly create a management interruption or operational action.

Shadow proof must use `eq4lae` and its isolated environment before the endpoint can be eligible for live form wiring.

## Gate B — live Tally preflight

Immediately before editing:
- re-run the read-only live fingerprint probe;
- require exactly 31 blocks and the pinned live SHA above;
- require workspace `3xP0bd`;
- require the current live type taxonomy and status taxonomy to match pinned values;
- require the existing old-field group UUIDs to remain unchanged;
- require the Google Sheets integration still targets `Caixa Executivo` / `ocorrencias_respostas`;
- duplicate the live form or otherwise capture a recoverable pre-edit copy;
- capture the exact current public block snapshot.

Any drift stops the cutover.
## Gate C — live form draft delta

Edit `ZjVv1a` **in place**. Do not replace it with the shadow form, because the shadow copy has different UUIDs for the legacy fields.

Insert after the existing `Tipo de Ocorrência` group and before the existing `Pedido / Mesa / Referência` title:
- required single-choice `Subtipo operacional`: Item faltando / Item errado / Outro;
- hidden required matrix `Verificações - Item faltando`;
- hidden required matrix `Verificações - Item errado`;
- two conditional logic rules matching the proven shadow behavior.

Item faltando rows:
1. Item identificado antes de seguir
2. Todos os volumes reunidos
3. Conferência física após impressão/ajuste
4. Conferência final antes da saída

Item errado rows:
1. Produto e quantidade conferiam
2. Observações do cliente conferidas
3. Correção manual conferida fisicamente quando aplicável
4. Conferência final antes da saída
Both matrices use exactly:
- Sim
- Não
- Não consegui confirmar
- Não se aplica

Outro shows neither matrix.

Keep unchanged:
- all ten existing occurrence-type options;
- all existing legacy titles and input blocks;
- Turno requiredness (currently not required);
- all existing status options, including source text/spacing;
- legacy group UUIDs;
- existing Google Sheets integration.

The live Tally editor may assign new UUIDs to the inserted blocks. Do not assume or transplant shadow UUIDs. After draft creation, read the draft/public representation available and pin the generated live IDs before downstream parsing is promoted.

Preview must prove all three routes before Publish.

## Gate D — Caixa Executivo compatibility

Current live raw header sequence has 11 fields. Expected post-cutover sequence has 20 fields, with nine new columns inserted before `Pedido / Mesa / Referência`.

The workbook is position-resilient for the legacy analysis path: `Configuracao` uses header-name `MATCH`, and `analise_ocorrencias` uses the resulting column numbers.

Therefore the shifted positions of Pedido, Ação and Status should self-remap after headers appear, subject to post-cutover proof.

One known debt must be repaired in the same controlled window:
`Configuracao!E9` currently searches for `O que aconteceu?` while the source header is exactly `O que aconteceu?\n`, so it is currently FALTANDO.
Candidate minimal correction for the existing exact source shape:

`=IFERROR(MATCH("O que aconteceu?"&CHAR(10);ocorrencias_respostas!1:1;0);"")`

This formula is a planned production change, not yet WORLD_PROVEN in the live workbook.

After any Tally publish, require:
- exact 20-header serialization in `ocorrencias_respostas`;
- Operador/Data/Turno/Tipo/Pedido/O que aconteceu/Ação/Status all report OK in `Configuracao`;
- `auditoria_sync` reports no FALTANDO for legacy occurrence fields;
- existing `analise_ocorrencias` columns A:H retain their previous meaning;
- painel counts and last-five occurrence projection remain structurally valid.

Do not redesign the managerial panel during this cutover. New barrier fields may remain raw/source-level until the Context Kernel source adapter is proven.

## Gate E — integration behavior

The retrieved Tally documentation confirms Google Sheets submissions are written as rows and that spreadsheet columns may be moved or deleted while syncing continues. It does not, in the evidence loaded for this plan, prove the exact schema-mutation behavior of an already-connected integration when questions are added.

Therefore post-publish header observation is a mandatory gate, not an assumption.

If the expected 20 headers do not appear, stop. Do not reconnect with `Export existing submissions` until duplicate/backfill behavior has been explicitly modeled and authorized.
## Gate F — live webhook wiring

Only after the shadow webhook intake is PROVEN:
- configure the live `ZjVv1a` webhook to the live observation-only endpoint;
- create a separate signing secret and store it only as a runtime secret;
- do not expose the secret in repo, logs, evidence receipts, or form content;
- verify one webhook event in the Tally event log and one corresponding idempotent persisted observation;
- keep Google Sheets integration active; webhook is an additional structured source, not a replacement for operational history.

The incident-level webhook and shift-level closing email are two evidence surfaces with different semantics. They must not be silently deduplicated as the same fact without an explicit linking rule.

## Production proof

Preferred proof is the first real occurrence after cutover, not an invented operational incident.

For that real submission verify:
- Tally public form accepted the route;
- Google Sheet wrote the expected 20-column row;
- legacy workbook analysis stayed healthy;
- signed webhook was admitted exactly once;
- subtype/matrix answers match between Tally/Sheet and the webhook observation;
- no answer was promoted beyond OPERATOR_SELF_REPORT;
- no management interruption was created merely by the new capture fields.

Until this happens, state is DEPLOYED / DONE_UNVERIFIED, not WORLD_PROVEN.
## Rollback

Form rollback:
- remove only the 26 newly inserted blocks/logic from the live draft/form and republish;
- preserve all legacy blocks and their UUIDs.

Sheet rollback:
- do not delete historic occurrence rows;
- extra new columns, if already created, may remain empty because legacy mappings are header-based;
- restore the prior `Configuracao!E9` formula only if the new formula itself causes a proven regression.

Webhook rollback:
- disable/remove only the Tally webhook connection;
- keep already admitted observations as immutable source evidence, marked with their source IDs;
- no replay or deletion is required to restore the old operational path.

The existing shift-closing email source remains operational throughout and is not changed by this cutover.

## Authorization boundary

Safe preparation may continue: code, tests, shadow webhook proof, read-only live preflight, and evidence receipts.

A near-action authorization from César is required before:
- editing or publishing `ZjVv1a`;
- changing `Caixa Executivo`;
- wiring the live Tally webhook;
- sending a synthetic submission into the live operational form.

No production cutover is authorized by this plan.
