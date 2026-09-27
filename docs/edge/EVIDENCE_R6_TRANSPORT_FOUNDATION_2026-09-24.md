# R6 Transport Foundation — 2026-09-24

## Scope

Branch: `design/tata-edge-runtime-foundation-v1`

This phase implements host-independent transport boundaries only.

No real browser, real iFood session, real OTP, Windows spooler, printer, Teknisa runtime or production system was touched.

## Implemented

### iFood browser transport boundary

- session-health metadata only;
- structured network capture boundary;
- download metadata boundary;
- no generic browser click/type/evaluate primitive;
- cookies/tokens/passwords remain outside Edge observations;
- persistent profile is explicitly external browser state.

Files:

- `src/edge/ifood/browserTransport.ts`
- `demo/edge_ifood_browser_transport_proof.ts`

### Windows print transport boundary

- read-only printer discovery command;
- read-only print-job enumeration command;
- mutating PowerShell verbs rejected by guard;
- PowerShell JSON normalized into `PrintJobSnapshot`;
- no print submit/cancel/pause/resume/delete capability;
- physical print effect remains `UNKNOWN`.

Files:

- `src/edge/print/windowsSource.ts`
- `demo/edge_windows_print_source_proof.ts`
- `demo/edge_powershell_print_adapter_proof.ts`

### Unified read-only transport cycle

- iFood session health admitted as safe metadata;
- structured iFood collection runs only while session is healthy;
- expired iFood auth does not block print observation;
- browser and print observations enter the same durable admission pipeline.

Files:

- `src/edge/transportCycle.ts`
- `demo/edge_transport_cycle_proof.ts`

## Execution status

The proof runners and package scripts are implemented.

Current session does not have an online execution host for this private repository.

Therefore:

`IMPLEMENTED != EXECUTED != PROVEN`

Status:

- R6 browser transport boundary: `IMPLEMENTED_SYNTHETIC / EXECUTION_PENDING`
- R6 Windows print source: `IMPLEMENTED_SYNTHETIC / EXECUTION_PENDING`
- unified transport cycle: `IMPLEMENTED_SYNTHETIC / EXECUTION_PENDING`
- live Playwright/CDP binding: `NOT_STARTED`
- live Windows spooler binding: `NOT_STARTED`

## Next gate

On an available development host, run:

```text
npm ci
npm run typecheck
npm run test:edge:shadow:all
```

If green, bind a persistent browser profile in shadow mode and a real read-only Windows print runner. The cashier PC remains deferred until final physical binding.