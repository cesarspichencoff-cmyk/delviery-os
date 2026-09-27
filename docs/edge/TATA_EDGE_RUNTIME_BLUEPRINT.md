# TATÁ Edge Runtime — Foundation Blueprint

## Status

**DESIGN / READ-ONLY / NO PRODUCTION EFFECT**

This document defines the integration boundary between DeliveryOS, TATÁ OS, Teknisa, iFood Portal, local printing and future operational sources.

It does **not** authorize deployment, browser automation against production, Windows installation, print control, Teknisa writes, iFood writes or any other operational effect.

## Product thesis

The Edge Runtime exists so the restaurant can emit operational memory as a by-product of work already happening.

It must never become a new manual workflow, a second ERP, or a prerequisite for the restaurant to operate.

Core invariants:

- `EDGE_DOWN != RESTAURANT_DOWN`
- `OBSERVED != CONTROLLED`
- `PRINT_JOB_COMPLETE != PHYSICAL_RESULT_PROVEN`
- `SOURCE_EVENT != CAUSAL_EXPLANATION`
- `UNKNOWN != GUESSED`
- `RETRY != NEW_MEANING`
- no operator input required in the delivery peak merely to keep the system alive
- read-only/shadow comes before effects

## Architecture

```text
Operational sources
│
├── Teknisa Retail / BI / exports
├── iFood Partner Portal
├── Atendimento mail bridge
├── DeliveryOS mobile / GPS
├── TATÁ OS Print Agent
└── Windows print spooler
        │
        ▼
TATÁ EDGE RUNTIME
│
├── source adapters
├── health/auth state
├── durable local journal
├── outbox + retry
├── dedupe/idempotency
└── receipts
        │
        ▼
EVENT SPINE
        │
        ▼
ORDER IDENTITY GRAPH
        │
        ▼
CONTEXT / PROJECTIONS / INVESTIGATION
        │
        ▼
ATTENTION
        │
        ▼
HUMAN DECISION
```

## What already exists and should be reused

### DeliveryOS

Reuse the existing platform/event concepts rather than creating a parallel transport:

- append-only transition/event semantics;
- deterministic event identifiers and replay safety;
- platform source/device envelopes;
- event log/outbox concepts;
- mobile delivery/GPS work;
- cloud/runtime health contracts;
- historical replay and shadow evaluation.

A new Edge implementation must adapt to these contracts or deliberately supersede them with proof. It must not create a second event vocabulary by convenience.

### TATÁ OS

Reuse proven operational patterns, not necessarily code coupling:

- fail-closed Windows runtime;
- service identity / registration;
- heartbeat and reconciliation;
- local secret protection;
- idempotent operation identifiers;
- effect boundaries;
- explicit separation between software receipt and physical result;
- print capability kept isolated from source-domain logic.

The Edge Runtime must not move shelf-life, sanitary authority or TATÁ OS domain rules into DeliveryOS.

## Source adapters

### 1. iFood Portal Sidecar

**Policy:** official iFood API is not a project dependency.

The adapter may use an authenticated browser profile and structured data exposed to that logged-in user. Prefer network JSON/downloads over DOM scraping. UI scraping is last resort.

The Sidecar begins as:

`OBSERVE_ONLY / SHADOW / NO_WRITE`

Expected source families:

- reviews;
- analytics available in the portal;
- financial/report surfaces visible to the account;
- store status/pause information when observable;
- order metadata that is not already available more reliably from Teknisa.

No CAPTCHA/MFA bypass. If human verification is required:

`AUTH_HUMAN_REQUIRED`

### 2. iFood Auth Relay

Input: authentication messages arriving in the already-authorized Atendimento mailbox path.

Rules:

- parse only narrowly-matched authentication messages;
- OTP exists only for the minimum time needed;
- never persist OTP;
- never place OTP, cookies, JWTs or passwords in logs;
- metadata receipts are allowed;
- false-positive protection must be proven before automatic submission.

States:

`AUTH_HEALTHY -> AUTH_RECOVERING -> AUTH_HEALTHY | AUTH_HUMAN_REQUIRED`

### 3. Teknisa Adapter

Teknisa API access is **optional**, not assumed.

Preferred route:

```text
configured official API / structured export
        ↓
existing structured application surface
        ↓
read-only local observation
        ↓
browser observation
```

Known Retail facts from manual inspection on 2026-09-24:

- integration code `002`, identifier `IFO`, name `iFood`, enabled;
- units `0001 TATA ITAIM` and `0004 TATA PINHEIROS`;
- external receiving mappings observed: `VOUCHER_IFOOD`, `OFFLINE_IFOOD`, `ONLINE_IFOOD`.

These facts do not yet prove which iFood order identifiers survive into Teknisa sales/commands.

### 4. Print Observer

Observe Windows print lifecycle without inserting the Edge Runtime into the print path.

Responsibilities:

- discover print queues;
- observe job created/queued/completed/error/cancelled;
- record document/printer/timestamps when available;
- correlate with a source order only when evidence supports it;
- never block or reroute Teknisa/TATÁ OS printing in shadow mode.

The first implementation must support both possibilities:

1. Teknisa and TATÁ OS share Windows spooler semantics;
2. one or both use a distinct print mechanism.

### 5. TATÁ OS Bridge

TATÁ OS remains owner of its physical-label domain.

The bridge consumes only safe operational receipts such as:

- agent heartbeat;
- job requested;
- lease accepted;
- evidence appended;
- print/software status.

A TATÁ OS print event does not grant DeliveryOS authority to print.

### 6. DeliveryOS Mobile Gateway

The mobile device remains the physical sensor for delivery movement.

Edge/cloud may receive:

- trip lifecycle;
- GPS facts;
- driver/device identity;
- delivery status.

The cashier PC does not replace the mobile sensor.

## Order Identity Graph

A single restaurant order may have several identifiers.

```text
iFood order id / short id
        ↕
Teknisa sale / command id
        ↕
Windows print job
        ↕
DeliveryOS order / trip
        ↕
review id
```

Links are evidence objects, not hidden joins.

Minimum link record:

```text
left_source
left_id
right_source
right_id
relation
evidence
confidence_class
first_seen_at
last_seen_at
```

Allowed confidence classes:

- `PROVEN`
- `SUPPORTED_INFERENCE`
- `CANDIDATE`
- `UNKNOWN`

Never promote a timestamp coincidence to `PROVEN` without an identifying field or other independent evidence.

## Edge event envelope

Candidate minimum fields:

```text
event_id
event_type
source
source_instance
domain
unit_id
occurred_at
observed_at
ingested_at
source_entity_id
correlation_hints
payload_ref / payload
provenance
fact_class
authority
schema_version
```

Requirements:

- append-only;
- deterministic dedupe where the source permits;
- late events preserved;
- original source timestamps preserved separately from observation/ingest time;
- replay-safe;
- source payload minimized where PII is unnecessary.

## Local durability

Do not add infrastructure for prestige.

The first Edge runtime needs only:

- durable local journal;
- durable outbox;
- checkpoints;
- retry/backoff;
- crash recovery;
- health receipt.

DeliveryOS already contains local durable/event mechanisms. Reuse them before selecting another queue/database.

## Resource isolation

The cashier computer is operationally critical.

The Edge Runtime must:

- run in background;
- never steal keyboard/mouse focus;
- never reboot Windows;
- never stop PDV/Teknisa;
- never make printing depend on Edge availability;
- use bounded CPU/memory/network;
- suspend nonessential collection under host pressure;
- fail independently per adapter.

## Build order while the cashier PC is unavailable

### Phase R0 — contract convergence

- map DeliveryOS event/source envelopes against TATÁ OS agent receipts;
- freeze Edge source boundaries;
- freeze Identity Graph link semantics;
- explicitly retire official-iFood-API dependency from the new route.

Exit: no duplicate source-of-truth or event vocabulary.

### Phase R1 — pure simulator

Build fixtures for:

- iFood review/report event;
- auth-required/auth-recovered lifecycle;
- Teknisa sale/command candidate;
- print spool event;
- TATÁ OS print-agent receipt;
- DeliveryOS trip/GPS event.

Exit: deterministic replay produces the same projection twice with zero duplicate meaning.

### Phase R2 — correlation engine

Implement evidence-based candidate links and replay.

Exit: no weak timestamp-only link can become `PROVEN`.

### Phase R3 — Edge runtime skeleton

Implement local adapter supervisor + journal/outbox/health using existing DeliveryOS primitives where sufficient.

Exit: adapter crash does not stop other adapters; restart does not duplicate accepted events.

### Phase R4 — iFood auth/portal shadow contract

Implement the Sidecar/Auth Relay boundary against fixtures and non-secret browser state abstractions.

Exit: secrets/OTP cannot appear in persisted logs; human-required state is explicit.

### Phase R5 — print observer shadow contract

Implement Windows print-event adapter behind an interface and test with synthetic print job events.

Exit: no API in this phase can submit, cancel or reorder print jobs.

### Phase R6 — cashier PC read-only discovery — LAST

Only when César is at the cashier PC:

- inventory processes/services/tasks;
- identify Teknisa/ForSale runtime;
- inspect available reports/structured access;
- observe one real iFood-origin order end-to-end;
- inventory printers/ports/drivers/spooler;
- identify TATÁ OS Print Agent/runtime;
- capture exact identifiers needed for adapter binding.

Exit: hardware/runtime binding facts are recorded; no installation or operational effect.

## Promotion gates

No adapter moves from fixture/shadow to live observation without:

1. exact source identity;
2. least privilege;
3. durable dedupe;
4. restart/recovery test;
5. PII/logging review;
6. rollback/disable path;
7. explicit distinction between observation and effect.

No external write/action is implied by successful observation.

## Current unresolved questions

- which iFood identifiers survive into Teknisa order/sale/comanda;
- whether TATÁ has usable Teknisa API/BI access;
- exact local Teknisa/ForSale process topology;
- whether Teknisa commands pass through Windows spooler;
- whether TATÁ OS and Teknisa share spooler/printer infrastructure;
- actual iFood Partner session lifetime/refresh behavior;
- exact browser network surfaces for reviews/analytics/financial data;
- the safest source of truth for cross-source order identity.

These remain UNKNOWN until direct evidence exists.
