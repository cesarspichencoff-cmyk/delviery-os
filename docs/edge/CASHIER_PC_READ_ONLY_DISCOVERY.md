# Cashier PC Read-Only Discovery Checklist

**Run only when César is physically available at the cashier computer.**

Purpose: bind the already-designed Edge contracts to the real TATÁ environment without changing it.

## Rules

- read-only inspection;
- no installs;
- no service start/stop;
- no registry edits;
- no printer changes;
- no credential extraction;
- no packet interception that alters TLS or browser trust;
- no production writes.

## Capture

### Host
- Windows version / hostname / current user context;
- relevant CPU/RAM headroom;
- network interfaces;
- scheduled tasks related to TATÁ/Teknisa/printing.

### Teknisa
- running processes and Windows services;
- ForSale/PDV executable identity;
- local configuration/log paths exposed by the product;
- open/listening local ports;
- one known iFood-origin order and all visible IDs/timestamps;
- one corresponding command/sale record;
- available structured export/API options.

### Printing
- installed printers;
- ports/drivers;
- active queues;
- whether a real Teknisa command appears in Windows spooler;
- whether a TATÁ OS label appears in the same spooler;
- only metadata required for correlation.

### TATÁ OS
- Print Agent presence/state;
- runtime path;
- service/task identity;
- heartbeat path;
- no print trigger.

### iFood
- dedicated browser/profile candidate;
- session persistence behavior;
- portal pages needed for Reviews/Analytics/Financial;
- no MFA/CAPTCHA bypass.

## Evidence format

For every observation record:

```text
what_was_observed
source
timestamp
host/unit
proof
classification = FACT | INFERENCE | UNKNOWN
operational_effect = NONE
```

The session is complete when every binding needed by the adapters is either FACT or explicitly UNKNOWN.
