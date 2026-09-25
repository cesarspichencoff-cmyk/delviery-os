# César Context Cycle — Product Composition

## Why this exists

The project had individually proven modules, but the user-facing product needs
one coherent evaluation pass.

`buildContextCycle` composes:

```text
Context Signals + Schedule + Commitments + Evidence Debt + Edge Snapshot
                              ↓
                         Mode Compiler
                              ↓
                      César Context Kernel
                              ↓
                    Precisa de mim?
                              ↓
                  Structured Briefing
                              ↓
               Mode-aware Attention Policy
```

## Output

One cycle returns:

- schedule snapshot;
- context-kernel snapshot;
- structured briefing;
- per-reason attention-delivery proposal.

It never performs the effect.

## Important product semantics

- an active meeting may produce REUNIAO unless a newer explicit human mode wins;
- work and personal signals may coexist as MISTO;
- Edge facts/simulations retain their truth class;
- commitments retain evidence-debt closure rules;
- delivery behavior requires explicit mode policy;
- no module silently turns `NO_KNOWN_NEED` into "everything is fine";
- no external write or notification is authorized by this cycle.

This is the pure core that future Watch, Calendar, Trello and Gmail bindings
can call repeatedly.
