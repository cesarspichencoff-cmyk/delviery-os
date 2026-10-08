import {
  splitTwoKitchenTicketsFromRulesV47,
  type KitchenSplitV47,
} from "./twoKitchenTicketsV47";
import type { KitchenDependencyRuleset } from "./kitchenDependencies";
import type { OperationalTicketsResultV45, SourceOrderItemV45 } from "./operationalTicketsV45";
import confirmedPolicy from "../../data/kitchen_sushi_quente_scope_v49.json";

/**
 * Human-approved CATEGORY SCOPE, never an implicit numeric yield.
 * Source routing must come from the current motor. The July catalogue is a
 * bounded audit/reference only and cannot prove a live item's current station.
 */
export interface ScopedSourceItemV49 extends SourceOrderItemV45 {
  current_praca?: string | null;
  current_praca_proof?: "CURRENT_MOTOR_PROVEN" | "UNKNOWN";
}
export interface HistoricalCatalogueItemV49 {
  id: string;
  nome: string;
  praca_principal?: string | null;
}
export type KitchenPrepKindV49 = "HOT" | "EBITEN" | "SHISO";
export interface KitchenScopeCandidateV49 {
  item_index: number;
  product_code: string | null;
  product_name: string;
  source_order_quantity: number;
  kitchen_kind: KitchenPrepKindV49;
  historical_catalogue_id: string | null;
  station_evidence: "CURRENT_MOTOR_PROVEN" | "HISTORICAL_REFERENCE_ONLY" | "UNVERIFIED";
  scope_status: "HUMAN_SCOPE_APPLIES" | "HISTORICAL_CANDIDATE" | "PENDING_STATION_PROOF";
  yield_per_sold_unit: number | null;
  requested_quantity: number | null;
  yield_evidence: "EXACT_HUMAN_CONFIRMED_RULE" | "NOT_CONFIRMED";
}
export interface KitchenSushiHotScopeV49 {
  schema: "deliveryos.kitchen-sushi-quente-scope-projection.v49";
  policy_status: string;
  station: "enrolados_quentes";
  confirmed_scope: string[];
  candidates: KitchenScopeCandidateV49[];
  required_reviews: string[];
  eligible_products_with_current_station: number;
  pending_factor_count: number;
  complete_quantity_coverage_proven: boolean;
  ready_for_automatic_operational_print: false;
  effects: {print:false; spooler_write:false; odhen_write:false; stock_write:false};
}
function norm(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toUpperCase().replace(/[^A-Z0-9]+/g," ").trim().replace(/\s+/g," ");
}
function kindsFromName(value: string): KitchenPrepKindV49[] {
  const words=new Set(norm(value).split(" ").filter(Boolean));
  const result: KitchenPrepKindV49[]=[];
  if(words.has("HOT"))result.push("HOT");
  if(words.has("EBITEN"))result.push("EBITEN");
  if(words.has("SHISO")||words.has("SHISSO"))result.push("SHISO");
  return result;
}
const VALID_PROOFS=new Set(["HUMAN_CONFIRMED"]);
function validQuantity(value: unknown): value is number {
  return typeof value==="number" && Number.isInteger(value) && value>=0;
}
/**
 * Classifies each sold product without inventing how many HOT/EBITEN/SHISO
 * preparations a portion actually consumes. One product may need >1 unit.
 *
 * Live routing wins over historical catalogue category.
 */
export function classifySushiHotPreparationsV49(
  orderItems: ScopedSourceItemV49[],
  catalogue: HistoricalCatalogueItemV49[],
  rules: KitchenDependencyRuleset,
): KitchenSushiHotScopeV49 {
  const issues=new Set<string>();
  const output:KitchenScopeCandidateV49[]=[];
  const byName=new Map<string,HistoricalCatalogueItemV49[]>();
  for(const product of catalogue){
    const key=norm(product.nome);
    if(!key)continue;
    const arr=byName.get(key)??[];
    arr.push(product);
    byName.set(key,arr);
  }
  const ruleByName=new Map<string,typeof rules.rules>();
  for(const rule of rules.rules){
    const key=norm(rule.canonical_item_name);
    const arr=ruleByName.get(key)??[];
    arr.push(rule);
    ruleByName.set(key,arr);
  }
  const indices=new Set<number>();
  for(const item of orderItems){
    if(!Number.isInteger(item.item_index)||indices.has(item.item_index)){
      issues.add("SOURCE_INDEX_NOT_UNIQUE_OR_INVALID:"+String(item.item_index));
    }
    indices.add(item.item_index);
    if(!Number.isInteger(item.quantity)||item.quantity<=0){
      issues.add("INVALID_SOLD_QUANTITY:"+item.item_index);
      continue;
    }
    const kinds=kindsFromName(item.product_name);
    if(kinds.length===0)continue;
    const exact=byName.get(norm(item.product_name))??[];
    if(exact.length>1)issues.add("AMBIGUOUS_CATALOGUE_IDENTITY:"+item.item_index);
    const historical=exact.length===1?exact[0]:null;
    const knownCurrent=item.current_praca_proof==="CURRENT_MOTOR_PROVEN" &&
      typeof item.current_praca==="string" && norm(item.current_praca).length>0;
    const currentlySushi=knownCurrent && norm(item.current_praca)==="ENROLADOS QUENTES";
    // A proven current route to another station overrides an old catalogue.
    if(knownCurrent&&!currentlySushi)continue;
    const historicalSushi=!!historical && norm(historical.praca_principal)==="ENROLADOS QUENTES";
    const evidence:KitchenScopeCandidateV49["station_evidence"] = currentlySushi
      ?"CURRENT_MOTOR_PROVEN":historicalSushi?"HISTORICAL_REFERENCE_ONLY":"UNVERIFIED";
    const status:KitchenScopeCandidateV49["scope_status"] = currentlySushi
      ?"HUMAN_SCOPE_APPLIES":historicalSushi?"HISTORICAL_CANDIDATE":"PENDING_STATION_PROOF";
    if(!currentlySushi)issues.add("CURRENT_SUSHI_QUENTE_STATION_NOT_PROVEN:"+item.item_index);
    for(const kind of kinds){
      const matchedRules=ruleByName.get(norm(item.product_name))??[];
      if(matchedRules.length>1)issues.add("DUPLICATE_DEPENDENCY_RULE:"+item.item_index);
      const rule=matchedRules.length===1&&VALID_PROOFS.has(matchedRules[0].proof)
        ?matchedRules[0]:null;
      const yieldValue=rule?.yields[kind];
      const yieldProven=rule!==null && validQuantity(yieldValue);
      if(!yieldProven)issues.add("PRODUCT_COMPONENT_FACTOR_NOT_CONFIRMED:"+item.item_index+":"+kind);
      output.push({
        item_index:item.item_index,
        product_code:item.product_code,
        product_name:item.product_name.toLocaleUpperCase("pt-BR"),
        source_order_quantity:item.quantity,
        kitchen_kind:kind,
        historical_catalogue_id:historical?.id??null,
        station_evidence:evidence,
        scope_status:status,
        yield_per_sold_unit:yieldProven?yieldValue:null,
        requested_quantity:yieldProven?yieldValue*item.quantity:null,
        yield_evidence:yieldProven?"EXACT_HUMAN_CONFIRMED_RULE":"NOT_CONFIRMED",
      });
    }
  }
  const keys=new Set(output.filter(x=>x.scope_status==="HUMAN_SCOPE_APPLIES")
    .map(x=>x.item_index));
  const scopeComplete=rules.coverage==="COMPLETE" &&
    rules.coverage_proof==="HUMAN_CONFIRMED" &&
    output.every(x=>x.scope_status==="HUMAN_SCOPE_APPLIES" && x.yield_per_sold_unit!==null) &&
    issues.size===0;
  return {
    schema:"deliveryos.kitchen-sushi-quente-scope-projection.v49",
    policy_status:confirmedPolicy.status,
    station:"enrolados_quentes",
    confirmed_scope:["HOT","EBITEN","SHISO"],
    candidates:output,
    required_reviews:[...issues].sort(),
    eligible_products_with_current_station:keys.size,
    pending_factor_count:output.filter(x=>x.yield_per_sold_unit===null).length,
    complete_quantity_coverage_proven:scopeComplete,
    ready_for_automatic_operational_print:false,
    effects:{print:false,spooler_write:false,odhen_write:false,stock_write:false},
  };
}
/** Integrates the approved scope with the EXISTING kitchen engine, never
 * mutating the engine's dependency rules or enabling physical printing. */
export function projectTwoKitchenTicketsScopedV49(
  orderItems:ScopedSourceItemV49[],
  catalogue:HistoricalCatalogueItemV49[],
  tickets:OperationalTicketsResultV45,
  existingHumanRules:KitchenDependencyRuleset,
):{
  scope:KitchenSushiHotScopeV49;
  split:KitchenSplitV47;
  print_authorized:false;
}{
  const scope=classifySushiHotPreparationsV49(orderItems,catalogue,existingHumanRules);
  const original=splitTwoKitchenTicketsFromRulesV47(orderItems,tickets,existingHumanRules);
  const reviews=[...new Set([...original.review_reasons,...scope.required_reviews])].sort();
  const split:KitchenSplitV47={
    ...original,
    review_reasons:reviews,
    ready_for_complete_components:original.ready_for_complete_components && scope.complete_quantity_coverage_proven,
    ready_for_automatic_operational_print:false,
    components:original.components?{
      ...original.components,
      status:original.ready_for_complete_components && scope.complete_quantity_coverage_proven
        ?"PROVEN_COMPLETE":"PARTIAL_REVIEW_REQUIRED",
      blocking_reasons:reviews,
    }:null,
  };
  return {scope,split,print_authorized:false};
}
