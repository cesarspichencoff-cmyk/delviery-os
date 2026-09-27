# EVIDENCE — Production Tally form deployed / proof pending — 2026-09-27

## Boundary

César explicitly authorized the production cutover of `ZjVv1a` and validation of `Caixa Executivo`.

This receipt records the live form publication and its immediate compatibility checks. It does **not** claim the first real post-cutover occurrence has happened, and it does **not** claim the live webhook is wired.

## Pre-publish safeguards

Immediately before Publish:

- live form `ZjVv1a` was still the pinned legacy public surface: 31 blocks, SHA-256 `51f07f02436057199af4d8a9782c37945b9bc38a3f9d54db8104abff9b73d251`;
- workspace remained `3xP0bd`;
- Google Sheets integration still pointed to live `Caixa Executivo`, spreadsheet `1N77sVp2wgIUaIlGBN7uVvlOoImPpKB_hAXXU9IxC-gk`, `ocorrencias_respostas` / gid `1057855332`;
- recoverable form copy `BzNJ87` existed as Draft and exposed the legacy fields/options with no `Subtipo operacional` or barrier matrices;
- native workbook backup remained `1A1j5AofuDKo66UAOhbhC15ciyhlsuqGBwMPZI36oFNw`.

The draft/live diff preserved every observed legacy field and option. Only the expected barrier-capture delta appeared in the live draft.

## Preview proof

Tally Preview on live `ZjVv1a` was exercised before Publish:

- `Item faltando` exposed exactly the four Item faltando matrix rows and no interactive Item errado matrix;
- `Item errado` exposed exactly the four Item errado matrix rows and no interactive Item faltando matrix;
- `Outro` exposed zero interactive barrier matrix groups.

No production submission was created by Preview.

## Published live surface

After Publish, the canonical public probe reports:

- form ID: `ZjVv1a`;
- workspace: `3xP0bd`;
- block count: `57`;
- canonical SHA-256: `d9303b9892434195ef4d3b93ca90ce96019a03dc2dd8e857deffa788bd2301b0`.

All eight pinned legacy input-group identities remain present:
- Operador `b20098da-7371-459c-8932-71ffbcf9bf71`
- Data `c34fa788-94bf-4207-a18f-e3e18c6a830d`
- Turno `de042c6f-c466-4376-8a07-00f55d0894ef`
- Tipo `5b0794da-93a7-44d3-9ba1-9e9616b2ffb9`
- Referência `b94ae407-8a3b-4fdc-ba7c-d7cc7147276c`
- O que aconteceu? `d51ce650-20de-46d5-9e7b-d0375e34e4bc`
- Ação Tomada? `397d4271-7cd9-410f-97cc-ab994daa0b0f`
- Status `fa40a224-0a6e-4bc5-b0bb-0342292f2642`

New live groups are pinned as:

- Subtipo operacional `830a6e53-0320-46ee-8a1e-4821cb160e28`
- Verificações — Item faltando `5d0f78d3-dbb9-4052-a654-ffd99058dc22`
- Verificações — Item errado `4e72822d-3361-46de-832a-02fb61148aad`

## Immediate Caixa Executivo check

Immediately after Publish, `ocorrencias_respostas` still had the 11 legacy headers because no new post-cutover response had been submitted.

The live workbook remained healthy:
- `Configuracao`: all eight legacy occurrence mappings `OK`;
- `auditoria_sync`: all eight legacy occurrence mappings `OK`;
- panel synchronization: 8 occurrence fields OK / 0 missing;
- historical occurrence count remained 742;
- the existing latest-five alignment repair remained structurally intact.

No synthetic production occurrence was submitted.

## Current state

PROVEN:
- live `ZjVv1a` publication;
- 57-block public surface;
- legacy UUID preservation;
- three-route conditional Preview behavior;
- existing Google Sheets integration target;
- immediate legacy workbook health.

DONE_UNVERIFIED / PENDING REAL SOURCE:
- exact 20-column live Google Sheets serialization;
- remapping from legacy positions 8–11 to 17–20 after the first new response;
- first real team use of subtype/matrix fields.

NOT DONE:
- live signed webhook wiring;
- first live incident-level D1 observation;
- production WORLD_PROVEN claim.

Gate E remains open. The next correct proof is the first real post-cutover occurrence, not an invented operational incident.