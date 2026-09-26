# Evidence — Tally Caixa Pulse Capture Identity — 2026-09-26

## Objective

Pin the exact live Tally forms that feed Caixa Pulse and make future form drift
observable before any production edit.

This evidence was collected read-only from the public Tally response pages.
No submission, form edit, Google Sheet edit or external operational effect was
performed.

## Live forms

Both forms belong to Tally workspace `3xP0bd`.

### Shift register

- role: `SHIFT_REGISTER`
- public form id: `eqAKzJ`
- public URL: `https://tally.so/r/eqAKzJ`
- editor route: `https://tally.so/forms/eqAKzJ`
- live block count: 76
- snapshot SHA-256:
  `d452aefd1687d8071e8f1776efc6147c07f846ba468a015e49720379e52dee5c`
### Occurrence form

- role: `OCCURRENCE`
- public form id: `ZjVv1a`
- public URL: `https://tally.so/r/ZjVv1a`
- editor route: `https://tally.so/forms/ZjVv1a`
- live block count: 31
- snapshot SHA-256:
  `51f07f02436057199af4d8a9782c37945b9bc38a3f9d54db8104abff9b73d251`

Unauthenticated access to the editor route resolves to Tally login. The route
exists, but authenticated editor access was not claimed or simulated.

## Occurrence field identity

Pinned current input groups:
- Operador: `b20098da-7371-459c-8932-71ffbcf9bf71`
- Data: `c34fa788-94bf-4207-a18f-e3e18c6a830d`
- Turno: `de042c6f-c466-4376-8a07-00f55d0894ef`
- Tipo de Ocorrência: `5b0794da-93a7-44d3-9ba1-9e9616b2ffb9`
- Pedido / Mesa / Referência: `b94ae407-8a3b-4fdc-ba7c-d7cc7147276c`
- O que aconteceu?: `d51ce650-20de-46d5-9e7b-d0375e34e4bc`
- Ação Tomada?: `397d4271-7cd9-410f-97cc-ab994daa0b0f`
- Status: `fa40a224-0a6e-4bc5-b0bb-0342292f2642`

The title block for `O que aconteceu?` is
`9787adda-0d04-4d16-ace4-529dab972b17`.

Its source title is exactly:

`O que aconteceu?\n`

This independently confirms the trailing-newline mapping debt observed in the
Google Sheet audit.

## Compatibility boundary

The first shadow pilot must:
- preserve every existing field-group UUID;
- preserve the ten current `Tipo de Ocorrência` options;
- preserve the three current `Status` options;
- insert new capture only between occurrence type and order/reference;
- never reinterpret operator self-report as independent execution proof.
The current live form and workbook are still outside write authority in this
checkpoint.

## Drift probe

New surfaces:
- `src/contextKernel/tallyCaptureSurface.ts`
- `demo/context_kernel_tally_capture_surface_proof.ts`
- `tools/probe_tally_caixa_pulse.mjs`

The live probe reads both public response pages, extracts Tally
`__NEXT_DATA__`, canonicalizes stable form/block identity, hashes it and
compares against the pinned snapshot.

Current live result: `PASS`.

The probe is intentionally not part of CI because an external Tally outage must
not make the repository build fail. Static compatibility invariants are part of
the normal local/CI gate.

## Remaining gate

To change the live occurrence form safely:
1. obtain authenticated editor access;
2. create or duplicate a shadow form rather than editing production first;
3. add the conditional subtype + four-row barrier capture;
4. connect the shadow copy to an isolated Sheet;
5. submit controlled test cases;
6. observe the exact matrix serialization;
7. prove parser/panel compatibility before any live cutover.
