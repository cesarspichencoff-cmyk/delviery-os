# Portable César Context Kernel v0.11 — observed-shadow replay proof

Date: 2026-09-27

## Scope

A separate portable package `cesar-context-kernel-v0.11.zip` was built from the preserved v0.10 line. v0.10 remains an intact rollback artifact.

v0.11 closes one concrete proof-path defect: Tally ingestion already allowed an explicit expected form identity, but v0.10 temporal context still hard-coded live form `ZjVv1a`. Therefore authentic shadow form `eq4lae` evidence could be admitted but could not traverse context -> hypotheses -> plan without mislabeling its origin.

## Identity correction

`expected_form_id` now propagates explicitly through:

- Tally barrier ingestion;
- temporal context;
- testable hypotheses;
- investigation plan.

The default remains `ZjVv1a`.

A shadow form is accepted only when a caller explicitly configures that exact form identity. Default/live context still rejects `eq4lae`.

## Current live Gate E recheck

Read-only inspection of production workbook `Caixa Executivo` / spreadsheet `1N77sVp2wgIUaIlGBN7uVvlOoImPpKB_hAXXU9IxC-gk` showed:

- tab `ocorrencias_respostas` is still present at sheetId `1057855332`;
- header row still exposes the 11 legacy fields only;
- the latest observed non-empty occurrence row remains submission `xV1xv4y`, submitted `2026-09-26 2:51:46`;
- no post-cutover real response is visible.

Therefore Gate E remains pending. No synthetic production occurrence was created and no live webhook was wired.

## Observed shadow evidence replay

Read-only inspection of isolated shadow spreadsheet `1Je2SRuugKx2FK1N39ShGwuUYWgNDO6YKEqHA1xicI-Q`, tab `Página1`, confirmed the previously proven exact 20-column schema and four controlled rows.

v0.11 replay uses:

1. `4ayaqYo` — Item faltando controlled serialization row;
2. `EqEK24l` — Item faltando row carrying operator marker `VERTICE_SHADOW_WEBHOOK_PROOF`.

Both observed rows carry the controlled barrier vector:

- `IDENTIFY_BEFORE_ADVANCE = REPORTED_DONE`;
- `REUNITE_COMPLETE_ORDER = REPORTED_NOT_DONE`;
- `PHYSICAL_POST_PRINT_CHECK = UNABLE_TO_CONFIRM`;
- `FINAL_DIVERGENCE_CONFERENCE = REPORTED_NOT_APPLICABLE`.

A separate existing DeliveryOS receipt proves a controlled occurrence with the unique `VERTICE_SHADOW_WEBHOOK_PROOF` marker crossed signed Tally webhook -> deployed Edge route -> remote D1. That receipt does not preserve the exact D1 event ID/submission-ID linkage. Therefore exact D1-row-to-kernel identity remains `UNKNOWN` and is not promoted here.

## Replay result

With `expected_form_id=eq4lae` explicitly configured:

- both observed rows enter the portable Event Spine as `OPERATOR_REPORT`;
- the later anchor sees one prior same-category/same-subtype occurrence;
- hypothesis layer emits `5` `TESTABLE_UNPROVEN` hypotheses;
- investigation plan emits `8` deduplicated probes;
- every probe remains `NOT_EXECUTED`;
- every probe remains `execution_authorized=false`;
- connectors called = `false`;
- Evidence Debt mutation = `false`;
- commitment creation = `false`;
- automatic `NEEDS_CESAR` = `false`;
- attention authority = `NONE`;
- causal status = `UNPROVEN`;
- external-effect authorization = `false`.

The same shadow anchor is rejected by the default/live Tally context service, proving this is explicit environment binding rather than an accept-any-form relaxation.

## Final packaged-byte proof

- version: `0.11.0`;
- tests collected: `100`;
- final extracted-ZIP tests: `100/100 PASS`;
- `python -m compileall -q src`: `PASS`;
- ZIP integrity: `PASS`;
- forbidden package entries (SQLite/DB, Python cache, pytest cache): `NONE`;
- Library path: `/VÉRTICE/CesarContextOS/cesar-context-kernel-v0.11.zip`;
- SHA-256: `65a7f59a0b736c7081b0cb1ec1b6275410cd5e43920676ea1e67141527422f73`;
- ZIP bytes: `73458`.

## Reality boundary

PROVEN:
- observed shadow rows can traverse portable context -> hypotheses -> plan without form spoofing;
- live defaults remain fail-closed to the shadow form;
- investigation remains read-only, non-causal and effect-free.

UNKNOWN / NOT PROVEN:
- exact D1 event identity linkage for `EqEK24l`;
- first real post-cutover production `ZjVv1a` occurrence;
- live 20-column production Sheet serialization;
- live webhook -> portable-kernel delivery;
- source independence, cause, guilt, barrier compliance/failure or operational resolution.

State remains `CODE_READY / TEST_PASS + OBSERVED_SHADOW_REPLAY_PROVEN`, not production WORLD_PROVEN.
