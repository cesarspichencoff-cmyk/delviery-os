# Silent runner — offline proof of no-console architecture

**Status:** LAB CODE ONLY, not a delivery/order collector. Not installed, deployed, scheduled or running on the cashier workstation. This folder lives only in the DRAFT/HOLD PR until reviewed.

## What this stage contains

- `SilentObserverLab.cs`: deliberately small Windows .NET Framework 4.x `winexe` program with no console subsystem. It runs for 1–8 bounded fixture-only ticks, protected by a single-instance Windows mutex.
- The only accepted input is a four-line, strictly fictional file. A marker `DELIVERYOS_LAB_ONLY.txt` with the exact value `DELIVERYOS_SILENT_TEST_ONLY_V1` in a directory named `deliveryos-silent-lab` is mandatory. The directory and marker cannot be reparse points; input cannot be a reparse point. No arbitrary input fields are accepted.
- It emits only a sanitized `status.json` with `HOLD_*` states, zero publishable orders, zero exported identifiers, and an atomic replacement. Invalid source content is rejected. A second concurrent instance exits without touching the status. All runs finish quickly.
- It never starts Edge, CMD, PowerShell, a service, a scheduled task, or any network client. It does not implement UI Automation or handle credentials. The absence of those features is intentional.

## Laboratory verification

First run the static contract tests on any machine with Node.js:

```sh
node tests/silent-runner/run-contract-tests.cjs
```

These tests check the fixture contract, forbidden APIs, guardrails and code structure. **They do not execute the C# runtime or prove Windows behavior.**

On an **isolated Windows VM, never on CAIXA_MOOCA**, run the opt-in native test harness:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests\silent-runner\verify-windows-fixture.ps1
```

Both the harness and the fixture executable refuse `COMPUTERNAME=CAIXA_MOOCA`, compiles `SilentObserverLab.cs` via `csc.exe /target:winexe`, creates only an otherwise nonexistent temp directory named `deliveryos-silent-lab`, and exercises: one instance, concurrent instance rejection, visible-HWND count during execution, unchanged foreground, bounded ticks, fixture rejection, blocked markerless execution, and zero publishable output. It removes only the fixture directory it created. Compilation and GUI-session tests have **not** been run or proven by static tests alone.

## Explicitly out of scope

No iFood login, live orders, items, additions, Reader merge, GPS, customer fields, or notifications. No deployment, task installation, scheduling, changing browser flags, or restarting operator processes. The six previously disabled cashier Edge/UIA/SP0RE tasks must stay disabled. The existing mute guard for the observation windows stays untouched.

## Progression gates

1. Native VM test passes with **zero windows visible** and no focus/volume change.
2. Independent, low-resource sandbox proves a crash/duplicate/run/stop cycle, with no new console or window and a simple rollback.
3. A separate, authorized, read-only adapter proves its merchant scope and order details. If it cannot, status remains `HOLD` and nothing is published.
4. Only after user approval of a controlled pilot outside peak service may the team consider installing a silent collector; never reuse the popup-producing scheduled tasks.
