import type { RoutingItemInput, RoutingOrderInput } from "./expectedRouting";

export const ODHEN_ROUTING_EFFECT_BOUNDARY = Object.freeze({
  print: false,
  database_write: false,
  odhen_change: false,
  fiscal_action: false,
  service_install: false,
  watcher_install: false,
  cutover: false,
});

export interface OdhenRoutingProductRaw {
  CDPRODUTO?: unknown;
  NMPRODUTO?: unknown;
  QTPRODCOMVEN?: unknown;
  [key: string]: unknown;
}

export interface OdhenRoutingRaw {
  NRCOMANDA?: unknown;
  products?: unknown;
  [key: string]: unknown;
}

export interface OdhenRoutingSnapshot extends RoutingOrderInput {
  contract: "deliveryos.shadow.odhen-routing.v1";
  source: "odhen_teknisa";
  ready_for_routing: boolean;
  blocking_reasons: string[];
  privacy: {
    raw_payload_retained: false;
    pii_fields_copied: false;
    policy: "MINIMUM_ROUTING_FIELDS_ONLY";
  };
  effects: typeof ODHEN_ROUTING_EFFECT_BOUNDARY;
}

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function positiveQuantity(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Minimal read-only normalization for expected printer routing.
 *
 * This contract intentionally does NOT require customer/order observations.
 * Routing only needs NRCOMANDA + CDPRODUTO/NMPRODUTO/QTPRODCOMVEN.
 */
export function normalizeOdhenRouting(raw: OdhenRoutingRaw): OdhenRoutingSnapshot {
  const blocking = new Set<string>();
  const pedidoInterno = textOrNull(raw.NRCOMANDA);

  if (!pedidoInterno) blocking.add("MISSING_NRCOMANDA");

  const productsRaw = Array.isArray(raw.products) ? raw.products : [];
  if (!Array.isArray(raw.products)) blocking.add("PRODUCTS_NOT_PROVEN_ARRAY");
  if (productsRaw.length === 0) blocking.add("NO_PRODUCTS");

  const items: RoutingItemInput[] = [];

  productsRaw.forEach((value, itemIndex) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      blocking.add(`INVALID_PRODUCT_ROW_${itemIndex}`);
      return;
    }

    const row = value as OdhenRoutingProductRaw;
    const codigo = textOrNull(row.CDPRODUTO);
    const nome = textOrNull(row.NMPRODUTO);
    const quantidade = positiveQuantity(row.QTPRODCOMVEN);

    if (!codigo) blocking.add(`MISSING_PRODUCT_CODE_${itemIndex}`);
    if (!nome) blocking.add(`MISSING_ITEM_NAME_${itemIndex}`);
    if (quantidade === null) blocking.add(`INVALID_ITEM_QTY_${itemIndex}`);

    if (!codigo || !nome || quantidade === null) return;

    items.push({
      item_index: itemIndex,
      codigo,
      nome,
      quantidade,
    });
  });

  return {
    contract: "deliveryos.shadow.odhen-routing.v1",
    source: "odhen_teknisa",
    ids: { pedido_interno: pedidoInterno },
    items,
    ready_for_routing: blocking.size === 0,
    blocking_reasons: [...blocking].sort(),
    privacy: {
      raw_payload_retained: false,
      pii_fields_copied: false,
      policy: "MINIMUM_ROUTING_FIELDS_ONLY",
    },
    effects: ODHEN_ROUTING_EFFECT_BOUNDARY,
  };
}
