/**
 * Reader V2 -> R5-D3 work events: REVIEW-ONLY identity bridge.
 *
 * A native line (NRPRODCOMVEN) is not the product code. Two identical SKUs
 * are distinct work targets. This module reuses validarEvento and projetarLeitura
 * and NEVER labels a physical item ready, nor grants source authority.
 * No I/O, customer fields, watcher, SQL or new engine.
 */
import { createHash } from "node:crypto";
import { validarEvento, type EnvelopeOperacional, type PayloadTrabalhoPraca } from "./catalogo-operacional";
import { projetarLeitura, type LeituraProjetada } from "./projetar-leitura";
import type { PracaId } from "../viewmodels/areas";

export const VINCULO_READER_TRABALHO_V1 = "reader-work-line-binding@1-review-only" as const;
type Linha = Readonly<{ line_no: string; product_code: string; quantity: number; route_code: string | null }>;
export interface RevisaoNativaParaTrabalho {
  readonly source_mode: "real" | "control" | "simulated";
  readonly identity: Readonly<{
    unit_id: string; store_id: string; nr_venda_rest: string; nr_comanda: string;
    origin: string; opened_at: string; snapshot_hash: string;
  }>;
  readonly items: readonly Linha[];
}
export interface VinculoLinhaReview {
  readonly line_ref: string;
  readonly product_code: string;
  readonly quantity: number;
  readonly event_ids: readonly string[];
  readonly pracas_declaradas: readonly PracaId[];
  readonly conclusao_fisica_comprovada: false;
}
export interface RevisaoVinculoReaderTrabalho {
  readonly schema: typeof VINCULO_READER_TRABALHO_V1;
  readonly state: "HOLD" | "NO_PHYSICAL_EVENTS" | "REVIEW_CANDIDATE_ONLY";
  readonly reasons: readonly string[];
  readonly opaque_order_ref: string | null;
  readonly lines: readonly VinculoLinhaReview[];
  readonly projection: LeituraProjetada | null;
  readonly reader_transaction_attested: false;
  readonly physical_event_attested: false;
  readonly ready_for_dispatch: null;
  readonly live_home_authorized: false;
  readonly no_action_executed: true;
}
const hash = (parts: readonly string[]): string =>
  createHash("sha256").update(JSON.stringify(parts)).digest("hex");
// Stable, review-only references. The classifier must re-bind exact native
// order + revision + line, not just an SKU and a quantity (both may repeat).
export function referenciaOpacaPedidoReader(
  id: RevisaoNativaParaTrabalho["identity"],
): string {
  return "reader-order:" + hash([id.unit_id, id.store_id,
    id.nr_venda_rest, id.nr_comanda]);
}
export function referenciaOpacaLinhaReader(
  id: RevisaoNativaParaTrabalho["identity"],
  item: Readonly<{line_no: string; product_code: string; quantity: number}>,
): string {
  return "reader-line:" + hash([id.unit_id, id.store_id, id.nr_venda_rest,
    id.nr_comanda, id.snapshot_hash, item.line_no, item.product_code,
    String(item.quantity)]);
}
const safe = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= 128 && v.trim() === v;
function hold(reason: string): RevisaoVinculoReaderTrabalho {
  return { schema: VINCULO_READER_TRABALHO_V1, state: "HOLD", reasons: [reason],
    opaque_order_ref: null, lines: [], projection: null,
    reader_transaction_attested: false, physical_event_attested: false,
    ready_for_dispatch: null, live_home_authorized: false, no_action_executed: true };
}
export function vincularReaderTrabalhoPraca(
  input: Readonly<{
    revision: RevisaoNativaParaTrabalho;
    tenant: string;
    unit: "ITAIM";
    now: string;
    workEvents: readonly unknown[];
  }>,
): RevisaoVinculoReaderTrabalho {
  if (!input || !safe(input.tenant) || input.unit !== "ITAIM" ||
    !Number.isFinite(Date.parse(input.now)) || !Array.isArray(input.workEvents) ||
    input.workEvents.length > 3000) return hold("REVIEW_SCOPE_INVALID");
  const r = input.revision, id = r?.identity;
  if (!r || !id || !["real", "control", "simulated"].includes(r.source_mode) ||
    id.unit_id !== "0001" || id.store_id !== "01" || id.origin !== "DLV_IFO" ||
    ![id.nr_venda_rest, id.nr_comanda, id.opened_at].every(safe) ||
    !/^([0-9a-f]{64})$/.test(id.snapshot_hash) || !Number.isFinite(Date.parse(id.opened_at)))
    return hold("NATIVE_READER_REVISION_IDENTITY_UNQUALIFIED");
  if (!Array.isArray(r.items) || !r.items.length || r.items.length > 200)
    return hold("NATIVE_LINES_MISSING");
  const order = referenciaOpacaPedidoReader(id);
  const byRef = new Map<string, { line: Linha; events: EnvelopeOperacional[]; stations: Set<PracaId> }>();
  const used = new Set<string>();
  for (const item of r.items) {
    if (!item || !safe(item.line_no) || !safe(item.product_code) ||
      used.has(item.line_no) || !Number.isFinite(item.quantity) || item.quantity <= 0 ||
      (item.route_code !== null && !safe(item.route_code)))
      return hold("NATIVE_LINE_IDENTITY_DUPLICATE_OR_INVALID");
    used.add(item.line_no);
    // Bind to the exact native revision and product: a changed SKU or note
    // never inherits an earlier workstation completion.
    const ref = referenciaOpacaLinhaReader(id, item);
    byRef.set(ref, { line: item, events: [], stations: new Set() });
  }
  const approved: EnvelopeOperacional[] = [];
  const reasons: string[] = [];
  for (const raw of input.workEvents) {
    const valid = validarEvento(raw);
    if (!valid.ok) { reasons.push("WORK_EVENT_SCHEMA_INVALID"); continue; }
    const e = valid.evento;
    if (e.event_type !== "trabalho_praca_observado" ||
      e.source !== "registro-operacao" || e.tenant_id !== input.tenant ||
      e.unit_id !== input.unit || (e.payload as PayloadTrabalhoPraca).pedido_id !== order) {
      reasons.push("WORK_EVENT_SOURCE_OR_ORDER_SCOPE_INVALID"); continue;
    }
    const p = e.payload as PayloadTrabalhoPraca;
    const target = byRef.get(p.referencia);
    if (!target || p.quantidade === null || p.quantidade !== target.line.quantity ||
      p.praca_id === null ||
      p.trabalho_id !== `w:${input.unit}:${p.praca_id}:${order}:${p.referencia}`) {
      reasons.push("WORK_EVENT_LINE_OR_QUANTITY_BINDING_INVALID"); continue;
    }
    target.events.push(e);
    target.stations.add(p.praca_id);
    // R5-D3 infers data nature from the source prefix. Until the
    // actual producer's authority is attested, its projection is ALWAYS
    // explicitly demonstration, even for a self-declared real Reader revision.
    approved.push({ ...e, source: "fixture:" + e.source });
  }
  const projection = projetarLeitura(approved, {
    tenant_id: input.tenant, unit_id: input.unit, agora_iso: input.now,
  });
  if (projection.conflitos.length || projection.lacunas.length ||
      [...byRef.values()].some(x => x.stations.size > 1))
    reasons.push("WORK_PROJECTION_CONFLICT_OR_AMBIGUITY");
  const lines: VinculoLinhaReview[] = [...byRef.entries()].map(([ref, x]) => ({
    line_ref: ref, product_code: x.line.product_code, quantity: x.line.quantity,
    event_ids: x.events.map(e => e.event_id),
    pracas_declaradas: [...x.stations].sort(),
    conclusao_fisica_comprovada: false,
  }));
  return {
    schema: VINCULO_READER_TRABALHO_V1,
    state: reasons.length ? "HOLD" :
      approved.length ? "REVIEW_CANDIDATE_ONLY" : "NO_PHYSICAL_EVENTS",
    reasons,
    opaque_order_ref: order, lines, projection: reasons.length ? null : projection,
    reader_transaction_attested: false, physical_event_attested: false,
    ready_for_dispatch: null, live_home_authorized: false, no_action_executed: true,
  };
}
