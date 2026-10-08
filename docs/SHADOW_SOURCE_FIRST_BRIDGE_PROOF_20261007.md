# Source-first classification bridge — evidence (2026-10-07)

## Root cause
The installed shadow consumer could return CLASSIFICATION_UNKNOWN even when the installed TATÁ Academia packaging engine already returned FACT for the exact product name, with a validated canonical product identity and routing station. This is a lookup/integration problem, not necessarily an unresolved human rule.

## Implemented and verified
A scoped fallback now accepts only exact-name FACT categories with compatible confirmed station:
- Duplas / Dyo, sashimi, enrolados, temaki, prato quente.
- It does not invent aliases or change printer routing.
- Fixed boxes (including Carpaccio) and sealed 650 products are **not** enabled by this fallback: packaging FACT alone does not prove kit coverage.

CAIXA_MOOCA installed consumer SHA256: `57586FFDA73904B06D8C2C28AAA47E13A6BAD4B6734C3CECC22ACDB8D16C0503`.
Previous consumer saved in atomic backup, SHA256: `DF478079CAE1C9A28D92BBF4B78D8EE554C173727A11B3EF79A4EF4E9C9ED84E`.

## Read-only real-order replay
- 127 unique closed tickets examined before installation.
- Ready: 15 before, 16 with the scoped candidate.
- 41 item classifications recovered in 29 orders.
- One newly ready order: iFood 0470.
- Zero detected routing, existing-ready, allergy or effects regressions in automated checks.
- Ten post-install critical replays passed: 0470 ready; 6307/3283 still blocked for unsupported Carpaccio kit semantics; 6407/1577 allergy holds preserved; 2103/7491/1161 remain ready; 5287/9001 remain outside the 1P-bag exception.
- Windows service and shadow running, with print and fiscal effects disabled.

On-device evidence: `C:\ProgramData\TataComandaReader\evidence\source-first-classification-bridge-proof-20261007.json`; SHA256 `C945B8540A00887A49BC18BD1F8A0A1D543DC60F2425E3598F136D240ED0549C`.

## Boundaries
Tests are historical real-order replays, not a proven first pass for the new implementation, physical printing, DANFE or fulfillment.

GitHub reference consumer differs from the installed consumer; commit `2008c3b220c556ce77be39ea4bd7af46a92a8aef` narrows its fallback scope but does not authorize deployment over the installed consumer.

Next: source-first audit of remaining classification, kit and bag blockers; do not ask for rules already documented.
