import type { UnitOfWork } from "../persistence/ports";
import { openFileUnitOfWork } from "../persistence/file-store";

export interface PilotUnitOfWorkSource {
  readonly kind: "file" | "external";
  readonly dataPath?: string;
  open(): UnitOfWork;
}

export function createFilePilotUnitOfWorkSource(
  dataFile: string,
): PilotUnitOfWorkSource {
  return {
    kind: "file",
    dataPath: dataFile,
    open: () => openFileUnitOfWork(dataFile),
  };
}
