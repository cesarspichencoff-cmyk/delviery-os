/*
TATÁ Reader SQL rollback — REVIEW ONLY / NOT AUTHORIZED.

SAFETY: SET NOEXEC ON intentionally prevents every statement below from executing.
Do not remove this guard. If César authorizes rollback later, generate a fresh
executable rollback from this reviewed template.

Rollback removes only the TATÁ reader SQL principal created for this integration.
The Windows service must be stopped and deleted first using the reviewed service rollback.
It does not alter Teknisa tables, rows, schema, Odhen services or printers.
*/

SET NOEXEC ON;

USE [teknisa];

IF USER_ID(N'NT SERVICE\TataComandaReader') IS NOT NULL
BEGIN
    DROP USER [NT SERVICE\TataComandaReader];
END;

USE [master];

IF SUSER_ID(N'NT SERVICE\TataComandaReader') IS NOT NULL
BEGIN
    DROP LOGIN [NT SERVICE\TataComandaReader];
END;
