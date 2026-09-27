# Correction — Caixa Pulse Mailbox Route — 2026-09-25

## Problem

The first scheduled production proof of the canonical Caixa Pulse parser returned:

- scanned messages: 21;
- Caixa Pulse candidates: 0;
- processed rows: 0;
- ingestion errors: 0.

The parser did not fail. The source mailbox role was wrong.

## Current evidence

A read of the real César Gmail source established the observed route:

- sender: `cesar.spichencoff@gmail.com`;
- display sender: `Tatá Sushi | Caixa Pulse`;
- recipients include `atendimento@tatasushi.com.br`;
- subject contract: `Caixa Pulse | Fechamento | DD/MM/YYYY | Manhã|Noite`.

Therefore, in the Atendimento mailbox these messages are incoming mail and belong
to `INBOX`, not the Atendimento Sent folder.

The failed production receipt came from temporary Worker version
`dfa85dcc-96f3-4d5a-989a-0ece27f909de`. It used the wrong Sent route and
created no Caixa Pulse D1 rows.

The canonical hourly cron was restored immediately after the receipt in Worker
version `e3d77b96-f67c-47ff-880f-bcf8e0ddd729`:

`0 * * * *`

## Failure class

`SOURCE_MAILBOX_ROLE_MISMATCH`

More specifically:

`OUTBOUND_SOURCE_IN_SENDER_ACCOUNT != SENT_FOLDER_IN_RECIPIENT_ACCOUNT`

A mail source route cannot be copied from another ingestion path merely because
both sources involve the same business mailbox.

## Correct route

The Caixa Pulse intake now requires all of:

1. mailbox account: `atendimento@tatasushi.com.br`;
2. mailbox role: `INBOX`;
3. read mode: `EXAMINE` + `BODY.PEEK`;
4. sender: `cesar.spichencoff@gmail.com`;
5. recipient: `atendimento@tatasushi.com.br`;
6. valid Caixa Pulse closing subject;
7. valid UIDVALIDITY + UID source identity.

The IMAP search is bounded by sender, recipient and recent source window before
full message parsing.

## Circuit breaker

A regression test inspects the production intake function and fails unless the
Caixa Pulse path is pinned to Atendimento INBOX with the observed sender and
recipient. It also fails if `findSentFolder` reappears inside that intake
function.

The route matcher has independent positive and negative tests for sender,
recipient and subject.

## Authority boundary

This correction does not authorize restaurant operations, notifications or
mailbox mutation.

The source remains read-only. The only permitted write is the existing
shadow-evidence persistence in the dedicated D1 Caixa Pulse tables.

## Next proof

Deploy the corrected route, obtain one real scheduled receipt, and verify:

- candidate count is non-zero when matching mail exists;
- stored rows carry `readonly_verified = 1`;
- parser health is explicit;
- canonical shift selection is revision-safe;
- the canonical hourly cron is restored after any temporary proof trigger.

Only after that receipt may the Caixa Pulse source be called
`WORLD_PROVEN_LIVE_SOURCE`.
