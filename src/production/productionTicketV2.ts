import type {
  PlannedProductionLine,
  ProductionPrintIntent,
} from "./productionPrintPlan";
import type {
  OrderResourceProjection,
  ResourceUsage,
} from "./resourceConsumption";

export interface StationTicketMountGroup {
  group_id: string;
  box_label: string | null;
  items: Array<{
    product_name: string;
    quantity: number;
    prep_ingredients: StationPrepComponent[];
    prep_unknowns: string[];
    observations: string[];
  }>;
}

export interface StationPrepComponent {
  component_key: string;
  label: string;
  quantity: number;
  unit: string;
  proof: "HUMAN_CONFIRMED" | "RECIPE_BOM";
}

export interface StationProductionTicketV2 {
  schema: "deliveryos.station-production-ticket.v2";
  destination: {
    printer_code: string;
    printer_name: string;
  };
  identifiers: {
    tata_sequence: string;
    teknisa_order_id: string;
    ifood_order_id: string | null;
    order_time: string | null;
  };
  mount_groups: StationTicketMountGroup[];
  final_check_label: "PRODUZIDO" | "FINALIZADO";
  content_priority: [
    "DESTINATION",
    "TATA_SEQUENCE",
    "MOUNT_BOX",
    "ITEM_QTY_NAME",
    "ITEM_PREP_INGREDIENTS",
    "ITEM_OBSERVATION",
    "SOURCE_IDS",
    "FINAL_CHECK",
  ];
  physical_render_status: "SEMANTIC_DOCUMENT_ONLY_REQUIRES_CALIBRATED_RENDERER";
  effects: {
    print: false;
  };
}

export interface DeliveryCheckProjectionV1 {
  schema: "deliveryos.delivery-check-projection.v1";
  order_id: string;
  boxes: ResourceUsage[];
  bags: ResourceUsage[];
  kits: ResourceUsage[];
  kit_components: ResourceUsage[];
  complements: ResourceUsage[];
  unknowns: string[];
  semantics: {
    expected_usage_not_physical_consumption: true;
    delivery_ui_projection_not_additional_ticket: true;
    checklist_not_stock_write: true;
  };
  effects: {
    print: false;
    stock_write: false;
  };
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function mountGroupId(line: PlannedProductionLine): string {
  return clean(line.mount_group_id) || `ITEM-${line.item_index}`;
}

function buildMountGroups(lines: PlannedProductionLine[]): StationTicketMountGroup[] {
  const groups = new Map<string, StationTicketMountGroup>();

  for (const line of lines) {
    const id = mountGroupId(line);
    const box = clean(line.box_label) || null;
    const existing = groups.get(id);

    if (existing) {
      if (existing.box_label !== box) {
        throw new Error(`MOUNT_GROUP_BOX_CONFLICT:${id}`);
      }
      const prep = itemPrepComponents(line);
      existing.items.push({
        product_name: line.product_name,
        quantity: line.quantity,
        prep_ingredients: prep.components,
        prep_unknowns: prep.unknowns,
        observations: line.item_observations,
      });
    } else {
      groups.set(id, {
        group_id: id,
        box_label: box,
        items: [
          (() => {
            const prep = itemPrepComponents(line);
            return {
              product_name: line.product_name,
              quantity: line.quantity,
              prep_ingredients: prep.components,
              prep_unknowns: prep.unknowns,
              observations: line.item_observations,
            };
          })(),
        ],
      });
    }
  }

  return [...groups.values()];
}

function itemPrepComponents(line: PlannedProductionLine): {
  components: StationPrepComponent[];
  unknowns: string[];
} {
  const known = new Map<string, StationPrepComponent>();
  const unknowns = new Set<string>();

  for (const component of line.prep_components ?? []) {
    const key = clean(component.component_key);
    const label = clean(component.label);
    const unit = clean(component.unit);
    const quantity = Number(component.quantity);

    if (!key || !label || !unit || !Number.isFinite(quantity) || quantity <= 0) {
      unknowns.add(`INVALID_PREP_COMPONENT:item_${line.item_index}`);
      continue;
    }

    if (component.proof === "UNKNOWN") {
      unknowns.add(`UNPROVEN_PREP_COMPONENT:${key}`);
      continue;
    }

    const mapKey = `${key}|${unit}|${component.proof}`;
    const prior = known.get(mapKey);
    if (prior) {
      prior.quantity += quantity;
    } else {
      known.set(mapKey, {
        component_key: key,
        label,
        quantity,
        unit,
        proof: component.proof,
      });
    }
  }

  return {
    components: [...known.values()].sort((a, b) =>
      a.label.localeCompare(b.label, "pt-BR"),
    ),
    unknowns: [...unknowns].sort(),
  };
}

/**
 * Creates the semantic production ticket. It is intentionally independent of
 * paper width, code page and transport. Physical rendering is a later,
 * printer-calibrated step.
 */
export function buildStationProductionTicketV2(
  intent: ProductionPrintIntent,
): StationProductionTicketV2 {
  return {
    schema: "deliveryos.station-production-ticket.v2",
    destination: {
      printer_code: intent.printer.printer_code,
      printer_name: intent.printer.printer_name,
    },
    identifiers: { ...intent.identifiers },
    mount_groups: buildMountGroups(intent.lines),
    final_check_label:
      intent.printer.printer_name === "COZINHA" ? "PRODUZIDO" : "FINALIZADO",
    content_priority: [
      "DESTINATION",
      "TATA_SEQUENCE",
      "MOUNT_BOX",
      "ITEM_QTY_NAME",
      "ITEM_PREP_INGREDIENTS",
      "ITEM_OBSERVATION",
      "SOURCE_IDS",
      "FINAL_CHECK",
    ],
    physical_render_status: "SEMANTIC_DOCUMENT_ONLY_REQUIRES_CALIBRATED_RENDERER",
    effects: {
      print: false,
    },
  };
}

function byKind(
  projection: OrderResourceProjection,
  kind: ResourceUsage["kind"],
): ResourceUsage[] {
  return projection.usages
    .filter((usage) => usage.kind === kind)
    .map((usage) => ({ ...usage }));
}

/**
 * The assembly/conference document is separate from station production.
 * It is where boxes, bags, kits and no-ticket complements belong.
 */
export function buildDeliveryCheckProjectionV1(
  projection: OrderResourceProjection,
): DeliveryCheckProjectionV1 {
  return {
    schema: "deliveryos.delivery-check-projection.v1",
    order_id: projection.order_id,
    boxes: byKind(projection, "PACKAGING_BOX"),
    bags: byKind(projection, "BAG"),
    kits: byKind(projection, "KIT"),
    kit_components: byKind(projection, "KIT_COMPONENT"),
    complements: byKind(projection, "COMPLEMENT"),
    unknowns: [...projection.unknowns],
    semantics: {
      expected_usage_not_physical_consumption: true,
      delivery_ui_projection_not_additional_ticket: true,
      checklist_not_stock_write: true,
    },
    effects: {
      print: false,
      stock_write: false,
    },
  };
}
