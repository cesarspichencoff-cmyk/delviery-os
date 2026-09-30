# iFood local OCR — Foxxy host gate — 2026-09-30

## Scope

Zero-cost, local-only proof of the existing layout-aware Tesseract.js engine on Foxxy.

No production OCR deployment, no restaurant write, no notification, and no synthetic production incident were created.

## Canonical basis

Worktree used current canonical branch head:
`e8e61a39e8c16bf43219c68ed28091cd6e0c5ce7`.

The repository already contains:
- `tools/ifood-local-ocr/tesseractjs-engine.mjs`;
- `tools/ifood-local-ocr/package.json`;
- `deploy/cloudflare/gerencial-mail-bridge/src/ifood-review-local-ocr-executor.js`;
- `deploy/cloudflare/gerencial-mail-bridge/src/ifood-attachment-source.js`.

Therefore the prior state claim that no concrete Tesseract.js adapter exists is stale.

## Host capability — PROVEN

Foxxy:
- Windows `win32` x64;
- Node `v24.18.0`;
- npm `11.16.0`;
- WebAssembly available;
- worker_threads available;
- 16 logical CPUs observed.

The local OCR package requires Node >=20.9 and pins:
- `tesseract.js 7.0.0`;
- `sharp 0.35.4`.

Dependencies installed successfully in an isolated worktree.

## Engine tests — PROVEN

Local engine suite:
- 4 tests;
- 4 passed;
- 0 failed.

Covered:
- original bytes for FULL_PAGE;
- pinned layout preprocessing for ORDER_HEADER;
- rejection of unsupported regions/empty bytes;
- idempotent terminate and post-terminate rejection.

## Real engine smoke — PROVEN

A synthetic 420x220 PNG containing:

`4787 29/08/2026`

was generated locally and passed through the real engine:

`tesseract.js@7.0.0+sharp@0.35.4/ifood-review-order-date-2026-09-v1`

Observed OCR:
- FULL_PAGE: `4787 29/08/2026`
- ORDER_HEADER: `478729/08/2026`

This proves the Foxxy Windows/Node host can execute the real Tesseract.js + Sharp layout-aware engine.

It does NOT prove future screenshot accuracy.

## Real source boundary

Read-only D1 count at proof time:
- `ifood_review_mail`: 0 rows;
- `ifood_review_attachment`: 0 rows;
- verified iFood mail rows: 0.

Therefore no real stored review attachment currently exists for a D1 -> local OCR -> parser world proof.

The private seven-image benchmark file referenced by the earlier receipt was not found under `C:\Users\italo` on Foxxy, so the seven-image accuracy benchmark was not re-run here.

## Classification

PROVEN:
- local concrete Tesseract.js layout engine exists;
- Foxxy is a viable zero-cost Windows/Node OCR host;
- real engine execution works locally;
- engine remains read-only/no-effect by contract.

UNKNOWN / pending:
- real stored attachment retrieval from D1;
- real D1 bytes -> executor -> engine -> parser;
- generalization beyond the private benchmark;
- production runtime/deployment.

## Next gate

Do not deploy OCR.

Wait for an authorized team iFood review mail to produce a verified D1 attachment, then prove exactly one read-only path:

`D1 attachment bytes -> hash-pinned local source -> FULL_PAGE + ORDER_HEADER OCR -> fail-closed parser -> UNVERIFIED candidate`

No persistence, notification or external effect is authorized by this gate.
