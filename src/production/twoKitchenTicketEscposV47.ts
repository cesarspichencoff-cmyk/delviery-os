import { OfflinePrinter, renderProductionTicketProofV46, type TicketEscPosProofV46 } from "./operationalTicketEscposV46";
import type { KitchenSplitV47, KitchenPrepV47 } from "./twoKitchenTicketsV47";

/**
 * Two distinct offline ESC/POS proof jobs. Neither invokes a printer, spooler,
 * network, driver, cut, and neither promotes a partial rule to a real command.
 */
function kitchenPrepProof(prep: KitchenPrepV47): TicketEscPosProofV46 {
  const p = new OfflinePrinter();
  p.font("B"); p.bold(true);
  p.line("TESTE - NAO PRODUZIR", "BANNER");
  p.line("COZINHA - HOT / EBITEN / SHISO", "KITCHEN_COMPONENTS");
  p.metadata(prep.identifiers);
  p.line("--------------------------------", "SEPARATOR");
  for (const task of prep.tasks) {
    p.font("B"); p.bold(true); p.heightDouble(true);
    p.line(String(task.quantity) + "  " + task.kind, "COMPONENT");
    p.heightDouble(false); p.bold(false);
  }
  if (prep.status !== "PROVEN_COMPLETE") {
    p.line("REGRAS PARCIAIS - CONFERIR", "INCOMPLETE_RULES");
    p.blockers.add("KITCHEN_COMPONENT_RULE_COVERAGE_NOT_PROVEN");
  }
  for(const reason of prep.blocking_reasons) p.blockers.add(reason);
  p.ending(prep.identifiers.tata);
  return p.result("COZINHA_COMPONENTES");
}
export function renderTwoKitchenProofsV47(split: KitchenSplitV47): {
  components: TicketEscPosProofV46 | null;
  dishes: TicketEscPosProofV46 | null;
  effects: {print:false;spooler_write:false;odhen_write:false;cut:false};
} {
  const components = split.components ? kitchenPrepProof(split.components) : null;
  let dishes: TicketEscPosProofV46 | null = null;
  if (split.dishes) {
    // Pratos retain their actual kitchen routing, boxes, quantity and
    // observations. HOT/EBITEN/SHISO instructions are NEVER copied onto this
    // paper because they have their own separate work channel.
    const source = split.dishes.source;
    const sanitized = {
      ...source,station:"COZINHA - PRATOS",
      boxes:source.boxes.map(box=>({...box,items:box.items.map(item=>({
        ...item,kitchen_dependencies:[],
      }))})),
      items_without_proven_box:source.items_without_proven_box.map(item=>({
        ...item,kitchen_dependencies:[],
      })),
    };
    const candidate = renderProductionTicketProofV46(sanitized);
    if (split.review_reasons.some(issue => issue === "MULTIPLE_KITCHEN_PRODUCTION_INTENTS" ||
                                           issue === "ORDER_IDENTIFIERS_NOT_UNIQUE_OR_MISSING")) {
      dishes = {
        ...candidate,ready_for_offline_preview:false,bytes:[],byte_count:0,
        blocking_reasons:[...candidate.blocking_reasons,"KITCHEN_DISH_IDENTITY_OR_ROUTE_AMBIGUOUS"],
      };
    } else dishes = candidate;
  }
  return {
    components,dishes,
    effects:{print:false,spooler_write:false,odhen_write:false,cut:false},
  };
}
