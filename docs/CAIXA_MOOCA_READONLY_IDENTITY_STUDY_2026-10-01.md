# CAIXA_MOOCA — Read-only identity design study — 2026-10-01

## Mission

Compare the best Windows/SQL identity for the future TATÁ command reader without creating or changing anything.

Primary comparison:
1. Windows Service SID / virtual service identity, for example an eventual `NT SERVICE\<service>`;
2. dedicated low-privilege Windows account.

## Allowed

- read OS/version/service-manager metadata;
- read SQL Server version/edition only if obtainable from already-known metadata/configuration without an operational SQL query;
- read Windows service configuration and existing service identities;
- read source/configuration that contains no order/customer data;
- use official platform documentation.

## Not authorized

- create Windows user;
- create Windows service;
- enable a Service SID;
- CREATE LOGIN / CREATE USER;
- GRANT / DENY / REVOKE;
- change local policy;
- SQL operational query;
- read any order/customer row;
- HTTP call;
- print;
- restart service;
- alter Odhen/Teknisa;
- expose secrets.

## Questions to answer

### A. Host capability
- Windows edition/version;
- whether custom Windows services on this host support per-service SID / virtual service identity;
- whether the intended runtime can run as such an identity;
- whether the service identity can authenticate locally to `MSSQL$SQLEXPRESS` via Windows Integrated Security;
- any prerequisite that would itself require administrative change.

### B. Service SID option
- exact future identity form that would be used;
- whether a password would be needed by the application;
- lifecycle behavior across reboot;
- whether it is suitable for a local-only reader;
- operational limitations;
- how SQL Server would recognize it;
- whether service creation and SID enabling are reversible.

### C. Dedicated Windows account option
- whether a password would need to be stored by the application or only by Windows SCM;
- whether interactive logon can be disabled;
- lifecycle/rotation burden;
- security difference versus a Service SID.

### D. SQL permission model
- confirm column-level SELECT is supported on this installed SQL Server version;
- confirm supported HAS_PERMS_BY_NAME sub-securable syntax for columns;
- identify the smallest candidate column set needed from COMANDAVEN, ITCOMANDAVEN, PRODUTO, and only if necessary VENDAREST;
- identify all forbidden personal-data columns we should explicitly negative-test;
- determine whether any required query would need EXECUTE, temp-object creation, VIEW DEFINITION, or other authority beyond SELECT;
- do not design a broad DENY + narrow GRANT pattern without checking SQL Server permission precedence.

### E. Reader design consequences
- whether polling can be done using only the minimal granted columns;
- what candidate new-order predicate can be expressed without customer data;
- which timestamp/state field could support stable reads;
- whether existing indexes can support that predicate, based only on schema/code metadata if safely available;
- what remains UNKNOWN until the first real read.

## Required output

Label every conclusion FACT / INFERENCE / UNKNOWN.

Provide:
- recommended identity type;
- fallback identity type;
- exact reasons;
- administrative actions that would later require César authorization;
- reversible rollback path;
- candidate minimum table/column permission matrix;
- explicit forbidden permissions;
- negative-test matrix;
- remaining unknowns;
- smallest safe implementation proof after authorization.

## STOP

Do not create or modify any identity, login, user, service, permission or database object.