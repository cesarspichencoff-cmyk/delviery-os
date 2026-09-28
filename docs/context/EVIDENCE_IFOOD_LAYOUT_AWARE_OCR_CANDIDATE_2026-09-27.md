# iFood layout-aware OCR candidate — 2026-09-27

## Boundary

This receipt refines, but does not erase, the earlier rejection of full-page Tesseract OCR.

The rejected route remains:

`WHOLE_SCREENSHOT -> FULL_PAGE_TESSERACT -> PRIMARY_EXTRACTION`

A materially different route was tested:

`FIXED_IFOOD_LAYOUT -> FIELD-SCOPED OCR -> FAIL-CLOSED PARSER`

The source corpus is the existing private seven-image visual benchmark from César's historical self-sent reference email. It is not the authorized production team-mail route.

## Baseline failure that remains locked

Tesseract 5.5.0 full-page OCR previously produced:
- visible order id exact: 6/6;
- visible order date exact: 1/6;
- rating readable: 7/7;
- review date exact: 7/7.

Observed critical date errors included values such as `50/08/2026`, `55/08/2026`, `a1j08/2026`, `51/08/2026` and `35/08/2026`.

No regex/context repair was accepted.

Therefore full-page Tesseract remains rejected as the primary extractor.

## Difference Check

The new route does not rerun the same failed design.

It changes the information boundary:
1. order id/date come from an isolated crop of the fixed order header;
2. rating/tags are parsed only from the `Sobre o pedido` block before the customer line;
3. review text is parsed only after the review metadata line and before response/completion markers;
4. response and completion are separate bounded sections;
5. cropped fields remain null;
6. an invalid isolated date remains null and is never repaired from review date, response date or neighboring screenshots.

## Real-corpus benchmark

Private benchmark artifact:

`/VÉRTICE/DeliveryOS/ifood-review-layout-aware-ocr-benchmark-2026-09-27.json`

SHA-256:

`f79552addac37f1cdfdf561d2239d5006c61f8df237e6ec9236fabe940ed305f`

Against the seven real screenshots:

- visible order id exact: 6/6;
- visible order date exact after header isolation: 6/6;
- visible rating exact: 7/7;
- visible improvement-tag set exact: 7/7;
- customer name exact: 7/7;
- visibility exact: 7/7;
- review date exact: 7/7;
- merchant response date exact: 4/4;
- completion date exact: 3/3;
- cropped order fields remained absent: 1/1;
- normalized review-text similarity: mean 0.985 / minimum 0.947;
- normalized merchant-response similarity: mean 0.989 / minimum 0.980.

This proves viability on this benchmark only. It does not prove generalization to future screenshots, new layouts or production throughput.

## Parser contract

Added:
- `deploy/cloudflare/gerencial-mail-bridge/src/ifood-review-ocr-parse.js`;
- `deploy/cloudflare/gerencial-mail-bridge/src/ifood-review-ocr-parse.test.mjs`.

Parser version:

`ifood-review-ocr-parse@0.1.0`

The parser:
- accepts full-page OCR text plus separately isolated order-header OCR text;
- uses the isolated header for order id/date;
- never repairs an invalid order date from another date;
- scopes tag matching before the customer-review block to avoid false positives from words inside the review;
- keeps unmapped tags unguessed;
- preserves `source_fact_promotion_allowed=false`;
- preserves `cause_proven=false`;
- preserves `blame_allowed=false`;
- preserves `external_effect_authorized=false`.

CI proof:
- parser/test head: `6720591903e4555cbe1a4d9c529fdbeceb2359ba`;
- Edge Shadow CI run: `36366425088`;
- result: `SUCCESS`.

## Execution-surface decision

The current Cloudflare Workers Free limit is 10 ms CPU per HTTP request with 128 MB memory. Tesseract.js is a JavaScript/WebAssembly wrapper around Tesseract and uses worker/worker-thread execution.

Therefore no production attempt is made to run OCR inside the current Free Worker. This is an architecture decision based on current platform limits, not a claim that Tesseract.js can never run on Workers.

The next zero-cost candidate surface is a local Node/WebAssembly executor that reads already-preserved review attachment bytes through a narrowly authorized source boundary, runs segmented OCR, and returns only a derived extraction candidate. No such local production binding is deployed by this receipt.

## Truth boundary

PROVEN:
- whole-page Tesseract route remains defective for critical order dates;
- layout-aware field isolation materially changes the failure mode;
- the seven-image benchmark reaches the metrics above;
- the deterministic parser is CI-green and fail-closed on invalid/cropped critical fields.

NOT PROVEN:
- first authorized Atendimento -> César live review batch;
- local executor deployment;
- real D1 attachment -> OCR -> structured candidate world path;
- performance/resource behavior on the target local PC;
- generalization to future iFood layout changes;
- causal, blame or action-effectiveness interpretation.

Current state:

`BENCHMARK_PROVEN + PARSER_TEST_PASS + EXECUTOR_NOT_DEPLOYED`
