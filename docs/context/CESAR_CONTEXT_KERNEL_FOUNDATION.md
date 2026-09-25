# César Context Kernel — Foundation

## Objective

Build the higher layer that combines TATÁ operational context with César's
calendar, commitments, personal context and explicit modes without turning
DeliveryOS into a personal-data database.

## Boundary

```text
TATÁ SOURCES
    ↓
TATÁ EDGE
    ↓
Edge Manager Snapshot
    ↓
CÉSAR CONTEXT KERNEL
    ├── Mode Compiler
    ├── Commitment Engine
    ├── Gerente Investigador
    └── "Precisa de mim?" projection
    ↓
Attention Governor / Watch / ChatGPT
```

The Edge owns operational observation.

The Context Kernel owns context composition.

Neither layer gains authority to perform external effects from observation
alone.

## v0.1 modules

### Mode Compiler

Supported modes:

- TRABALHO
- PESSOAL
- MISTO
- FOCO
- REUNIAO
- OFF
- UNKNOWN

Rules are deliberately small:

1. newest explicit human mode wins;
2. same-time conflicting explicit modes -> UNKNOWN;
3. active meeting -> REUNIAO;
4. simultaneous work + personal context -> MISTO;
5. work only -> TRABALHO;
6. personal only -> PESSOAL;
7. insufficient evidence -> UNKNOWN.

No arbitrary time threshold or inferred personality rule exists.

### Commitment Engine

Commitments are reconstructed from append-only events.

A commitment cannot become `PROVEN_CLOSED` while evidence debt remains open.

This preserves:

`DONE_UNVERIFIED != PROVEN`

The foundation stores safe references/codes, not source-specific personal
content.

### Gerente Investigador

Evidence debt routing is:

```text
trusted source
    ↓
operational owner
    ↓
César
    ↓
improve next capture
    ↓
KEEP UNKNOWN
```

Evidence debt never means guilt and never proves cause.

### "Precisa de mim?"

The v0.1 projection answers only from direct loaded evidence:

- explicit Edge hard exception;
- evidence question that truly needs César context;
- overdue open commitment assigned to César.

A quiet result is `NO_KNOWN_NEED`, not "everything is fine".

If there is no usable context at all, the result is `UNKNOWN`.

## Data separation

Personal sources are not persisted in the Edge journal.

Future Calendar/Gmail/Watch adapters should feed the Context Kernel through
their own minimal contracts.

Restaurant raw payloads remain behind the Edge Manager Snapshot.

## Current proof boundary

The foundation is pure TypeScript with no external I/O.

It becomes `PROVEN_SYNTHETIC` only after the exact commit passes cloud
typecheck + the full synthetic suite.

It does not prove:

- live Google Calendar ingestion;
- live Gmail/Trello ingestion;
- Apple Watch capture;
- notification delivery;
- personal-data persistence/security;
- production authorization.
