# Cloud CI Evidence — Run 29 — 2026-09-24

## Exact proof target

- Branch: `design/tata-edge-runtime-foundation-v1`
- Commit: `4b454dcef37a5c7d9786e809ca01643119d57b1d`
- GitHub Actions run: `36046782914`
- Job: `verify` (`107792182036`)
- Conclusion: `success`

## Observed successful gates

```text
npm ci                         success
npm run typecheck              success
npm run test:edge:shadow:all   success
```

The aggregate suite executed all current Edge proof runners and every runner returned PASS, including:

- replay/idempotency;
- restart/outbox recovery;
- secret persistence guards;
- iFood auth and portal semantics;
- print observation-only boundary;
- Teknisa/TATÁ OS source boundaries;
- identity graph projection/rebuild;
- browser transport redaction;
- Windows print allowlist;
- cross-source failure isolation;
- source-envelope validation;
- corrupt-store backup recovery/fail-closed behavior.

## Classification

`IMPLEMENTED + EXECUTED + GREEN = PROVEN_SYNTHETIC_FOR_THIS_EXACT_COMMIT`

This evidence does not prove live iFood, live Teknisa, a real Windows spooler, a real TATÁ OS agent, physical printing, cashier-PC resource safety, or any production effect.

## Additional security signal

The same run reported one HIGH npm audit finding during `npm ci`. Dependency inspection identified `xlsx@0.18.5` in devDependencies. This is tracked separately and is not silently treated as resolved.
