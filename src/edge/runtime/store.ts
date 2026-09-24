/**
 * Single-PC durable store-and-forward for Edge observations.
 *
 * This is a local/pilot mechanism, not a multi-instance production database.
 * Observation + outbox state are persisted atomically with temp-write + rename.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { EdgeSourceObservation } from "../simulator";

export type EdgeOutboxStatus = "pending" | "sent" | "failed";
export type EdgeOutboxFailureCode =
  | "network_unavailable"
  | "upstream_unavailable"
  | "timeout"
  | "rejected"
  | "unknown";

export interface EdgeOutboxRecord {
  observation_id: string;
  status: EdgeOutboxStatus;
  attempts: number;
  created_at: string;
  last_attempt_at?: string;
  last_error_code?: EdgeOutboxFailureCode;
  sent_at?: string;
}

interface EdgeStoreState {
  observations: EdgeSourceObservation[];
  outbox: EdgeOutboxRecord[];
}

export interface IngestReceipt {
  accepted: boolean;
  duplicate: boolean;
  observation_id: string;
}

const FORBIDDEN_PERSISTED_KEYS = new Set([
  "otp",
  "otp_code",
  "auth_code",
  "verification_code",
  "login_code",
  "password",
  "senha",
  "token",
  "authorization",
  "cookie",
  "jwt",
  "access_token",
  "refresh_token",
  "secret",
  "customer_name",
  "customer_phone",
  "customer_email",
  "customer_address",
]);

const ALLOWED_FAILURE_CODES = new Set<EdgeOutboxFailureCode>([
  "network_unavailable",
  "upstream_unavailable",
  "timeout",
  "rejected",
  "unknown",
]);

function isForbiddenPersistedKey(key: string): boolean {
  const normalized = key.toLowerCase();
  if (FORBIDDEN_PERSISTED_KEYS.has(normalized)) return true;
  if (
    ["email", "address", "phone"].some((suffix) =>
      normalized.endsWith(`_${suffix}`),
    )
  ) {
    return true;
  }

  return [
    "otp",
    "password",
    "senha",
    "token",
    "authorization",
    "cookie",
    "jwt",
    "secret",
  ].some((suffix) => normalized.endsWith(`_${suffix}`));
}

function emptyState(): EdgeStoreState {
  return { observations: [], outbox: [] };
}

export class FileEdgeStore {
  private state: EdgeStoreState;

  constructor(
    private readonly filePath: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.state = loadState(filePath);
  }

  ingest(observation: EdgeSourceObservation): IngestReceipt {
    assertPersistable(observation);

    const existing = this.state.observations.find(
      (item) => item.observation_id === observation.observation_id,
    );
    if (existing) {
      if (stableStringify(existing) !== stableStringify(observation)) {
        throw new Error("observation_id_conflict");
      }
      return {
        accepted: true,
        duplicate: true,
        observation_id: observation.observation_id,
      };
    }

    const next = structuredClone(this.state);
    next.observations.push(structuredClone(observation));
    next.outbox.push({
      observation_id: observation.observation_id,
      status: "pending",
      attempts: 0,
      created_at: this.now().toISOString(),
    });
    this.persist(next);
    return {
      accepted: true,
      duplicate: false,
      observation_id: observation.observation_id,
    };
  }

  pending(): EdgeOutboxRecord[] {
    return this.state.outbox
      .filter((item) => item.status === "pending" || item.status === "failed")
      .map((item) => ({ ...item }));
  }

  observations(): EdgeSourceObservation[] {
    return structuredClone(this.state.observations);
  }

  markSent(observationId: string): void {
    this.mutateOutbox(observationId, (record) => {
      record.attempts += 1;
      record.last_attempt_at = this.now().toISOString();
      record.sent_at = record.last_attempt_at;
      record.status = "sent";
      delete record.last_error_code;
    });
  }

  markFailed(observationId: string, errorCode: EdgeOutboxFailureCode): void {
    if (!ALLOWED_FAILURE_CODES.has(errorCode)) {
      throw new Error("invalid outbox failure code");
    }
    this.mutateOutbox(observationId, (record) => {
      record.attempts += 1;
      record.last_attempt_at = this.now().toISOString();
      record.last_error_code = errorCode;
      record.status = "failed";
    });
  }

  snapshot(): string {
    return JSON.stringify(this.state);
  }

  private mutateOutbox(
    observationId: string,
    mutate: (record: EdgeOutboxRecord) => void,
  ): void {
    const next = structuredClone(this.state);
    const record = next.outbox.find((item) => item.observation_id === observationId);
    if (!record) throw new Error(`outbox record not found: ${observationId}`);
    mutate(record);
    this.persist(next);
  }

  private persist(next: EdgeStoreState): void {
    saveState(this.filePath, next);
    this.state = next;
  }
}

function loadState(filePath: string): EdgeStoreState {
  const primary = readState(filePath);
  if (primary.ok) return primary.state;

  const backupPath = `${filePath}.bak`;
  const backup = readState(backupPath);
  if (backup.ok) return backup.state;

  if (!primary.exists && !backup.exists) return emptyState();

  // Existing-but-unreadable local state is a fail-closed condition.
  throw new Error("edge_store_corrupt");
}

function readState(
  filePath: string,
):
  | { ok: true; exists: true; state: EdgeStoreState }
  | { ok: false; exists: boolean } {
  if (!existsSync(filePath)) return { ok: false, exists: false };
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as EdgeStoreState;
    if (!Array.isArray(parsed.observations) || !Array.isArray(parsed.outbox)) {
      return { ok: false, exists: true };
    }
    assertPersistable(parsed);
    return { ok: true, exists: true, state: parsed };
  } catch {
    return { ok: false, exists: true };
  }
}

function saveState(filePath: string, state: EdgeStoreState): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${randomUUID()}.tmp`;
  const backup = `${filePath}.bak`;

  writeFileSync(tmp, JSON.stringify(state), "utf8");

  if (existsSync(filePath)) {
    if (existsSync(backup)) rmSync(backup);
    renameSync(filePath, backup);
  }

  renameSync(tmp, filePath);
}

function assertPersistable(value: unknown, depth = 0): void {
  if (depth > 16 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) assertPersistable(item, depth + 1);
    return;
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (isForbiddenPersistedKey(key)) {
      throw new Error(`forbidden persisted secret field: ${key}`);
    }
    assertPersistable(nested, depth + 1);
  }
}


function stableStringify(value: unknown): string {
  return JSON.stringify(sortForStableJson(value));
}

function sortForStableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForStableJson);
  if (value === null || typeof value !== "object") return value;

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) {
    output[key] = sortForStableJson(input[key]);
  }
  return output;
}
