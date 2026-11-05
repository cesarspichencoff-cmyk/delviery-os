/*
 TATÁ ITAIM — REVIEW-ONLY / NOT EXECUTED / DO NOT INSTALL.
 Metadata-only blueprint for a future, separately AUTHORIZED catalog check.
 This SELECT never queries native order rows, customer fields, SQL plans,
 locks, changes, reader services, printer queues or output.
 Source: sys.schemas, sys.tables, sys.indexes, sys.index_columns, sys.columns.

 A UNIQUE index qualifies as AT-MOST-ONE proof for equality join columns
 ONLY when the effective nonfiltered enforced UNIQUE key is a subset of
 those join columns. Included columns (key_ordinal = 0) are NOT keys.
 A filtered, disabled or hypothetical index is NOT automatically sufficient.
 Catalog names alone do NOT attest a complete order revision, JOIN plan,
 no-writer-block impact, delivery, physical paper or exclusive emission.

 DO NOT execute against the Itaim production SQL Server without César's
 separate authorization and supervised safeguards. Do not export raw data.
*/
SELECT
  s.name AS source_schema,
  t.name AS source_table,
  i.name AS index_name,
  i.index_id AS index_id,
  i.type_desc AS index_type,
  i.is_unique AS is_unique,
  i.is_disabled AS is_disabled,
  i.is_hypothetical AS is_hypothetical,
  i.has_filter AS has_filter,
  ic.key_ordinal AS key_ordinal,
  ic.is_included_column AS is_included_column,
  c.name AS source_column
FROM sys.schemas AS s
INNER JOIN sys.tables AS t ON t.schema_id = s.schema_id
INNER JOIN sys.indexes AS i ON i.object_id = t.object_id
LEFT JOIN sys.index_columns AS ic
  ON ic.object_id = i.object_id
 AND ic.index_id = i.index_id
LEFT JOIN sys.columns AS c
  ON c.object_id = ic.object_id
 AND c.column_id = ic.column_id
WHERE s.name = N'TEKNISA'
  AND t.name IN
    (N'COMANDAVEN', N'VENDAREST', N'ITCOMANDAVEN', N'PRODUTO')
  AND t.is_ms_shipped = 0
  AND i.index_id > 0
ORDER BY t.name, i.index_id, ic.key_ordinal, ic.index_column_id;
