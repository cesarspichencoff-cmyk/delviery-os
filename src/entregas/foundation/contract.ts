/**
 * COR-ENTREGAS-V1 @ 1.0.3 — única autoridade de estados/eventos/transições.
 * Fonte exclusiva; não inventar enumerações a partir de UI ou resumos.
 */
export const CONTRACT_ID = "COR-ENTREGAS-V1" as const;
export const CONTRACT_VERSION = "1.0.3" as const;
export const CONTRACT_VERSION_FULL = "COR-ENTREGAS-V1@1.0.3" as const;

export type ContractVersion = typeof CONTRACT_VERSION_FULL;
