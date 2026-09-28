# TATÁ iFood Local OCR

Local-only zero-cost OCR executor dependencies.

Pinned runtime:
- Node >= 20.9
- tesseract.js 7.0.0
- sharp 0.35.4

This package is not imported by the Cloudflare Worker.

The engine uses:
1. original image bytes for FULL_PAGE OCR;
2. a benchmark-pinned fixed crop for ORDER_HEADER;
3. 4x Lanczos resize, grayscale and threshold 200 for the header crop;
4. digit/slash whitelist only on the header pass.

The structured result still goes through the fail-closed mail-bridge parser/executor and remains UNVERIFIED. This directory does not provide a production D1 transport or any write/notification capability.
