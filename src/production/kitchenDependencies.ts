export type KitchenDependencyKind = "HOT" | "EBITEN" | "SHISO";
export type KitchenRuleProof = "HUMAN_CONFIRMED" | "UNKNOWN";

export interface KitchenDependencyRule {
  canonical_item_name: string;
  proof: KitchenRuleProof;
  yields: Partial<Record<KitchenDependencyKind, number>>;
}

export interface KitchenDependencyRuleset {
  schema: "deliveryos.kitchen-dependency-rules.v1";
  coverage: "PARTIAL" | "COMPLETE";
  coverage_proof: "HUMAN_CONFIRMED" | "UNPROVEN";
  rules: KitchenDependencyRule[];
}

export interface KitchenSourceItem {
  nome: string;
  quantidade: number;
}

export interface KitchenNeedContribution {
  item_name: string;
  item_quantity: number;
  rule_name: string;
  hot: number;
  ebiten: number;
  shiso: number;
}

export interface KitchenNeedProjection {
  schema: "deliveryos.kitchen-need-projection.v1";
  ready_for_complete_total: boolean;
  blocking_reasons: string[];
  totals: {
    hot: number;
    ebiten: number;
    shiso: number;
  };
  contributions: KitchenNeedContribution[];
  unmatched_items: string[];
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

function validYield(value: unknown): value is number {
  return Number.isFinite(value) && Number(value) >= 0;
}

function uniqueRuleMap(ruleset: KitchenDependencyRuleset): {
  map: Map<string, KitchenDependencyRule>;
  blocking: Set<string>;
} {
  const map = new Map<string, KitchenDependencyRule>();
  const blocking = new Set<string>();

  for (const rule of ruleset.rules) {
    const key = normalizedName(rule.canonical_item_name);
    if (!key) {
      blocking.add("EMPTY_DEPENDENCY_RULE_NAME");
      continue;
    }
    if (map.has(key)) {
      blocking.add(`DUPLICATE_DEPENDENCY_RULE:${key}`);
      continue;
    }

    for (const kind of ["HOT", "EBITEN", "SHISO"] as const) {
      const value = rule.yields[kind];
      if (value !== undefined && (!validYield(value) || !Number.isInteger(value))) {
        blocking.add(`INVALID_DEPENDENCY_YIELD:${key}:${kind}`);
      }
    }

    if (rule.proof !== "HUMAN_CONFIRMED") {
      blocking.add(`UNPROVEN_DEPENDENCY_RULE:${key}`);
    }

    map.set(key, rule);
  }

  return { map, blocking };
}

/**
 * Pure, explicit-rule dependency compiler.
 *
 * No fuzzy classification is allowed. A menu item contributes HOT/EBITEN/SHISO
 * only when an exact normalized canonical-name rule exists and is human-confirmed.
 *
 * A PARTIAL or unproven-coverage ruleset may calculate known contributions, but
 * must never call the result a complete requested/remaining total. COMPLETE is
 * meaningful only when coverage_proof is HUMAN_CONFIRMED.
 */
export function projectKitchenNeeds(
  items: KitchenSourceItem[],
  ruleset: KitchenDependencyRuleset,
): KitchenNeedProjection {
  const blocking = new Set<string>();
  const { map, blocking: ruleBlocking } = uniqueRuleMap(ruleset);
  for (const reason of ruleBlocking) blocking.add(reason);

  if (ruleset.coverage !== "COMPLETE") {
    blocking.add("DEPENDENCY_RULESET_COVERAGE_NOT_COMPLETE");
  }
  if (ruleset.coverage_proof !== "HUMAN_CONFIRMED") {
    blocking.add("DEPENDENCY_RULESET_COVERAGE_NOT_PROVEN");
  }

  const totals = { hot: 0, ebiten: 0, shiso: 0 };
  const contributions: KitchenNeedContribution[] = [];
  const unmatched = new Set<string>();

  for (const item of items) {
    const itemName = clean(item.nome);
    const itemQty = Number(item.quantidade);

    if (!itemName) {
      blocking.add("EMPTY_KITCHEN_SOURCE_ITEM_NAME");
      continue;
    }
    if (!Number.isFinite(itemQty) || itemQty <= 0) {
      blocking.add(`INVALID_KITCHEN_SOURCE_QTY:${itemName}`);
      continue;
    }

    const rule = map.get(normalizedName(itemName));
    if (!rule) {
      unmatched.add(itemName);
      continue;
    }
    if (rule.proof !== "HUMAN_CONFIRMED") continue;

    const hot = (rule.yields.HOT ?? 0) * itemQty;
    const ebiten = (rule.yields.EBITEN ?? 0) * itemQty;
    const shiso = (rule.yields.SHISO ?? 0) * itemQty;

    totals.hot += hot;
    totals.ebiten += ebiten;
    totals.shiso += shiso;
    contributions.push({
      item_name: itemName,
      item_quantity: itemQty,
      rule_name: rule.canonical_item_name,
      hot,
      ebiten,
      shiso,
    });
  }

  return {
    schema: "deliveryos.kitchen-need-projection.v1",
    ready_for_complete_total: blocking.size === 0,
    blocking_reasons: [...blocking].sort(),
    totals,
    contributions,
    unmatched_items: [...unmatched].sort(),
    effects: {
      print: false,
      persistence_write: false,
      odhen_write: false,
    },
  };
}

export interface KitchenOrderNeedSnapshot {
  teknisa_order_id: string;
  projection: KitchenNeedProjection;
}

export interface KitchenAggregate {
  schema: "deliveryos.kitchen-aggregate.v1";
  ready_for_complete_total: boolean;
  blocking_reasons: string[];
  totals: {
    hot: number;
    ebiten: number;
    shiso: number;
  };
  unique_orders: number;
}

/**
 * Aggregates latest per-order snapshots. Duplicate order IDs are blocking,
 * because blindly summing them could double-count a replay/reprint.
 */
export function aggregateKitchenNeeds(
  snapshots: KitchenOrderNeedSnapshot[],
): KitchenAggregate {
  const blocking = new Set<string>();
  const seen = new Set<string>();
  const totals = { hot: 0, ebiten: 0, shiso: 0 };

  for (const snapshot of snapshots) {
    const id = clean(snapshot.teknisa_order_id);
    if (!id) {
      blocking.add("MISSING_KITCHEN_AGGREGATE_ORDER_ID");
      continue;
    }
    if (seen.has(id)) {
      blocking.add(`DUPLICATE_KITCHEN_AGGREGATE_ORDER:${id}`);
      continue;
    }
    seen.add(id);

    if (!snapshot.projection.ready_for_complete_total) {
      blocking.add(`ORDER_DEPENDENCY_TOTAL_NOT_PROVEN:${id}`);
    }

    totals.hot += snapshot.projection.totals.hot;
    totals.ebiten += snapshot.projection.totals.ebiten;
    totals.shiso += snapshot.projection.totals.shiso;
  }

  return {
    schema: "deliveryos.kitchen-aggregate.v1",
    ready_for_complete_total: blocking.size === 0,
    blocking_reasons: [...blocking].sort(),
    totals,
    unique_orders: seen.size,
  };
}
