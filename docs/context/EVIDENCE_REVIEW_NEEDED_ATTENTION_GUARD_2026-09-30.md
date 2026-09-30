# Review-needed attention guard — 2026-09-30

## Objective

Make the already-existing truth boundary explicit and regression-protected:

`SOURCE_MARKED_REVIEW_NEEDED != CESAR_NEED`

A Caixa Pulse occurrence marked `Necessário Revisão` must not, by status alone, create:
- Evidence Debt routed to César;
- a direct Attention reason;
- an external effect;
- a claim that the recorded action worked or failed.

## Implementation

Added:
`demo/context_kernel_review_needed_attention_guard_proof.ts`

Added to the aggregate regression suite:
`test:context:review-needed-attention-guard`

No production behavior was changed. This is a regression guard over the existing contracts.

## Proof on Foxxy

Canonical tested head:
`b3f71934452e7b4882b0929e5bc159e820bd4e7b`

Executed successfully:
- `npm run typecheck`
- `npm run test:context:caixa-pulse-episode-adapter`
- `npm run test:context:episode-recurrence`
- `npm run test:context:action-followup`
- `npm run test:context:attention-policy`
- `npm run test:context:review-needed-attention-guard`

All passed.

The dedicated guard proves:
- source-marked review-needed is not a César need;
- review-needed does not create Evidence Debt;
- review-needed does not create Attention reasons;
- action effectiveness remains UNKNOWN;
- attention authority remains NONE;
- external effects remain false.

## Boundary

This does not prohibit the Manager Investigator from eventually routing a separate, independently justified Evidence Debt to César.

It prohibits using the source status itself as that justification.

Therefore:

`REVIEW_NEEDED_STATUS != EVIDENCE_DEBT != CESAR_ROUTE != ATTENTION`

Each transition requires its own evidence and contract.

## Effect boundary

No deployment was performed.
No production source was changed.
No notification was emitted.
No restaurant operational action was authorized.
