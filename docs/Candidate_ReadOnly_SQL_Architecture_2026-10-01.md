# Candidate architecture after CAIXA_MOOCA local study — 2026-10-01

## Status

CANDIDATE, not authorized and not production-proven.

## Proven local facts from CAIXA_MOOCA study

- The local machine hosts the SQL Server instance used by Odhen.
- Odhen backend is served locally by Apache on port 9091.
- DeliveryRepository/AllDeliveryRepository require an operator session.
- Operator authentication has side effects and therefore is not a clean read-only integration boundary.
- The delivery routes do not expose all observation fields required by the production-ticket design.
- The current Windows principal reaching SQL has elevated authority and is rejected as a read-only identity.
- Static source semantics for NRCOMANDA, NRCOMANDAEXT, NRVENDAREST, product fields and observation fields are sufficiently mapped for the next proof.

## Current architectural candidate

Read Odhen tables directly through a Windows-authenticated principal whose effective SQL permissions are technically restricted to the minimum required SELECT surface.

Do NOT use the current sysadmin principal.

Do NOT rely on application discipline or transaction rollback as a substitute for least privilege.

## Identity options to compare before implementation

### Option A — Windows Service SID / virtual service identity

Preferred candidate if supported by the actual Windows/service/runtime setup.

Rationale:
- no application-stored password;
- identity exists only for the service;
- tighter lifecycle and isolation than a human/local user;
- SQL Server supports Windows principals and service SIDs as logins.

### Option B — dedicated low-privilege Windows account

Fallback candidate if a service SID is impractical in this environment.

Requirements:
- not local administrator;
- no interactive operational use;
- no broad SQL roles;
- no shared credentials;
- only the minimum database user/column grants.

## SQL permission model

Prefer an empty/minimal principal with only explicit SELECT grants required by the reader.

Do NOT design around broad DENY plus column GRANT because SQL Server has a historical exception in which a table-level DENY does not override a column-level GRANT.

Effective permissions must be tested while running as the final reader identity.

Column checks must use the supported sub-securable form:
HAS_PERMS_BY_NAME('schema.table', 'OBJECT', 'SELECT', 'column', 'COLUMN').

Negative proof is mandatory:
- forbidden personal-data columns must fail;
- INSERT must fail;
- UPDATE must fail;
- DELETE must fail;
- EXECUTE must fail;
- ALTER/CONTROL/TAKE OWNERSHIP must fail;
- elevated server/database roles must be absent.

## Data minimization

Only grant fields required for command production and correlation.

Customer name, phone, address and other personal data remain outside the permission surface unless a later operational requirement explicitly proves necessity.

## Polling

Polling is only a candidate until the actual minimal read query and order-stability rule are proven.

Do not freeze an interval such as 2–5 seconds yet.

Need proof for:
- exact detection predicate for a new delivery order;
- authoritative timestamp/order marker;
- order completion/stability criteria;
- change detection/re-read behavior;
- query cost and index friendliness.

## Local state

Local state for TATÁ sequence, intent fingerprint and effect reconciliation remains conceptually correct, but persistence technology is not frozen.

SQLite is a candidate; JSON is not yet promoted for a durable concurrent production ledger.

## Printing

Do not interpret Windows spooler acceptance as physical-paper proof.

Existing production rules remain:
- PRINTED/spooler-observed != physically confirmed;
- ambiguous effect blocks blind retry;
- automatic retry allowed only after proven no-effect;
- physical print remains a separate human-controlled gate until live proof.

## Fiscal

Fiscal remains separate from the order-reader decision.

DeliveryOS must not become a custom NFC-e emitter.

Native Teknisa/Odhen fiscal path remains the preferred provider candidate pending live proof.

## Current next gate

Before any administrative change, compare Service SID versus dedicated Windows account on the actual CAIXA_MOOCA host using metadata/documentation only.

No login/user/service/permission may be created by this document.