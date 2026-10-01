import { createHash } from "node:crypto";
import type {
  ExpectedRoutingProjection,
  ExpectedRoutingTarget,
} from "../shadow/expectedRouting";

export type ProductionPrintEvidenceState =
  | "PLANNED"
  | "PROVEN_NO_EFFECT_FAILURE"
  | "SUBMISSION_RETURNED_UNOBSERVED"
  | "SPOOLER_OBSERVED"
  | "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION"
  | "PHYSICALLY_CONFIRMED";

export type ProductionService = "LUNCH" | "DINNER";

export type ProductionInstructionEvidence =
  | "HUMAN_CONFIRMED_RULE"
  | "LOCAL_RECIPE_VALIDATED"
  | "REAL_OBSERVED"
  | "UNKNOWN";

export interface ProductionServiceResolution {
  service: ProductionService | null;
  evidence: "HUMAN_CONFIRMED_RULE" | "REAL_OBSERVED" | "UNKNOWN";
  source_ref: string | null;
}

export interface ProductionOrderObservationInput {
  value: string;
  source_ref: string | null;
  relevance: "PRODUCTION_RELEVANT" | "UNKNOWN";
  proof: "HUMAN_CONFIRMED_RULE" | "REAL_OBSERVED" | "UNKNOWN";
}

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
    proof: ProductionInstructionEvidence;
  }>;
}

export interface ProductionPrintContext {
  tata_sequence: string | null;
  teknisa_sequence: string | null;
  ifood_sequence: string | null;
  order_time: string | null;
  service_resolution?: ProductionServiceResolution | null;
  order_observations?: ProductionOrderObservationInput[];
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
  service_resolution: ProductionServiceResolution;
  order_observations: string[];
  semantic_key_material: string;
  intent_fingerprint: string;
  identifiers: {
    ifood_sequence: string;
    teknisa_sequence: string;
    tata_sequence: string;
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
    service_is_explicit_not_inferred_from_clock: true;
    dual_service_routes_are_mutually_exclusive: true;
    same_semantic_intent_same_fingerprint: true;
    retry_must_reuse_intent_fingerprint: true;
    fingerprint_is_not_print_proof: true;
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

function validatedOrderObservations(
  values: ProductionOrderObservationInput[] | undefined,
  blocking: Set<string>,
): string[] {
  const accepted: string[] = [];
  const seen = new Set<string>();

  for (const [index, observation] of (values ?? []).entries()) {
    const value = clean(observation.value);
    if (!value) continue;

    if (observation.relevance !== "PRODUCTION_RELEVANT") {
      blocking.add(`ORDER_OBSERVATION_RELEVANCE_UNPROVEN_${index}`);
      continue;
    }
    if (
      observation.proof !== "HUMAN_CONFIRMED_RULE" &&
      observation.proof !== "REAL_OBSERVED"
    ) {
      blocking.add(`ORDER_OBSERVATION_PROOF_REQUIRED_${index}`);
      continue;
    }
    if (!clean(observation.source_ref)) {
      blocking.add(`ORDER_OBSERVATION_SOURCE_REF_REQUIRED_${index}`);
      continue;
    }

    const key = value.toLocaleUpperCase("pt-BR");
    if (seen.has(key)) continue;
    seen.add(key);
    accepted.push(value);
  }

  return accepted;
}

function calibrationReady(entry: ProductionPrinterCalibrationEntry): boolean {
  const c = entry.calibration;
  return (
    clean(c.actual_device_variant) !== "UNKNOWN" &&
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
    clean(c.cover_open_observation) !== "UNKNOWN" &&
    clean(c.offline_observation) !== "UNKNOWN" &&
    clean(c.spooler_job_observation) !== "UNKNOWN" &&
    clean(c.one_physical_ticket_proof) !== "UNKNOWN"
  );
}

const SERVICE_ALTERNATIVE_GROUPS = [
  { key: "SUSHI_1", lunch: "00009", dinner: "00003" },
  { key: "SUSHI_2", lunch: "00006", dinner: "00004" },
] as const;

function selectTargetsForService(
  targets: ExpectedRoutingTarget[],
  service: ProductionService | null,
  itemIndex: number,
  blocking: Set<string>,
): ExpectedRoutingTarget[] {
  let selected = [...targets];

  for (const group of SERVICE_ALTERNATIVE_GROUPS) {
    const codes = new Set<string>([group.lunch, group.dinner]);
    const present = selected.filter((target) => codes.has(target.printer_code));
    if (present.length < 2) continue;

    if (!service) {
      blocking.add(
        `SERVICE_REQUIRED_FOR_ALTERNATE_ROUTE_ITEM_${itemIndex}_${group.key}`,
      );
      selected = selected.filter((target) => !codes.has(target.printer_code));
      continue;
    }

    const activePrinterCode =
      service === "LUNCH" ? group.lunch : group.dinner;
    selected = selected.filter(
      (target) =>
        !codes.has(target.printer_code) ||
        target.printer_code === activePrinterCode,
    );
  }

  return selected;
}

function normalizedPrepComponents(
  components: ProductionTicketItemMetadata["prep_components"],
): string {
  return [...(components ?? [])]
    .map((component) => [
      clean(component.component_key),
      clean(component.label),
      Number(component.quantity),
      clean(component.unit),
      component.proof,
    ].join("~"))
    .sort()
    .join("|");
}

function stableSemanticKeyMaterial(input: {
  orderId: string;
  target: ExpectedRoutingTarget;
  templateVersion: string;
  serviceResolution: ProductionServiceResolution;
  ifoodSequence: string;
  teknisaSequence: string;
  tataSequence: string;
  orderTime: string | null;
  orderObservations: string[];
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
      normalizedPrepComponents(line.prep_components),
    ].join("~"))
    .join("||");

  return [
    "production-ticket-v2",
    input.orderId,
    input.target.printer_code,
    input.target.printer_name,
    input.target.printer_ip,
    input.templateVersion,
    input.serviceResolution.service ?? "UNRESOLVED",
    input.serviceResolution.evidence,
    input.serviceResolution.source_ref ?? "",
    input.ifoodSequence,
    input.teknisaSequence,
    input.tataSequence,
    input.orderTime ?? "",
    input.orderObservations.join(" | "),
    lines,
  ].join("::");
}

function fingerprintSemanticIntent(material: string): string {
  return createHash("sha256").update(material).digest("hex");
}

/**
 * Builds one logical ticket intent per resolved active production station.
 *
 * Configured lunch/dinner alternatives are mutually exclusive. If both
 * alternatives exist for one item, service must be supplied explicitly; this
 * planner never infers service from the clock.
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

  const orderId = clean(projection.order_id || context.teknisa_sequence);
  if (!orderId) blocking.add("ORDER_ID_REQUIRED");
  const tataSequence = clean(context.tata_sequence);
  if (!tataSequence) blocking.add("TATA_SEQUENCE_REQUIRED");
  const teknisaSequence = clean(context.teknisa_sequence);
  if (!teknisaSequence) blocking.add("TEKNISA_SEQUENCE_REQUIRED");
  const ifoodSequence = clean(context.ifood_sequence);
  if (!ifoodSequence) blocking.add("IFOOD_SEQUENCE_REQUIRED");
  if (!clean(context.template_version)) blocking.add("TEMPLATE_VERSION_REQUIRED");

  const rawServiceResolution = context.service_resolution ?? null;
  const serviceResolution: ProductionServiceResolution = {
    service:
      rawServiceResolution?.service === "LUNCH" ||
      rawServiceResolution?.service === "DINNER"
        ? rawServiceResolution.service
        : null,
    evidence:
      rawServiceResolution?.evidence === "HUMAN_CONFIRMED_RULE" ||
      rawServiceResolution?.evidence === "REAL_OBSERVED"
        ? rawServiceResolution.evidence
        : "UNKNOWN",
    source_ref: clean(rawServiceResolution?.source_ref) || null,
  };

  if (rawServiceResolution?.service && !serviceResolution.service) {
    blocking.add("INVALID_PRODUCTION_SERVICE");
  }
  if (serviceResolution.service && serviceResolution.evidence === "UNKNOWN") {
    blocking.add("PRODUCTION_SERVICE_EVIDENCE_REQUIRED");
  }
  if (serviceResolution.service && !serviceResolution.source_ref) {
    blocking.add("PRODUCTION_SERVICE_SOURCE_REF_REQUIRED");
  }

  const orderObservations = validatedOrderObservations(
    context.order_observations,
    blocking,
  );

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

    const activeTargets = selectTargetsForService(
      item.targets,
      serviceResolution.service,
      item.item_index,
      blocking,
    );

    for (const target of activeTargets) {
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
    const semanticKeyMaterial = stableSemanticKeyMaterial({
      orderId,
      target: grouped.target,
      templateVersion: context.template_version,
      serviceResolution,
      ifoodSequence,
      teknisaSequence,
      tataSequence,
      orderTime: clean(context.order_time) || null,
      orderObservations,
      lines,
    });
    printIntents.push({
      printer: grouped.target,
      template_version: context.template_version,
      service_resolution: { ...serviceResolution },
      order_observations: [...orderObservations],
      semantic_key_material: semanticKeyMaterial,
      intent_fingerprint: fingerprintSemanticIntent(semanticKeyMaterial),
      identifiers: {
        ifood_sequence: ifoodSequence,
        teknisa_sequence: teknisaSequence,
        tata_sequence: tataSequence,
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
      service_is_explicit_not_inferred_from_clock: true,
      dual_service_routes_are_mutually_exclusive: true,
      same_semantic_intent_same_fingerprint: true,
      retry_must_reuse_intent_fingerprint: true,
      fingerprint_is_not_print_proof: true,
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
