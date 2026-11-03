# Delivery OS Itaim V1 — finalization gates and route decision
**Date:** 2026-11-03 BRT  
**Scope:** first Itaim operational version — Reader + iFood source + strong order identity + read-only Copilot/Entregas + acceptance.  
**Status:** DRAFT/HOLD. This document never grants permission to operate or change live orders.

## The decision that reduces rework
Do **not** reactivate any of the six original scheduled Edge/UIA/V2/SP0RE tasks. Their former relaunch/console design interfered with the cashier interface. Keep the separate audio muting guard, Reader service and operational iFood Edge untouched.

**Current decision (03 Nov 2026): the iFood Order API is NOT a viable read-only-only shortcut.** The official homologation policy explicitly restricts the Order module to operational real-time PDVs and says read-only apps are not accepted for operational modules (except Financial/Analytics, which do not establish real order-detail access). Do not attempt an API token, event polling, acknowledgment, merchant authorization, or account registration without a separately approved operational PDV integration. The API remains a future conditional route, not the critical-path default. Developer documentation checked 2026-11-03:
- https://developer.ifood.com.br/pt-BR — fees/eligibility still require independent confirmation for a real TATÁ application; no paid plan or account action is approved. The store's authorization is separate and is never assumed.
- https://developer.ifood.com.br/en-US/docs/getting-started/homologation/categories — **controlling limitation:** Order module is for real-time PDVs; read-only-only operational apps are not accepted. BI/Analytics are separate and not a substitute for order detail.
- https://developer.ifood.com.br/en-US/docs/getting-started/first-steps/request-access — merchant permission follows homologation and owner/manager approval.
- https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/details — official food order details include UUID, displayId, items, options, dates and merchant information.
- https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/endpoints — event polling is accompanied by acknowledgment; **acknowledging changes event-consumption state**. Some integrations also change store availability/operational behavior. Therefore no real polling/acknowledgment/confirmation is authorized as an exploratory read-only shortcut.
- https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/homologation — complete food workflow has homologation criteria and potentially mandatory operational actions. Never promise that an unapproved read-only app will qualify.

This official path is a **candidate**, not proof of TATÁ account eligibility, merchant access, available credentials, or go-live cost. Registration/legal/account decisions require the appropriate human/company authority. No purchases or infrastructure expenses were authorized.

**Near-term order-source decision:** first inspect EXISTING, explicitly authorized native TATÁ/Teknisa exports and their schema/provenance using sanitized metadata ONLY. Determine whether an independent iFood UUID/displayId, line items, modifications, and revisions can be proven. Historic diagnostic reports do not count as fresh orders. If this source cannot prove merchant/order identity, retain the strictly isolated, legitimately authenticated visual read-only Gestor adapter as conditional fallback. Do not scrape the operator's Edge, duplicate sessions/cookies, rely on hidden windows refreshing, call internal endpoints or click an order without proving effects and receiving permission.

## Latest verified foundation (separate test layers)

| Layer | Verified evidence | Boundary |
|---|---|---|
| Cashier screen/sound mitigation | Windows tasks intentionally disabled; isolated audio mute measured; user confirmed beeping stopped | The absence of future flicker on all shifts still needs observation |
| Reader health | Automated read-only diagnostic observed during lunch; sample status has schema and sourceMode = CONTROL_DIAGNOSTIC_NOT_REAL_PROOF | No authenticated real order/comanda total or items proven |
| No-console fixture | GitHub Actions Windows native 45/45 + Linux contracts 42/42 | Fixture has no live Reader/Gestor inputs |
| Fictional source pairing | 40/40 static plus native fixture within Windows 45/45 | LAB-only IDs; even exact pairs never become real matches |
| Passive Gestor structure | V2 snapshot and UIA diagnostics existed, but are stale since tasks were stopped; merchantVerified=false and order IDs unavailable | Merchant scope, details and complete order coverage UNKNOWN |
| Sanitized diagnostic projector | New pure module and test run under review in this PR | Inputs are caller-supplied diagnostics, not attested orders or credentials |

Current project PR: #137 on feat/gestor-shadow-observer-20261103, base integration/deliveryos-v1-connected-20261102, DRAFT/HOLD. Code/test evidence from GitHub Actions is not proof of deployment or user acceptance.

## Six remaining acceptance gates to finish Itaim V1

1. **Silent data intake:** a bounded, non-console reader of *already sanitized* diagnostics, operational ownership, no pop-ups/alerts/audio, no activity in the operator's Edge. Current projector is pure and not installed. Prove timestamps and fail-closed status but do not claim real orders.
2. **Authenticated merchant source:** verify a permitted existing TATÁ/Teknisa export with independently attested Itaim/Order ID and current item detail; otherwise seek approval for a separate lawful authenticated Itaim Gestor session with safe effect proof. The official Order API requires an actual homologated operational PDV (not a read-only utility), company authority and separate merchant grant; it is not an immediate fallback. Do not conflate authenticated user with authenticated Itaim merchant.
3. **Real order details:** with the approved channel, prove item names/quantities, modifiers, notes, status/revision, service time, completeness and privacy from 1 actual authorized order, then 5, then a varied representative set. Keep customer personal data out of the diagnostic pipeline.
4. **Strong Reader join:** prove unique native Teknisa key ↔ iFood UUID/displayId with transaction/revision consistency and cancellation/patch transitions; quarantine ambiguities, stale data, duplicate short codes, status conflicts. Never join on a four-digit candidate alone.
5. **Copilot/Entregas V1:** show only proven order/risk and delivery state in the Itaim interface; respect lunch 11:00–15:00, dinner 18:00–23:00 (weekend lunch to 16:30), device constraints and GPS scope. Validate permissions, errors, refresh and zero fictional orders in UI. No driver/location action without consent.
6. **Operational proof and cutover:** off-peak controlled pilot with rollback and a test order under clear operator authorization, no screen flashes/console/audio, stable resource use, no impact on iFood, printing, Reader, order processing or network; verify on physical iPhone and Android. Deploy, merge and operational cutover remain separate human-authorized gates.

**No gate #2–#6 is proven complete.** Gate #1 is **partially implemented**, with runtime data intake/operational evidence still pending. Therefore an overall completion percentage or trustworthy finish date **cannot be inferred** from the 127 laboratory assertions.

## Relative planning and critical path
- Immediately executable without merchant access: harden strict aggregate projection, test on independent Linux/Windows runners, add "HOLD" visibility and evidence trail; evaluate event-order semantics on mock fixtures. Zero business impact.
- **External dependency that determines time to finish:** a permitted source with proven Itaim merchant identity, real current order detail and strong native join. Existing authorized native export is the lowest-impact first candidate; separate Gestor session is conditional; operational PDV API integration is longer-route gated by homologation. There is no validated ETA.
- After permitted source proof: real detail/revision tests → strong Reader reconciliation → Copilot/Entregas read-only V1 → operator pilot.
- A "ready to show" UI and a "10/10" complete operational delivery app are different milestones. Do not call DONE when any mandatory gate remains open.

## Proof/rollback rules
- No production changes while observer/capture is HOLD. Do not turn on six previously disabled tasks even to repair stale snapshots.
- Code on PR is reversible. Operational processes, service deployment, browser logins, merchant authorization, order actions and billing require separate effect-boundary checks.
- Make explicit at every checkpoint: CODE_READY, TEST_PASS_FIXTURE, DEPLOYED, WORLD_PROVEN and HUMAN_ACCEPTED.

## Revalidated checkpoint — 03 November 2026, after 17:30 BRT

- The `CAIXA_MOOCA` device was online and local sanitized `C:\\ProgramData\\DeliveryOS-Itaim-Observer\\status.json` was read **without starting a shell or altering the cashier**. At 20:35:40.064 UTC, it still said `OUTSIDE_SERVICE_WINDOW`, `CONTROL_DIAGNOSTIC_NOT_REAL_PROOF`, `liveSourceVerified=false`, `operationalOrderTotal=null`, `noActionExecuted=true`. It proves the diagnostic record exists, not live iFood orders.
- Existing reporting receipt `C:\\ProgramData\\TataComandaReader\\reports\\delivery-report-current.proof.json` attests a **historic** 2026-10-05 local projection: 198 source revisions, 104 current-for-that-snapshot and 94 superseded, with 70 unknowns. It does not establish freshness, merchant ID or the join required for Delivery OS V1 in November.
- `GestorWebReadOnlyV2/latest.structure.json`: `STRUCTURE_ONLY_UNVERIFIED`, `verifiedMerchant=false`, `verifiedCoverage=false`, `identifiersCaptured=false`. Existing UI monitor also records `merchantVerified=false` and `actualOrderIdVerified=false`.
- The six experimental Edge/UIA/V2/SP0RE scheduled jobs stay disabled after the UI interference. No instruction here re-enables them, changes the observer, opens operational Edge, authorizes GPS, queries SQL or touches the iFood merchant.
- The fictitious Epson job #3026 was separately submitted in the TATÁ Comandas verification work, but **physical paper was not verified**. It is NOT delivery-order source proof and there is no authorization for another print attempt.
- The official iFood policy was checked at https://developer.ifood.com.br/en-US/docs/getting-started/homologation/categories : operational Order module is not homologated for a read-only-only application. Prior drafts treating API access as a near-term passive solution must not be carried forward.

**Next bounded technical unit:** inspect only existing published sanitised contract/metadata of the native order feed, map the missing fields and attestation requirements, and add fixture tests on a review branch. No new intake, console runner, automated Gestor navigation, production change or order publication until independently proven authorized.

**Release truth:** `CODE_READY=PARTIAL`; `TEST_PASS_FIXTURE=YES` for specific pinned tests; `DEPLOYED_V1=NO`; `WORLD_PROVEN_V1=NO`; `HUMAN_ACCEPTED_V1=NO`. No delivery completion date is supportable without a qualified source.

## Vendor-native source candidate — public documentation only (03 November 2026)
**Historical human veto (PR #127, 29 October): NO CONTACT WITH TEKNISA.** This section is internal research only; no email, ticket, outreach, draft, or request to reconsider the prohibition.

The Teknisa public integrations page (https://www.teknisa.com/api) describes **Sale API** `POST /getSales` (sale details) and `POST /getSaleProducts` (sold products **including complements**). It also describes Order API `POST /orderStatus` and logistics webhooks, but **nothing here authorizes calling them**: method names and apparent read semantics are not proof of side-effect-free execution, local availability, store licensing, or permission. The public page explicitly says standard integrations/APIs are subject to commercial conditions and endpoint details require the account manager.

This changes the fastest candidate source-validation order:
1. **Inspect current installed native schemas/code and existing already-sanitisized proof, metadata only**: does the existing Reader/Teknisa stream already contain a stable iFood identity, product lines, complement lines and revisions? Keep personal fields and raw orders unread.
2. If missing, check **internally only** whether an already licensed and explicitly authorized Teknisa Sale API export exists for Itaim, using installed code, permitted records and existing internal documentation. **César's explicit 29 October decision prohibits contacting Teknisa, creating Gmail drafts, tickets or outreach, and re-asking permission**; only a new initiative from César can change it. Do not buy, activate or call any API. `getSaleProducts` may cover sold items but **does not automatically cover incoming/in-preparation orders or iFood UUID**.
3. If that fails, consider independent, legitimately authenticated Gestor observation with human-approved effect proof. Keep the original operator Edge and the six disabled tasks untouched.
4. Only treat the official iFood Order API as an operational-PDV integration requiring homologation/merchant permission; not a passive read-only shortcut.

The installed `copiloto_tata_reader_adapter_v1.cjs` (code-only inspection 03/11) exposes native `CDFILIAL, CDLOJA, NRVENDAREST, NRCOMANDA, IDORGCMDVENDA` plus product code/quantity and timestamps. That **does not prove** iFood UUID/displayId, item modifiers, or one-to-one cross-source identity. A nonempty `mappingEvidenceRef` is a caller statement, not independent attestation. Strict join remains HOLD until anchored evidence exists.
