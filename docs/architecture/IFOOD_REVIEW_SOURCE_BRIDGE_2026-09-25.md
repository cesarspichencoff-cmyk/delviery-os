# iFood Review Mail -> Edge -> Watch — 2026-09-25

## Decision

The canonical review-mail source is the current mail-bridge table:

`ifood_review_mail`

The older `ifood_evaluation_mails` lineage remains in D1 but is not used by
the new Edge bridge.

Current production counts at verification time:

```text
ifood_review_mail       0
ifood_evaluation_mails  0
```

Therefore the bridge can be code/deployment proven before the first real batch,
but cannot be classified as a live iFood source proof yet.

## Source semantics

The Edge reads only verified rows:

```sql
FROM ifood_review_mail
WHERE readonly_verified = 1
ORDER BY message_sent_at DESC, mailbox_uid DESC
LIMIT 1
```

Freshness input follows the source fact:

```text
source_observed_at = message_sent_at
ingested_at        = updated_at
```
The Watch handoff exports only minimized coverage metadata:

- source = `ifood_review_mail`;
- observation count;
- first/last observed time.

It does not export subject, body, attachment manifest/content, mailbox UID or
UIDVALIDITY.

The existing closing coverage is preserved when iFood is added.

## Freshness boundary

No iFood freshness cadence is registered yet.

Until real usage establishes a defensible policy:

`ifood_review_mail -> UNKNOWN`

This does not block observation, but it prevents false FRESH classification.

Global all-clear and external effects remain false.

## Verification

Foxxy targeted proof:
- cloud producer: 19/19;
- Watch worker: 14/14;
- typecheck: PASS.

Full `test:edge:shadow:all`:
- exit code 0;
- browser/print/runtime/context/transport gates preserved;
- no external effect authority introduced.

## Remaining gate

The first real matching email sent through the authorized review-mail route is
still required for:

`WORLD_PROVEN_LIVE_IFOOD_REVIEW_SOURCE`

Until that happens, the correct state is:

`CODE_READY + TEST_PASS + LIVE_SOURCE_NOT_YET_OBSERVED`
