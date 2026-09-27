# R4–R5 Shadow Contracts — 2026-09-24

## Scope

Branch: `design/tata-edge-runtime-foundation-v1`

This phase remains synthetic and observation-only.

No real iFood session, real OTP, production mailbox credential, browser control, printer query, print submission, Teknisa write or cashier-PC installation was used.

## R4 — iFood Sidecar + Auth Relay

Implemented:

- `src/edge/ifood/auth.ts`
- `src/edge/ifood/sidecar.ts`
- `demo/edge_ifood_shadow_proof.ts`

Properties:

- auth state is explicit: `AUTH_HEALTHY / AUTH_RECOVERING / AUTH_HUMAN_REQUIRED`;
- CAPTCHA/MFA/unexpected flow routes to human-required rather than bypass;
- OTP matching is sender + subject + age + code-pattern constrained;
- OTP is returned as an ephemeral in-memory object only;
- auth metadata rejects secret-like fields;
- structured portal payload rejects cookie/token/password/OTP and direct customer PII fields;
- Sidecar capabilities are observation-only.

R4 does **not** yet prove the actual iFood sender, subject, code format, session lifetime or portal network surfaces.

## R5 — Print Observer

Implemented:

- `src/edge/print/observer.ts`
- `demo/edge_print_shadow_proof.ts`

Properties:

- the observer interface exposes only `listJobs()`;
- no submit, cancel or reorder capability exists;
- spool states become observations, not control commands;
- `NO_LONGER_LISTED` does not mean physically printed;
- every observed print state keeps `physical_effect = UNKNOWN`.

This preserves the TATÁ OS effect boundary:

`SPOOLER/PROVIDER SOFTWARE STATE != PHYSICAL LABEL/COMANDA PROVEN`

## Required repository commands

```text
npm run test:edge:ifood
npm run test:edge:print
npm run test:edge:shadow:all
```

## Promotion status

- R4 contract: **IMPLEMENTED_SYNTHETIC / FULL_SUITE_PENDING**
- R5 contract: **IMPLEMENTED_SYNTHETIC / FULL_SUITE_PENDING**
- live iFood browser adapter: **NOT_STARTED**
- live mail OTP relay: **NOT_STARTED**
- Windows spooler adapter: **NOT_STARTED**
- production effects: **NOT_AUTHORIZED**

## Next gate

Run the complete branch test suite in a normal checkout with dependencies installed.

If green, the next useful development is a non-secret browser abstraction and a Windows print-source abstraction that can later bind to Playwright/CDP and WMI/Win32 without changing the higher-level contracts.
