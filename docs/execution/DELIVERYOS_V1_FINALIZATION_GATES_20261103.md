# Delivery OS Itaim V1 — finalization gates and route decision
**Date:** 2026-11-03 BRT  
**Scope:** first Itaim operational version — Reader + iFood source + strong order identity + read-only Copilot/Entregas + acceptance.  
**Status:** DRAFT/HOLD. This document never grants permission to operate or change live orders.

## The decision that reduces rework
Do **not** reactivate any of the six original scheduled Edge/UIA/V2/SP0RE tasks. Their former relaunch/console design interfered with the cashier interface. Keep the separate audio muting guard, Reader service and operational iFood Edge untouched.

Prefer the officially documented **iFood Restaurant Order API** if (and only if) a legitimately authorized integration can be obtained. Developer documentation checked 2026-11-03:
- https://developer.ifood.com.br/pt-BR — iFood states its developer API has no per-API charge for qualifying integrators, but requirements include valid CNPJ, technology-related CNAE, complete tested app, homologation, and approval for production merchant access. The store's authorization is a separate grant, not assumed.
- https://developer.ifood.com.br/en-US/docs/getting-started/first-steps/request-access — merchant permission follows homologation and owner/manager approval.
- https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/details — official food order details include UUID, displayId, items, options, dates and merchant information.
- https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/endpoints — event polling is accompanied by acknowledgment; **acknowledging changes event-consumption state**. Some integrations also change store availability/operational behavior. Therefore no real polling/acknowledgment/confirmation is authorized as an exploratory read-only shortcut.
- https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/homologation — complete food workflow has homologation criteria and potentially mandatory operational actions. Never promise that an unapproved read-only app will qualify.

This official path is a **candidate**, not proof of TATÁ account eligibility, merchant access, available credentials, or go-live cost. Registration/legal/account decisions require the appropriate human/company authority. No purchases or infrastructure expenses were authorized.

If official authorization is not feasible, retain the strictly isolated, legitimately authenticated visual read-only Gestor adapter as fallback. Do not scrape the operator's Edge, duplicate sessions/cookies, rely on hidden windows refreshing, call internal endpoints or click an order without proving effects and receiving permission.

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
2. **Authenticated merchant source:** select a permitted iFood access method. For the official API route: eligibility → sandbox tests → homologation → explicit merchant grant; for visual fallback: separate lawful authenticated Itaim session, exact scope check and safe navigation/effect proof. Do not conflate authenticated user with authenticated Itaim merchant.
3. **Real order details:** with the approved channel, prove item names/quantities, modifiers, notes, status/revision, service time, completeness and privacy from 1 actual authorized order, then 5, then a varied representative set. Keep customer personal data out of the diagnostic pipeline.
4. **Strong Reader join:** prove unique native Teknisa key ↔ iFood UUID/displayId with transaction/revision consistency and cancellation/patch transitions; quarantine ambiguities, stale data, duplicate short codes, status conflicts. Never join on a four-digit candidate alone.
5. **Copilot/Entregas V1:** show only proven order/risk and delivery state in the Itaim interface; respect lunch 11:00–15:00, dinner 18:00–23:00 (weekend lunch to 16:30), device constraints and GPS scope. Validate permissions, errors, refresh and zero fictional orders in UI. No driver/location action without consent.
6. **Operational proof and cutover:** off-peak controlled pilot with rollback and a test order under clear operator authorization, no screen flashes/console/audio, stable resource use, no impact on iFood, printing, Reader, order processing or network; verify on physical iPhone and Android. Deploy, merge and operational cutover remain separate human-authorized gates.

**No gate #2–#6 is proven complete.** Gate #1 is **partially implemented**, with runtime data intake/operational evidence still pending. Therefore an overall completion percentage or trustworthy finish date **cannot be inferred** from the 127 laboratory assertions.

## Relative planning and critical path
- Immediately executable without merchant access: harden strict aggregate projection, test on independent Linux/Windows runners, add "HOLD" visibility and evidence trail; evaluate event-order semantics on mock fixtures. Zero business impact.
- **External dependency that determines time to finish:** official iFood API eligibility and merchant authorization or a safe alternative session, plus a first legally/operationally authorized real order observation. There is no validated ETA.
- After permitted source proof: real detail/revision tests → strong Reader reconciliation → Copilot/Entregas read-only V1 → operator pilot.
- A "ready to show" UI and a "10/10" complete operational delivery app are different milestones. Do not call DONE when any mandatory gate remains open.

## Proof/rollback rules
- No production changes while observer/capture is HOLD. Do not turn on six previously disabled tasks even to repair stale snapshots.
- Code on PR is reversible. Operational processes, service deployment, browser logins, merchant authorization, order actions and billing require separate effect-boundary checks.
- Make explicit at every checkpoint: CODE_READY, TEST_PASS_FIXTURE, DEPLOYED, WORLD_PROVEN and HUMAN_ACCEPTED.
