# Passive Print Log Shadow — V1.3.2

## Status

**CODE-PROVEN CANDIDATE, NOT WORLD-PROVEN YET.**

Read-only source inspection on CAIXA_MOOCA established from current Odhen/Periféricos code and config that:

- `salvaLogDetalhadoIMP` is enabled;
- `printCommands` writes the complete print command text immediately before the official printer path;
- the log writer targets a monthly/day/printer file under `Log\<MêsAno>\<AAAA_MM_DD>_IMP_<modelo>_<porta>.txt`;
- `arrFila` is memory-only;
- `salvaimpressao` / request-dump alternatives are disabled.

The physical existence/current append activity of the target log file has **not** been proven because the host permission layer blocked even directory listing. Therefore this route is not yet WORLD_PROVEN.

## Proposed path

```
Odhen ImpressaoDelivery
  -> Command[]
  -> ImpressaoUtil::impressaoPedidos
  -> Printing::sendPrint
  -> POST :3000/print
  -> routes/imp.js
  -> saveItemRequest
  -> arrFila
  -> printDocs
  -> printCommands
       |-> LogIMP(full print text) ----> PASSIVE SHADOW TAP
       \-> formatTX -----------------> official printer
```

No Odhen/Teknisa code modification is required for the preferred route.

## Operational data known to be present in the delivery report path

- NRCOMANDA: present.
- NRCOMANDAEXT: present for supported marketplace orders such as iFood/Uber.
- Items and quantities: present.
- DSOBSDESCIT + DSOBSPEDDIGCMD: printed as merged item-level observation lines; original source attribution is not recoverable from paper text.
- DSOBSCOMANDA: present as order-level `OBS.:`.
- NRVENDAREST: absent.
- TXPRODCOMVEN: absent from the delivery report; it is a kitchen-ticket channel.

This source therefore cannot satisfy the previous SQL-oriented "all four observation channels" completeness contract. A new print-source contract is required and must not pretend TXPRODCOMVEN or original DSOBSDESCIT-vs-DSOBSPEDDIGCMD provenance exists.

## Privacy boundary

The raw print text may contain name, phone, address and payment/total information.

Any future reader must:

1. read locally;
2. parse in memory;
3. immediately project to a minimum operational record;
4. discard raw text and PII;
5. never persist raw print text in DeliveryOS;
6. never transmit raw text off the cashier PC;
7. persist only minimum operational fields and a deterministic dedupe/fingerprint.

## File-safety boundary

The Odhen logger must remain authoritative. A reader must never lock, rename, truncate, rotate or write the log.

Implementation requirement for any reader:
- read-only access;
- shared read/write/delete semantics where the platform permits;
- fail-open: reader failure never affects official printing;
- no retry loop that can hold a handle continuously;
- source disappearance/staleness => UNKNOWN/SOURCE_UNAVAILABLE, never "no orders".

## Next proof gate

A bounded one-order passive proof is required before implementation can be called viable:

1. prove the expected log file exists and is being appended;
2. capture only the newly appended block for one controlled order;
3. sanitize in memory before persistence;
4. verify order id, external id when present, items, quantities, merged item observations and order observation;
5. prove no raw PII persists;
6. prove official printing behavior/queue is unchanged;
7. prove dedupe on the same appended block.

Until that proof exists:
- `EXISTING_PASSIVE_SOURCE` = CODE_PROVEN_CANDIDATE;
- production integration = NOT PROVEN;
- physical print/cutover = NOT AUTHORIZED.
