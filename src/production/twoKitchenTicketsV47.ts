import { createHash } from "node:crypto";
import { projectKitchenNeeds, type KitchenNeedProjection, type KitchenDependencyRuleset } from "./kitchenDependencies";
import type { SourceOrderItemV45, OperationalTicketsResultV45, ProductionTicketV45 } from "./operationalTicketsV45";

export type KitchenKindV47 = "HOT" | "EBITEN" | "SHISO";
export interface KitchenPrepV47 {
  channel: "KITCHEN_COMPONENTS";
  title: "COZINHA - HOT / EBITEN / SHISO";
  identifiers: ProductionTicketV45["identifiers"];
  tasks: Array<{ kind: KitchenKindV47; quantity: number; originating_products: string[] }>;
  status: "PROVEN_COMPLETE" | "PARTIAL_REVIEW_REQUIRED";
  blocking_reasons: string[];
  /** Consistency binding, not an authenticated signature or proof of live order origin. */
  source_projection_binding_v512?: string;
}
export interface KitchenDishesV47 {
  channel: "KITCHEN_DISHES";
  title: "COZINHA - PRATOS";
  source: ProductionTicketV45;
}
export interface KitchenSplitV47 {
  schema: "deliveryos.kitchen-two-tickets.v47.shadow.v1";
  components: KitchenPrepV47 | null;
  dishes: KitchenDishesV47 | null;
  review_reasons: string[];
  ready_for_complete_components: boolean;
  ready_for_automatic_operational_print: false;
  effects: { print:false; spooler_write:false; odhen_write:false; stock_write:false };
}
/**
 * V5.12: associate a synthetic components preview with the exact projection
 * and task payload from which it was built. This checks consistency across
 * separately passed values; it is NOT source authentication, a secret MAC,
 * or permission to print. Remains purely offline.
 */
function stableProjection(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableProjection);
  if (value && typeof value === "object") {
    const record=value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort()
      .map(k=>[k,stableProjection(record[k])]));
  }
  return value;
}
export function componentProjectionBindingV512(
  tickets: OperationalTicketsResultV45,
  component: Pick<KitchenPrepV47, "identifiers" | "tasks" | "status" | "blocking_reasons">,
): string {
  const payload=stableProjection({
    schema:"deliveryos.kitchen-component-projection-binding.v512",
    tickets,component:{
      identifiers:component.identifiers,
      tasks:component.tasks,
      status:component.status,
      blocking_reasons:component.blocking_reasons,
    },
  });
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
const kinds: KitchenKindV47[] = ["HOT", "EBITEN", "SHISO"];
function clean(s: string): string { return String(s).trim().replace(/\s+/g," "); }
function canon(s: string): string {
  return clean(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
}
function key(name: string, qty: number): string { return canon(name)+"|"+qty; }
function idKey(ids: ProductionTicketV45["identifiers"]): string {
  return [ids.ifood,ids.teknisa,ids.tata,ids.hour??""].join("|");
}
/**
 * Pure SHADOW routing. Two disjoint *work types* for one kitchen:
 * - components: only HOT / EBITEN / SHISO, computed ONCE from order-wide source
 *   through the existing human-rule kitchenDependencies engine;
 * - dishes: only menu lines already explicitly routed to station COZINHA.
 * Never infer kitchen work from a product name or copy sushi print intents here.
 */
export function splitTwoKitchenTicketsV47(
  source: SourceOrderItemV45[],
  tickets: OperationalTicketsResultV45,
  needs: KitchenNeedProjection | null,
): KitchenSplitV47 {
  const issues = new Set<string>();
  const kitchen = tickets.production.filter(t=>canon(t.station)==="COZINHA");
  if(kitchen.length>1) issues.add("MULTIPLE_KITCHEN_PRODUCTION_INTENTS");
  const kitchenIntent = kitchen.length===1?kitchen[0]:null;
  const hasDishes = !!kitchenIntent && (kitchenIntent.boxes.some(b=>b.items.length>0) ||
                                       kitchenIntent.items_without_proven_box.length>0);
  const dishes: KitchenDishesV47|null=hasDishes&&kitchenIntent?
    {channel:"KITCHEN_DISHES",title:"COZINHA - PRATOS",source:kitchenIntent}:null;
  const ids=new Map<string,ProductionTicketV45["identifiers"]>();
  for(const intent of tickets.production) ids.set(idKey(intent.identifiers),intent.identifiers);
  if(ids.size!==1) issues.add("ORDER_IDENTIFIERS_NOT_UNIQUE_OR_MISSING");
  const id=ids.size===1?[...ids.values()][0]:null;
  const seen=new Set<number>();
  for(const s of source){
    if(!Number.isInteger(s.item_index)||seen.has(s.item_index)) issues.add("DUPLICATE_ITEM_INDEX");
    seen.add(s.item_index);
  }
  if(!needs) issues.add("KITCHEN_NEEDS_MISSING");
  else {
    for(const reason of needs.blocking_reasons)issues.add("KITCHEN_MOTOR:"+reason);
    if(!needs.ready_for_complete_total)issues.add("DEPENDENCY_RULES_NOT_COMPLETE");
    if(needs.unmatched_items.length)issues.add("DEPENDENCY_RULES_UNMATCHED_ITEMS");
    const pool=new Map<string,number>();
    for(const item of source){
      const k=key(item.product_name,item.quantity);
      pool.set(k,(pool.get(k)??0)+1);
    }
    const sum={hot:0,ebiten:0,shiso:0};
    for(const c of needs.contributions){
      const k=key(c.item_name,c.item_quantity);
      if(!(pool.get(k)??0))issues.add("DEPENDENCY_CONTRIBUTION_NOT_IN_SOURCE");
      else pool.set(k,(pool.get(k)??0)-1);
      for(const kind of kinds){
        const k2=kind.toLowerCase() as "hot"|"ebiten"|"shiso";
        if(!Number.isInteger(c[k2])||c[k2]<0) issues.add("INVALID_DEPENDENCY_QUANTITY:"+kind);
        else sum[k2]+=c[k2];
      }
    }
    for(const kind of kinds){
      const k=kind.toLowerCase() as "hot"|"ebiten"|"shiso";
      if(sum[k]!==needs.totals[k])issues.add("TOTAL_MISMATCH:"+kind);
    }
  }
  const tasks: KitchenPrepV47["tasks"]=needs?kinds.map(kind=>{
    const field=kind.toLowerCase() as "hot"|"ebiten"|"shiso";
    return {
      kind,quantity:needs.totals[field],
      originating_products:needs.contributions.filter(c=>c[field]>0)
         .map(c=>canon(c.item_name)),
    };
  }).filter(t=>t.quantity>0):[];
  const ready=!!needs&&needs.ready_for_complete_total&&needs.unmatched_items.length===0 &&
    issues.size===0&&!!id;
  if(tasks.length&&!id)issues.add("COMPONENT_TICKET_IDENTIFIERS_UNKNOWN");
  const components: KitchenPrepV47|null=tasks.length&&id?{
    channel:"KITCHEN_COMPONENTS",title:"COZINHA - HOT / EBITEN / SHISO",
    identifiers:id,tasks,
    status:ready?"PROVEN_COMPLETE":"PARTIAL_REVIEW_REQUIRED",
    blocking_reasons:[...issues].sort(),
  }:null;
  if (components) {
    components.source_projection_binding_v512=componentProjectionBindingV512(tickets,components);
  }
  return {
    schema:"deliveryos.kitchen-two-tickets.v47.shadow.v1",
    components,dishes,review_reasons:[...issues].sort(),
    ready_for_complete_components:ready,
    ready_for_automatic_operational_print:false,
    effects:{print:false,spooler_write:false,odhen_write:false,stock_write:false},
  };
}
export function splitTwoKitchenTicketsFromRulesV47(
  source: SourceOrderItemV45[],tickets: OperationalTicketsResultV45,
  rules: KitchenDependencyRuleset,
): KitchenSplitV47 {
  return splitTwoKitchenTicketsV47(source,tickets,
    projectKitchenNeeds(source.map(s=>({nome:s.product_name,quantidade:s.quantity})),rules));
}
