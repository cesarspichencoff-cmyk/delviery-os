import type {
  ExpectedRoutingProjection,
  ExpectedRoutingTarget,
} from "../shadow/expectedRouting";

export type ProductionPrintEvidenceState =
  | "PLANNED"
  | "SUBMISSION_RETURNED_UNOBSERVED"
  | "SPOOLER_OBSERVED"
  | "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION"
  | "PHYSICALLY_CONFIRMED";

export interface ProductionPrinterCalibration {
  actual_device_variant: string;
  actual_media_width_mm: number | "UNKNOWN";
  printable_width_dots: number | "UNKNOWN";
  windows_queue_name: string;
  windows_driver_name: string;
  windows_port_name: string;
  direct_network_print_port: number | "UNKNOWN";
  transport_selected: string;
  character_mode: string;
  accent_test: string;
  cutter_test: string;
  feed_after_cut_test: string;
  bold_double_size_legibility: string;
  density_legibility: string;
  paperout_observation: string;
  cover_open_observation: string;
  offline_observation: string;
  spooler_job_observation: string;
  one_physical_ticket_proof: string;
}

export interface ProductionPrinterCalibrationEntry {
  printer_code: string;
  printer_name: string;
  configured_model: string;
  configured_ip: string;
  configured_port_alias: string | null;
  peripherals_server: string | null;
  route_identity_proof: string;
  calibration: ProductionPrinterCalibration;
  activation_status: string;
}

export interface ProductionPrinterCalibrationRegistry {
  schema: "deliveryos.production-printer-calibration-registry.v1";
  store: string;
  printers: ProductionPrinterCalibrationEntry[];
}

export interface ProductionTicketItemMetadata {
  item_index: number;
  item_observations?: string[];
  mount_group_id?: string | null;
  box_label?: string | null;
  prep_components?: Array<{
    component_key: string;
    label: string;
    quantity: number;
    unit: string;
    proof: "HUMAN_CONFIRMED" | "RECIPE_BOM" | "UNKNOWN";
  }>;
}

export interface ProductionPrintContext {
  tata_sequence: string | null;
  teknisa_order_id: string | null;
  ifood_order_id: string | null;
  order_time: string | null;
  template_version: string;
  ticket_items?: ProductionTicketItemMetadata[];
}

export interface PlannedProductionLine {
  item_index: number;
  product_code: string | null;
  product_name: string;
  quantity: number;
  item_observations: string[];
  mount_group_id: string | null;
  box_label: string | null;
  prep_components: ProductionTicketItemMetadata["prep_components"];
}

export interface ProductionPrintIntent {
  printer: ExpectedRoutingTarget;
  template_version: string;
  semantic_key_material: string;
  identifiers: {
    tata_sequence: string;
    teknisa_order_id: string;
    ifood_order_id: string | null;
    order_time: string | null;
  };
  lines: PlannedProductionLine[];
  evidence: ProductionPrintEvidenceState;
  calibration_status: "READY_FOR_RENDER_CALIBRATION_PROVEN" | "CALIBRATION_REQUIRED";
  physical_effect_authorized: false;
}

export interface ProductionPrintPlan {
  schema: "deliveryos.production-print-plan.v1";
  order_id: string | null;
  ready_for_shadow_payload: boolean;
  ready_for_physical_print: false;
  blocking_reasons: string[];
  print_intents: ProductionPrintIntent[];
  no_own_production_ticket_items: Array<{
    item_index: number;
    product_code: string | null;
    product_name: string;
    quantity: number;
    reason: string | null;
  }>;
  evidence_policy: {
    planned_is_not_submitted: true;
    spooler_observed_is_not_physical_confirmation: true;
    ambiguous_effect_forbids_automatic_retry: true;
  };
  effects: {
    print: false;
    spooler_write: false;
    odhen_write: false;
    fiscal_action: false;
    cutover: false;
  };
}

function clean(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function normalizedObservations(values: string[] | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values ?? []) {
    const value = clean(raw);
    const key = value.toLocaleUpperCase("pt-BR");
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function calibrationReady(entry: ProductionPrinterCalibrationEntry): boolean {
  const c = entry.calibration;
  return (
    typeof c.actual_media_width_mm === "number" &&
    typeof c.printable_width_dots === "number" &&
    clean(c.transport_selected) !== "UNKNOWN" &&
    clean(c.character_mode) !== "UNKNOWN" &&
    clean(c.accent_test) !== "UNKNOWN" &&
    clean(c.cutter_test) !== "UNKNOWN" &&
    clean(c.feed_after_cut_test) !== "UNKNOWN" &&
    clean(c.bold_double_size_legibility) !== "UNKNOWN" &&
    clean(c.density_legibility) !== "UNKNOWN" &&
    clean(c.paperout_observation) !== "UNKNOWN" &&
    clean(c.offline_observation) !== "UNKNOWN" &&
    clean(c.spooler_job_observation) !== "UNKNOWN" &&
    clean(c.one_physical_ticket_proof) !== "UNKNOWN"
  );
}

function stableSemanticKeyMaterial(input: {
  orderId: string;
  printerCode: string;
  templateVersion: string;
  lines: PlannedProductionLine[];
}): string {
  const lines = input.lines
    .map((line) => [
      line.item_index,
      line.product_code ?? "",
      line.product_name,
      line.quantity,
      line.mount_group_id ?? "",
      line.box_label ?? "",
      line.item_observations.join(" | "),
    ].join("~"))
    .join("||");

  return [
    "production-ticket-v1",
    input.orderId,
    input.printerCode,
    input.templateVersion,
    lines,
  ].join("::");
}

/**
 * Builds one logical ticket intent per configured physical printer.
 *
 * It deliberately does NOT render bytes and never authorizes a physical effect.
 * Product routing authority comes from ExpectedRoutingProjection. Printer
 * calibration is a separate gate.
 */
export function planProductionPrintIntents(
  projection: ExpectedRoutingProjection,
  context: ProductionPrintContext,
  calibrationRegistry: ProductionPrinterCalibrationRegistry,
): ProductionPrintPlan {
  const blocking = new Set<string>();

  if (calibrationRegistry.schema !== "deliveryos.production-printer-calibration-registry.v1") {
    blocking.add("CALIBRATION_REGISTRY_SCHEMA_MISMATCH");
  }
  if (!projection.ready) {
    for (const reason of projection.blocking_reasons) {
      blocking.add(`ROUTING_NOT_READY:${reason}`);
    }
  }

  const orderId = clean(projection.order_id || context.teknisa_order_id);
  if (!orderId) blocking.add("ORDER_ID_REQUIRED");
  const tataSequence = clean(context.tata_sequence);
  if (!tataSequence) blocking.add("TATA_SEQUENCE_REQUIRED");
  const teknisaOrderId = clean(context.teknisa_order_id);
  if (!teknisaOrderId) blocking.add("TEKNISA_ORDER_ID_REQUIRED");
  if (!clean(context.template_version)) blocking.add("TEMPLATE_VERSION_REQUIRED");

  const metaByIndex = new Map<number, ProductionTicketItemMetadata>();
  for (const meta of context.ticket_items ?? []) {
    if (metaByIndex.has(meta.item_index)) {
      blocking.add(`DUPLICATE_TICKET_ITEM_METADATA_${meta.item_index}`);
      continue;
    }
    metaByIndex.set(meta.item_index, meta);
  }

  const calibrationByCode = new Map<string, ProductionPrinterCalibrationEntry>();
  for (const entry of calibrationRegistry.printers) {
    if (calibrationByCode.has(entry.printer_code)) {
      blocking.add(`DUPLICATE_CALIBRATION_PRINTER_${entry.printer_code}`);
      continue;
    }
    calibrationByCode.set(entry.printer_code, entry);
  }

  const linesByPrinter = new Map<string, {
    target: ExpectedRoutingTarget;
    lines: PlannedProductionLine[];
  }>();

  const noOwnProductionTicketItems: ProductionPrintPlan["no_own_production_ticket_items"] = [];

  for (const item of projection.items) {
    if (item.routing_status === "NO_OWN_PRODUCTION_TICKET") {
      noOwnProductionTicketItems.push({
        item_index: item.item_index,
        product_code: item.product_code,
        product_name: item.product_name,
        quantity: item.quantity,
        reason: item.non_production_reason,
      });
      continue;
    }

    if (item.routing_status !== "ROUTED") {
      blocking.add(`UNRESOLVED_ROUTING_ITEM_${item.item_index}`);
      continue;
    }

    const meta = metaByIndex.get(item.item_index);
    const line: PlannedProductionLine = {
      item_index: item.item_index,
      product_code: item.product_code,
      product_name: item.product_name,
      quantity: item.quantity,
      item_observations: normalizedObservations(meta?.item_observations),
      mount_group_id: clean(meta?.mount_group_id) || null,
      box_label: clean(meta?.box_label) || null,
      prep_components: meta?.prep_components ?? [],
    };

    for (const target of item.targets) {
      const current = linesByPrinter.get(target.printer_code);
      if (current) {
        const sameIdentity =
          current.target.printer_name === target.printer_name &&
          current.target.printer_ip === target.printer_ip;
        if (!sameIdentity) {
          blocking.add(`PRINTER_TARGET_IDENTITY_CONFLICT_${target.printer_code}`);
          continue;
        }
        current.lines.push(line);
      } else {
        linesByPrinter.set(target.printer_code, { target, lines: [line] });
      }
    }
  }

  const printIntents: ProductionPrintIntent[] = [];

  for (const [printerCode, grouped] of [...linesByPrinter.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const calibration = calibrationByCode.get(printerCode);
    if (!calibration) {
      blocking.add(`CALIBRATION_PROFILE_NOT_FOUND_${printerCode}`);
      continue;
    }
    if (
      calibration.printer_name !== grouped.target.printer_name ||
      calibration.configured_ip !== grouped.target.printer_ip
    ) {
      blocking.add(`CALIBRATION_TARGET_MISMATCH_${printerCode}`);
      continue;
    }

    const lines = grouped.lines.sort((a, b) => a.item_index - b.item_index);
    printIntents.push({
      printer: grouped.target,
      template_version: context.template_version,
      semantic_key_material: stableSemanticKeyMaterial({
        orderId,
        printerCode,
        templateVersion: context.template_version,
        lines,
      }),
      identifiers: {
        tata_sequence: tataSequence,
        teknisa_order_id: teknisaOrderId,
        ifood_order_id: clean(context.ifood_order_id) || null,
        order_time: clean(context.order_time) || null,
      },
      lines,
      evidence: "PLANNED",
      calibration_status: calibrationReady(calibration)
        ? "READY_FOR_RENDER_CALIBRATION_PROVEN"
        : "CALIBRATION_REQUIRED",
      physical_effect_authorized: false,
    });
  }

  return {
    schema: "deliveryos.production-print-plan.v1",
    order_id: projection.order_id,
    ready_for_shadow_payload: blocking.size === 0,
    ready_for_physical_print: false,
    blocking_reasons: [...blocking].sort(),
    print_intents: printIntents,
    no_own_production_ticket_items: noOwnProductionTicketItems,
    evidence_policy: {
      planned_is_not_submitted: true,
      spooler_observed_is_not_physical_confirmation: true,
      ambiguous_effect_forbids_automatic_retry: true,
    },
    effects: {
      print: false,
      spooler_write: false,
      odhen_write: false,
      fiscal_action: false,
      cutover: false,
    },
  };
}
