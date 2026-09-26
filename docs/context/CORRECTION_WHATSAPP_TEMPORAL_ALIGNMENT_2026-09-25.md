# Correction — WhatsApp Timeline vs Closing Baseline Window — 2026-09-25

## Difference Check

The previous temporal-baseline evidence proposed aligning the July–September
2026 closing candidates with the historical WhatsApp archive.

That direct route is invalid for the current baseline window.

Observed source ranges:

- raw WhatsApp archive on Foxxy: through **2026-06-25**;
- real closing temporal baseline: **2026-07-14 through 2026-09-24**.

Therefore:

```text
WHATSAPP_ARCHIVE_END < CLOSING_BASELINE_START
NO TEMPORAL OVERLAP
```

The WhatsApp archive remains useful for taxonomy, recurring failure classes and
historical operating patterns. It cannot label whether a July–September 2026
closing anomaly corresponded to a same-day operational episode.

## Failure class

`NON_OVERLAPPING_SOURCE_USED_AS_PROPOSED_TEMPORAL_VALIDATOR`

## Circuit breaker

Do not use the 2020–2026-06-25 WhatsApp corpus as a same-period validation
source for the July–September 2026 temporal baseline.

A source must overlap the evaluated business date before it can contribute a
same-day episode label.

## Replacement evidence route

Caixa Pulse closing emails overlap the baseline and contain independently
recorded shift-level operational occurrences.

The replacement alignment source is therefore:

```text
real D1 daily closing date
    +
Caixa Pulse Manhã/Noite occurrence evidence for the same business date
```

Absence is accepted only when both Manhã and Noite evidence are loaded.
A recorded positive occurrence remains usable even when only one shift is
available, because partial coverage can prove presence but cannot prove
absence.

This correction does not change the temporal baseline itself. It changes only
the source used to evaluate whether its candidates co-locate with independently
recorded operational episodes.
