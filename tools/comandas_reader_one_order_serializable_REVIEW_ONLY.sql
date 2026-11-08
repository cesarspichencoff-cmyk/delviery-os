/*
TATÁ / ITAIM — DESIGN REVIEW ONLY (NOT DEPLOYABLE OR AUTHORIZED TO RUN).
Proposed bounded single native order under locking SERIALIZABLE when RCSI=OFF.
DO NOT EXECUTE against the live Teknisa database or cashier host.
Even with LOCK_TIMEOUT, this SELECT can temporarily block POS WRITERS.
The 100ms LOCK_TIMEOUT limits this reader's wait, NOT time writers wait for it.
An authorized isolated, NON-POOLED Reader-identity connection with its own
short CommandTimeout, plan review, rollback, monitoring and safety window
would be prerequisites. No customer/fiscal fields, no iFood request.
Verified in the Itaim SQL Server catalog (04/11/2026):
TEKNISA.COMANDAVEN.NRVENDAREST is varchar(10), NRCOMANDA is varchar(10).
ADO.NET bind BOTH @nrVendaRest and @nrComanda as SqlDbType.VarChar, Size=10.
Verify the column metadata again at the supervised pilot; never use
SqlDbType.NVarChar or nvarchar(64) here, which risks implicit conversion/scan.
Precondition: exact native order key issued by the authorized Reader.
The installed Teknisa INSERT SQL includes CDLOJA on VENDAREST and ITCOMANDAVEN;
require equality with COMANDAVEN.CDLOJA on BOTH joins. This prevents a
coherent cross-store row with a reused sale/command code from joining Itaim.
It does NOT prove unique indexes, optimizer access paths, or writer lock safety.
Free-text observations MAY include customer PII despite no customer columns;
never log, transmit or publish raw observation fields.
Result >200 lines or any timeout => HOLD (never silently truncate).
*/
SET NOCOUNT ON;
SET DEADLOCK_PRIORITY LOW;
SET LOCK_TIMEOUT 100;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

-- Exactly ONE SELECT under statement/autocommit isolation; no DML/DDL.
-- This relies on SQL Server to hold read/range locks until statement end.
-- A seek plan is NOT guaranteed by these hints or by catalog indexes.
SELECT TOP (201)
  c.CDFILIAL,c.CDLOJA,c.NRVENDAREST,c.NRCOMANDA,
  c.NRCOMANDAEXT,c.IDORGCMDVENDA,c.IDSTCOMANDA,v.DTHRABERMESA,
  i.NRPRODCOMVEN,i.CDPRODUTO,p.CDARVPROD,i.QTPRODCOMVEN,
  i.IDSTPRCOMVEN,
  c.DSOBSCOMANDA,
  i.DSOBSDESCIT,i.DSOBSPEDDIGCMD,i.TXPRODCOMVEN
FROM TEKNISA.COMANDAVEN AS c
INNER JOIN TEKNISA.VENDAREST AS v
  ON v.CDFILIAL=c.CDFILIAL
 AND v.CDLOJA=c.CDLOJA
 AND v.NRVENDAREST=c.NRVENDAREST
LEFT JOIN TEKNISA.ITCOMANDAVEN AS i
  ON i.CDFILIAL=c.CDFILIAL
 AND i.CDLOJA=c.CDLOJA
 AND i.NRVENDAREST=c.NRVENDAREST
 AND i.NRCOMANDA=c.NRCOMANDA
LEFT JOIN TEKNISA.PRODUTO AS p
  ON p.CDPRODUTO=i.CDPRODUTO
WHERE c.CDFILIAL='0001'
  AND c.CDLOJA='01'
  AND c.IDORGCMDVENDA='DLV_IFO'
  AND c.NRVENDAREST=@nrVendaRest
  AND c.NRCOMANDA=@nrComanda
ORDER BY i.NRPRODCOMVEN ASC
OPTION (MAXDOP 1);
