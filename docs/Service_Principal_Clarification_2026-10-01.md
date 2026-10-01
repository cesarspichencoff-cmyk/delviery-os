# Service principal clarification — 2026-10-01

## Correction

"Virtual account" and "Service SID" are related Windows service-security mechanisms but are not the same concept.

For TATÁ, the security invariant is:

- SQL permissions belong to the per-service principal \`NT SERVICE\TataComandaReader\`;
- never grant the reader permissions to \`LocalSystem\`, \`Administrators\`, the current cashier account, or another broad human/system principal;
- the final Windows service logon choice must preserve per-service isolation and require no application-stored password.

## Preferred implementation candidate

Create a Windows service named \`TataComandaReader\`, ensure its per-service SID is enabled, and map \`NT SERVICE\TataComandaReader\` as the SQL Windows login/database user with only column-level SELECT grants.

The exact SCM logon account remains an implementation detail to prove on the actual host before production. The per-service SQL principal is the part that must remain stable.

## Safety

No service, SID, SQL login, database user, or permission is created by this document.
