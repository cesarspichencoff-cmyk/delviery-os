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

export interface EdgeOutboxRecord {
  observation_id: string;
  status: EdgeOutboxStatus;
  attempts: number;
  created_at: string;
  last_attempt_at?: string;
  last_error?: string;
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
]);

function isForbiddenPersistedKey(key: string): boolean {
  const normalized = key.toLowerCase();
  if (FORBIDDEN_PERSISTED_KEYS.has(normalized)) return true;
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
    assertPersistable(observation.payload);

    if (this.state.observations.some((item) => item.observation_id === observation.observation_id)) {
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
      delete record.last_error;
    });
  }

  markFailed(observationId: string, error: string): void {
    this.mutateOutbox(observationId, (record) => {
      record.attempts += 1;
      record.last_attempt_at = this.now().toISOString();
      record.last_error = error;
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
  if (existsSync(filePath)) {
    return JSON.parse(readFileSync(filePath, "utf8")) as EdgeStoreState;
  }
  const backup = `${filePath}.bak`;
  if (existsSync(backup)) {
    return JSON.parse(readFileSync(backup, "utf8")) as EdgeStoreState;
  }
  return emptyState();
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
  if (depth > 12 || value === null || typeof value !== "object") return;
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
