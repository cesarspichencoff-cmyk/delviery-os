import type { ProductionPrintPlan, PlannedProductionLine } from "./productionPrintPlan";
import {
  projectOrderResources,
  type OrderResourceProjection,
  type OrderResourceProjectionInput,
  type PackagingPlanInput,
  type ResourceUsage,
} from "./resourceConsumption";
import type { KitchenNeedProjection } from "./kitchenDependencies";

/**
 * V4.5: adapters for the two approved designs. No physical output.
 * The existing routing, resource and kitchen motors remain the authorities.
 * In particular, catalogue ingredient descriptions are NOT finishing recipes.
 */
export interface SourceOrderItemV45 {
  item_index: number;
  product_code: string | null;
  product_name: string;
  quantity: number;
  observations: string[];
  packaging_role?: "CLOSED_COMBO" | "OTHER" | "UNKNOWN";
}

export interface ColdFinishingRuleV45 {
  product_code: string;
  station: string;
  components: string[];
  purpose: "COLD_FINISHING";
  proof: "HUMAN_CONFIRMED_RULE" | "LOCAL_RECIPE_VALIDATED" | "REAL_OBSERVED";
  source_ref: string;
}

export interface ApprovedPrintAliasV45 {
  product_code: string;
  print_name: string;
  approval: "HUMAN_APPROVED";
  source_ref: string;
}

export interface OperationalTicketsInputV45 {
  order_id: string;
  source_items: SourceOrderItemV45[];
  production_plan: ProductionPrintPlan;
  resource_projection: OrderResourceProjection;
  packaging_plan: PackagingPlanInput | null;
  finishing_rules?: ColdFinishingRuleV45[];
  approved_aliases?: ApprovedPrintAliasV45[];
  kitchen_needs_by_fingerprint?: Record<string, KitchenNeedProjection>;
  revision?: { number: number; source_ref: string };
}

export interface TicketItemV45 {
  source_item_index: number;
  product_code: string | null;
  quantity: number;
  print_name: string;
  observations: string[];
  finishing: string[]; // Only explicit, evidenced cold-finishing instructions.
  kitchen_dependencies: string[]; // Only projection-backed dependencies.
}
export interface TicketBoxV45 {
  position: string;
  /** Greater than one is permitted only for a directly-proven one-unit-per-box
   * closed-combo group in the production projection. */
  physical_box_count?: number;
  model: string | null;
  status: "PROVEN" | "UNKNOWN";
  items: TicketItemV45[];
  operator_field: "Op. ________";
}
export interface ProductionTicketV45 {
  station: string;
  fingerprint: string;
  identifiers: {
    ifood: string;
    teknisa: string;
    tata: string;
    hour: string | null;
  };
  boxes: TicketBoxV45[];
  items_without_proven_box: TicketItemV45[];
  warnings: string[];
  ready_for_semantic_preview: boolean;
}
export interface ConferenceTicketV45 {
  order_id: string;
  identifiers: ProductionTicketV45["identifiers"] | null;
  revision: number | null;
  boxes: TicketBoxV45[];
  items_without_proven_box: TicketItemV45[];
  bags: Array<{ label: string; quantity: number }>;
  kits: Array<{ label: string; quantity: number }>;
  accompaniments: Array<{ label: "GARI" | "WASABI" | "TARE"; quantity: number }>;
  warnings: string[];
  ready_for_semantic_preview: boolean;
}
export interface OperationalTicketsResultV45 {
  schema: "deliveryos.operational-tickets.v45.shadow.v1";
  production: ProductionTicketV45[];
  conference: ConferenceTicketV45;
  blocking_reasons: string[];
  ready_for_semantic_preview: boolean;
  ready_for_automatic_operational_print: false;
  effects: { print: false; spooler_write: false; odhen_write: false; stock_write: false };
}

const NUMERIC_BOXES = new Set(["240", "450", "650", "750", "1000", "1500", "1600"]);
const PROVEN_BOX_STATUS = new Set([
  "PROVEN_OPERATIONAL_DOCUMENT",
  "PROVEN_CURRENT_HUMAN_RULE",
  "PROVEN_CURRENT_HUMAN_RULE_WITH_DERIVED_CAPACITY",
  "DERIVED_FROM_PROVEN_CAPACITIES",
]);

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
function canon(value: unknown): string {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}
function positive(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function boxModel(value: unknown): string | null {
  const cleaned = clean(value).replace(/\./g, "").toUpperCase();
  const match = cleaned.match(/^(?:(?:CX|CAIXA)\s*)?(240|450|650|750|1000|1500|1600)(?:\s+(?:SELADA|SEALED))?$/);
  return match && NUMERIC_BOXES.has(match[1]) ? match[1] : null;
}
function allReasons(reasons: Set<string>): string[] {
  return [...reasons].sort();
}
function formatQuantity(q: number): string {
  return String(q);
}
function safeName(
  source: Pick<SourceOrderItemV45, "product_code" | "product_name">,
  aliases: ApprovedPrintAliasV45[],
  reasons: Set<string>,
): string {
  const matches = aliases.filter((a) => a.product_code === source.product_code);
  if (matches.length > 1) reasons.add("AMBIGUOUS_ALIAS:" + clean(source.product_code));
  if (matches.length === 1) {
    const alias = matches[0];
    if (alias.approval !== "HUMAN_APPROVED" || !clean(alias.source_ref) || !clean(alias.print_name)) {
      reasons.add("UNPROVEN_ALIAS:" + clean(source.product_code));
    } else {
      return clean(alias.print_name).toLocaleUpperCase("pt-BR");
    }
  }
  return clean(source.product_name).toLocaleUpperCase("pt-BR");
}
function finishLines(
  line: { product_code: string | null },
  station: string,
  rules: ColdFinishingRuleV45[],
  reasons: Set<string>,
): string[] {
  if (!line.product_code) return [];
  const matching = rules.filter((r) => r.product_code === line.product_code && canon(r.station) === canon(station));
  if (matching.length > 1) {
    reasons.add("AMBIGUOUS_FINISHING_RULE:" + line.product_code);
    return [];
  }
  if (!matching.length) return [];
  const r = matching[0];
  if (r.purpose !== "COLD_FINISHING" || !clean(r.source_ref) || !r.components.length ||
      r.components.some((c) => !clean(c)) ||
      !["HUMAN_CONFIRMED_RULE", "LOCAL_RECIPE_VALIDATED", "REAL_OBSERVED"].includes(r.proof)) {
    reasons.add("UNPROVEN_FINISHING_RULE:" + line.product_code);
    return [];
  }
  return r.components.map((c) => clean(c).toLocaleUpperCase("pt-BR"));
}
function dependencies(
  line: Pick<PlannedProductionLine, "product_name" | "quantity">,
  projection: KitchenNeedProjection | undefined,
  reasons: Set<string>,
): string[] {
  if (!projection) return [];
  const matches = projection.contributions.filter(
    (c) => canon(c.item_name) === canon(line.product_name) && c.item_quantity === line.quantity,
  );
  if (matches.length > 1) {
    reasons.add("AMBIGUOUS_KITCHEN_CONTRIBUTION:" + canon(line.product_name));
    return [];
  }
  if (matches.length === 0) return [];
  const c = matches[0];
  const result: string[] = [];
  if (c.hot > 0) result.push(formatQuantity(c.hot) + "x HOT");
  if (c.ebiten > 0) result.push(formatQuantity(c.ebiten) + "x EBITEN");
  if (c.shiso > 0) result.push(formatQuantity(c.shiso) + "x SHISO");
  return result;
}
function itemFromSource(
  source: SourceOrderItemV45,
  aliases: ApprovedPrintAliasV45[],
  reasons: Set<string>,
): TicketItemV45 {
  return {
    source_item_index: source.item_index,
    product_code: source.product_code,
    quantity: source.quantity,
    print_name: safeName(source, aliases, reasons),
    observations: source.observations.map((x) => clean(x).toLocaleUpperCase("pt-BR")).filter(Boolean),
    finishing: [],
    kitchen_dependencies: [],
  };
}
function evidenceUsages(
  usages: ResourceUsage[],
  kind: ResourceUsage["kind"],
  proof: ResourceUsage["proof"],
): ResourceUsage[] {
  return usages.filter((u) => u.kind === kind && u.proof === proof && positive(u.quantity));
}
function aggregate(usages: ResourceUsage[]): Array<{ label: string; quantity: number }> {
  const data = new Map<string, number>();
  for (const u of usages) {
    const name = clean(u.label);
    if (name) data.set(name, (data.get(name) ?? 0) + u.quantity);
  }
  return [...data].map(([label, quantity]) => ({ label, quantity }));
}

/**
 * Call after the existing production planner and resource projection have run.
 * Never infers inventory consumption, box size, bag allocation or recipe steps.
 */
export function projectOperationalTicketsV45(input: OperationalTicketsInputV45): OperationalTicketsResultV45 {
  const reasons = new Set<string>();
  const warnings = new Set<string>();
  const aliases = input.approved_aliases ?? [];
  const rules = input.finishing_rules ?? [];
  const sources = [...input.source_items].sort((a, b) => a.item_index - b.item_index);
  if (!clean(input.order_id)) reasons.add("ORDER_ID_REQUIRED");
  if (!sources.length) reasons.add("SOURCE_ITEMS_REQUIRED");
  if (clean(input.resource_projection.order_id) !== clean(input.order_id)) {
    reasons.add("RESOURCE_ORDER_ID_MISMATCH");
  }
  if (input.resource_projection.schema !== "deliveryos.order-resource-projection.v1") {
    reasons.add("RESOURCE_PROJECTION_SCHEMA_MISMATCH");
  }
  for (const problem of input.resource_projection.blocking_reasons) {
    reasons.add("RESOURCE_MOTOR:" + problem);
  }
  if (!input.production_plan.ready_for_shadow_payload) {
    reasons.add("PRODUCTION_PLAN_NOT_SHADOW_READY");
    warnings.add("PRODUCTION_PLAN_NOT_SHADOW_READY");
  }
  for (const problem of input.production_plan.blocking_reasons) {
    // The production planner's blocking reasons are authoritative even if
    // a contradictory ready flag slips through. Never downgrade to warnings.
    reasons.add("PRODUCTION_MOTOR:" + problem);
    warnings.add("PRODUCTION_MOTOR:" + problem);
  }
  const seenIndices = new Set<number>();
  for (const source of sources) {
    if (!Number.isInteger(source.item_index) || seenIndices.has(source.item_index)) {
      reasons.add("INVALID_OR_DUPLICATE_ITEM_INDEX:" + source.item_index);
    }
    seenIndices.add(source.item_index);
    // Sold menu items are countable portions, unlike fractional resource usages.
    if (!clean(source.product_name) || !Number.isSafeInteger(source.quantity) ||
        source.quantity <= 0 || !Array.isArray(source.observations)) {
      reasons.add("INVALID_SOURCE_ITEM:" + source.item_index);
    }
  }
  const provenSold = evidenceUsages(input.resource_projection.usages, "MENU_ITEM", "ORDER_SOURCE_PROVEN");
  const projectedByCode = new Map<string, number>();
  for (const usage of provenSold) {
    const key = clean(usage.source_item_code) || "NAME:" + canon(usage.source_item_name);
    projectedByCode.set(key, (projectedByCode.get(key) ?? 0) + usage.quantity);
  }
  const sourcesByCode = new Map<string, number>();
  for (const source of sources) {
    const key = clean(source.product_code) || "NAME:" + canon(source.product_name);
    sourcesByCode.set(key, (sourcesByCode.get(key) ?? 0) + source.quantity);
  }
  for (const [key, quantity] of sourcesByCode) {
    if (projectedByCode.get(key) !== quantity) reasons.add("SOLD_ITEM_MISMATCH:" + key);
  }
  for (const key of projectedByCode.keys()) {
    if (!sourcesByCode.has(key)) reasons.add("MISSING_SOURCE_ITEM:" + key);
  }
  if (input.revision && (!Number.isInteger(input.revision.number) || input.revision.number < 1 ||
                         !clean(input.revision.source_ref))) {
    reasons.add("INVALID_ORDER_REVISION");
  }

  const production: ProductionTicketV45[] = input.production_plan.print_intents.map((intent) => {
    const localReasons = new Set<string>();
    const boxes = new Map<string, TicketBoxV45>();
    const sourceLinesByGroup = new Map<string, PlannedProductionLine[]>();
    const station = intent.printer.printer_name;
    const needed = input.kitchen_needs_by_fingerprint?.[intent.intent_fingerprint];
    if (!needed) warnings.add("KITCHEN_PROJECTION_NOT_ATTACHED:" + station);
    if (needed) for (const issue of needed.blocking_reasons) localReasons.add("KITCHEN_MOTOR:" + issue);
    for (const line of intent.lines) {
      const source = sources.find((s) => s.item_index === line.item_index);
      if (!source || canon(source.product_name) !== canon(line.product_name) ||
          source.quantity !== line.quantity ||
          (source.product_code && line.product_code && source.product_code !== line.product_code)) {
        localReasons.add("PRODUCTION_SOURCE_MISMATCH:" + line.item_index);
      }
      const chosen = source ?? {
        item_index: line.item_index,
        product_code: line.product_code,
        product_name: line.product_name,
        quantity: line.quantity,
        observations: line.item_observations,
      };
      const rendered = itemFromSource(chosen, aliases, localReasons);
      rendered.observations = line.item_observations.map((o) => clean(o).toLocaleUpperCase("pt-BR")).filter(Boolean);
      rendered.finishing = finishLines(line, station, rules, localReasons);
      rendered.kitchen_dependencies = dependencies(line, needed, localReasons);
      const group = clean(line.mount_group_id) || "UNASSIGNED:" + line.item_index;
      const priorLines = sourceLinesByGroup.get(group) ?? [];
      priorLines.push(line);
      sourceLinesByGroup.set(group, priorLines);
      let bx = boxes.get(group);
      if (!bx) {
        const model = boxModel(line.box_label);
        bx = {
          position: "C" + (boxes.size + 1),
          model,
          status: "UNKNOWN", // A numeric label alone is not packaging evidence.
          items: [],
          operator_field: "Op. ________",
        };
        boxes.set(group, bx);
      } else if (bx.model !== boxModel(line.box_label)) {
        localReasons.add("STATION_MOUNT_GROUP_BOX_CONFLICT:" + group);
        bx.status = "UNKNOWN";
        bx.model = null;
      }
      bx.items.push(rendered);
    }
    // Proven source-based packing allocation is required; the station label
    // alone does not establish which item belongs in a physical box.
    const signature = (items: Array<{ name: string; quantity: number }>): string =>
      items.map((x) => canon(x.name) + "|" + x.quantity).sort().join(";");
    for (const [groupId, box] of boxes) {
      const stationLines = sourceLinesByGroup.get(groupId) ?? [];
      const wanted = signature(stationLines.map((x) => ({ name: x.product_name, quantity: x.quantity })));
      const candidates = (input.packaging_plan?.groups ?? []).filter(
        (g) => Number.isInteger(g.boxes) && (g.boxes ?? 0) >= 1 &&
               PROVEN_BOX_STATUS.has(g.status) &&
               boxModel(g.box) === box.model && Array.isArray(g.products) &&
               signature(g.products) === wanted,
      );
      const stationSources = stationLines
        .map((line) => sources.find((s) => s.item_index === line.item_index))
        .filter((value): value is SourceOrderItemV45 => value !== undefined);
      const rolesProven = stationSources.length === stationLines.length &&
        stationSources.every((s) => s.packaging_role === "CLOSED_COMBO" || s.packaging_role === "OTHER");
      const mixedClosedCombo = stationSources.length > 1 &&
        stationSources.some((s) => s.packaging_role === "CLOSED_COMBO");
      const candidate = candidates.length === 1 ? candidates[0] : null;
      const repeatedClosedCombo =
        stationSources.length === 1 &&
        stationSources[0].packaging_role === "CLOSED_COMBO" &&
        (candidate?.boxes ?? 0) === stationSources[0].quantity &&
        stationSources[0].quantity > 1;
      const eligibleOneBox = candidate?.boxes === 1 &&
        !(stationSources.length === 1 && stationSources[0].packaging_role === "CLOSED_COMBO" &&
          stationSources[0].quantity > 1);
      if (box.model !== null && candidate && rolesProven && !mixedClosedCombo &&
          (eligibleOneBox || repeatedClosedCombo)) {
        box.status = "PROVEN";
        if (repeatedClosedCombo) box.physical_box_count = candidate.boxes ?? undefined;
      } else {
        box.model = null;
        localReasons.add(mixedClosedCombo
          ? "CLOSED_COMBO_CANNOT_SHARE_BOX:" + groupId
          : "STATION_BOX_ALLOCATION_NOT_PROVEN:" + groupId);
      }
    }
    for (const r of localReasons) warnings.add("STATION:" + station + ":" + r);
    const values = [...boxes.values()];
    return {
      station,
      fingerprint: intent.intent_fingerprint,
      identifiers: {
        ifood: intent.identifiers.ifood_sequence,
        teknisa: intent.identifiers.teknisa_sequence,
        tata: intent.identifiers.tata_sequence,
        hour: intent.identifiers.order_time,
      },
      boxes: values.filter((box) => box.status === "PROVEN"),
      items_without_proven_box: values.filter((box) => box.status !== "PROVEN").flatMap((box) => box.items),
      warnings: allReasons(localReasons),
      ready_for_semantic_preview: localReasons.size === 0,
    };
  });
  // Conference: the packing engine is the ONLY source of physical box assignment.
  const remaining = new Map<number, SourceOrderItemV45>(sources.map((s) => [s.item_index, s]));
  const conferenceBoxes: TicketBoxV45[] = [];
  if (!input.packaging_plan) {
    warnings.add("PACKAGING_PLAN_MISSING");
  } else {
    for (const [index, group] of input.packaging_plan.groups.entries()) {
      const model = boxModel(group.box);
      const proved = model !== null && Number.isInteger(group.boxes) && (group.boxes ?? 0) >= 1 &&
                     PROVEN_BOX_STATUS.has(group.status) &&
                     Array.isArray(group.products) && group.products.length > 0;
      if (!proved) {
        warnings.add("BOX_GROUP_NOT_PROVEN_OR_NOT_ALLOCATED:" + index);
        continue;
      }
      const matched: SourceOrderItemV45[] = [];
      const reserved = new Set<number>();
      let ambiguous = false;
      for (const product of group.products ?? []) {
        const candidates = [...remaining.values()].filter((s) =>
          canon(s.product_name) === canon(product.name) && s.quantity === product.quantity &&
          !reserved.has(s.item_index));
        if (candidates.length !== 1) {
          ambiguous = true;
          warnings.add("AMBIGUOUS_OR_MISSING_BOX_ITEM:" + index + ":" + canon(product.name));
          break;
        }
        matched.push(candidates[0]);
        reserved.add(candidates[0].item_index);
      }
      if (ambiguous || matched.length === 0) continue;
      if (matched.some((s) => s.packaging_role !== "CLOSED_COMBO" && s.packaging_role !== "OTHER")) {
        warnings.add("PACKAGING_ROLE_NOT_CONFIRMED:" + index);
        continue;
      }
      if (matched.some((s) => s.packaging_role === "CLOSED_COMBO") && matched.length > 1) {
        warnings.add("CLOSED_COMBO_CANNOT_SHARE_BOX:" + index);
        continue;
      }
      // One verified physical box per unit of a repeated CLOSED_COMBO,
      // otherwise physical contents cannot be derived from aggregate counts.
      const repeatsCombo = matched.length === 1 &&
        matched[0].packaging_role === "CLOSED_COMBO" &&
        matched[0].quantity === group.boxes;
      const singleBoxAllowed = group.boxes === 1 &&
        !matched.some((s) => s.packaging_role === "CLOSED_COMBO" && s.quantity > 1);
      if (!singleBoxAllowed && !repeatsCombo) {
        warnings.add("PER_BOX_ITEM_ALLOCATION_UNKNOWN:" + index);
        continue;
      }
      const physicalCount = repeatsCombo ? (group.boxes ?? 1) : 1;
      for (let offset = 0; offset < physicalCount; offset++) {
        const items = repeatsCombo
          ? [{ ...itemFromSource(matched[0], aliases, reasons), quantity: 1 }]
          : matched.map((s) => itemFromSource(s, aliases, reasons));
        conferenceBoxes.push({
          position: "C" + (conferenceBoxes.length + 1),
          model,
          status: "PROVEN",
          items,
          operator_field: "Op. ________",
        });
      }
      for (const source of matched) remaining.delete(source.item_index);
    }
  }
  if (remaining.size) warnings.add("UNALLOCATED_ITEMS_REQUIRE_MANUAL_PACKING_REVIEW");
  const bags = aggregate(evidenceUsages(input.resource_projection.usages, "BAG", "PACKAGING_RULE_FACT"));
  const kits = aggregate(evidenceUsages(input.resource_projection.usages, "KIT", "KIT_RULE_FACT"));
  const accompanimentMap = new Map<"GARI" | "WASABI" | "TARE", number>();
  for (const complement of evidenceUsages(input.resource_projection.usages, "COMPLEMENT", "HUMAN_CONFIRMED")) {
    const name = canon(complement.label);
    if (name !== "GARI" && name !== "WASABI" && name !== "TARE") continue;
    accompanimentMap.set(name, (accompanimentMap.get(name) ?? 0) + complement.quantity);
  }
  if (!bags.length) warnings.add("BAG_SIZE_OR_COUNT_NOT_PROVEN");
  if (input.packaging_plan?.has_unknown) warnings.add("PACKAGING_ENGINE_UNKNOWN");
  for (const unknown of input.resource_projection.unknowns) warnings.add("RESOURCE_UNKNOWN:" + unknown);
  const unallocated = [...remaining.values()].map((s) => itemFromSource(s, aliases, reasons));
  for (const issue of reasons) warnings.add("DATA_INTEGRITY:" + issue);
  const distinctIdentifiers = new Map<string, ProductionTicketV45["identifiers"]>();
  for (const station of production) {
    const id = station.identifiers;
    distinctIdentifiers.set([id.ifood, id.teknisa, id.tata, id.hour ?? ""].join("|"), id);
  }
  if (distinctIdentifiers.size > 1) reasons.add("PRODUCTION_IDENTIFIER_MISMATCH");
  const conferenceIdentifiers = distinctIdentifiers.size === 1
    ? [...distinctIdentifiers.values()][0]
    : null;
  // Conference needs an evidenced packaging plan and full allocation.
  // A readable fallback trace is diagnostic, not semantic approval.
  const conferenceReady = reasons.size === 0 && input.packaging_plan !== null &&
    input.packaging_plan.has_unknown === false && remaining.size === 0;
  const conference: ConferenceTicketV45 = {
    order_id: input.order_id,
    identifiers: conferenceIdentifiers,
    revision: input.revision?.number ?? null,
    boxes: conferenceBoxes,
    items_without_proven_box: unallocated,
    bags,
    kits,
    accompaniments: [...accompanimentMap].map(([label, quantity]) => ({ label, quantity })),
    warnings: allReasons(warnings),
    ready_for_semantic_preview: conferenceReady,
  };
  const allReady = conferenceReady && production.every((t) => t.ready_for_semantic_preview);
  return {
    schema: "deliveryos.operational-tickets.v45.shadow.v1",
    production,
    conference,
    blocking_reasons: allReasons(reasons),
    ready_for_semantic_preview: allReady,
    ready_for_automatic_operational_print: false,
    effects: { print: false, spooler_write: false, odhen_write: false, stock_write: false },
  };
}

/**
 * Automatic integration seam: invokes the existing resource/packaging motor
 * before projecting both tickets. It is NOT an order listener or printer hook.
 */
export interface OperationalTicketsFromMotorsInputV45
  extends Omit<OperationalTicketsInputV45, "resource_projection" | "packaging_plan"> {
  resource_input: OrderResourceProjectionInput;
}

export function projectOperationalTicketsFromMotorsV45(
  input: OperationalTicketsFromMotorsInputV45,
): OperationalTicketsResultV45 {
  const { resource_input, ...context } = input;
  const resource_projection = projectOrderResources(resource_input);
  return projectOperationalTicketsV45({
    ...context,
    resource_projection,
    packaging_plan: resource_input.packaging ?? null,
  });
}
