# Print Topology / Production Ticket Source Map — V1.3.2

## Purpose

Parallel, source-only investigation while the isolated real delivery append proof is pending.

Primary questions:

1. Which Odhen/Periféricos print types share the generic `*_IMP.txt` log?
2. How does a print request select printer / queue / model / port / destination?
3. What is the full production/kitchen ticket path?
4. Where and how is `TXPRODCOMVEN` rendered?
5. Can a local production print path complement the delivery-report source without SQL/Teknisa?
6. Are there stable source-level markers that distinguish delivery, kitchen/production and other print jobs?

## Safety boundary

Source/config only.

Do not:
- open any real Log file;
- read order/customer/payment data;
- query SQL;
- call `/print`;
- send a print;
- restart Odhen/Periféricos;
- change `C:\TEKNISA`;
- install watchers/services;
- change printer configuration;
- merge PR #11.

## Required topology

Map these layers with exact file/function/line evidence where available:

```
PRINT GENERATOR
  -> payload / command builder
  -> sendPrint / HTTP client
  -> POST /print
  -> route handler
  -> saveItemRequest
  -> arrFila
  -> printDocs
  -> printCommands
  -> LogIMP
  -> formatTX / printer library
  -> target printer
```

## Required print-type matrix

For every source-proven print type, record:

- print type / generator name;
- source file + function;
- identifying header/marker in rendered text;
- order identifier(s);
- item + quantity;
- item observation channels;
- order observation channels;
- `TXPRODCOMVEN` presence;
- target-selection fields;
- whether it enters generic `LogIMP`;
- whether it is distinguishable from other jobs before/inside `printCommands`;
- privacy-bearing fields;
- confidence: PROVEN / INFERRED / UNKNOWN.

At minimum investigate:
- delivery report / `ImpressaoDelivery`;
- production/kitchen ticket containing `TXPRODCOMVEN`;
- fiscal/NF print paths only enough to distinguish them from delivery/production;
- generic/manual print paths if they also enter `/print`.

## Printer topology

Without querying the database, determine from source/config:

- which fields identify printer/model/port/queue/destination;
- where those fields are populated;
- whether population is static config, payload, DB-derived, or mixed;
- whether `arrFila` is one global queue or partitioned;
- whether `printCommands` still knows the original print type and printer target;
- why a generic file such as `2026_09_29_IMP.txt` can be produced without model/port suffix;
- whether a more specific existing log path is source-proven.

Do not claim actual installed printer names/ports unless source/config (not DB/runtime order data) proves them.

## Production-ticket focus

Trace `TXPRODCOMVEN` from query/result shape to render location.

Prove or leave UNKNOWN:
- item association;
- quantity;
- NRCOMANDA / external order identifier;
- station/printer destination;
- ticket header/footer;
- relationship to delivery report;
- whether the kitchen ticket gives information missing from the delivery report;
- whether multiple station tickets can be deterministically recombined into one order without DB access.

## Decision output

Conclude one of:

- `LOCAL_PRINT_SOURCES_COMPLEMENTARY`: delivery + production local print paths can jointly cover the operational truth needed by DeliveryOS without SQL.
- `LOCAL_PRINT_SOURCE_PARTIAL`: useful but one or more material fields/joins remain unproven.
- `LOCAL_PRINT_SOURCE_INSUFFICIENT`: source-level print paths cannot provide the required truth safely.

No implementation or production change is authorized by this investigation.


## Source-audit result — 2026-09-30

Decision at code level: `LOCAL_PRINT_SOURCES_COMPLEMENTARY`.

The manual CAIXA_MOOCA audit proved the following source contracts without reading logs, orders, SQL or credentials:

- Delivery report: `NRCOMANDA`, conditional `NRCOMANDAEXT`, product code/name/quantity, merged `DSOBSDESCIT + DSOBSPEDDIGCMD`, and order-level `DSOBSCOMANDA`.
- Production ticket: item quantity/name, item-scoped `TXPRODCOMVEN`, and printer destination in `printerInfo`; `NRCOMANDA` is represented as `COMANDA.: DLV_<N>` when the runtime path uses `tipoVenda='C'`.
- A product may print to production, production 2 and puxa; any future join must deduplicate repeated production lines.
- Delivery and production can therefore be joined by `NRCOMANDA` when `DLV_<N>` is present; production lacks `NRCOMANDAEXT` and `CDPRODUTO`.
- The Periféricos path preserves only model + port in the payload/log identity; human TATÁ praça names are not an Odhen concept and require an explicit mapping layer.
- The canonical packaging box is not sourced from Odhen print data; it remains a DeliveryOS V1.3.2 motor result.

### Runtime gates still open

Code-level complementarity is not yet world proof. Before any live reader/cutover:

1. prove that delivery production tickets on this store actually traverse this CAIXA_MOOCA Periféricos instance;
2. prove whether the live production ticket contains `COMANDA.: DLV_<NRCOMANDA>`;
3. prove the live bridge path for the relevant production print;
4. map runtime `<modelo>_<porta>` to TATÁ physical praça;
5. prove one bounded live production block before creating a REAL_SAMPLE_PROVEN production parser profile.

### Preferred zero-content proof

Use only metadata from the already-existing per-printer files:

`<AAAA_MM_DD>_IMP_<modelo>_<porta>.txt`

Correlate which file grows with an observed physical production print. This can simultaneously prove the active bridge path and provide the model/port ↔ physical-printer mapping without opening log contents.

Tool prepared:
`tools/monitor_imp_printer_metadata_only.ps1`

It reads filename/length/timestamps only and has no content-read or write capability.


## First world-proven physical printer mapping — 2026-09-30

A short metadata-only observation on CAIXA_MOOCA was correlated with César's direct physical observation:

- `2026_09_30_IMP_16_192.168.0.153.txt` changed `26926 -> 27358` at 13:56:49.537 and `27358 -> 27658` at 13:57:32.911 local;
- the observed physical print was an Executivo Salmão on **BALCAO SUSHI 1**;
- no log content was opened or read.

Therefore:

`model 16 + port 192.168.0.153 -> BALCAO_SUSHI_1` = **WORLD_PROVEN** for physical-printer identity.

This proof is intentionally narrow. It does NOT yet prove that the observed order was delivery/iFood, that the production ticket contained `COMANDA.: DLV_<N>`, or that every delivery production path traverses this Periféricos instance.

The other observed port `192.168.0.116` remains unmapped.
