import type { PackagingPlanInput } from "./resourceConsumption";
import { projectOperationalTicketsFromMotorsV45, type OperationalTicketsFromMotorsInputV45,
  type OperationalTicketsResultV45, type SourceOrderItemV45 } from "./operationalTicketsV45";

/** Read-only bridge to the already-maintained TATÁ packaging motor.
 * NO printer, live source access, or separate packing heuristics.
 * The motor file must be audited and pinned before any use.
 */
export const PACKAGING_SOURCE_BLOB_V63 = "3167c309f02a0ad5a84fb43043b8866e3bee873c";
const PROVEN = new Set(["PROVEN_OPERATIONAL_DOCUMENT","PROVEN_CURRENT_HUMAN_RULE",
  "PROVEN_CURRENT_HUMAN_RULE_WITH_DERIVED_CAPACITY","DERIVED_FROM_PROVEN_CAPACITIES"]);
const canon=(s:unknown)=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toUpperCase().trim().replace(/\s+/g," ");
const positive=(n:unknown):n is number=>typeof n==="number"&&Number.isSafeInteger(n)&&n>0;
type Size="P"|"M"|"G";
export interface MotorEntryV63 {
  source_item_index:number;
  quantity:number;
  station_proof:"CURRENT_MOTOR_PROVEN"|"UNKNOWN";
  product:{nome:string;classification:{station:string|null};[key:string]:unknown};
}
export interface MotorOutputV63 {
  groups:Array<{
    kind:string; station?:string|null; box:string|null; boxes:number|null;status:string;
    products:Array<{name:string;quantity:number}>;complement_status?:string|null;
  }>;
  has_unknown:boolean; total_items:number;
  bags:{size?:Size|null;status:string;exact_bag_count?:number|null};
}
export interface MotorKitOutputV63 {
  status:string;kits:Array<{kit:string;quantidade:number}>;
}
export interface MotorInterfaceV63 {
  packComanda(entries:Array<{product:MotorEntryV63["product"];quantity:number}>):MotorOutputV63;
  kitVerdict(entries:Array<{product:MotorEntryV63["product"];quantity:number}>):MotorKitOutputV63;
}
export interface BridgeDecisionV63 {
  status:"VERIFIED_INPUT"|"BLOCKED";
  reasons:string[];
  packaging:PackagingPlanInput|null;
  kits:{status:"FACT";kits:Array<{kit:string;quantidade:number}>}|null;
  ready_for_automatic_operational_print:false;
  effects:{print:false;spooler_write:false;cut:false;network:false;stock_write:false};
}
const EFFECTS={print:false,spooler_write:false,cut:false,network:false,stock_write:false} as const;
const identity=(n:string,q:number)=>canon(n)+"|"+q;

/** Fails closed when source, membership, packaging, bag or kit proof is incomplete.
 * In particular, an inferred capacity is not promoted to a fact here.
 */
export function bridgeCurrentPackagingV63(
  sources:SourceOrderItemV45[], entries:MotorEntryV63[],
  motor:MotorInterfaceV63, sourceBlobSha:string,
):BridgeDecisionV63 {
  const issues=new Set<string>();
  const block=():BridgeDecisionV63=>({
    status:"BLOCKED",reasons:[...issues].sort(),packaging:null,kits:null,
    ready_for_automatic_operational_print:false,effects:EFFECTS,
  });
  if(sourceBlobSha!==PACKAGING_SOURCE_BLOB_V63)issues.add("PACKAGING_MOTOR_SOURCE_DRIFT");
  if(!sources.length||sources.length!==entries.length)issues.add("SOURCE_ENTRY_COUNT_MISMATCH");
  const sourceIndex=new Map<number,SourceOrderItemV45>(), seen=new Set<number>();
  const names=new Set<string>(), enriched=new Map<number,MotorEntryV63>();
  for(const source of sources){
    if(!Number.isSafeInteger(source.item_index)||sourceIndex.has(source.item_index)||
       !positive(source.quantity)||!canon(source.product_name))
      issues.add("INVALID_OR_DUPLICATE_SOURCE_ITEM");
    sourceIndex.set(source.item_index,source);
    const key=identity(source.product_name,source.quantity);
    if(names.has(key))issues.add("AMBIGUOUS_SAME_NAME_QUANTITY_SOURCE");
    names.add(key);
  }
  for(const entry of entries){
    if(!Number.isSafeInteger(entry.source_item_index)||seen.has(entry.source_item_index))
      issues.add("DUPLICATE_MOTOR_SOURCE_INDEX");
    seen.add(entry.source_item_index);
    const original=sourceIndex.get(entry.source_item_index);
    if(!original || !positive(entry.quantity) || entry.quantity!==original.quantity ||
       canon(entry.product?.nome)!==canon(original.product_name))
      issues.add("MOTOR_INPUT_DOES_NOT_MATCH_ORDER_SOURCE");
    if(entry.station_proof!=="CURRENT_MOTOR_PROVEN" ||
       !canon(entry.product?.classification?.station))issues.add("STATION_NOT_CURRENTLY_PROVEN");
    enriched.set(entry.source_item_index,entry);
  }
  if(sources.some(s=>!seen.has(s.item_index)))issues.add("MOTOR_SOURCE_ITEM_MISSING");
  if(issues.size)return block();
  const input=entries.map(e=>({product:e.product,quantity:e.quantity}));
  let output:MotorOutputV63, kits:MotorKitOutputV63;
  try { output=motor.packComanda(input);kits=motor.kitVerdict(input); }
  catch {issues.add("PACKAGING_MOTOR_EXECUTION_FAILED");return block();}
  if(!output||!Array.isArray(output.groups)||!output.bags||!kits||!Array.isArray(kits.kits)){
    issues.add("MOTOR_RESULT_MALFORMED");return block();
  }
  const count=sources.reduce((s,x)=>s+x.quantity,0);
  if(output.total_items!==count)issues.add("MOTOR_TOTAL_QUANTITY_MISMATCH");
  if(output.has_unknown)issues.add("MOTOR_PACKING_CONTAINS_UNKNOWN");
  const accounted=new Set<number>();
  const groups:PackagingPlanInput["groups"]=[];
  for(const group of output.groups){
    if(!Array.isArray(group.products)||!group.products.length){
      issues.add("EMPTY_PACKING_GROUP");continue;
    }
    const matched:SourceOrderItemV45[]=[];
    for(const item of group.products){
      const match=sources.filter(s=>identity(s.product_name,s.quantity)===
        identity(item.name,item.quantity));
      if(match.length!==1 || accounted.has(match[0].item_index)){
        issues.add("GROUP_SOURCE_MEMBERSHIP_UNPROVEN");continue;
      }
      matched.push(match[0]);accounted.add(match[0].item_index);
    }
    if(matched.length!==group.products.length)continue;
    if(matched.some(s=>canon(enriched.get(s.item_index)?.product.classification.station)!==
      canon(group.station)))issues.add("GROUP_STATION_MISMATCH");
    if(group.kind==="sem_caixa" && group.boxes===0&&group.box===null){
      // Not a physical box. V4.5 cannot yet resolve no-box lines in Conference.
      issues.add("NON_BOXED_ITEMS_REQUIRE_CONFERENCE_ADAPTER");continue;
    }
    if(!positive(group.boxes)||!group.box||!PROVEN.has(group.status)||
       group.complement_status==="UNKNOWN")issues.add("BOX_CAPACITY_OR_ALLOCATION_NOT_PROVEN");
    if(positive(group.boxes) && group.boxes>1 &&
       !(group.kind==="combinado"&&matched.length===1&&
         matched[0].packaging_role==="CLOSED_COMBO"&&
         matched[0].quantity===group.boxes))
      issues.add("MULTIPLE_BOX_CONTENT_DISTRIBUTION_UNPROVEN");
    if(matched.length>1&&matched.some(s=>s.packaging_role==="CLOSED_COMBO"))
      issues.add("CLOSED_COMBO_MIXED_WITH_EXTRAS");
    groups.push({box:group.box,boxes:group.boxes,status:group.status,
      products:group.products.map(x=>({name:x.name,quantity:x.quantity}))});
  }
  if(accounted.size!==sources.length)issues.add("NOT_ALL_SOURCE_ITEMS_ACCOUNTED_FOR");
  const bags=output.bags;
  if(bags.status!=="FACT"||!positive(bags.exact_bag_count)||
     !["P","M","G"].includes(String(bags.size)))
    issues.add("EXTERNAL_BAG_SIZE_OR_COUNT_NOT_PROVEN");
  if(kits.status!=="FACT"||kits.kits.some(k=>!canon(k.kit)||!positive(k.quantidade)))
    issues.add("KIT_ASSIGNMENT_NOT_PROVEN");
  if(issues.size)return block();
  return {status:"VERIFIED_INPUT",reasons:[],
    packaging:{groups,bags:{minimum:bags.exact_bag_count!,status:"FACT",
      exact_bag_count:bags.exact_bag_count!,exact_bag_count_status:"FACT",
      group_sizes:[{group:"MOTOR_CURRENT_VERIFIED",size:bags.size!,status:"FACT"}]},
      has_unknown:false},
    kits:{status:"FACT",kits:kits.kits.map(x=>({...x}))},
    ready_for_automatic_operational_print:false,effects:EFFECTS};
}

/** The operational projection remains downstream of the existing motor,
 * even when this bridge has verified its input; never authorizes printing.
 */
export function projectTicketsFromCurrentPackagingV63(
 input:OperationalTicketsFromMotorsInputV45,entries:MotorEntryV63[],
 motor:MotorInterfaceV63,blobSha:string,
):{bridge:BridgeDecisionV63;tickets:OperationalTicketsResultV45|null;
   ready_for_automatic_operational_print:false}{
 const bridge=bridgeCurrentPackagingV63(input.source_items,entries,motor,blobSha);
 if(bridge.status!=="VERIFIED_INPUT"||!bridge.packaging||!bridge.kits)
   return {bridge,tickets:null,ready_for_automatic_operational_print:false};
 const tickets=projectOperationalTicketsFromMotorsV45({
   ...input,resource_input:{...input.resource_input,packaging:bridge.packaging,kits:bridge.kits},
 });
 return {bridge,tickets,ready_for_automatic_operational_print:false};
}
