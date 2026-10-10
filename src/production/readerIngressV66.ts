import {joinDeliveryAndProduction, type DeliveryJoinProjection,
  type ProductionJoinProjection, type DeliveryProductionJoin} from "./deliveryProductionJoin";
import type {ProductionPrintPlan} from "./productionPrintPlan";
import type {SourceOrderItemV45,OperationalTicketsFromMotorsInputV45} from "./operationalTicketsV45";
import {projectTicketsFromCurrentPackagingV63,
  type MotorEntryV63,type MotorInterfaceV63,
  type BridgeDecisionV63} from "./currentPackagingBridgeV63";
import {pinnedUnifiedCoreKitRegistryV66} from "./pinnedUnifiedKitsV66";
import type {OperationalTicketsResultV45} from "./operationalTicketsV45";

const norm=(s:unknown)=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toUpperCase().replace(/[^A-Z0-9]+/g," ").trim().replace(/\s+/g," ");
const text=(s:unknown)=>String(s??"").trim();
export interface ProvenReaderProductV66 {
  item_index:number;
  product_code:string|null;
  product_name:string;
  quantity:number;
  classification:{station:string|null;family:string|null};
  packaging_role:"CLOSED_COMBO"|"OTHER"|"UNKNOWN";
  station_proof:"CURRENT_MOTOR_PROVEN"|"CURRENT_NON_PRODUCTION_FAMILY_PROVEN"|"UNKNOWN";
  proof:"CURRENT_PRODUCT_IDENTITY_CROSSWALK_PROVEN"|"UNKNOWN";
  source_ref:string;
}
export interface ReaderIngressV66 {
  status:"ALIGNED"|"BLOCKED";
  blockers:string[];
  input:OperationalTicketsFromMotorsInputV45|null;
  entries:MotorEntryV63[]|null;
  effects:{database_read:false;database_write:false;print:false;spooler:false;cutover:false};
}
const EFFECTS={database_read:false,database_write:false,print:false,spooler:false,cutover:false} as const;

/** Consumes a previously reconciled/sanitized order snapshot; never queries
 * SQL, reads services, allocates TATÁ sequence or launches a physical job.
 * Current product crosswalk is an explicit required input, not guessed names.
 */
export function compileJoinedReaderIngressV66(
 joined:DeliveryProductionJoin,
 printPlan:ProductionPrintPlan,
 identities:ProvenReaderProductV66[],
):ReaderIngressV66 {
 const blockers=new Set<string>();
 const reject=():ReaderIngressV66=>({status:"BLOCKED",blockers:[...blockers].sort(),
    input:null,entries:null,effects:EFFECTS});
 if(joined.schema!=="deliveryos.delivery-production-join.v1"||!joined.ready||
     joined.blocking_reasons.length)blockers.add("DELIVERY_PRODUCTION_JOIN_NOT_PROVEN");
 // Some archived print plans have order_id=null but each intent carries the
 // Teknisa identifier. This is valid only when ALL intents agree on that ID.
 if(!text(joined.ids.pedido_interno)||
    (text(printPlan.order_id) && joined.ids.pedido_interno!==printPlan.order_id)||
    (!text(printPlan.order_id) && (!printPlan.print_intents.length ||
      printPlan.print_intents.some(x=>x.identifiers.teknisa_sequence!==joined.ids.pedido_interno))))
   blockers.add("ORDER_JOIN_PRINT_PLAN_ID_MISMATCH");
 if(!printPlan.ready_for_shadow_payload||printPlan.blocking_reasons.length||
    !printPlan.print_intents.length)blockers.add("PRINT_PLAN_SHADOW_NOT_PROVEN");
 if(joined.order_observations.length)
   blockers.add("ORDER_LEVEL_OBSERVATIONS_REQUIRE_ITEM_RELEVANCE_PROOF");
 if(joined.items.length!==identities.length||!joined.items.length)
   blockers.add("IDENTITY_CROSSWALK_COVERAGE_INCOMPLETE");
 const byIndex=new Map<number,ProvenReaderProductV66>();
 for(const id of identities){
   if(!Number.isSafeInteger(id.item_index)||byIndex.has(id.item_index))
     blockers.add("IDENTITY_INDEX_DUPLICATE_OR_INVALID");
   byIndex.set(id.item_index,id);
 }
 const source:SourceOrderItemV45[]=[];
 const entries:MotorEntryV63[]=[];
 for(const item of joined.items){
   const id=byIndex.get(item.delivery_item_index);
   if(!id||id.proof!=="CURRENT_PRODUCT_IDENTITY_CROSSWALK_PROVEN"||
      !text(id.source_ref)||id.product_code!==item.codigo||
      norm(id.product_name)!==norm(item.nome)||id.quantity!==item.quantidade||
      !Number.isSafeInteger(item.quantidade)||item.quantidade<=0)
      blockers.add("IDENTITY_SOURCE_ITEM_NOT_RECONCILED:"+item.delivery_item_index);
   if(!id)continue;
   const currentStation=id.station_proof==="CURRENT_MOTOR_PROVEN" &&
     !!norm(id.classification.station);
   const nonProduction=id.station_proof==="CURRENT_NON_PRODUCTION_FAMILY_PROVEN" &&
     ["BEBIDA","NAO_PRODUCAO"].includes(norm(id.classification.family));
   if(!currentStation&&!nonProduction)
     blockers.add("CURRENT_STATION_OR_FAMILY_NOT_PROVEN:"+item.delivery_item_index);
   if(id.packaging_role==="UNKNOWN")
     blockers.add("PACKAGING_ROLE_NOT_PROVEN:"+item.delivery_item_index);
   const observations=[...item.delivery_observacoes,...item.tx_prod_com_ven];
   if(!Array.isArray(item.delivery_observacoes)||!Array.isArray(item.tx_prod_com_ven)||
      observations.some(x=>!text(x))) {
     blockers.add("SOURCE_OBSERVATIONS_INVALID:"+item.delivery_item_index);continue;
   }
   // Any disagreement between production text and customer order must remain
   // separate and visible; never silently invert SEM/COM or drop an allergy.
   const unique:string[]=[];
   for(const obs of observations)if(!unique.some(x=>norm(x)===norm(obs)))unique.push(obs);
   source.push({item_index:item.delivery_item_index,product_code:item.codigo,
     product_name:item.nome,quantity:item.quantidade,observations:unique,
     packaging_role:id.packaging_role});
   entries.push({source_item_index:item.delivery_item_index,quantity:item.quantidade,
     station_proof:id.station_proof,
     product:{nome:item.nome,classification:{...id.classification}}});
 }
 const linesByItem=new Map<number,Array<{index:number;printer:string}>>();
 for(const intent of printPlan.print_intents){
   if(intent.identifiers.teknisa_sequence!==joined.ids.pedido_interno ||
      (joined.ids.pedido_externo &&
       intent.identifiers.ifood_sequence!==joined.ids.pedido_externo))
     blockers.add("PRINT_INTENT_IDENTIFIERS_MISMATCH");
   for(const line of intent.lines){
     const src=source.find(s=>s.item_index===line.item_index);
     const raw=joined.items.find(s=>s.delivery_item_index===line.item_index);
     if(!src||!raw||src.product_code!==line.product_code||
        norm(src.product_name)!==norm(line.product_name)||src.quantity!==line.quantity)
       blockers.add("PRINT_INTENT_ITEM_NOT_IN_RECONCILED_SOURCE:"+line.item_index);
     const observed=(line.item_observations??[]).map(norm);
     if(src && JSON.stringify(observed)!==JSON.stringify(src.observations.map(norm)))
       blockers.add("PRODUCTION_CUSTOMER_OBSERVATION_DIVERGENCE:"+line.item_index);
     if(raw && !raw.printer_keys.includes(intent.printer.printer_code))
       blockers.add("PRODUCTION_PRINTER_NOT_IN_CURRENT_SOURCE_ROUTE:"+line.item_index);
     const refs=linesByItem.get(line.item_index)??[];
     if(refs.some(x=>x.printer===intent.printer.printer_code))
       blockers.add("DUPLICATE_STATION_ITEM:"+line.item_index);
     refs.push({index:line.item_index,printer:intent.printer.printer_code});
     linesByItem.set(line.item_index,refs);
   }
 }
 for(const item of joined.items){
   if(item.printer_keys.length && !linesByItem.has(item.delivery_item_index))
     blockers.add("ROUTED_ITEM_MISSING_PRINT_INTENT:"+item.delivery_item_index);
 }
 if(blockers.size)return reject();
 let registry;
 try {registry=pinnedUnifiedCoreKitRegistryV66();}
 catch{blockers.add("UNIFIED_KIT_CORE_PROVENANCE_NOT_VERIFIED");return reject();}
 const order_id=joined.ids.pedido_interno!;
 const input:OperationalTicketsFromMotorsInputV45={
   order_id,source_items:source,production_plan:printPlan,
   resource_input:{order_id,kit_registry:registry,
    sold_items:source.map(s=>({product_code:s.product_code,product_name:s.product_name,
     quantity:s.quantity,cmv_basis:"UNKNOWN"}))}
 };
 return {status:"ALIGNED",blockers:[],input,entries,effects:EFFECTS};
}
export function projectJoinedReaderTicketsV66(
  delivery:DeliveryJoinProjection,production:ProductionJoinProjection,
  plan:ProductionPrintPlan,identities:ProvenReaderProductV66[],
  motor:MotorInterfaceV63,blobSha:string,
):{ingress:ReaderIngressV66;bridge:BridgeDecisionV63|null;
   tickets:OperationalTicketsResultV45|null;reasons:string[];
   print_authorized:false} {
  const joined=joinDeliveryAndProduction(delivery,production);
  const ingress=compileJoinedReaderIngressV66(joined,plan,identities);
  if(ingress.status!=="ALIGNED"||!ingress.input||!ingress.entries)
    return {ingress,bridge:null,tickets:null,reasons:ingress.blockers,print_authorized:false};
  const result=projectTicketsFromCurrentPackagingV63(
    ingress.input,ingress.entries,motor,blobSha);
  return {ingress,bridge:result.bridge,tickets:result.tickets,
    reasons:result.coherence_reasons,print_authorized:false};
}
