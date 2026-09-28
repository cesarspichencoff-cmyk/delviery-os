# iFood local OCR executor contract — 2026-09-27

## Scope

This receipt advances the layout-aware OCR path without deploying OCR or changing production.

The selected architecture remains:

`stored review attachment -> explicitly authorized local source -> local OCR engine -> layout-aware parser -> UNVERIFIED derived candidate`

Cloudflare mail ingestion/storage remains unchanged.

## Contract

Added:

- `deploy/cloudflare/gerencial-mail-bridge/src/ifood-review-local-ocr-executor.js`
- `deploy/cloudflare/gerencial-mail-bridge/src/ifood-review-local-ocr-executor.test.mjs`

Version:

`ifood-local-ocr-executor@0.1.0`

The executor has no built-in network client and no built-in Tesseract dependency. Its dependencies are injected:
- an attachment source exposing only `load({mailbox_key, attachment_index})`;
- an OCR engine exposing only `recognize({bytes, region})`.

This keeps source authorization, transport and engine choice outside the parser semantics.

## Admission gates

Before OCR is called, the executor requires:

- exact source-ref shape;
- mailbox key in `UIDVALIDITY:UID` form;
- non-negative attachment index;
- exact expected SHA-256;
- explicit expected source class;
- PNG or JPEG MIME type;
- non-empty image <= 5 MiB;
- actual attachment SHA-256 matching the pinned expected hash.

Default source class:

`AUTHORIZED_TEAM_MAIL`

A César self-sent benchmark source is rejected by default. It can only be admitted when the executor is explicitly rebound to:

`CESAR_SELF_SENT_REFERENCE_BATCH`

This mirrors the existing explicit-environment binding pattern rather than adding an accept-any-source route.

## OCR boundary

For an admitted image, the engine is called exactly twice:

1. `FULL_PAGE`
2. `ORDER_HEADER`

The output is passed through `ifood-review-ocr-parse@0.1.0`.

The result remains:
- `verification_status = UNVERIFIED`;
- `source_fact_promotion_allowed = false`;
- `persistence_authorized = false`;
- `notification_authorized = false`;
- `external_effect_authorized = false`;
- raw image bytes are not returned by the executor.

## Negative tests

The contract proves fail-closed behavior for:
- wrong source class;
- SHA-256 mismatch;
- forbidden non-image MIME type;
- injected extra source-ref fields;
- source/hash failures occurring before the OCR engine is invoked.

## Proof

Implementation/test head:

`95b34ca64cfe6334604d12312118c16a9411ad6c`

GitHub Actions:
- workflow: Edge Shadow CI;
- run: `36366823937`;
- result: `SUCCESS`.

## Reality boundary

PROVEN:
- local executor semantics and admission gates;
- source-class binding;
- source hash binding;
- two-region OCR call contract;
- no automatic persistence/notification/effect authority;
- full existing CI remains green.

NOT PROVEN:
- no concrete Tesseract.js/local engine adapter is wired;
- no D1 attachment retrieval adapter is wired;
- no target PC/runtime is bound;
- no real attachment has traversed `D1 -> local executor -> OCR -> parser`;
- no production mail flow is changed.

Current state:

`EXECUTOR_CONTRACT_TEST_PASS / RUNTIME_BINDING_NOT_DONE`
