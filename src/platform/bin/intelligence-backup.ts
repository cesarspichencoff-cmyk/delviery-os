/**
 * Processo não crítico de backup da Intelligence Spine (Q-015).
 *
 * Modos:
 *   loop    snapshot diário;
 *   once    um snapshot e encerra;
 *   restore restaura um snapshot nomeado para volume vazio.
 */

import { basename, join } from "node:path";
import {
  criarSnapshot,
  INTELLIGENCE_BACKUP_INTERVAL_MS,
  INTELLIGENCE_BACKUP_KEEP,
  restaurarSnapshot,
} from "../runtime/intelligence-backup";

function texto(nome: string, padrao?: string): string {
  const v = process.env[nome]?.trim();
  if (v) return v;
  if (padrao !== undefined) return padrao;
  throw new Error(`variavel_obrigatoria_ausente:${nome}`);
}

function inteiro(nome: string, padrao: number): number {
  const bruto = process.env[nome]?.trim();
  if (!bruto) return padrao;
  const n = Number(bruto);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`valor_invalido:${nome}`);
  return n;
}

const sourceDir = texto("DELIVERYOS_INTELLIGENCE_SOURCE_DIR", "/intelligence");
const backupDir = texto("DELIVERYOS_INTELLIGENCE_BACKUP_DIR", "/backups");
const modo = process.argv[2] ?? "loop";

function snapshot(): void {
  const path = criarSnapshot(
    sourceDir,
    backupDir,
    new Date(),
    inteiro("DELIVERYOS_INTELLIGENCE_BACKUP_KEEP", INTELLIGENCE_BACKUP_KEEP),
  );
  console.log("[intelligence-backup] snapshot", JSON.stringify({ nome: basename(path) }));
}

async function loop(): Promise<void> {
  const intervalo = inteiro(
    "DELIVERYOS_INTELLIGENCE_BACKUP_INTERVAL_MS",
    INTELLIGENCE_BACKUP_INTERVAL_MS,
  );
  while (true) {
    try {
      snapshot();
    } catch (e) {
      console.error(
        "[intelligence-backup] falhou",
        JSON.stringify({ classe: e instanceof Error ? e.constructor.name : "Error" }),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, intervalo));
  }
}

function restore(): void {
  const nome = texto("DELIVERYOS_INTELLIGENCE_RESTORE_SNAPSHOT");
  if (basename(nome) !== nome || !nome.startsWith("intelligence-")) {
    throw new Error("snapshot_invalido");
  }
  restaurarSnapshot(join(backupDir, nome), sourceDir);
  console.log("[intelligence-backup] restore", JSON.stringify({ nome }));
}

async function main(): Promise<void> {
  if (modo === "once") {
    snapshot();
    return;
  }
  if (modo === "restore") {
    restore();
    return;
  }
  if (modo !== "loop") throw new Error("modo_invalido");
  await loop();
}

void main().catch((e) => {
  console.error(
    "[intelligence-backup] fatal",
    JSON.stringify({ classe: e instanceof Error ? e.constructor.name : "Error" }),
  );
  process.exit(78);
});
