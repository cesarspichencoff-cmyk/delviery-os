import type {
  ResourceAggregate,
  ResourceUsage,
  ResourceUsageKind,
} from "./resourceConsumption";
import type { ResourceCostProjection } from "./resourceCosting";

export interface OperationalResourceReportSection {
  kind: ResourceUsageKind;
  title: string;
  rows: ResourceUsage[];
}

export interface OperationalResourceReport {
  schema: "deliveryos.operational-resource-report.v1";
  order_count: number;
  sections: OperationalResourceReportSection[];
  coverage: {
    blocked_orders: string[];
    orders_with_unknown_resources: string[];
    packaging_and_kit_complete_orders: number;
    theoretical_cmv_basis_ready_orders: number;
  };
  costs: null | {
    as_of_date: string;
    packaging_and_kit_brl: number;
    recipe_ingredient_brl: number;
    complements_brl: number;
    total_theoretical_brl: number;
    ready_for_packaging_and_kit_cost: boolean;
    ready_for_full_theoretical_cmv: boolean;
    uncosted_resource_keys: string[];
  };
  semantics: {
    resource_totals_are_expected_not_physical_inventory_counts: true;
    theoretical_cost_is_not_accounting_cmv: true;
  };
}

const TITLES: Record<ResourceUsageKind, string> = {
  MENU_ITEM: "Itens vendidos",
  PACKAGING_BOX: "Caixas",
  BAG: "Sacolas",
  KIT: "Kits",
  KIT_COMPONENT: "Componentes de kits",
  COMPLEMENT: "Complementos / montagem",
  KITCHEN_DEPENDENCY: "Dependências de cozinha",
  RECIPE_INGREDIENT: "Ingredientes por ficha técnica",
  DIRECT_STOCK_ITEM: "Itens de estoque direto",
};

const ORDER: ResourceUsageKind[] = [
  "MENU_ITEM",
  "PACKAGING_BOX",
  "BAG",
  "KIT",
  "KIT_COMPONENT",
  "COMPLEMENT",
  "KITCHEN_DEPENDENCY",
  "RECIPE_INGREDIENT",
  "DIRECT_STOCK_ITEM",
];

export function buildOperationalResourceReport(
  aggregate: ResourceAggregate,
  costs?: ResourceCostProjection | null,
): OperationalResourceReport {
  const sections = ORDER.map((kind) => ({
    kind,
    title: TITLES[kind],
    rows: aggregate.usages
      .filter((usage) => usage.kind === kind)
      .map((usage) => ({ ...usage }))
      .sort((a, b) => b.quantity - a.quantity || a.label.localeCompare(b.label, "pt-BR")),
  })).filter((section) => section.rows.length > 0);

  return {
    schema: "deliveryos.operational-resource-report.v1",
    order_count: aggregate.order_count,
    sections,
    coverage: {
      blocked_orders: [...aggregate.blocked_orders],
      orders_with_unknown_resources: [...aggregate.orders_with_unknown_resources],
      packaging_and_kit_complete_orders: aggregate.packaging_and_kit_complete_orders,
      theoretical_cmv_basis_ready_orders: aggregate.theoretical_cmv_basis_ready_orders,
    },
    costs: costs
      ? {
          as_of_date: costs.as_of_date,
          packaging_and_kit_brl: costs.totals.packaging_and_kit_brl,
          recipe_ingredient_brl: costs.totals.recipe_ingredient_brl,
          complements_brl: costs.totals.complements_brl,
          total_theoretical_brl: costs.totals.total_theoretical_brl,
          ready_for_packaging_and_kit_cost: costs.ready_for_packaging_and_kit_cost,
          ready_for_full_theoretical_cmv: costs.ready_for_full_theoretical_cmv,
          uncosted_resource_keys: costs.uncosted.map((item) => item.resource_key).sort(),
        }
      : null,
    semantics: {
      resource_totals_are_expected_not_physical_inventory_counts: true,
      theoretical_cost_is_not_accounting_cmv: true,
    },
  };
}
