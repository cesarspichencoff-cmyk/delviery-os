# Context Kernel — Mode-aware Attention Policy

## Decision

Modes influence delivery behavior only through explicit policy.

There are no hard-coded daily question limits, magic cooldowns, urgency scores
or assumptions such as "OFF always suppresses" or "REUNIAO always holds".

## Contract

For each pair:

```text
mode × direct reason kind
```

the configured policy may return:

- SHOW_NOW
- HOLD
- SILENT_LOG

If no entry exists:

```text
UNCONFIGURED
```

The system does not guess.

## Important boundaries

- `NeedsMe=YES` is not itself authorization to notify.
- a delivery plan never authorizes an external effect.
- UNKNOWN mode never receives an inferred policy.
- conflicting duplicate policies fail closed.
- quiet state means only that current loaded evidence has no direct reason.

This keeps the real Attention Governor tunable by pilot evidence instead of
embedding arbitrary thresholds before real usage.
