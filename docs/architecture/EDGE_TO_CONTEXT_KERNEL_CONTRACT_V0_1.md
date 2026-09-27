# Edge → Context Kernel Contract v0.1

## Purpose

Connect TATÁ Edge / DeliveryOS to the higher Gerencial Watch Context Kernel
without turning DeliveryOS into a second managerial brain.

## Producer

DeliveryOS emits:

`edge-watch-handoff@0.1.0`

The envelope contains only:

- source mode and truth class;
- generated time and source watermark;
- observation counts and source coverage;
- identity confidence counts;
- minimized hard-exception references;
- explicit non-claim of global coverage;
- `external_effect_authorized=false`.

Raw source payloads do not cross this boundary.

## Consumer

The current Context Kernel v0.6 admission route is:

`POST /sources/tata-edge/handoff`

The consumer validates before persistence:

- `live_observed -> FACT`;
- `synthetic -> SIMULATION`;
- `empty -> EMPTY`;
- source coverage counts reconcile;
- source timestamps do not exceed the watermark;
- watermark does not exceed generation time;
- extra fields are rejected;
- external-effect authority remains false.

## Attention semantics

A hard exception is not automatically an interruption.

Current higher-layer routing:

- iFood auth explicitly requiring a human -> César-owned commitment;
- print software error -> system triage;
- source adapter failure -> system triage.

The higher layer still owns source freshness, global coverage and attention
delivery.

## Runtime boundary

This repository contains only the producer and request projection.

The request builder performs no HTTP call and embeds no credential.

A live sender is a later shadow-runtime gate.
