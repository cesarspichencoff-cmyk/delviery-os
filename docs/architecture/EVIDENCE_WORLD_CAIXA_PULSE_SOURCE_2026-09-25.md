# Evidence — WORLD Caixa Pulse Source — 2026-09-25

## Objective

World-prove the canonical Caixa Pulse mail source through the production
read-only ingestion path, without authorizing any restaurant operational write.

Canonical route:

```text
César Gmail generated Caixa Pulse
  -> atendimento@tatasushi.com.br
  -> Atendimento INBOX
  -> IMAP EXAMINE + BODY.PEEK
  -> cesar-gerencial-mail-bridge
  -> D1 caixa_pulse_shift / caixa_pulse_occurrence
```

## Initial production failure

The first scheduled world proof used a temporary one-minute cron only to obtain
an observable scheduled receipt.

Worker version:
`3bcb00a9-6e96-4b63-8064-2371bbe9926e`

Observed scheduled result:
- scanned: 49;
- candidates: 43;
- processed: 0;
- errors: 43;
- all 43 errors: `CAIXA_PULSE_OCCURRENCE_SECTION_MISSING`.

No parser result was promoted as valid from that run.
## Root cause

A real Gmail message and its raw MIME were inspected.

The Gmail-rendered body exposed labels such as:
- `Ocorrências em aberto / registradas`;
- `Total: N |`;
- `Planilha completa:`.

The actual MIME `text/plain` part consumed by PostalMime used:
- `OCORRÊNCIAS DO TURNO`;
- `Total: N` and `Em aberto: N` on separate lines;
- `Tipo: <categoria>`;
- `Planilha:`.

Therefore the transport route was correct. The parser was compatible with the
rendered representation but not with the source's real plain-text MIME shape.

Failure class:
`SOURCE_MIME_REPRESENTATION_MISMATCH`

Correction commit:
`a414a6f6e7c7aeeb10834129512701b883b11f66`

The parser now accepts both observed representations without weakening source
identity, UIDVALIDITY, read-only proof or structural reconciliation.
## Regression proof

Before redeploy:
- real MIME-layout parser test: 10/10 PASS;
- complete gerencial-mail-bridge suite: 40/40 PASS;
- root TypeScript typecheck: PASS.

The new regression fixture contains the actual structural form observed in the
plain-text MIME: `OCORRÊNCIAS DO TURNO`, `Tipo:` and `Planilha:`.

## Corrected scheduled world proof

Temporary proof version:
`e983e6d2-0e4b-4677-8ef6-2fbfc9d123d3`

Real scheduled execution:
- scanned: 49;
- candidates: 43;
- processed: 43;
- skipped: 6;
- degraded: 0;
- errorCount: 0.

Every processed candidate reported:
- `sourceHealth = HEALTHY`;
- `readOnlyVerified = true`;
- empty quality flags;
- parsed totals equal to source-reported totals.

Zero-occurrence shifts remained explicit zero records; no occurrence was
fabricated.
## D1 world state after proof

Read-only verification queries returned:

`caixa_pulse_shift`
- rows: 43;
- canonical shifts: 41;
- healthy shifts: 43;
- read-only verified shifts: 43;
- source business-date range: 2026-09-04 through 2026-09-25.

`caixa_pulse_occurrence`
- occurrence rows: 69;
- canonical occurrence rows: 69;
- occurrence rows with recorded action text: 69.

Canonical source status markers:
- `Concluído`: 58;
- `Necessário Revisão`: 11.

Invariant:
`SOURCE_MARKED_CONCLUDED != OUTCOME_PROVEN`

The D1 verification queries wrote zero rows.

## Rollback / canonical schedule

Immediately after the proof, the temporary one-minute cron was removed.

Restored production version:
`e7490e26-4904-4265-a750-05fba9adf797`

Restored canonical cron:
`0 * * * *`

The production source is therefore WORLD_PROVEN as read-only ingestion, but it
does not authorize any notification, operational write, causal attribution or
global all-clear.
