/**
 * TATÁ Comanda — headless packaging contract V1, REVIEW ONLY.
 * No rewrite of canonical Academy rules, no file/host/print/sequence effects.
 * An independently authenticated V2 reader event remains a separate gate.
 */
import {createHash} from "node:crypto";
import {createContext,runInContext} from "node:vm";
import {
 bridgeCurrentPackagingV63,
 PACKAGING_SOURCE_BLOB_V63,
 PACKAGING_SOURCE_SHA256_V78,
 type MotorInterfaceV63,
 type MotorEntryV63,
 type BridgeDecisionV63,
} from "./currentPackagingBridgeV63";
import type {SourceOrderItemV45} from "./operationalTicketsV45";

export const CATALOG_GIT_BLOB_V1 =
 "d4cc9ba91c850314ffa9bd45fb9dfd1dea3d3c22";
export const CONTRACT_VERSION_V1 = "tata.comanda.packaging-headless.v1";
export interface ContractLineV1 {
 source_line_id:string;
 source_product_code:string;
 academy_product_id:string;
 product_name:string;
 quantity_raw:string;
 observations:string[];
 packaging_role?:"CLOSED_COMBO"|"OTHER"|"UNKNOWN";
}
export interface PackagingContractRequestV1 {
 order_key:string;
 snapshot_hash:string;
 lines:ContractLineV1[];
}
export interface ContractGroupV1 {
 group_index:number;
 box:string|null;
 category:string|null;
 boxes:number;
 source_line_ids:string[];
 physical_box_allocation:"NOT_ASSERTED";
}
export interface PackagingContractResultV1 {
 schema:typeof CONTRACT_VERSION_V1;
 status:"OFFLINE_CONTRACT_VERIFIED"|"HOLD";
 blockers:string[];
 order_key:string|null;
 snapshot_hash:string|null;
 motor_sha256:string|null;
 catalog_git_blob_sha1:string|null;
 group_membership:ContractGroupV1[];
 packaging:BridgeDecisionV63["packaging"];
 kits:BridgeDecisionV63["kits"];
 reader_pair_authenticated:false;
 snapshot_hash_independently_recomputed:false;
 observations_authenticated:false;
 source_code_crosswalk_authenticated:false;
 ready_for_operational_print:false;
 effects:{
  print:false;spooler_write:false;sequence_write:false;
  database_write:false;network:false;fiscal:false;
 };
}

const EFFECTS={
 print:false,spooler_write:false,sequence_write:false,
 database_write:false,network:false,fiscal:false,
} as const;
const norm=(v:string)=>v.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .trim().replace(/\s+/g," ").toUpperCase();
const QUANTITY=/^(?:0*[1-9][0-9]*)(?:\.0+)?$/;
const ID=/^[A-Za-z0-9_-]{1,64}$/;
const SHA=/^[a-f0-9]{64}$/i;
const ORDER=/^[0-9]{4}\|[0-9]{2}\|[0-9]{1,12}\|[0-9]{1,12}$/;
const hash=(b:Buffer)=>createHash("sha256").update(b).digest("hex");
const blob=(b:Buffer)=>createHash("sha1")
 .update("blob "+b.length+"\0").update(b).digest("hex");

/** Public structural preflight. Passing never authenticates a live order. */
export function validatePackagingContractRequestV1(request:PackagingContractRequestV1):string[] {
 const issues=new Set<string>();
 if(!request||typeof request.order_key!=="string"||!ORDER.test(request.order_key)||
    typeof request.snapshot_hash!=="string"||!SHA.test(request.snapshot_hash))
  issues.add("ORDER_REVISION_IDENTITY_INVALID");
 if(!Array.isArray(request?.lines)||request.lines.length<1||request.lines.length>200){
  issues.add("SOURCE_LINES_INVALID");return [...issues].sort();
 }
 const ids=new Set<string>(),codeToProduct=new Map<string,string>();
 const identities=new Set<string>();
 let total=0;
 for(const line of request.lines){
  if(!line||typeof line!=="object"||
     typeof line.source_line_id!=="string"||!ID.test(line.source_line_id)||
     ids.has(line.source_line_id)){
   issues.add("SOURCE_LINE_ID_INVALID_OR_DUPLICATE");continue;
  }
  ids.add(line.source_line_id);
  if(typeof line.source_product_code!=="string"||!ID.test(line.source_product_code)||
     typeof line.academy_product_id!=="string"||!ID.test(line.academy_product_id)||
     typeof line.product_name!=="string"||!norm(line.product_name)){
   issues.add("SOURCE_PRODUCT_IDENTITY_INCOMPLETE");continue;
  }
  const prior=codeToProduct.get(line.source_product_code);
  if(prior!==undefined&&prior!==line.academy_product_id)
   issues.add("SOURCE_CODE_CATALOG_MAPPING_CONFLICT");
  codeToProduct.set(line.source_product_code,line.academy_product_id);
  if(typeof line.quantity_raw!=="string"||!QUANTITY.test(line.quantity_raw)){
   issues.add("SOURCE_QUANTITY_INVALID");continue;
  }
  const q=Number(line.quantity_raw);
  if(!Number.isSafeInteger(q)||q<1||q>9999){
   issues.add("SOURCE_QUANTITY_OUT_OF_BOUNDS");continue;
  }
  total+=q;if(total>9999)issues.add("ORDER_QUANTITY_OUT_OF_BOUNDS");
  const key=norm(line.product_name)+"|"+q;
  if(identities.has(key))issues.add("MOTOR_GROUP_SOURCE_MEMBERSHIP_AMBIGUOUS");
  identities.add(key);
  if(!Array.isArray(line.observations)||line.observations.length>30||
     !line.observations.every(x=>typeof x==="string"&&x.length<=2000))
   issues.add("SOURCE_OBSERVATIONS_INVALID");
  if(line.packaging_role!==undefined&&
     !["CLOSED_COMBO","OTHER","UNKNOWN"].includes(line.packaging_role))
   issues.add("SOURCE_PACKAGING_ROLE_INVALID");
 }
 return [...issues].sort();
}

type CatalogRow={
 id?:unknown;nome?:unknown;
 classification?:{family?:unknown;station?:unknown;
  truth_class?:unknown;review_required?:unknown};
};

/** The source reader/crosswalk is not authenticated by this offline contract. */
export function evaluatePackagingContractV1(
 request:PackagingContractRequestV1, catalogBytes:Buffer, motorBytes:Buffer,
):PackagingContractResultV1 {
 const issues=new Set<string>(validatePackagingContractRequestV1(request));
 const denied=():PackagingContractResultV1=>({
  schema:CONTRACT_VERSION_V1,status:"HOLD",
  blockers:[...issues].sort(),
  order_key:typeof request?.order_key==="string"?request.order_key:null,
  snapshot_hash:typeof request?.snapshot_hash==="string"?request.snapshot_hash:null,
  motor_sha256:null,catalog_git_blob_sha1:null,
  group_membership:[],packaging:null,kits:null,
  reader_pair_authenticated:false,
  snapshot_hash_independently_recomputed:false,
  observations_authenticated:false,
  source_code_crosswalk_authenticated:false,
  ready_for_operational_print:false,effects:EFFECTS,
 });
 // Bounded checks are required BEFORE parsing catalog or executing any engine.
 if(!request||!ORDER.test(request.order_key)||!SHA.test(request.snapshot_hash))
  issues.add("ORDER_REVISION_IDENTITY_INVALID");
 if(!Array.isArray(request?.lines)||request.lines.length<1||request.lines.length>200)
  issues.add("SOURCE_LINES_INVALID");
 if(!Buffer.isBuffer(catalogBytes)||catalogBytes.length<2||
    catalogBytes.length>2*1024*1024||
    blob(catalogBytes)!==CATALOG_GIT_BLOB_V1)
  issues.add("ACADEMY_CATALOG_BYTES_NOT_PINNED");
 if(!Buffer.isBuffer(motorBytes)||motorBytes.length<2||
    motorBytes.length>256*1024||
    hash(motorBytes)!==PACKAGING_SOURCE_SHA256_V78)
  issues.add("ACADEMY_ENGINE_BYTES_NOT_PINNED");
 if(issues.size)return denied();

 let data:unknown;
 try{data=JSON.parse(catalogBytes.toString("utf8"));}
 catch{issues.add("ACADEMY_CATALOG_JSON_INVALID");return denied();}
 const catalog=(data as {products?:unknown}).products;
 if(!Array.isArray(catalog)){issues.add("ACADEMY_CATALOG_PRODUCTS_INVALID");return denied();}
 const byId=new Map<string,CatalogRow>(), duplicated=new Set<string>();
 for(const item of catalog){
  const row=item as CatalogRow;
  if(typeof row?.id!=="string"||!ID.test(row.id))continue;
  if(byId.has(row.id))duplicated.add(row.id);
  else byId.set(row.id,row);
 }
 if(duplicated.size){issues.add("ACADEMY_CATALOG_DUPLICATE_ID");return denied();}

 const sources:SourceOrderItemV45[]=[], entries:MotorEntryV63[]=[];
 const sourceLineIds:string[]=[];
 const indexes=new Set<string>(), sourceNames=new Set<string>();
 let total=0;
 for(const [i,line] of request.lines.entries()){
  if(!line||typeof line!=="object"||
     typeof line.source_line_id!=="string"||!ID.test(line.source_line_id)||
     indexes.has(line.source_line_id)){
    issues.add("SOURCE_LINE_ID_INVALID_OR_DUPLICATE");continue;
  }
  indexes.add(line.source_line_id);
  if(typeof line.source_product_code!=="string"||
     !ID.test(line.source_product_code)||
     typeof line.academy_product_id!=="string"||
     !ID.test(line.academy_product_id)||
     typeof line.product_name!=="string"||!norm(line.product_name)){
    issues.add("SOURCE_PRODUCT_IDENTITY_INCOMPLETE");continue;
  }
  if(typeof line.quantity_raw!=="string"||!QUANTITY.test(line.quantity_raw)){
    issues.add("SOURCE_QUANTITY_INVALID");continue;
  }
  const qty=Number(line.quantity_raw);
  if(!Number.isSafeInteger(qty)||qty<1||qty>9999){
    issues.add("SOURCE_QUANTITY_OUT_OF_BOUNDS");continue;
  }
  total+=qty;
  if(total>9999){issues.add("ORDER_QUANTITY_OUT_OF_BOUNDS");continue;}
  if(!Array.isArray(line.observations)||line.observations.length>30||
     !line.observations.every(x=>typeof x==="string"&&x.length<=2000)){
    issues.add("SOURCE_OBSERVATIONS_INVALID");continue;
  }
  const row=byId.get(line.academy_product_id);
  if(!row||typeof row.nome!=="string"||
     norm(row.nome)!==norm(line.product_name)){
    issues.add("CATALOG_PRODUCT_NAME_OR_ID_MISMATCH");continue;
  }
  const c=row.classification;
  const family=typeof c?.family==="string"?c.family:"";
  const station=typeof c?.station==="string"?c.station:null;
  if(!c||c.review_required!==false||
     c.truth_class!=="PROVEN_DELIVERYOS_STATION_MATRIX"||
     !family||!station){
    issues.add("CATALOG_STATION_CLASSIFICATION_NOT_PROVEN");continue;
  }
  // V6.3 still binds groups by normalized name + qty, not source_line_id.
  // A duplicate legitimate item remains HOLD until a versioned source-line API.
  const identity=norm(row.nome)+"|"+qty;
  if(sourceNames.has(identity))issues.add("MOTOR_GROUP_SOURCE_MEMBERSHIP_AMBIGUOUS");
  sourceNames.add(identity);
  sourceLineIds.push(line.source_line_id);
  sources.push({
   item_index:i+1,product_code:line.source_product_code,
   product_name:row.nome,quantity:qty,observations:[...line.observations],
   packaging_role:line.packaging_role??"UNKNOWN",
  });
  entries.push({
   source_item_index:i+1,quantity:qty,
   station_proof:"CURRENT_MOTOR_PROVEN",
   product:{nome:row.nome,classification:{family,station}},
  });
 }
 if(sources.length!==request.lines.length)
  issues.add("NOT_ALL_SOURCE_LINES_RECONCILED");
 if(issues.size)return denied();

 // Execute the same exact authenticated motor bytes; no extra rule engine.
 // Node VM is NOT treated as a security sandbox for hostile code: hash pin is
 // therefore mandatory; source is the approved private Academy file only.
 let bridge:BridgeDecisionV63;
 try{
  const context=createContext({},{codeGeneration:{strings:false,wasm:false}});
  runInContext(motorBytes.toString("utf8"),context,{timeout:1500,
   filename:"academy-packaging-pinned.js"});
  const motor=(context as {TATAPackaging?:MotorInterfaceV63}).TATAPackaging;
  if(!motor||typeof motor.packComanda!=="function"||
     typeof motor.kitVerdict!=="function")throw Error("API_INVALID");
  // Fail closed on expensive/broken rules as well as initialization.
  (context as {__entries?:unknown}).__entries=
   entries.map(e=>({product:e.product,quantity:e.quantity}));
  runInContext(
   "globalThis.__packing=globalThis.TATAPackaging.packComanda(__entries);"+
   "globalThis.__kits=globalThis.TATAPackaging.kitVerdict(__entries);",
   context,{timeout:1500});
  const motorResults=context as {
   __packing?:ReturnType<MotorInterfaceV63["packComanda"]>;
   __kits?:ReturnType<MotorInterfaceV63["kitVerdict"]>;
  };
  const fixedMotor:MotorInterfaceV63={
   packComanda:()=>motorResults.__packing!,
   kitVerdict:()=>motorResults.__kits!,
  };
  bridge=bridgeCurrentPackagingV63(sources,entries,fixedMotor,PACKAGING_SOURCE_BLOB_V63);
 }catch{issues.add("PINNED_ENGINE_EXECUTION_FAILED");return denied();}
 if(bridge.status!=="VERIFIED_INPUT"||!bridge.packaging||!bridge.kits){
  for(const reason of bridge.reasons)issues.add(reason);
  return denied();
 }
 // Rebind group membership only when unique and exact. Never allocate
 // individual physical boxes or bags from group-level facts.
 const seen=new Set<string>(),groups:ContractGroupV1[]=[];
 for(const [index,group] of bridge.packaging.groups.entries()){
  const ids:string[]=[];
  if(!Array.isArray(group.products)||!group.products.length){
   issues.add("GROUP_SOURCE_LINE_BINDING_INCOMPLETE");continue;
  }
  for(const product of group.products){
   const matches=sources.filter(s=>norm(s.product_name)===norm(product.name)&&
    s.quantity===product.quantity);
   if(matches.length!==1||seen.has(sourceLineIds[matches[0].item_index-1])){
    issues.add("GROUP_SOURCE_LINE_BINDING_AMBIGUOUS");continue;
   }
   const id=sourceLineIds[matches[0].item_index-1];
   seen.add(id);ids.push(id);
  }
  groups.push({
   group_index:index+1,box:group.box??null,category:group.category??null,
   boxes:group.boxes??0,source_line_ids:ids,
   physical_box_allocation:"NOT_ASSERTED",
  });
 }
 if(seen.size!==sourceLineIds.length)
  issues.add("GROUP_SOURCE_LINE_BINDING_INCOMPLETE");
 if(issues.size)return denied();
 // Convert foreign VM-realm arrays/objects to native Node data before use by
 // other modules. Cross-realm arrays can fail deep equality even if identical.
 let portablePackaging:NonNullable<BridgeDecisionV63["packaging"]>;
 let portableKits:NonNullable<BridgeDecisionV63["kits"]>;
 try{
  portablePackaging=structuredClone(bridge.packaging);
  portableKits=structuredClone(bridge.kits);
 }catch{
  issues.add("MOTOR_RESULT_NOT_PORTABLE");
  return denied();
 }
 return {
  schema:CONTRACT_VERSION_V1,status:"OFFLINE_CONTRACT_VERIFIED",blockers:[],
  order_key:request.order_key,snapshot_hash:request.snapshot_hash,
  motor_sha256:PACKAGING_SOURCE_SHA256_V78,
  catalog_git_blob_sha1:CATALOG_GIT_BLOB_V1,
  group_membership:groups,packaging:portablePackaging,kits:portableKits,
  reader_pair_authenticated:false,snapshot_hash_independently_recomputed:false,
  observations_authenticated:false,source_code_crosswalk_authenticated:false,
  ready_for_operational_print:false,effects:EFFECTS,
 };
}
