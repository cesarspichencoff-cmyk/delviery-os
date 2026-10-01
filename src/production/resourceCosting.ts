import type {
  ResourceAggregate,
  ResourceUom,
  ResourceUsage,
} from "./resourceConsumption";

export interface ResourceCostEntry {
  resource_key: string;
  label: string;
  effective_from: string;
  effective_to: string | null;
  unit_cost: number;
  currency: "BRL";
  uom: ResourceUom;
  source_ref: string;
  proof: "PURCHASE_COST_PROVEN" | "INVENTORY_COST_PROVEN" | "MANUAL_COST_CONFIRMED";
}

export interface ResourceCostRegistry {
  schema: "deliveryos.resource-cost-registry.v1";
  store: string;
  entries: ResourceCostEntry[];
}

export interface CostedResourceUsage {
  resource_key: string;
  label: string;
  kind: ResourceUsage["kind"];
  quantity: number;
  uom: ResourceUom;
  unit_cost: number;
  currency: "BRL";
  total_cost: number;
  cost_proof: ResourceCostEntry["proof"];
  source_ref: string;
}

export interface ResourceCostProjection {
  schema: "deliveryos.resource-cost-projection.v1";
  as_of_date: string;
  costed: CostedResourceUsage[];
  uncosted: ResourceUsage[];
  totals: {
    packaging_and_kit_brl: number;
    recipe_ingredient_brl: number;
    complements_brl: number;
    total_theoretical_brl: number;
  };
  ready_for_packaging_and_kit_cost: boolean;
  ready_for_full_theoretical_cmv: boolean;
  blocking_reasons: string[];
  semantics: {
    theoretical_cost_is_not_accounting_cmv: true;
    cost_projection_does_not_write_stock: true;
    no_implicit_uom_conversion: true;
  };
  effects: {
    stock_write: false;
    cmv_write: false;
  };
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function dateActive(entry: ResourceCostEntry, asOfDate: string): boolean {
  return (
    entry.effective_from <= asOfDate &&
    (entry.effective_to === null || entry.effective_to >= asOfDate)
  );
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000000) / 1000000;
}

function costableOperationalUsage(usage: ResourceUsage): boolean {
  return (
    usage.stock_semantics === "THEORETICAL_EXPECTED_CONSUMPTION" &&
    [
      "PACKAGING_BOX",
      "BAG",
      "KIT_COMPONENT",
      "COMPLEMENT",
      "RECIPE_INGREDIENT",
      "DIRECT_STOCK_ITEM",
    ].includes(usage.kind)
  );
}

export function costResourceAggregate(
  aggregate: ResourceAggregate,
  registry: ResourceCostRegistry,
  asOfDate: string,
): ResourceCostProjection {
  const blocking = new Set<string>();
  const costed: CostedResourceUsage[] = [];
  const uncosted: ResourceUsage[] = [];

  if (registry.schema !== "deliveryos.resource-cost-registry.v1") {
    blocking.add("COST_REGISTRY_SCHEMA_MISMATCH");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    blocking.add("AS_OF_DATE_INVALID");
  }

  const activeByKey = new Map<string, ResourceCostEntry[]>();
  for (const entry of registry.entries) {
    if (
      !clean(entry.resource_key) ||
      !Number.isFinite(entry.unit_cost) ||
      entry.unit_cost < 0 ||
      !clean(entry.source_ref)
    ) {
      blocking.add("INVALID_COST_ENTRY");
      continue;
    }
    if (!dateActive(entry, asOfDate)) continue;
    const list = activeByKey.get(entry.resource_key) ?? [];
    list.push(entry);
    activeByKey.set(entry.resource_key, list);
  }

  for (const [key, entries] of activeByKey) {
    if (entries.length > 1) {
      blocking.add(`AMBIGUOUS_ACTIVE_COST:${key}`);
    }
  }

  for (const usage of aggregate.usages) {
    if (!costableOperationalUsage(usage)) continue;

    const candidates = activeByKey.get(usage.resource_key) ?? [];
    if (candidates.length !== 1) {
      uncosted.push({ ...usage });
      continue;
    }

    const cost = candidates[0];
    if (cost.uom !== usage.uom) {
      blocking.add(`COST_UOM_MISMATCH:${usage.resource_key}:${usage.uom}:${cost.uom}`);
      uncosted.push({ ...usage });
      continue;
    }

    costed.push({
      resource_key: usage.resource_key,
      label: usage.label,
      kind: usage.kind,
      quantity: usage.quantity,
      uom: usage.uom,
      unit_cost: cost.unit_cost,
      currency: cost.currency,
      total_cost: roundCurrency(usage.quantity * cost.unit_cost),
      cost_proof: cost.proof,
      source_ref: cost.source_ref,
    });
  }

  const sum = (kinds: ResourceUsage["kind"][]): number =>
    roundCurrency(
      costed
        .filter((item) => kinds.includes(item.kind))
        .reduce((total, item) => total + item.total_cost, 0),
    );

  const packagingAndKitKinds: ResourceUsage["kind"][] = [
    "PACKAGING_BOX",
    "BAG",
    "KIT_COMPONENT",
  ];
  const recipeKinds: ResourceUsage["kind"][] = ["RECIPE_INGREDIENT", "DIRECT_STOCK_ITEM"];
  const complementKinds: ResourceUsage["kind"][] = ["COMPLEMENT"];

  const packagingUncosted = uncosted.filter((item) =>
    packagingAndKitKinds.includes(item.kind),
  );
  const recipeUncosted = uncosted.filter((item) => recipeKinds.includes(item.kind));
  const complementUncosted = uncosted.filter((item) =>
    complementKinds.includes(item.kind),
  );

  const readyPackaging =
    blocking.size === 0 &&
    aggregate.packaging_and_kit_complete_orders === aggregate.order_count &&
    packagingUncosted.length === 0;
  const hasRecipeUsage = aggregate.usages.some(
    (item) => item.kind === "RECIPE_INGREDIENT",
  );
  const readyFull =
    blocking.size === 0 &&
    aggregate.blocked_orders.length === 0 &&
    hasRecipeUsage &&
    recipeUncosted.length === 0 &&
    packagingUncosted.length === 0 &&
    complementUncosted.length === 0 &&
    aggregate.theoretical_cmv_basis_ready_orders === aggregate.order_count;

  const packaging = sum(packagingAndKitKinds);
  const recipe = sum(recipeKinds);
  const complements = sum(complementKinds);

  return {
    schema: "deliveryos.resource-cost-projection.v1",
    as_of_date: asOfDate,
    costed: costed.sort((a, b) =>
      [a.kind, a.resource_key].join("|").localeCompare([b.kind, b.resource_key].join("|")),
    ),
    uncosted: uncosted.sort((a, b) =>
      [a.kind, a.resource_key].join("|").localeCompare([b.kind, b.resource_key].join("|")),
    ),
    totals: {
      packaging_and_kit_brl: packaging,
      recipe_ingredient_brl: recipe,
      complements_brl: complements,
      total_theoretical_brl: roundCurrency(packaging + recipe + complements),
    },
    ready_for_packaging_and_kit_cost: readyPackaging,
    ready_for_full_theoretical_cmv: readyFull,
    blocking_reasons: [...blocking].sort(),
    semantics: {
      theoretical_cost_is_not_accounting_cmv: true,
      cost_projection_does_not_write_stock: true,
      no_implicit_uom_conversion: true,
    },
    effects: {
      stock_write: false,
      cmv_write: false,
    },
  };
}
