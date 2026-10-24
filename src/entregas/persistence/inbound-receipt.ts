/**
 * Contrato candidato de recibos de COMANDOS que ENTRAM no servidor.
 * Nao confundir com DomainEvent ou public_outbox: estes sao emitidos pelo dominio.
 *
 * Este arquivo sozinho NAO habilita a rota /api/events/batch.
 * Nao emitir ACK HTTP positivo enquanto fachada, UoW por request,
 * transacao e cutover nao implementarem e provarem o mesmo contrato.
 */
import { createHash } from "node:crypto";

export type InboundReceiptOutcome = "applied" | "rejected";

export interface DurableInboundReceipt {
  unit_id: string;
  event_id: string;
  idempotency_key: string;
  fingerprint: string;
  actor_id: string;
  actor_role: string;
  device_id: string | null;
  command_id: string;
  command_type: string;
  outcome: InboundReceiptOutcome;
  code: string | null;
  recorded_at: string;
}

export class InboundReceiptConflictError extends Error {
  constructor(message = "Recibo de entrada duplicado ou colisao de chave") {
    super(message);
    this.name = "InboundReceiptConflictError";
  }
}

/** Unicidade local explicita por command_id, alem das duas chaves HTTP. */
export class InboundReceiptCommandIdCollisionError extends InboundReceiptConflictError {
  constructor() {
    super("command_id ja confirmado por outro evento");
    this.name = "InboundReceiptCommandIdCollisionError";
  }
}

/** JSON canonico baseado nos bytes sem autoridade do aparelho.
 * Atores/unidade vem da sessao verificada e entram no hash como fonte de autoridade.
 * Nunca converter objetos chaveados sem protecao contra ciclos/NaN/undefined.
 */
export function canonicalInboundFingerprint(input: {
  event_id: string;
  idempotency_key: string;
  command: Record<string, unknown>;
  unit_id: string;
  actor_id: string;
  actor_role: string;
  device_id: string | null;
}): string {
  const seen = new WeakSet<object>();
  function stable(v: unknown): unknown {
    if (v !== null && typeof v === "object") {
      if (seen.has(v)) throw new Error("Objeto circular no fingerprint");
      seen.add(v);
      try {
        if (Array.isArray(v)) {
          const arr: unknown[] = [];
          for (let i=0;i<v.length;i++) {
            if (!(i in v) || v[i] === undefined)
              throw new Error("Elemento undefined em array no fingerprint");
            arr.push(stable(v[i]));
          }
          return arr;
        }
        const proto = Object.getPrototypeOf(v);
        if (proto !== Object.prototype && proto !== null)
          throw new Error("Objeto nao-JSON no fingerprint");
        const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
        for (const [key, value] of Object.entries(v as Record<string, unknown>)
          .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
          // O facade pode enriquecer comandos com channel: undefined.
          // Propriedade opcional ausente e undefined sao o mesmo valor JSON;
          // arrays undefined continuam rejeitados para nao esconder posicoes.
          if (value === undefined) continue;
          output[key] = stable(value);
        }
        return output;
      } finally { seen.delete(v); }
    }
    if (typeof v === "number" && !Number.isFinite(v)) {
      throw new Error("Numero nao finito no fingerprint");
    }
    if (v === undefined || typeof v === "function" || typeof v === "symbol" ||
        typeof v === "bigint") throw new Error("Tipo nao canonico no fingerprint");
    return v;
  }
  return createHash("sha256").update(JSON.stringify(stable(input)), "utf8").digest("hex");
}

/** Busca por ambas as chaves: uma unica chave pode colidir independentemente. */
export function classifyInboundReceipt(
  found: readonly DurableInboundReceipt[],
  request: Pick<DurableInboundReceipt,
    "unit_id" | "event_id" | "idempotency_key" | "fingerprint" |
    "actor_id" | "actor_role" | "device_id">,
): "new" | "replay" | "collision" {
  if (found.length === 0) return "new";
  if (found.length !== 1) return "collision";
  const p = found[0];
  return p.unit_id === request.unit_id &&
    p.event_id === request.event_id &&
    p.idempotency_key === request.idempotency_key &&
    p.fingerprint === request.fingerprint &&
    p.actor_id === request.actor_id &&
    p.actor_role === request.actor_role &&
    p.device_id === request.device_id
    ? "replay" : "collision";
}
