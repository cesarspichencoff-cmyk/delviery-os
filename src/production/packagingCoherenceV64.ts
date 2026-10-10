import type { ProductionPrintPlan } from "./productionPrintPlan";
import type { PackagingPlanInput } from "./resourceConsumption";
import type { OperationalTicketsResultV45, SourceOrderItemV45 } from "./operationalTicketsV45";

/** SHADOW-only reconciliation. The packaging engine is the sole authority
 * for physical box membership; production routing stays untouched.
 */
export interface PackingCoherenceV64 {
  status: "ALIGNED" | "BLOCKED";
  blockers: string[];
  plan: ProductionPrintPlan | null;
  print_authorized: false;
}
const name=(v:unknown)=>String(v??"").normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ").trim();
const sig=(items:ReadonlyArray<{name:string;quantity:number}>)=>
  items.map(x=>name(x.name)+"|"+x.quantity).sort().join(";");

/** Aligns *only projection metadata* to a verified packaging plan.
 * It never mutates upstream fingerprints, original plan or order content.
 * If a single physical box is split across independent printer intents,
 * refuse to invent cross-station production grouping.
 */
export function alignProductionPackagingV64(
  source:SourceOrderItemV45[], original:ProductionPrintPlan,
  packing:PackagingPlanInput,
):PackingCoherenceV64 {
  const failures=new Set<string>();
  const sourceByIndex=new Map(source.map(s=>[s.item_index,s]));
  const boxByIndex=new Map<number,{index:number;model:string;members:number[]}>();
  packing.groups.forEach((g,index)=>{
    if(g.kind==="sem_caixa" && g.box===null && g.boxes===0 &&
       g.status==="PROVEN_OPERATIONAL_DOCUMENT" &&
       Array.isArray(g.products) && g.products.length){
      for(const item of g.products){
        const candidates=source.filter(s=>
          name(s.product_name)===name(item.name)&&s.quantity===item.quantity);
        if(candidates.length!==1)
          failures.add("NON_BOXED_SOURCE_AMBIGUOUS:"+index);
      }
      return;
    }
    if(!g.box||!Array.isArray(g.products)||!g.products.length||
       !Number.isSafeInteger(g.boxes)||(g.boxes??0)<1){
      failures.add("PACKING_GROUP_UNPROVEN:"+index);return;
    }
    const members:number[]=[];
    for(const p of g.products){
      const candidates=source.filter(s=>
        name(s.product_name)===name(p.name)&&s.quantity===p.quantity);
      if(candidates.length!==1){
        failures.add("PACKING_MEMBER_AMBIGUOUS:"+index);continue;
      }
      const id=candidates[0].item_index;
      if(boxByIndex.has(id))failures.add("PACKING_MEMBER_REUSED:"+id);
      members.push(id);
      boxByIndex.set(id,{index,model:g.box.replace(/\./g,""),members});
    }
  });
  const mapped=original.print_intents.map(intent=>{
    const stationIndices=new Set(intent.lines.map(l=>l.item_index));
    for(const l of intent.lines){
      const src=sourceByIndex.get(l.item_index);
      if(!src||name(src.product_name)!==name(l.product_name)||
         src.quantity!==l.quantity ||src.product_code!==l.product_code)
        failures.add("STATION_LINE_SOURCE_MISMATCH:"+l.item_index);
      const known=boxByIndex.get(l.item_index);
      if(!known){failures.add("STATION_ITEM_WITHOUT_BOX:"+l.item_index);continue;}
      if(!known.members.every(n=>stationIndices.has(n)))
        failures.add("STATION_SPLITS_PHYSICAL_BOX:"+known.index);
    }
    return {...intent, lines:intent.lines.map(l=>{
      const box=boxByIndex.get(l.item_index);
      return box?{...l,mount_group_id:"MOTOR_BOX_"+box.index,
        box_label:"CX "+box.model}:{...l};
    })};
  });
  if(failures.size)return {status:"BLOCKED",blockers:[...failures].sort(),
    plan:null,print_authorized:false};
  return {status:"ALIGNED",blockers:[],
    plan:{...original,print_intents:mapped},print_authorized:false};
}

/** Independent semantic check: every boxed production line must match exactly
 * one of the physical Conference boxes or a proven repeated-closed-combo group.
 */
export function inspectThreeWayBoxCoherenceV64(tickets:OperationalTicketsResultV45):string[] {
  const failures=new Set<string>();
  const conf=tickets.conference.boxes;
  const grouped=new Map<string,number>();
  for(const c of conf){
    const key=c.model+"|"+sig(c.items.map(i=>({name:i.print_name,quantity:i.quantity})));
    grouped.set(key,(grouped.get(key)??0)+1);
  }
  for(const p of tickets.production)for(const b of p.boxes){
    if(!b.model||!b.items.length){failures.add("PRODUCTION_BOX_NOT_PROVEN:"+p.station);continue;}
    const repeats=b.physical_box_count??1;
    const canSplit=repeats>1 && b.status==="PROVEN" && b.items.length===1
      && b.items[0].quantity===repeats;
    if(repeats>1&&!canSplit){
      failures.add("PRODUCTION_MULTI_BOX_MEMBERSHIP_UNKNOWN:"+p.station);continue;
    }
    const content=canSplit?[{...b.items[0],quantity:1}]:b.items;
    const key=b.model+"|"+sig(content.map(i=>({name:i.print_name,quantity:i.quantity})));
    if((grouped.get(key)??0)<repeats)
      failures.add("CONFERENCE_PRODUCTION_BOX_DIVERGENCE:"+p.station+":"+key);
  }
  if(!tickets.ready_for_semantic_preview)
    failures.add("TICKETS_NOT_SEMANTICALLY_READY");
  return [...failures].sort();
}
