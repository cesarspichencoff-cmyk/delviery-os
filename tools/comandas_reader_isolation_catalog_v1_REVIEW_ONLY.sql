/*
TATÁ Comandas — SQL Server source-isolation catalogue, REVIEW ONLY.
NEVER executed against cashier SQL in this change. Read-only metadata,
not a transaction setup, not a change to SQL Server or TEKNISA.
To run later, use ONLY the existing authorized Reader service account
and explicit human authorization; do not expose customer identifiers.
*/
SELECT
  DB_NAME() AS database_name,
  SUSER_SNAME() AS current_login,
  d.is_read_committed_snapshot_on,
  d.snapshot_isolation_state_desc
FROM sys.databases AS d
WHERE d.name=DB_NAME();
