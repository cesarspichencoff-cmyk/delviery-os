/*
TATÁ Reader SQL permission change — REVIEW ONLY / NOT AUTHORIZED.

SAFETY: SET NOEXEC ON intentionally prevents every statement below from executing.
Do not remove this guard until César explicitly authorizes the administrative change
and the reviewed executable version is generated separately.

Target principal: NT SERVICE\TataComandaReader
Target database: teknisa
Target schema: TEKNISA
Scope: integrated delivery channels only.
No DSCOMANDA, combo-structure columns or IDORIGEMVENDA in v1.
*/

SET NOEXEC ON;

USE [master];

IF SUSER_ID(N'NT SERVICE\TataComandaReader') IS NOT NULL
BEGIN
    THROW 51000, 'TATA_READER_LOGIN_ALREADY_EXISTS_REVIEW_REQUIRES_RECONCILIATION', 1;
END;

CREATE LOGIN [NT SERVICE\TataComandaReader] FROM WINDOWS;

USE [teknisa];

IF USER_ID(N'NT SERVICE\TataComandaReader') IS NOT NULL
BEGIN
    THROW 51001, 'TATA_READER_USER_ALREADY_EXISTS_REVIEW_REQUIRES_RECONCILIATION', 1;
END;

CREATE USER [NT SERVICE\TataComandaReader]
    FOR LOGIN [NT SERVICE\TataComandaReader];

GRANT CONNECT TO [NT SERVICE\TataComandaReader];

GRANT SELECT (
    [CDFILIAL],
    [CDLOJA],
    [NRVENDAREST],
    [NRCOMANDA],
    [NRCOMANDAEXT],
    [IDORGCMDVENDA],
    [IDSTCOMANDA],
    [DSOBSCOMANDA]
)
ON OBJECT::[TEKNISA].[COMANDAVEN]
TO [NT SERVICE\TataComandaReader];

GRANT SELECT (
    [CDFILIAL],
    [NRVENDAREST],
    [NRCOMANDA],
    [NRPRODCOMVEN],
    [CDPRODUTO],
    [QTPRODCOMVEN],
    [IDSTPRCOMVEN],
    [DSOBSDESCIT],
    [DSOBSPEDDIGCMD],
    [TXPRODCOMVEN]
)
ON OBJECT::[TEKNISA].[ITCOMANDAVEN]
TO [NT SERVICE\TataComandaReader];

GRANT SELECT (
    [CDPRODUTO],
    [NMPRODUTO]
)
ON OBJECT::[TEKNISA].[PRODUTO]
TO [NT SERVICE\TataComandaReader];

GRANT SELECT (
    [CDFILIAL],
    [NRVENDAREST],
    [DTHRABERMESA]
)
ON OBJECT::[TEKNISA].[VENDAREST]
TO [NT SERVICE\TataComandaReader];

/*
No DENY statements are used.
No database role membership is granted.
No EXECUTE, VIEW DEFINITION, VIEW SERVER STATE, ALTER, CONTROL,
IMPERSONATE, INSERT, UPDATE or DELETE is granted.

After a future authorized execution, the next mandatory action is:
run tools\tata_reader_least_privilege_preflight.ps1 as the final service identity.
If it does not return safe_for_minimized_order_read=true, stop and rollback.
*/
