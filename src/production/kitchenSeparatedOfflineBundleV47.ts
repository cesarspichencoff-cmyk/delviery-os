import { renderConferenceTicketProofV46,renderProductionTicketProofV46,type TicketEscPosProofV46 } from "./operationalTicketEscposV46";
import { renderTwoKitchenProofsV47 } from "./twoKitchenTicketEscposV47";
import type { OperationalTicketsResultV45 } from "./operationalTicketsV45";
import type { KitchenSplitV47 } from "./twoKitchenTicketsV47";

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
 * Replaces the former unsplit COZINHA output in the OFFLINE export.
 * It NEVER adds a third kitchen paper or routes jobs to a real device.
 */
export function buildKitchenSeparatedBundleV47(
  tickets: OperationalTicketsResultV45,
  split: KitchenSplitV47,
): KitchenSeparatedBundleV47 {
  const jobs: KitchenSeparatedJobV47[] = [];
  const blocked_proofs: KitchenSeparatedJobV47[] = [];
  function append(channel: KitchenSeparatedJobV47["channel"],proof:TicketEscPosProofV46|null):void {
    if(!proof)return;
    const item={channel,proof};
    if(proof.ready_for_offline_preview && proof.byte_count>0)jobs.push(item);
    else blocked_proofs.push(item);
  }
  // Never emit the old COZINHA source print after implementing the split.
  for(const production of tickets.production) {
    if(kitchenStation(production.station))continue;
    append("OTHER_PRODUCTION",renderProductionTicketProofV46(production));
  }
  const kitchen=renderTwoKitchenProofsV47(split);
  append("KITCHEN_COMPONENTS",kitchen.components);
  append("KITCHEN_DISHES",kitchen.dishes);
  append("CONFERENCE",renderConferenceTicketProofV46(tickets.conference));
  const rawKitchenCount=tickets.production.filter(x=>kitchenStation(x.station)).length;
  const issues=[...split.review_reasons];
  if(rawKitchenCount>1)issues.push("DUPLICATED_SOURCE_KITCHEN_INTENTS_NEED_RECONCILIATION");
  if(rawKitchenCount===1 && !split.dishes)issues.push("KITCHEN_SOURCE_WAS_NOT_REPLACED_BY_DISH_TICKET");
  return {schema:"deliveryos.kitchen-separated-offline-bundle.v47",jobs,
    blocked_proofs,review_reasons:[...new Set(issues)].sort(),
    ready_for_automatic_operational_print:false,
    effects:{print:false,spooler_write:false,odhen_write:false,stock_write:false}};
}
