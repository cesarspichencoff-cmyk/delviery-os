import { renderConferenceTicketProofV46,renderProductionTicketProofV46,type TicketEscPosProofV46 } from "./operationalTicketEscposV46";
import { renderTwoKitchenProofsV47 } from "./twoKitchenTicketEscposV47";
import type { OperationalTicketsResultV45 } from "./operationalTicketsV45";
import { componentProjectionBindingV512, type KitchenSplitV47 } from "./twoKitchenTicketsV47";

export interface KitchenSeparatedJobV47 {
  channel: "OTHER_PRODUCTION" | "KITCHEN_COMPONENTS" | "KITCHEN_DISHES" | "CONFERENCE";
  proof: TicketEscPosProofV46;
}
export interface KitchenSeparatedBundleV47 {
  schema: "deliveryos.kitchen-separated-offline-bundle.v47";
  jobs: KitchenSeparatedJobV47[];
  blocked_proofs: KitchenSeparatedJobV47[];
  review_reasons: string[];
  ready_for_automatic_operational_print: false;
  effects:{print:false;spooler_write:false;odhen_write:false;stock_write:false};
}
function kitchenStation(name: string): boolean {
  return String(name).normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .trim().toUpperCase() === "COZINHA";
}
/**
 * All four identifiers must match the order conference projection for
 * station-level offline eligibility. Consistency check only, no source
 * authentication and no permission to print.
 */
function matchingOrderIds(
  a: OperationalTicketsResultV45["production"][number]["identifiers"] | null | undefined,
  b: OperationalTicketsResultV45["production"][number]["identifiers"] | null | undefined,
): boolean {
  return !!a && !!b &&
    a.ifood === b.ifood && a.teknisa === b.teknisa &&
    a.tata === b.tata && a.hour === b.hour;
}
/**
 * Replaces the former unsplit COZINHA output in the OFFLINE export.
 * It NEVER adds a third kitchen paper or routes jobs to a real device.
 */
export function buildKitchenSeparatedBundleV47(
  tickets: OperationalTicketsResultV45,
  split: KitchenSplitV47,
): KitchenSeparatedBundleV47 {
  const jobs: KitchenSeparatedJobV47[] = [];
  const blocked_proofs: KitchenSeparatedJobV47[] = [];
  // An eligible offline export needs BOTH printable geometry and an evidenced
  // semantic source. Keep text_trace for diagnosis, but never export bytes for
  // a semantically blocked ticket (and never open a physical printer).
  const globalReasons = Array.isArray(tickets.blocking_reasons)
    ? tickets.blocking_reasons.map(reason => "GLOBAL_SEMANTIC_BLOCK:" + reason)
    : ["GLOBAL_SEMANTIC_BLOCKERS_MISSING"];
  // The global aggregate can be false for a single blocked station; that
  // condition must not hide other individually proven kitchen work.
  if (globalReasons.length === 0 && tickets.ready_for_semantic_preview !== true &&
      tickets.production.every(p => p.ready_for_semantic_preview === true) &&
      tickets.conference.ready_for_semantic_preview === true) {
    globalReasons.push("GLOBAL_SEMANTIC_STATUS_INCONSISTENT");
  }
  function append(
    channel: KitchenSeparatedJobV47["channel"],
    proof: TicketEscPosProofV46 | null,
    localReasons: string[] = [],
  ): void {
    if (!proof) return;
    const reasons = [...new Set([...globalReasons,...localReasons])];
    const gated = reasons.length ? {
      ...proof,
      ready_for_offline_preview: false,
      bytes: [],
      byte_count: 0,
      blocking_reasons: [...new Set([...proof.blocking_reasons,...reasons])].sort(),
    } : proof;
    const item = {channel,proof:gated};
    if (gated.ready_for_offline_preview && gated.byte_count > 0) jobs.push(item);
    else blocked_proofs.push(item);
  }
  // Never emit the old COZINHA source print after implementing the split.
  for(const production of tickets.production) {
    if(kitchenStation(production.station))continue;
    append("OTHER_PRODUCTION",renderProductionTicketProofV46(production),[
      ...(production.ready_for_semantic_preview === true
        ? [] : ["STATION_SEMANTIC_NOT_READY:" + production.station]),
      ...(matchingOrderIds(production.identifiers,tickets.conference.identifiers)
        ? [] : ["STATION_ORDER_IDENTIFIERS_MISMATCH"]),
    ]);
  }
  const kitchen=renderTwoKitchenProofsV47(split);
  // The kitchen split is supplied separately from the order projection.
  // Verify its source is exactly the evidenced source of THIS order before
  // accepting its offline bytes, so a different order cannot be substituted.
  const kitchenSources=tickets.production.filter(p=>kitchenStation(p.station));
  const expectedKitchen=kitchenSources.length===1?kitchenSources[0]:null;
  const splitDish=split.dishes?.source;
  const matchingKitchenSource=!!splitDish && !!expectedKitchen &&
    splitDish.station===expectedKitchen.station &&
    splitDish.fingerprint===expectedKitchen.fingerprint &&
    splitDish.identifiers.ifood===expectedKitchen.identifiers.ifood &&
    splitDish.identifiers.teknisa===expectedKitchen.identifiers.teknisa &&
    splitDish.identifiers.tata===expectedKitchen.identifiers.tata &&
    splitDish.identifiers.hour===expectedKitchen.identifiers.hour &&
    JSON.stringify(splitDish.boxes)===JSON.stringify(expectedKitchen.boxes) &&
    JSON.stringify(splitDish.items_without_proven_box)===
      JSON.stringify(expectedKitchen.items_without_proven_box);
  // Component prep has no source fingerprint in V4.7. At minimum its
  // identifiers must agree with every production intent and the conference
  // of this order. Absence or conflict fails closed.
  const componentIds=split.components?.identifiers;
  const componentMatchesOrder=!!componentIds && tickets.production.length>0 &&
    tickets.production.every(p=>matchingOrderIds(componentIds,p.identifiers)) &&
    matchingOrderIds(componentIds,tickets.conference.identifiers);
  // An identifier match alone does not prove that the independently provided
  // kitchen component preview belongs to this exact order projection.
  // Missing/changed bindings fail closed ONLY for that component channel.
  const componentMatchesProjection=!!split.components &&
    typeof split.components.source_projection_binding_v512==="string" &&
    split.components.source_projection_binding_v512===
      componentProjectionBindingV512(tickets,split.components);
  append("KITCHEN_COMPONENTS",kitchen.components,[
    ...(split.components && !componentMatchesOrder
      ? ["KITCHEN_COMPONENT_IDENTIFIERS_MISMATCH"] : []),
    ...(split.components && !componentMatchesProjection
      ? ["KITCHEN_COMPONENT_PROJECTION_BINDING_MISMATCH"] : []),
    // An unchanged fingerprint alone cannot overrule a withdrawn approval.
    // The independent split-level decision must still be valid at export.
    ...(split.components && split.ready_for_complete_components !== true
      ? ["KITCHEN_COMPONENT_SPLIT_NOT_READY"] : []),
    ...(split.components && split.review_reasons.length > 0
      ? ["KITCHEN_COMPONENT_SPLIT_REVIEW_BLOCKERS"] : []),
    ...(split.components && (split.components.status !== "PROVEN_COMPLETE" ||
                              split.components.blocking_reasons.length > 0)
      ? ["KITCHEN_COMPONENT_NOT_PROVEN_COMPLETE"] : []),
  ]);
  append("KITCHEN_DISHES",kitchen.dishes, [
    ...(split.dishes && split.dishes.source.ready_for_semantic_preview !== true
      ? ["STATION_SEMANTIC_NOT_READY:" + split.dishes.source.station] : []),
    ...(split.dishes && !matchingKitchenSource ? ["KITCHEN_SPLIT_SOURCE_MISMATCH"] : []),
    ...(split.dishes && !matchingOrderIds(
      split.dishes.source.identifiers,tickets.conference.identifiers)
      ? ["KITCHEN_DISHES_ORDER_IDENTIFIERS_MISMATCH"] : []),
  ]);
  append("CONFERENCE",renderConferenceTicketProofV46(tickets.conference),
    tickets.conference.ready_for_semantic_preview === true ? [] : ["CONFERENCE_SEMANTIC_NOT_READY"]);
  const rawKitchenCount=tickets.production.filter(x=>kitchenStation(x.station)).length;
  // A blocked proof must be explainable from the bundle summary as well as
  // its per-proof diagnostics; channel qualification prevents ambiguity.
  const issues=[
    ...split.review_reasons,
    ...globalReasons,
    ...blocked_proofs.flatMap(({channel,proof}) =>
      proof.blocking_reasons.map(reason => channel + ":" + reason)),
  ];
  if(rawKitchenCount>1)issues.push("DUPLICATED_SOURCE_KITCHEN_INTENTS_NEED_RECONCILIATION");
  if(rawKitchenCount===1 && !split.dishes)issues.push("KITCHEN_SOURCE_WAS_NOT_REPLACED_BY_DISH_TICKET");
  return {schema:"deliveryos.kitchen-separated-offline-bundle.v47",jobs,
    blocked_proofs,review_reasons:[...new Set(issues)].sort(),
    ready_for_automatic_operational_print:false,
    effects:{print:false,spooler_write:false,odhen_write:false,stock_write:false}};
}
