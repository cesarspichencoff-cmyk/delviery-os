# iFood review visual reference + fail-closed extraction contract — 2026-09-27

## Scope

A real historical reference email already present in César's Gmail was inspected:

- subject: `Avaliacoes Negativas Ifood`;
- date: 2026-09-03;
- route: César -> César;
- seven inline PNG screenshots;
- this is **not** the authorized production team route `atendimento@tatasushi.com.br -> cesar@tatasushi.com.br`.

Therefore this work may establish attachment/extraction shape, but it must not be promoted to `WORLD_PROVEN_LIVE_IFOOD_REVIEW_SOURCE`.

## Observed screenshot shape

All seven screenshots are real iFood review-detail surfaces.

Observed across the corpus:
- 7/7 expose rating;
- 7/7 expose improvement tags;
- 7/7 expose customer/review text;
- 7/7 expose public/private visibility;
- 6/7 expose order ID and order date;
- 4/7 visibly expose a merchant response;
- 3/7 visibly expose an evaluation-completion date;
- at least one screenshot is cropped above the order header;
- multiple screenshots are cropped before any merchant response.

This proves that field visibility varies by screenshot. Missing/cropped values must not be reconstructed from neighboring screenshots or inferred from context.

## Private benchmark

The exact seven-record visual transcription was saved outside the repository in the personal Library:

`/VÉRTICE/DeliveryOS/ifood-review-ground-truth-2026-09-03.json`

SHA-256:

`f298d1afb31cb7f68cd8058ade37df52603e13de1709e5a0963351988e6753ab`

The benchmark preserves nulls for fields that are not visible in a screenshot and is explicitly marked as a César self-sent reference batch, not the production team route.

Raw customer screenshot content is not committed to this repository by this change.

## Code contract

Added:

- `deploy/cloudflare/gerencial-mail-bridge/src/ifood-review-visual-extraction.js`
- `deploy/cloudflare/gerencial-mail-bridge/src/ifood-review-visual-extraction.test.mjs`

Contract version:

`ifood-review-visual-extraction@0.1.0`

Key invariant:

`NOT_VISIBLE_IN_SCREENSHOT -> NULL`

The validator fails closed if:
- a cropped/invisible field is populated;
- a declared visible field is null;
- rating/date/visibility/order-id shape is invalid;
- an unknown or duplicate visible field is declared;
- extra fields such as blame/culprit labels are injected.

Validated extraction output also hard-codes:
- `inferred_fields = []`;
- `source_fact_promotion_allowed = false`;
- `cause_proven = false`;
- `blame_allowed = false`;
- `external_effect_authorized = false`.

## CI proof

Implementation/test head:

`fcc7eb5bf8eaf7f6d94e7da99e7be7560efa6adb`

GitHub Actions:
- workflow: Edge Shadow CI;
- run: `36346533912`;
- result: `SUCCESS`.

The existing full edge/context/mail-bridge synthetic suite remained green.

## Existing ingestion/storage boundary

The production mail bridge already preserves image attachment bytes in D1 table `ifood_review_attachment` as `content_blob`, keyed by `mailbox_key + attachment_index`.

Current ingestion intentionally classifies image-only review mail as `ATTACHMENT_ONLY` and does not pretend OCR has happened.

That behavior remains unchanged.

## Truth boundary

PROVEN:
- real iFood screenshot attachment shape has been observed;
- mixed/cropped field visibility is real;
- raw image bytes already have a lossless D1 storage path when the authorized mail route ingests them;
- a fail-closed structured visual-extraction contract exists and is CI-green;
- the seven-screenshot private benchmark exists and is hash-pinned.

UNKNOWN / NOT PROVEN:
- no real review batch from the authorized team route has yet been admitted into `ifood_review_mail`;
- no OCR/model extraction engine is wired into the production runtime;
- automated extraction accuracy against the seven-image benchmark is not yet measured;
- iFood source freshness cadence remains UNKNOWN;
- review text does not independently prove cause, guilt, sector responsibility or action effectiveness.

## Next safe step

Benchmark candidate zero-cost extraction routes against the private seven-image ground truth before choosing any production extractor. Do not wire an extractor merely because it can read text; require field-level accuracy and preserve invisible fields as null.
