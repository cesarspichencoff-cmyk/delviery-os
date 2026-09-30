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
