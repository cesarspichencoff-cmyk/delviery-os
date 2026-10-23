import { createHash } from "node:crypto";

/**
 * Shadow Odhen/Teknisa V1.3.2.
 *
 * PURE CODE ONLY:
 * - no network;
 * - no database connection;
 * - no print;
 * - no filesystem write;
 * - no fiscal action;
 * - no order/status mutation.
 *
 * A future live reader may feed snapshots into this module only after the
 * read-only source contract is revalidated on the store PC.
 */

export const CANONICAL_V132_SHA256 =
  "D34583F0A743DF9645914BCDFC1010E6D3AEF72AC74D3A4B7B01F81E305B71E4";

export const SHADOW_EFFECT_BOUNDARY = Object.freeze({
  live_reader_implemented: false,
  print: false,
  call_print_endpoint: false,
  database_write: false,
  order_update: false,
  status_update: false,
  fiscal_action: false,
  service_install: false,
  watcher_install: false,
  cutover: false,
});

export type ObservationScopeHint = "item" | "order" | "unknown";

export interface OdhenProductRaw {
  CDPRODUTO?: unknown;
  NMPRODUTO?: unknown;
  QTPRODCOMVEN?: unknown;
  [key: string]: unknown;
}

export interface OdhenObservationRowRaw {
  source_field?: unknown;
  value?: unknown;
  item_index?: unknown;
  CDPRODUTO?: unknown;
  scope_hint?: ObservationScopeHint | unknown;
  join_proven?: unknown;
  [key: string]: unknown;
}

export interface OdhenOrderRaw {
  NRCOMANDA?: unknown;
  NRCOMANDAEXT?: unknown;
  NRVENDAREST?: unknown;
  emissao?: unknown;
  products?: unknown;
  observation_scan_complete?: unknown;
  observation_rows?: unknown;

  // Unknown extra fields are deliberately accepted but never copied wholesale.
  // This keeps PII/payment/address out of shadow output by construction.
  [key: string]: unknown;
}

export interface ShadowObservation {
  source_field: string;
  value: string;
}

export interface ShadowItem {
  item_index: number;
  codigo: string | null;
  nome: string;
  quantidade: number;
  observacoes: ShadowObservation[];
}

export interface UnassignedObservation {
  source_field: string;
  value: string;
  reason:
    | "scope_not_proven"
    | "join_not_proven"
    | "join_target_missing"
    | "join_target_ambiguous";
}

export interface ShadowNormalizedOrder {
  contract: "deliveryos.shadow.odhen.v132";
  source: "odhen_teknisa";
  canonical_sha256: string;
  ids: {
    pedido_interno: string | null;
    pedido_externo: string | null;
    venda: string | null;
  };
  emissao: string | null;
  items: ShadowItem[];
  order_observations: ShadowObservation[];
  unassigned_observations: UnassignedObservation[];
  observation_state:
    | "SOURCE_NOT_CHECKED"
    | "PROVEN_NONE"
    | "PROVEN_ASSIGNED"
    | "UNKNOWN_UNASSIGNED_CANDIDATES";
  ready_for_motor: boolean;
  blocking_reasons: string[];
  dedupe_key: string;
  privacy: {
    raw_payload_retained: false;
    pii_fields_copied: false;
    policy: "MINIMUM_OPERATIONAL_FIELDS_ONLY";
  };
  effects: typeof SHADOW_EFFECT_BOUNDARY;
}

export interface MotorRow {
  pedido_id: string;
  item_nome: string;
  quantidade: number;
  observacao: string | null;
  horario: string | null;
}

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function positiveQuantity(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function normalizedObservationRow(value: unknown): OdhenObservationRowRaw | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as OdhenObservationRowRaw;
}

function hashStable(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function findJoinTargets(
  row: OdhenObservationRowRaw,
  items: ShadowItem[],
): { indexes: number[]; reasonWhenEmpty: UnassignedObservation["reason"] } {
  const indexRaw = row.item_index;
  if (typeof indexRaw === "number" && Number.isInteger(indexRaw)) {
    const exists = items.some((x) => x.item_index === indexRaw);
    return { indexes: exists ? [indexRaw] : [], reasonWhenEmpty: "join_target_missing" };
  }

  const codigo = textOrNull(row.CDPRODUTO);
  if (codigo) {
    const indexes = items.filter((x) => x.codigo === codigo).map((x) => x.item_index);
    return {
      indexes,
      reasonWhenEmpty: indexes.length > 1 ? "join_target_ambiguous" : "join_target_missing",
    };
  }

  return { indexes: [], reasonWhenEmpty: "join_target_missing" };
}

/**
 * Normalize one externally-read snapshot into the minimal shadow contract.
 *
 * Observation rule:
 * - source scan not explicitly proven complete => motor BLOCKED;
 * - any non-empty candidate without proven scope/join => motor BLOCKED;
 * - nothing is silently discarded.
 */
export function normalizeOdhenShadow(raw: OdhenOrderRaw): ShadowNormalizedOrder {
  const blocking = new Set<string>();
  const pedidoInterno = textOrNull(raw.NRCOMANDA);
  const pedidoExterno = textOrNull(raw.NRCOMANDAEXT);
  const venda = textOrNull(raw.NRVENDAREST);
  const emissao = textOrNull(raw.emissao);

  if (!pedidoInterno) blocking.add("MISSING_NRCOMANDA");

  const productsRaw = Array.isArray(raw.products) ? raw.products : [];
  if (!Array.isArray(raw.products)) blocking.add("PRODUCTS_NOT_PROVEN_ARRAY");
  if (!productsRaw.length) blocking.add("NO_PRODUCTS");

  const items: ShadowItem[] = [];
  productsRaw.forEach((value, itemIndex) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      blocking.add(`INVALID_PRODUCT_ROW_${itemIndex}`);
      return;
    }
    const row = value as OdhenProductRaw;
    const nome = textOrNull(row.NMPRODUTO);
    const quantidade = positiveQuantity(row.QTPRODCOMVEN);
    if (!nome) {
      blocking.add(`MISSING_ITEM_NAME_${itemIndex}`);
      return;
    }
    if (quantidade === null) {
      blocking.add(`INVALID_ITEM_QTY_${itemIndex}`);
      return;
    }
    items.push({
      item_index: itemIndex,
      codigo: textOrNull(row.CDPRODUTO),
      nome,
      quantidade,
      observacoes: [],
    });
  });

  const scanComplete = raw.observation_scan_complete === true;
  const observationRowsRaw = Array.isArray(raw.observation_rows) ? raw.observation_rows : [];
  if (!scanComplete) blocking.add("OBSERVATION_SOURCE_NOT_PROVEN_COMPLETE");

  const orderObservations: ShadowObservation[] = [];
  const unassigned: UnassignedObservation[] = [];

  for (const candidate of observationRowsRaw) {
    const row = normalizedObservationRow(candidate);
    if (!row) continue;
    const sourceField = textOrNull(row.source_field) ?? "UNKNOWN_FIELD";
    const value = textOrNull(row.value);
    if (!value) continue;

    const scope = row.scope_hint === "item" || row.scope_hint === "order"
      ? row.scope_hint
      : "unknown";
    const joinProven = row.join_proven === true;

    if (scope === "order" && joinProven) {
      orderObservations.push({ source_field: sourceField, value });
      continue;
    }

    if (scope !== "item") {
      unassigned.push({ source_field: sourceField, value, reason: "scope_not_proven" });
      continue;
    }
    if (!joinProven) {
      unassigned.push({ source_field: sourceField, value, reason: "join_not_proven" });
      continue;
    }

    const target = findJoinTargets(row, items);
    if (target.indexes.length !== 1) {
      unassigned.push({
        source_field: sourceField,
        value,
        reason: target.indexes.length > 1 ? "join_target_ambiguous" : target.reasonWhenEmpty,
      });
      continue;
    }

    const item = items.find((x) => x.item_index === target.indexes[0]);
    if (!item) {
      unassigned.push({ source_field: sourceField, value, reason: "join_target_missing" });
      continue;
    }
    item.observacoes.push({ source_field: sourceField, value });
  }

  if (unassigned.length) blocking.add("OBSERVATION_CANDIDATE_UNASSIGNED");

  const observationState: ShadowNormalizedOrder["observation_state"] =
    !scanComplete
      ? "SOURCE_NOT_CHECKED"
      : unassigned.length
        ? "UNKNOWN_UNASSIGNED_CANDIDATES"
        : (orderObservations.length || items.some((x) => x.observacoes.length))
          ? "PROVEN_ASSIGNED"
          : "PROVEN_NONE";

  const fingerprintBasis = {
    ids: {
      pedido_interno: pedidoInterno,
      pedido_externo: pedidoExterno,
      venda,
    },
    emissao,
    items: items.map((x) => ({
      item_index: x.item_index,
      codigo: x.codigo,
      nome: x.nome,
      quantidade: x.quantidade,
      observacoes: x.observacoes,
    })),
    order_observations: orderObservations,
    unassigned_observations: unassigned,
    observation_state: observationState,
  };

  return {
    contract: "deliveryos.shadow.odhen.v132",
    source: "odhen_teknisa",
    canonical_sha256: CANONICAL_V132_SHA256,
    ids: {
      pedido_interno: pedidoInterno,
      pedido_externo: pedidoExterno,
      venda,
    },
    emissao,
    items,
    order_observations: orderObservations,
    unassigned_observations: unassigned,
    observation_state: observationState,
    ready_for_motor: blocking.size === 0,
    blocking_reasons: [...blocking].sort(),
    dedupe_key: hashStable(fingerprintBasis),
    privacy: {
      raw_payload_retained: false,
      pii_fields_copied: false,
      policy: "MINIMUM_OPERATIONAL_FIELDS_ONLY",
    },
    effects: SHADOW_EFFECT_BOUNDARY,
  };
}

export function toMotorRows(order: ShadowNormalizedOrder): MotorRow[] {
  if (!order.ready_for_motor) {
    throw new Error(`SHADOW_NOT_READY_FOR_MOTOR:${order.blocking_reasons.join(",")}`);
  }
  const pedidoId = order.ids.pedido_interno;
  if (!pedidoId) throw new Error("SHADOW_NOT_READY_FOR_MOTOR:MISSING_NRCOMANDA");

  return order.items.map((item) => ({
    pedido_id: pedidoId,
    item_nome: item.nome,
    quantidade: item.quantidade,
    observacao: item.observacoes.length
      ? item.observacoes.map((o) => o.value).join(" | ")
      : null,
    horario: order.emissao,
  }));
}

export function sameShadowSnapshot(a: ShadowNormalizedOrder, b: ShadowNormalizedOrder): boolean {
  return a.dedupe_key === b.dedupe_key;
}
