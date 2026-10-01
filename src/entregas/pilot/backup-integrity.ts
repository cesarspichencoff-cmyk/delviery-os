import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { basename } from "node:path";

export type BackupIntegrityFailure =
  | "snapshot_missing"
  | "sidecar_missing"
  | "sidecar_invalid"
  | "sidecar_filename_mismatch"
  | "sha256_mismatch";

export type BackupIntegrityResult =
  | {
      ok: true;
      sha256: string;
      bytes: number;
      snapshot_name: string;
      sidecar_name: string;
    }
  | {
      ok: false;
      reason: BackupIntegrityFailure;
      snapshot_name: string;
      sidecar_name: string;
      expected_sha256?: string;
      actual_sha256?: string;
    };

export interface ParsedSha256Sidecar {
  sha256: string;
  filename: string;
}

export function parseSha256Sidecar(text: string): ParsedSha256Sidecar | null {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.endsWith("\n")
    ? normalized.slice(0, -1).split("\n")
    : normalized.split("\n");
  if (lines.length !== 1) return null;

  // Formato canônico do GNU sha256sum: HASH + espaço + marcador de modo
  // (espaço para texto, * para binário) + nome do arquivo.
  const match = /^([0-9a-fA-F]{64}) ([ *])([^\r\n]+)$/.exec(lines[0]);
  if (!match) return null;
  return { sha256: match[1].toLowerCase(), filename: match[3] };
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(path);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

export async function verifyBackupIntegrity(
  snapshotPath: string,
  sidecarPath = snapshotPath + ".sha256",
): Promise<BackupIntegrityResult> {
  const snapshotName = basename(snapshotPath);
  const sidecarName = basename(sidecarPath);

  if (!existsSync(snapshotPath)) {
    return {
      ok: false,
      reason: "snapshot_missing",
      snapshot_name: snapshotName,
      sidecar_name: sidecarName,
    };
  }
  if (!existsSync(sidecarPath)) {
    return {
      ok: false,
      reason: "sidecar_missing",
      snapshot_name: snapshotName,
      sidecar_name: sidecarName,
    };
  }

  const parsed = parseSha256Sidecar(readFileSync(sidecarPath, "utf8"));
  if (!parsed) {
    return {
      ok: false,
      reason: "sidecar_invalid",
      snapshot_name: snapshotName,
      sidecar_name: sidecarName,
    };
  }

  // O sidecar precisa ser portátil: referencia só o basename que está ao lado.
  // Caminho absoluto/relativo diferente é rejeitado em vez de seguido.
  if (parsed.filename !== snapshotName) {
    return {
      ok: false,
      reason: "sidecar_filename_mismatch",
      snapshot_name: snapshotName,
      sidecar_name: sidecarName,
      expected_sha256: parsed.sha256,
    };
  }

  const actual = await sha256File(snapshotPath);
  if (actual !== parsed.sha256) {
    return {
      ok: false,
      reason: "sha256_mismatch",
      snapshot_name: snapshotName,
      sidecar_name: sidecarName,
      expected_sha256: parsed.sha256,
      actual_sha256: actual,
    };
  }

  return {
    ok: true,
    sha256: actual,
    bytes: statSync(snapshotPath).size,
    snapshot_name: snapshotName,
    sidecar_name: sidecarName,
  };
}
