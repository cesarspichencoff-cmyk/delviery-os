import { isPublicEventType } from "./catalog";
import {
  FORBIDDEN_PAYLOAD_KEYS,
  PUBLIC_EVENTS_SCHEMA_VERSION,
  type EntregasPublicEvent,
  type PublicEventValidationIssue,
  type PublicEventValidationResult,
} from "./types";

function isIsoDate(s: unknown): boolean {
  return typeof s === "string" && !Number.isNaN(Date.parse(s));
}

function scanForbiddenKeys(
  obj: unknown,
  path: string,
  issues: PublicEventValidationIssue[],
): void {
  if (obj === null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => scanForbiddenKeys(v, `${path}[${i}]`, issues));
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const p = path ? `${path}.${k}` : k;
    const lower = k.toLowerCase();
    if (
      (FORBIDDEN_PAYLOAD_KEYS as readonly string[]).includes(lower) ||
      (FORBIDDEN_PAYLOAD_KEYS as readonly string[]).includes(k)
    ) {
      issues.push({
        path: p,
        message: `Campo proibido no contrato público: ${k}`,
      });
    }
    scanForbiddenKeys(v, p, issues);
  }
}

/**
 * Validação de schema do envelope público v1.0.0.
 * Mudança incompatível exige nova schema_version.
 */
export function validatePublicEvent(
  raw: unknown,
): PublicEventValidationResult {
  const issues: PublicEventValidationIssue[] = [];
  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      issues: [{ path: "", message: "Evento deve ser objeto" }],
    };
  }
  const e = raw as Record<string, unknown>;

  const reqStr = (key: string) => {
    if (typeof e[key] !== "string" || !(e[key] as string).trim()) {
      issues.push({ path: key, message: `${key} obrigatório (string)` });
    }
  };

  reqStr("event_id");
  reqStr("event_type");
  reqStr("schema_version");
  reqStr("occurred_at");
  reqStr("recorded_at");
  reqStr("idempotency_key");
  reqStr("unit_id");
  reqStr("correlation_id");

  if (e.source !== "entregas") {
    issues.push({ path: "source", message: 'source deve ser "entregas"' });
  }
  if (e.schema_version !== PUBLIC_EVENTS_SCHEMA_VERSION) {
    issues.push({
      path: "schema_version",
      message: `schema_version deve ser ${PUBLIC_EVENTS_SCHEMA_VERSION} nesta fundação`,
    });
  }
  if (typeof e.event_type === "string" && !isPublicEventType(e.event_type)) {
    issues.push({
      path: "event_type",
      message: `event_type desconhecido: ${e.event_type}`,
    });
  }
  if (!isIsoDate(e.occurred_at)) {
    issues.push({ path: "occurred_at", message: "occurred_at ISO inválido" });
  }
  if (!isIsoDate(e.recorded_at)) {
    issues.push({ path: "recorded_at", message: "recorded_at ISO inválido" });
  }
  if (e.synced_at !== undefined && !isIsoDate(e.synced_at)) {
    issues.push({ path: "synced_at", message: "synced_at ISO inválido" });
  }

  const health = e.source_health;
  if (health !== "ok" && health !== "degraded" && health !== "unknown") {
    issues.push({
      path: "source_health",
      message: "source_health inválido",
    });
  }
  const conf = e.confidence;
  if (conf !== "observed" && conf !== "inferred" && conf !== "unknown") {
    issues.push({ path: "confidence", message: "confidence inválido" });
  }
  if (e.payload === undefined || typeof e.payload !== "object" || e.payload === null) {
    issues.push({ path: "payload", message: "payload objeto obrigatório" });
  } else {
    scanForbiddenKeys(e.payload, "payload", issues);
  }

  // end_of_evidence: absence must not be coerced — optional ids ok
  if (issues.length) return { ok: false, issues };
  return { ok: true, event: e as unknown as EntregasPublicEvent };
}
