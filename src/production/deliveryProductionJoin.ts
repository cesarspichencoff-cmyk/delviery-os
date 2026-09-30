export interface DeliveryJoinItem {
  item_index: number;
  codigo: string | null;
  nome: string;
  quantidade: number;
  observacoes: string[];
}

export interface DeliveryJoinProjection {
  pedido_interno: string | null;
  pedido_externo: string | null;
  items: DeliveryJoinItem[];
  order_observations: string[];
}

export interface ProductionJoinLine {
  nome: string;
  quantidade: number;
  tx_prod_com_ven: string[];
  printer_key: string | null;
}

export interface ProductionJoinProjection {
  join_key_proof: "DLV_NRCOMANDA_PROVEN" | "UNPROVEN";
  pedido_interno_from_dlv: string | null;
  lines: ProductionJoinLine[];
}

export interface JoinedOperationalItem {
  delivery_item_index: number;
  codigo: string | null;
  nome: string;
  quantidade: number;
  delivery_observacoes: string[];
  tx_prod_com_ven: string[];
  printer_keys: string[];
}

export interface DeliveryProductionJoin {
  schema: "deliveryos.delivery-production-join.v1";
  ready: boolean;
  blocking_reasons: string[];
  ids: {
    pedido_interno: string | null;
    pedido_externo: string | null;
  };
  items: JoinedOperationalItem[];
  order_observations: string[];
  effects: {
    print: false;
    persistence_write: false;
    odhen_write: false;
  };
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizedName(value: unknown): string {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizedObservationList(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = clean(value);
    const key = normalizedName(text);
    if (!text || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function uniquePrinterKeys(lines: ProductionJoinLine[]): string[] {
  const keys = new Set<string>();
  for (const line of lines) {
    const key = clean(line.printer_key);
    if (key) keys.add(key);
  }
  return [...keys].sort();
}

function productionSignature(line: ProductionJoinLine): string {
  return `${normalizedName(line.nome)}|${line.quantidade}`;
}

/**
 * Joins already-sanitized delivery and production projections.
 *
 * Safety rules:
 * - the order join is allowed only when the production DLV_<NRCOMANDA> key was
 *   proven by a live/source profile;
 * - item matching is exact after accent/case/punctuation normalization + qty;
 * - ambiguous delivery matches block rather than guessing;
 * - duplicate production copies (produção 2 / puxa) contribute printer targets
 *   but do not duplicate TXPRODCOMVEN text.
 */
export function joinDeliveryAndProduction(
  delivery: DeliveryJoinProjection,
  production: ProductionJoinProjection,
): DeliveryProductionJoin {
  const blocking = new Set<string>();
  const deliveryOrder = clean(delivery.pedido_interno);
  const productionOrder = clean(production.pedido_interno_from_dlv);

  if (!deliveryOrder) blocking.add("DELIVERY_JOIN_MISSING_NRCOMANDA");
  if (production.join_key_proof !== "DLV_NRCOMANDA_PROVEN") {
    blocking.add("PRODUCTION_DLV_JOIN_KEY_NOT_PROVEN");
  }
  if (!productionOrder) blocking.add("PRODUCTION_JOIN_MISSING_NRCOMANDA");
  if (deliveryOrder && productionOrder && deliveryOrder !== productionOrder) {
    blocking.add("DELIVERY_PRODUCTION_NRCOMANDA_MISMATCH");
  }

  const deliveryBySignature = new Map<string, DeliveryJoinItem[]>();
  for (const item of delivery.items) {
    const qty = Number(item.quantidade);
    if (!clean(item.nome)) {
      blocking.add(`DELIVERY_ITEM_MISSING_NAME:${item.item_index}`);
      continue;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      blocking.add(`DELIVERY_ITEM_INVALID_QTY:${item.item_index}`);
      continue;
    }
    const signature = `${normalizedName(item.nome)}|${qty}`;
    const list = deliveryBySignature.get(signature) ?? [];
    list.push(item);
    deliveryBySignature.set(signature, list);
  }

  const productionBySignature = new Map<string, ProductionJoinLine[]>();
  for (const line of production.lines) {
    const qty = Number(line.quantidade);
    if (!clean(line.nome)) {
      blocking.add("PRODUCTION_ITEM_MISSING_NAME");
      continue;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      blocking.add(`PRODUCTION_ITEM_INVALID_QTY:${clean(line.nome)}`);
      continue;
    }
    const signature = productionSignature(line);
    const list = productionBySignature.get(signature) ?? [];
    list.push(line);
    productionBySignature.set(signature, list);
  }

  const joined: JoinedOperationalItem[] = [];

  for (const [signature, deliveryMatches] of deliveryBySignature) {
    const productionMatches = productionBySignature.get(signature) ?? [];

    if (deliveryMatches.length !== 1) {
      blocking.add(`AMBIGUOUS_DELIVERY_ITEM_SIGNATURE:${signature}`);
      continue;
    }
    if (productionMatches.length === 0) {
      blocking.add(`PRODUCTION_ITEM_NOT_FOUND:${signature}`);
      continue;
    }

    const deliveryItem = deliveryMatches[0];
    const txObs = normalizedObservationList(
      productionMatches.flatMap((line) => line.tx_prod_com_ven),
    );

    joined.push({
      delivery_item_index: deliveryItem.item_index,
      codigo: deliveryItem.codigo,
      nome: deliveryItem.nome,
      quantidade: deliveryItem.quantidade,
      delivery_observacoes: normalizedObservationList(deliveryItem.observacoes),
      tx_prod_com_ven: txObs,
      printer_keys: uniquePrinterKeys(productionMatches),
    });
  }

  for (const signature of productionBySignature.keys()) {
    if (!deliveryBySignature.has(signature)) {
      blocking.add(`DELIVERY_ITEM_NOT_FOUND:${signature}`);
    }
  }

  return {
    schema: "deliveryos.delivery-production-join.v1",
    ready: blocking.size === 0,
    blocking_reasons: [...blocking].sort(),
    ids: {
      pedido_interno: deliveryOrder || null,
      pedido_externo: clean(delivery.pedido_externo) || null,
    },
    items: joined.sort((a, b) => a.delivery_item_index - b.delivery_item_index),
    order_observations: normalizedObservationList(delivery.order_observations),
    effects: {
      print: false,
      persistence_write: false,
      odhen_write: false,
    },
  };
}
