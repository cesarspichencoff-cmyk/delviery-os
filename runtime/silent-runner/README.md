# Delivery OS — silent Reader + Gestor fixture executor

**State:** `TEST_PASS_WINDOWS_FIXTURE` only. No production reader, no real orders, no authenticated join. PR #137 must remain DRAFT/HOLD. Nothing in this folder is installed or scheduled on the cashier machine.

## Native implementation

- `SilentObserverLab.cs`: .NET Framework `winexe` with no console subsystem, single-instance mutex, 1–8 bounded ticks, no network/UI APIs, no Edge launch, no direct operational paths, no event handlers that change orders, atomic status output and exception boundary to avoid GUI error dialogs. The program itself refuses `COMPUTERNAME=CAIXA_MOOCA`.
- `SnapshotPairAdapter.cs`: strict parser of **two optional, wholly fictional JSON projections**. Accepts only a small allowlisted subset of the Reader status schema (`deliveryos.itaim.automatic-reader-status.v1`) and Gestor structure schema (`tata.gestor.structure-v2`). Both must declare `fixtureOnly=true`, an unverified source, no exported identity, timestamps no older than 120 seconds and no more than 16 fabricated `LAB-0000` style records. Unknown or personal fields, duplicate keys, stale/future timestamps, revision differences and item/option count differences are held.
- A four-line `input.fixture` plus marker file `DELIVERYOS_LAB_ONLY.txt` containing exactly `DELIVERYOS_SILENT_TEST_ONLY_V1` in a directory named `deliveryos-silent-lab` remain mandatory. The two JSON projections are **optional**; if absent, output `pairState=HOLD_NO_PAIR`.
- When fictional records match in all validated fields, the result is only `pairState=SYNTHETIC_PAIR_ONLY`. It is **never** an authenticated production Reader-to-iFood join. In every case `realReaderJoinProven=false`, `orderIdentityProven=false`, `ordersPublishable=0`, `orderIdsExported=0`, `customerFieldsExported=0`.

This is an **adapter contract and laboratory comparator**, not a connector to live files. It intentionally refuses real order IDs and customer data. The use of a source schema name does **not** certify data provenance.

## Automated verification

GitHub Actions workflow: `.github/workflows/deliveryos-silent-fixture-windows.yml`.

- Linux Node: `node tests/silent-runner/run-contract-tests.cjs` — **42/42 PASS**.
- Linux Node: `node tests/silent-runner/run-pair-contract-tests.cjs` — **40/40 PASS**.
- Isolated GitHub-hosted Windows: `tests/silent-runner/verify-windows-fixture.ps1` — **45/45 PASS**, compiling both C# sources with `/target:winexe` and `System.Web.Extensions.dll`.
- Official execution [#41692832854](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41692832854): `completed/success`, tested head `fd70b039586df0557799573d3edbda99c7996642`.

Windows tests check the process has no visible HWND, the foreground doesn't change, mutex blocks duplication, output is never publishable, fictional pair matches, and invalid personal fields, duplicates, expired/future data, mismatched revisions/items/options, missing source files and spoofed merchant proof are rejected. All tests occur in an isolated VM; **no test executes on CAIXA_MOOCA**.

## Boundaries and next gates

No session/login, iFood detail navigation, live Reader access, personal data, GPS, printing, API calls, browser automation, service creation, scheduled task, merge, deploy, or cashier pilot. The six Edge/UIA/SP0RE tasks disabled to prevent UI flicker must remain disabled; the dedicated observation audio mute guard remains untouched.

**Next development gate:** create a *separate* trustworthy read-only projection layer for existing sanitized Reader and Gestor diagnostics, without copying credentials or entering the operator's session. Verify real merchant Itaim and order identity by independent evidence before attempting a production correlation. Any unproven merchant/order detail must remain `UNKNOWN`; no production publishing.

A native zero-window success in GitHub's VM does **not** prove that real data collection would be invisible or usable on the cashier desktop.
