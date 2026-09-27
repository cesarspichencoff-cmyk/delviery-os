# iFood screenshot zero-cost OCR benchmark — Tesseract route rejected — 2026-09-27

## Objective

Test one zero-cost local OCR route against the private seven-screenshot iFood visual ground truth before allowing any production extractor.

This is a benchmark only. It does not modify the production mail bridge, D1 schema, Edge, Watch, Tally, or the authorized review-mail route.

## Ground truth

Private reference:

`/VÉRTICE/DeliveryOS/ifood-review-ground-truth-2026-09-03.json`

SHA-256:

`f298d1afb31cb7f68cd8058ade37df52603e13de1709e5a0963351988e6753ab`

The source batch contains seven real iFood review screenshots. One screenshot is cropped above the order header and therefore intentionally has null order ID/date in the ground truth.

## Candidate route

Engine:
- Tesseract 5.5.0
- language: `eng`
- OEM: 1
- PSM: 6
- seven screenshots supplied as one multi-page TIFF in a single OCR run.

Raw OCR output is stored privately at:

`/VÉRTICE/DeliveryOS/ifood-review-tesseract-eng-2026-09-27.txt`

SHA-256:

`0da4da8b011b3bba5a065215ddf6e40ccc82ca7be28d638ba08b775c3ca151e8`

Machine-readable benchmark summary:

`/VÉRTICE/DeliveryOS/ifood-review-ocr-benchmark-2026-09-27.json`

SHA-256:

`c6bb6b22047ad1e6a73fd7c294ef6154bcf9c081106de6d7c09e1ff0015b45d6`

## Observed result

- visible order IDs: 6/6 exact;
- visible ratings: 7/7 readable;
- visible review dates: 7/7 exact;
- cropped order ID/date remained absent: 1/1;
- visible order dates: **1/6 exact**.

Critical order-date failures:

- expected `29/08/2026` -> OCR `50/08/2026`;
- expected `28/08/2026` -> OCR `55/08/2026`;
- expected `31/08/2026` -> OCR `a1j08/2026`;
- expected `21/08/2026` -> OCR `51/08/2026`;
- expected `22/08/2026` -> OCR `35/08/2026`.

Review text was broadly readable but also showed diacritic and character substitutions.

## Decision

`REJECT_AS_PRIMARY_EXTRACTOR`

Reason:

The route is not sufficiently reliable for fields that can link a review to an operational order/day. A parser that “repairs” these dates from context would convert OCR uncertainty into invented source facts.

Therefore:

- do not wire Tesseract as the production iFood screenshot extractor;
- do not add regex/date guessing to compensate for its order-date failures;
- preserve the raw screenshot as authority;
- any future extraction route must beat this benchmark and satisfy the fail-closed visual contract.

## Failure-circuit consequence

The rejected route is:

`LOCAL_TESSERACT_SCREENSHOT_OCR -> REGEX/CORRECTION AS PRIMARY SOURCE`

A future attempt must be materially different or must demonstrate a bounded preprocessing/model change with measured field-level improvement against the same private benchmark.

## Truth boundary

This rejects one candidate extraction route. It does not prove that all local OCR is unusable, and it does not establish the final production extractor.
