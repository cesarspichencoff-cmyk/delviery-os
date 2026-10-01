export type ResourceUom = "EA" | "GRM" | "KGM" | "MLT" | "LTR";

export type ResourceUsageKind =
  | "MENU_ITEM"
  | "PACKAGING_BOX"
  | "BAG"
  | "KIT"
  | "KIT_COMPONENT"
  | "COMPLEMENT"
  | "KITCHEN_DEPENDENCY"
  | "RECIPE_INGREDIENT"
  | "DIRECT_STOCK_ITEM";

export type ResourceUsageProof =
  | "ORDER_SOURCE_PROVEN"
  | "PACKAGING_RULE_FACT"
  | "KIT_RULE_FACT"
  | "HUMAN_CONFIRMED"
  | "RECIPE_BOM"
  | "DIRECT_STOCK_MAPPING"
  | "INFERENCE"
  | "UNKNOWN";

export interface ResourceUsage {
  resource_key: string;
  label: string;
  kind: ResourceUsageKind;
  quantity: number;
  uom: ResourceUom;
  proof: ResourceUsageProof;
  stock_semantics: "THEORETICAL_EXPECTED_CONSUMPTION" | "REFERENCE_ONLY";
  source_item_code?: string | null;
  source_item_name?: string | null;
}

export interface KitComponentRegistry {
  schema: "deliveryos.kit-component-registry.v1";
  kits: Record<
    string,
    {
      proof: "HUMAN_CONFIRMED";
      components: Array<{
        resource_key: string;
        label: string;
        quantity: number;
        uom: ResourceUom;
      }>;
    }
  >;
}

export interface PackagingGroupInput {
  box: string | null;
  boxes: number | null;
  status: string;
  products?: Array<{ name: string; quantity: number }>;
}

export interface BagGroupInput {
  group: string;
  size: "P" | "M" | "G" | null;
  status: string;
  separate_required?: boolean;
  why?: string;
}

export interface PackagingPlanInput {
  groups: PackagingGroupInput[];
  bags: {
    minimum: number;
    status: string;
    exact_bag_count: number | null;
    exact_bag_count_status: string;
    group_sizes: BagGroupInput[];
  };
  has_unknown: boolean;
}

export interface KitPlanInput {
  status: string;
  kits: Array<{ kit: string; quantidade: number }>;
}

export interface RecipeIngredientInput {
  resource_key: string;
  label: string;
  quantity: number;
  uom: ResourceUom;
  proof: "RECIPE_BOM";
  source_item_code: string;
  source_item_name: string;
}

export interface OrderResourceProjectionInput {
  order_id: string;
  sold_items: Array<{
    product_code: string | null;
    product_name: string;
    quantity: number;
    cmv_basis?: "RECIPE_BOM" | "DIRECT_STOCK_ITEM" | "NON_STOCK" | "UNKNOWN";
  }>;
  complements?: Array<{
    product_code: string | null;
    product_name: string;
    quantity: number;
    proof: "HUMAN_CONFIRMED";
  }>;
  packaging?: PackagingPlanInput | null;
  kits?: KitPlanInput | null;
  kit_registry?: KitComponentRegistry | null;
  kitchen_dependencies?: Array<{
    resource_key: "HOT" | "EBITEN" | "SHISO";
    label: string;
    quantity: number;
    proof: "HUMAN_CONFIRMED";
  }>;
  recipe_ingredients?: RecipeIngredientInput[];
  recipe_bom_coverage?: Array<{
    product_code: string;
    bom_version: number;
    complete: true;
  }>;
  direct_stock_items?: Array<{
    source_product_code: string;
    source_product_name: string;
    resource_key: string;
    label: string;
    quantity: number;
    uom: ResourceUom;
    proof: "DIRECT_STOCK_MAPPING";
  }>;
}

export interface OrderResourceProjection {
  schema: "deliveryos.order-resource-projection.v1";
  order_id: string;
  ready_for_operational_resource_report: boolean;
  complete_for_packaging_and_kit_usage: boolean;
  ready_for_recipe_cmv: boolean;
  ready_for_theoretical_cmv_basis: boolean;
  blocking_reasons: string[];
  usages: ResourceUsage[];
  unknowns: string[];
  semantics: {
    sold_is_not_actual_consumed: true;
    theoretical_is_not_stock_write: true;
    cmv_requires_recipe_bom_and_cost_basis: true;
  };
  effects: {
    stock_write: false;
    cmv_write: false;
    print: false;
    odhen_write: false;
  };
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function positiveNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function addUsage(
  map: Map<string, ResourceUsage>,
  usage: ResourceUsage,
): void {
  const key = [
    usage.kind,
    usage.resource_key,
    usage.uom,
    usage.proof,
    usage.stock_semantics,
    usage.source_item_code ?? "",
  ].join("|");
  const prior = map.get(key);
  if (!prior) {
    map.set(key, { ...usage });
    return;
  }
  prior.quantity += usage.quantity;
}

/**
 * Projects expected operational resource usage from one order.
 *
 * This is NOT an inventory decrement. Recipe ingredients are accepted only when
 * backed by an explicit RECIPE_BOM. Menu descriptions are not a BOM.
 */
export function projectOrderResources(
  input: OrderResourceProjectionInput,
): OrderResourceProjection {
  const blocking = new Set<string>();
  const unknowns = new Set<string>();
  const usages = new Map<string, ResourceUsage>();
  const orderId = clean(input.order_id);
  const cmvBasisByProduct = new Map<string, "RECIPE_BOM" | "DIRECT_STOCK_ITEM" | "NON_STOCK" | "UNKNOWN">();

  if (!orderId) blocking.add("ORDER_ID_REQUIRED");
  if (!Array.isArray(input.sold_items) || input.sold_items.length === 0) {
    blocking.add("SOLD_ITEMS_REQUIRED");
  }

  for (const item of input.sold_items ?? []) {
    const quantity = positiveNumber(item.quantity);
    if (!clean(item.product_name) || quantity === null) {
      blocking.add("INVALID_SOLD_ITEM");
      continue;
    }
    const productCode = clean(item.product_code);
    if (productCode) {
      const basis = item.cmv_basis ?? "UNKNOWN";
      const priorBasis = cmvBasisByProduct.get(productCode);
      if (priorBasis && priorBasis !== basis) {
        blocking.add(`CMV_BASIS_CONFLICT:${productCode}`);
      } else {
        cmvBasisByProduct.set(productCode, basis);
      }
    }

    addUsage(usages, {
      resource_key: item.product_code
        ? `MENU:${item.product_code}`
        : `MENU_NAME:${clean(item.product_name).toLocaleUpperCase("pt-BR")}`,
      label: item.product_name,
      kind: "MENU_ITEM",
      quantity,
      uom: "EA",
      proof: "ORDER_SOURCE_PROVEN",
      stock_semantics: "REFERENCE_ONLY",
      source_item_code: item.product_code,
      source_item_name: item.product_name,
    });
  }

  for (const item of input.complements ?? []) {
    const quantity = positiveNumber(item.quantity);
    if (!clean(item.product_name) || quantity === null) {
      blocking.add("INVALID_COMPLEMENT_ITEM");
      continue;
    }
    addUsage(usages, {
      resource_key: item.product_code
        ? `COMPLEMENT:${item.product_code}`
        : `COMPLEMENT_NAME:${clean(item.product_name).toLocaleUpperCase("pt-BR")}`,
      label: item.product_name,
      kind: "COMPLEMENT",
      quantity,
      uom: "EA",
      proof: item.proof,
      stock_semantics: "THEORETICAL_EXPECTED_CONSUMPTION",
      source_item_code: item.product_code,
      source_item_name: item.product_name,
    });
  }

  if (input.packaging) {
    for (const [index, group] of input.packaging.groups.entries()) {
      if (!group.box || group.boxes === null) {
        unknowns.add(`PACKAGING_BOX_UNKNOWN_GROUP_${index}`);
        continue;
      }
      const boxes = positiveNumber(group.boxes);
      if (boxes === null) {
        blocking.add(`INVALID_BOX_COUNT_${index}`);
        continue;
      }
      const proven =
        group.status === "PROVEN_OPERATIONAL_DOCUMENT" ||
        group.status === "PROVEN_CURRENT_HUMAN_RULE" ||
        group.status === "PROVEN_CURRENT_HUMAN_RULE_WITH_DERIVED_CAPACITY" ||
        group.status === "DERIVED_FROM_PROVEN_CAPACITIES";

      if (!proven) {
        unknowns.add(`PACKAGING_BOX_NOT_FACT_${index}`);
        continue;
      }

      addUsage(usages, {
        resource_key: `BOX_${String(group.box).replace(/\./g, "")}`,
        label: `Caixa ${group.box}`,
        kind: "PACKAGING_BOX",
        quantity: boxes,
        uom: "EA",
        proof: "PACKAGING_RULE_FACT",
        stock_semantics: "THEORETICAL_EXPECTED_CONSUMPTION",
      });
    }

    const exactBagCount = input.packaging.bags.exact_bag_count;
    const exactBagStatus = input.packaging.bags.exact_bag_count_status;

    if (exactBagCount !== null && exactBagStatus === "FACT") {
      const knownSizes = input.packaging.bags.group_sizes
        .filter((group) => group.size && group.status === "FACT")
        .map((group) => group.size as "P" | "M" | "G");

      if (knownSizes.length === exactBagCount) {
        for (const size of knownSizes) {
          addUsage(usages, {
            resource_key: `BAG_${size}`,
            label: `Sacola ${size}`,
            kind: "BAG",
            quantity: 1,
            uom: "EA",
            proof: "PACKAGING_RULE_FACT",
            stock_semantics: "THEORETICAL_EXPECTED_CONSUMPTION",
          });
        }
      } else if (
        exactBagCount === 1 &&
        input.packaging.bags.group_sizes.length === 1 &&
        input.packaging.bags.group_sizes[0]?.size &&
        input.packaging.bags.group_sizes[0]?.status === "FACT"
      ) {
        const size = input.packaging.bags.group_sizes[0].size;
        addUsage(usages, {
          resource_key: `BAG_${size}`,
          label: `Sacola ${size}`,
          kind: "BAG",
          quantity: 1,
          uom: "EA",
          proof: "PACKAGING_RULE_FACT",
          stock_semantics: "THEORETICAL_EXPECTED_CONSUMPTION",
        });
      } else {
        unknowns.add("BAG_SIZE_ALLOCATION_NOT_FULLY_PROVEN");
      }
    } else {
      unknowns.add("EXACT_BAG_COUNT_UNKNOWN");
    }

    if (input.packaging.has_unknown) {
      unknowns.add("PACKAGING_PLAN_HAS_UNKNOWN");
    }
  } else {
    unknowns.add("PACKAGING_PLAN_MISSING");
  }

  if (input.kits) {
    if (input.kits.status !== "FACT") {
      unknowns.add("KIT_ASSIGNMENT_NOT_FACT");
    } else if (!input.kit_registry) {
      blocking.add("KIT_COMPONENT_REGISTRY_REQUIRED");
    } else if (input.kit_registry.schema !== "deliveryos.kit-component-registry.v1") {
      blocking.add("KIT_COMPONENT_REGISTRY_SCHEMA_MISMATCH");
    } else {
      for (const kit of input.kits.kits) {
        const quantity = positiveNumber(kit.quantidade);
        if (!clean(kit.kit) || quantity === null) {
          blocking.add("INVALID_KIT_ASSIGNMENT");
          continue;
        }
        const definition = input.kit_registry.kits[kit.kit];
        if (!definition || definition.proof !== "HUMAN_CONFIRMED") {
          blocking.add(`KIT_DEFINITION_NOT_PROVEN:${kit.kit}`);
          continue;
        }

        addUsage(usages, {
          resource_key: `KIT:${kit.kit}`,
          label: kit.kit,
          kind: "KIT",
          quantity,
          uom: "EA",
          proof: "KIT_RULE_FACT",
          stock_semantics: "REFERENCE_ONLY",
        });

        for (const component of definition.components) {
          addUsage(usages, {
            resource_key: component.resource_key,
            label: component.label,
            kind: "KIT_COMPONENT",
            quantity: component.quantity * quantity,
            uom: component.uom,
            proof: "KIT_RULE_FACT",
            stock_semantics: "THEORETICAL_EXPECTED_CONSUMPTION",
          });
        }
      }
    }
  } else {
    unknowns.add("KIT_PLAN_MISSING");
  }

  for (const dep of input.kitchen_dependencies ?? []) {
    const quantity = positiveNumber(dep.quantity);
    if (quantity === null) {
      blocking.add(`INVALID_KITCHEN_DEPENDENCY:${dep.resource_key}`);
      continue;
    }
    addUsage(usages, {
      resource_key: `KITCHEN_DEPENDENCY:${dep.resource_key}`,
      label: dep.label,
      kind: "KITCHEN_DEPENDENCY",
      quantity,
      uom: "EA",
      proof: dep.proof,
      stock_semantics: "THEORETICAL_EXPECTED_CONSUMPTION",
    });
  }

  for (const direct of input.direct_stock_items ?? []) {
    const quantity = positiveNumber(direct.quantity);
    if (
      !clean(direct.source_product_code) ||
      !clean(direct.resource_key) ||
      !clean(direct.label) ||
      quantity === null ||
      direct.proof !== "DIRECT_STOCK_MAPPING"
    ) {
      blocking.add("INVALID_DIRECT_STOCK_ITEM");
      continue;
    }
    addUsage(usages, {
      resource_key: direct.resource_key,
      label: direct.label,
      kind: "DIRECT_STOCK_ITEM",
      quantity,
      uom: direct.uom,
      proof: "DIRECT_STOCK_MAPPING",
      stock_semantics: "THEORETICAL_EXPECTED_CONSUMPTION",
      source_item_code: direct.source_product_code,
      source_item_name: direct.source_product_name,
    });
  }

  for (const ingredient of input.recipe_ingredients ?? []) {
    const quantity = positiveNumber(ingredient.quantity);
    if (
      !clean(ingredient.resource_key) ||
      !clean(ingredient.label) ||
      quantity === null ||
      ingredient.proof !== "RECIPE_BOM"
    ) {
      blocking.add("INVALID_RECIPE_INGREDIENT");
      continue;
    }
    addUsage(usages, {
      resource_key: ingredient.resource_key,
      label: ingredient.label,
      kind: "RECIPE_INGREDIENT",
      quantity,
      uom: ingredient.uom,
      proof: "RECIPE_BOM",
      stock_semantics: "THEORETICAL_EXPECTED_CONSUMPTION",
      source_item_code: ingredient.source_item_code,
      source_item_name: ingredient.source_item_name,
    });
  }

  const recipeCompleteCodes = new Set(
    (input.recipe_bom_coverage ?? [])
      .filter((entry) => entry.complete === true && Number.isInteger(entry.bom_version) && entry.bom_version > 0)
      .map((entry) => clean(entry.product_code))
      .filter(Boolean),
  );
  const recipeIngredientCodes = new Set(
    (input.recipe_ingredients ?? [])
      .map((ingredient) => clean(ingredient.source_item_code))
      .filter(Boolean),
  );
  const directStockCodes = new Set(
    (input.direct_stock_items ?? [])
      .map((item) => clean(item.source_product_code))
      .filter(Boolean),
  );

  let readyForTheoreticalCmvBasis = cmvBasisByProduct.size > 0;
  for (const [code, basis] of cmvBasisByProduct) {
    if (basis === "RECIPE_BOM") {
      if (!recipeCompleteCodes.has(code) || !recipeIngredientCodes.has(code)) {
        unknowns.add(`RECIPE_BOM_COVERAGE_INCOMPLETE:${code}`);
        readyForTheoreticalCmvBasis = false;
      }
    } else if (basis === "DIRECT_STOCK_ITEM") {
      if (!directStockCodes.has(code)) {
        unknowns.add(`DIRECT_STOCK_MAPPING_MISSING:${code}`);
        readyForTheoreticalCmvBasis = false;
      }
    } else if (basis === "NON_STOCK") {
      continue;
    } else {
      unknowns.add(`CMV_BASIS_UNKNOWN:${code}`);
      readyForTheoreticalCmvBasis = false;
    }
  }

  const packagingKitUnknown = [...unknowns].some((reason) =>
    reason.startsWith("PACKAGING_") ||
    reason.startsWith("BAG_") ||
    reason.startsWith("EXACT_BAG_") ||
    reason.startsWith("KIT_"),
  );
  const completeForPackagingAndKit =
    blocking.size === 0 && !packagingKitUnknown;

  return {
    schema: "deliveryos.order-resource-projection.v1",
    order_id: orderId,
    ready_for_operational_resource_report: blocking.size === 0,
    complete_for_packaging_and_kit_usage: completeForPackagingAndKit,
    ready_for_recipe_cmv: blocking.size === 0 && readyForTheoreticalCmvBasis,
    ready_for_theoretical_cmv_basis: blocking.size === 0 && readyForTheoreticalCmvBasis,
    blocking_reasons: [...blocking].sort(),
    usages: [...usages.values()].sort((a, b) =>
      [a.kind, a.resource_key].join("|").localeCompare([b.kind, b.resource_key].join("|")),
    ),
    unknowns: [...unknowns].sort(),
    semantics: {
      sold_is_not_actual_consumed: true,
      theoretical_is_not_stock_write: true,
      cmv_requires_recipe_bom_and_cost_basis: true,
    },
    effects: {
      stock_write: false,
      cmv_write: false,
      print: false,
      odhen_write: false,
    },
  };
}

export interface ResourceAggregate {
  schema: "deliveryos.resource-aggregate.v1";
  order_count: number;
  usages: ResourceUsage[];
  blocked_orders: string[];
  recipe_cmv_ready_orders: number;
  theoretical_cmv_basis_ready_orders: number;
  packaging_and_kit_complete_orders: number;
  orders_with_unknown_resources: string[];
  semantics: {
    aggregate_is_theoretical: true;
    no_stock_write: true;
  };
}

export function aggregateOrderResources(
  orders: OrderResourceProjection[],
): ResourceAggregate {
  const usages = new Map<string, ResourceUsage>();
  const blockedOrders: string[] = [];
  let recipeCmvReadyOrders = 0;
  let theoreticalCmvBasisReadyOrders = 0;
  let packagingAndKitCompleteOrders = 0;
  const ordersWithUnknownResources: string[] = [];

  for (const order of orders) {
    if (!order.ready_for_operational_resource_report) {
      blockedOrders.push(order.order_id);
    }
    if (order.ready_for_recipe_cmv) recipeCmvReadyOrders += 1;
    if (order.ready_for_theoretical_cmv_basis) theoreticalCmvBasisReadyOrders += 1;
    if (order.complete_for_packaging_and_kit_usage) packagingAndKitCompleteOrders += 1;
    if (order.unknowns.length > 0) ordersWithUnknownResources.push(order.order_id);

    for (const usage of order.usages) {
      addUsage(usages, usage);
    }
  }

  return {
    schema: "deliveryos.resource-aggregate.v1",
    order_count: orders.length,
    usages: [...usages.values()].sort((a, b) =>
      [a.kind, a.resource_key].join("|").localeCompare([b.kind, b.resource_key].join("|")),
    ),
    blocked_orders: blockedOrders.sort(),
    recipe_cmv_ready_orders: recipeCmvReadyOrders,
    theoretical_cmv_basis_ready_orders: theoreticalCmvBasisReadyOrders,
    packaging_and_kit_complete_orders: packagingAndKitCompleteOrders,
    orders_with_unknown_resources: ordersWithUnknownResources.sort(),
    semantics: {
      aggregate_is_theoretical: true,
      no_stock_write: true,
    },
  };
}
