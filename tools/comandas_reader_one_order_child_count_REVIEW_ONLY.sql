/*
TATÁ Itaim — candidate ONE-ORDER NATIVE CHILD COUNT probe, REVIEW ONLY.
DO NOT RUN on CAIXA_MOOCA or any production SQL without separate, specific
authorization + measured writer-safety window + approved command identity.
The vendor's own PHP confirms relationships:
  ITCOMANDAEST by CDFILIAL/NRVENDAREST/NRCOMANDA/NRPRODCOMVEN;
  OBSITCOMANDAVEN by same 4 fields and occurrence pair CDGRPOCOR/CDOCORR;
  OBSITCOMANDAEST by parent key + CDPRODUTO;
  OCORRENCIA by CDGRPOCOR/CDOCORR.
Strictly bind four parameters in a future SqlCommand: @filial @loja
@venda @comanda. Native sale and comanda parameters VARCHAR(10).
Bounded by exactly ONE known order; no names, money, PII or note text.
Counts are NOT an atomic native snapshot under RCSI OFF/SNAPSHOT OFF.
NOLOCK is prohibited: dirty or partial rows are not completeness proof.
A short LOCK_TIMEOUT limits reader waiting, not writer blockage.
Plan/cost/isolation and stop-on-lock must be reviewed before execution.
*/
SELECT
  (SELECT COUNT_BIG(*) FROM TEKNISA.ITCOMANDAVEN AS i
   WHERE i.CDFILIAL=c.CDFILIAL AND i.NRVENDAREST=c.NRVENDAREST
     AND i.NRCOMANDA=c.NRCOMANDA) AS native_item_rows,
  (SELECT COUNT_BIG(*) FROM TEKNISA.ITCOMANDAEST AS e
   WHERE e.CDFILIAL=c.CDFILIAL AND e.NRVENDAREST=c.NRVENDAREST
     AND e.NRCOMANDA=c.NRCOMANDA) AS native_combo_child_rows,
  (SELECT COUNT_BIG(*) FROM TEKNISA.OBSITCOMANDAVEN AS ov
   WHERE ov.CDFILIAL=c.CDFILIAL AND ov.NRVENDAREST=c.NRVENDAREST
     AND ov.NRCOMANDA=c.NRCOMANDA) AS native_item_occurrence_rows,
  (SELECT COUNT_BIG(*) FROM TEKNISA.OBSITCOMANDAEST AS oe
   WHERE oe.CDFILIAL=c.CDFILIAL AND oe.NRVENDAREST=c.NRVENDAREST
     AND oe.NRCOMANDA=c.NRCOMANDA) AS native_combo_occurrence_rows,
  (SELECT COUNT_BIG(*) FROM TEKNISA.OBSITCOMANDAVEN AS ov
   WHERE ov.CDFILIAL=c.CDFILIAL AND ov.NRVENDAREST=c.NRVENDAREST
     AND ov.NRCOMANDA=c.NRCOMANDA
     AND NOT EXISTS (
       SELECT 1 FROM TEKNISA.OCORRENCIA AS oc
       WHERE oc.CDGRPOCOR=ov.CDGRPOCOR AND oc.CDOCORR=ov.CDOCORR
     )) AS unresolved_item_occurrence_rows,
  (SELECT COUNT_BIG(*) FROM TEKNISA.ITCOMANDAVEN AS i
   WHERE i.CDFILIAL=c.CDFILIAL AND i.NRVENDAREST=c.NRVENDAREST
     AND i.NRCOMANDA=c.NRCOMANDA
     AND NOT EXISTS (
       SELECT 1 FROM TEKNISA.PRODUTO AS p
       WHERE p.CDPRODUTO=i.CDPRODUTO
     )) AS missing_product_master_rows
FROM TEKNISA.COMANDAVEN AS c
WHERE c.CDFILIAL=@filial AND c.CDLOJA=@loja
  AND c.NRVENDAREST=@venda AND c.NRCOMANDA=@comanda
  AND c.IDORGCMDVENDA='DLV_IFO';
