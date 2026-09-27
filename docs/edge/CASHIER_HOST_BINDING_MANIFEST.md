# Cashier Host Binding Manifest

This file defines the **questions** the final cashier-PC audit must answer.
It is not an installation script and contains no credentials.

## Host

- hostname
- Windows version/build
- current user/SID used by TATÁ OS runtime
- CPU/RAM headroom during normal and peak operation
- network interfaces used by PDV/browser

## Teknisa

- Retail/ForSale process names and executable paths
- Windows services/tasks used by Teknisa
- local structured ports/endpoints, if any
- structured export/API capability visible to the account
- one real iFood-origin order with every visible internal/external identifier
- one matching sale/comanda identifier
- whether external iFood order id survives into Teknisa

## Printing

- installed printer names
- queue names
- drivers
- ports
- whether Teknisa comanda appears in Windows spooler
- whether TATÁ OS label appears in Windows spooler
- document/job metadata available without control privileges

## TATÁ OS

- Print Agent executable/runtime path
- startup mechanism
- service/task identity
- state directory
- heartbeat route
- printer binding currently configured

## iFood Portal

- dedicated browser/profile candidate
- session persistence across browser/process restart
- whether login requires OTP every session or only after invalidation
- actual authentication email sender/subject/code format
- structured network/download surfaces for reviews, analytics, financial and status

## Required classifications

Every captured binding must be marked:

`FACT | INFERENCE | UNKNOWN`

and:

`READ_ONLY | EFFECT_CAPABLE`

No EFFECT_CAPABLE path is activated during discovery.

## Exit condition

The physical audit is complete when every adapter binding required by the existing Edge contracts is either:

- FACT with evidence; or
- explicitly UNKNOWN with the missing proof named.