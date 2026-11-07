/*
 REVIEW ONLY — metadata inventory, NEVER executed by this PR.
 Scope: three Teknisa native tables already referenced by Reader V2.
 This SELECT lists column definitions, NOT orders or customer information.
 A timestamp-like column name does NOT establish monotonic revision
 semantics, update triggers, transaction completeness, or retention.
 No permission to run against production is implied by this artifact.
*/
SELECT
  s.name AS source_schema,
  t.name AS source_table,
  c.name AS source_column,
  ty.name AS sql_type,
  c.column_id AS column_ordinal,
  c.is_nullable AS is_nullable,
  c.is_identity AS is_identity,
  c.is_computed AS is_computed
FROM sys.schemas AS s
JOIN sys.tables AS t ON t.schema_id = s.schema_id
JOIN sys.columns AS c ON c.object_id = t.object_id
JOIN sys.types AS ty ON ty.user_type_id = c.user_type_id
WHERE s.name = N'TEKNISA'
  AND t.name IN (N'COMANDAVEN', N'ITCOMANDAVEN', N'VENDAREST')
ORDER BY s.name, t.name, c.column_id;
