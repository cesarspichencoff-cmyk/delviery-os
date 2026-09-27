# Cloud CI Evidence — Context Cloud Source Adapters — 2026-09-25

## Exact proof target

- Branch: `design/tata-edge-runtime-foundation-v1`
- Commit: `7d5790030f9358a27b862ac47bbb0a0a0008f484`
- GitHub Actions run: `36103516063`
- Conclusion: `success`

## Proven synthetically for this exact commit

- Google Calendar events cross the boundary without title, description,
  location, attendee emails or attachments.
- Calendar WORK/PERSONAL domain requires explicit source policy.
- Unconfigured calendar domain fails closed.
- Trello card title/description/comments do not enter the commitment ledger.
- Trello list meaning requires explicit configured list-role mapping.
- Unmapped Trello lists produce no commitment.
- Trello completion can produce `DONE_UNVERIFIED`, never
  `PROVEN_CLOSED`.
- Neither adapter authorizes an external write.

## Live discovery vs proof

Read-only connector discovery was used only to verify that the source surfaces
are reachable and to understand their current shape.

Connector-specific personal contents and identifiers were deliberately not
committed to this public repository.

`LIVE_SOURCE_REACHABLE != LIVE_ADAPTER_BOUND`

Live continuous ingestion remains unproven.
