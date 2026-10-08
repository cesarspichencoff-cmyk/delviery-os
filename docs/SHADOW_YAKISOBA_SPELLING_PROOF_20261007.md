# Yakisoba spelling: source-backed rule and shadow evidence — 2026-10-07

## Root cause
The packaging motor recognized the spelling "Yakissoba" in two regular expressions but failed to recognize "Yakisoba" used by live Retail order names. Current TATÁ operational packaging and kit sources already establish Yakisoba as a hot main dish; flavor does not change its category. This was a parser/lookup defect, not a need for a new human packaging rule.

## Correction
In TATÁ Academia `lib/packaging-current.js`, the two expressions accept both "Yakisoba" and "Yakissoba". The engine retains hot main classification, 1.500 box, G bag for a standalone main, and Kit Quente under applicable kit rules. Regression tests cover mignon, chicken, seafood and the older spelling, plus the established Kids + Yakisoba + dupla kit decision.

Academia branch `evolucao/v33-product-pass`, implementation and tests at commit `6396427220b5eb2e2d1a570ef58437a4d302ff49`.

## Tests and installation
- Packaging tests: 124/124; kit tests passed.
- Read-only comparison of two motor revisions in isolated directories on 128 unique closed orders: zero detected regressions, five newly classified Yakisoba items, no new fully approved orders (other independent blockers remain).
- 15/15 post-install read-only replays passed, preserving allergies, prior ready orders, kids/temaki bag unknowns and unsupported Carpaccio kit hold.
- CAIXA_MOOCA installed engine SHA256 `1E4CF2475EDB586D5DAE88388D2ADC7CF02013B00EC93C0371E3EDB80F81342E`.
- Atomic backup of prior engine SHA256 `A074C1F4B0DC90BAE97DA245062CA51C99B71F332F5E6BDD7C5E6E62EE0EA342`.
- Source-first consumer unchanged, SHA256 `57586FFDA73904B06D8C2C28AAA47E13A6BAD4B6734C3CECC22ACDB8D16C0503`.
- Runtime remains running. Printing and fiscal effects remain disabled.

On-device proof: `C:\ProgramData\TataComandaReader\evidence\source-first-yakisoba-spelling-proof-20261007.json`, SHA256 `ED0AEE9AC25D1C827E9D0B498475565C553FC20336E420A874B6C0709FDAFC43`.

## Proof boundary
Historical real-order replay and shadow runtime checks; does not demonstrate first pass of a newly arriving Yakisoba order, physical print, DANFE, customer handling or fiscal execution.
