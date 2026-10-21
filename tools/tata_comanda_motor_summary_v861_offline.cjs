"use strict";
/**
 * TATA Comanda review-only presentation adapter for the EXISTING V6.3
 * packaging bridge. NEVER infer a motor result from its absence.
 * Exact motor bytes must be supplied from a separately authorized source.
 * Caller-supplied SHA labels/functions never grant provenance.
 */
const EMPTY=Object.freeze({caixa:null,sacola:null,kit:null});
const {inspectPinnedMotorBytes}=require("./tata_comanda_pinned_motor_loader_v862_offline.cjs");
const sortedSummary=values=>[...values.entries()]
 .sort((a,b)=>a[0].localeCompare(b[0],"pt-BR"))
 .map(([name,count])=>count+" X "+name).join(" | ");
const aggregate=arr=>{
 const m=new Map();
 for(const x of arr)m.set(x,(m.get(x)||0)+1);
 return sortedSummary(m);
};
function presentMotorPackaging(items,ctx) {
 const none=(status,reasons=[])=>({status,optional:{...EMPTY},
  reasons,has_verified_motor_output:false,motor_file_authenticated_here:false});
 if(ctx==null)return none("NOT_EVALUATED",["PACKAGING_MOTOR_NOT_INVOKED"]);
 if(typeof ctx!=="object"||!Array.isArray(ctx.entries))
  return none("BLOCKED",["MOTOR_CALL_CONTEXT_INVALID"]);
 const pinned=inspectPinnedMotorBytes(ctx.motor_bytes);
 if(pinned.status!=="PINNED_EXACT_BYTES")
  return none("BLOCKED",[pinned.reason]);
 try {
  const {bridgeCurrentPackagingV63,PACKAGING_SOURCE_BLOB_V63}=
   require("../dist/src/production/currentPackagingBridgeV63.js");
  if(!pinned.blob_sha_verified||!pinned.sha256_verified)
   return none("BLOCKED",["PACKAGING_MOTOR_NOT_AUTHENTICATED"]);
  const sources=items.map((x,i)=>({item_index:i,
   product_code:String(x.code??""),product_name:x.name,
   quantity:x.quantity,observations:x.notes??[],
   packaging_role:ctx.packaging_roles?.[i]??"OTHER"}));
  const r=bridgeCurrentPackagingV63(sources,ctx.entries,pinned.motor,PACKAGING_SOURCE_BLOB_V63);
  if(r.status!=="VERIFIED_INPUT"||!r.packaging||!r.kits)
   return none("BLOCKED",r.reasons);
  const boxes=[];
  for(const group of r.packaging.groups) {
   if(group.kind==="sem_caixa")continue;
   if(!Number.isSafeInteger(group.boxes)||group.boxes<1||!group.box)
    return none("BLOCKED",["GROUP_BOX_LABEL_INVALID"]);
   for(let i=0;i<group.boxes;i++)boxes.push("CX "+group.box);
  }
  const bags=r.packaging.bags.group_sizes;
  if(!Array.isArray(bags)||bags.length!==r.packaging.bags.exact_bag_count)
   return none("BLOCKED",["BAG_DISTRIBUTION_INVALID"]);
  const kits=r.kits.kits;
  const optional={
   caixa:boxes.length?aggregate(boxes):"NAO SE APLICA",
   sacola:bags.length?aggregate(bags.map(x=>"SACOLA "+x.size)):"NAO SE APLICA",
   kit:kits.length?kits.map(k=>k.quantidade+" X "+k.kit).join(" | "):"NAO SE APLICA"
  };
  return {status:"VERIFIED_INPUT",optional,reasons:[],
   has_verified_motor_output:true,motor_file_authenticated_here:true};
 } catch {
  return none("BLOCKED",["MOTOR_BRIDGE_EXECUTION_FAILED"]);
 }
}
module.exports={presentMotorPackaging};
