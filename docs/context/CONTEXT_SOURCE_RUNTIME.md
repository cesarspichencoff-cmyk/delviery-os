# Context Source Runtime — Continuous Snapshot Foundation

## Objective

Move from manually assembling Context Kernel inputs to a repeatable refresh
cycle without tying the core to a specific cloud connector.

## Runtime flow

```text
Calendar adapter ─┐
Trello adapter ───┼─> Context Source Runtime
Gmail adapter ────┤        │
Watch adapter ────┘        ├─ isolated source receipts
                           ├─ coverage status
Edge Manager Snapshot ─────┘
                           ↓
                     Context Cycle
                           ↓
              mode / commitments / briefing
                 / Precisa de mim? / policy
```

## Invariants

- one failed source does not erase successful source data;
- raw connector exceptions do not cross the boundary;
- source coverage degradation is explicit;
- synthetic and live-observed source batches cannot be mixed silently;
- a SIMULATION Edge snapshot cannot be combined with live personal context;
- a FACT Edge snapshot cannot be combined with synthetic personal context;
- the runtime performs no external write or notification effect.

## Why coverage matters

`NO_KNOWN_NEED` means only "nothing in loaded evidence currently requires
César".

If a source failed, the refresh result says `coverage_complete=false`.

The product can therefore distinguish:

```text
no known need with healthy source coverage
!=
no known need while a source is unavailable
```

without inventing an alert threshold.

## Next live step

Implement cloud bindings that translate connector reads into these safe source
batches. Their first mode remains read-only.
