import {createHash} from "node:crypto";
import snapshot from "../../data/unified_core_kits_pin_v66.json";
import type {KitComponentRegistry} from "./resourceConsumption";

/** Source-pinned read-only representation of the TATÁ Unified Core kit registry.
 * Not a live external-module import or permission to operate inventory.
 */
export const UNIFIED_KIT_CORE_SOURCE_BLOB_V66="42d69fea73e830bd6517e1230a0ec4c7fc9737a4";
export const UNIFIED_KIT_SNAPSHOT_BLOB_V66="29d917030070abfe37d294e93db0addc8f7e24da";
const KNOWN_KITS=["Kit Simples","Kit p/1","Kit p/2","Kit Quente","Kit Kids","Kit Sobremesa"];

function gitBlobSha(serialized:string):string {
  const bytes=Buffer.from(serialized,"utf8");
  return createHash("sha1").update("blob "+bytes.length+"\0").update(bytes).digest("hex");
}

/** Explicitly refuses tampered snapshots or stale/mislabelled provenance. */
export function pinnedUnifiedCoreKitRegistryV66():KitComponentRegistry {
  const raw=JSON.stringify(snapshot,null,2)+"\n";
  if(gitBlobSha(raw)!==UNIFIED_KIT_SNAPSHOT_BLOB_V66 ||
      snapshot.schema!=="deliveryos.unified-core-kit-registry-pin.v66" ||
      snapshot.source.repo!=="cesarspichencoff-cmyk/tata-os" ||
      snapshot.source.path!=="packages/unified-restaurant-core/src/kits.ts" ||
      snapshot.source.blob_sha!==UNIFIED_KIT_CORE_SOURCE_BLOB_V66 ||
      snapshot.source.status!=="PINNED_SNAPSHOT_NOT_LIVE_AUTHORITY" ||
      snapshot.registry.schema!=="deliveryos.kit-component-registry.v1")
    throw new Error("UNIFIED_KIT_CORE_SNAPSHOT_PROOF_FAILED");
  const keys=Object.keys(snapshot.registry.kits).sort();
  if(JSON.stringify(keys)!==JSON.stringify([...KNOWN_KITS].sort()))
    throw new Error("UNIFIED_KIT_CORE_KIT_SET_CHANGED");
  for(const [name,kit] of Object.entries(snapshot.registry.kits)){
    if(kit.proof!=="HUMAN_CONFIRMED"||!kit.components.length)
      throw new Error("UNPROVEN_UNIFIED_KIT:"+name);
    const seen=new Set<string>();
    for(const x of kit.components){
      if(!x.resource_key||!x.label||!Number.isSafeInteger(x.quantity)||
          x.quantity<=0||!["EA","GRM","KGM","MLT","LTR"].includes(x.uom)||
          seen.has(x.resource_key))
        throw new Error("UNIFIED_KIT_COMPONENT_INVALID:"+name);
      seen.add(x.resource_key);
    }
  }
  // Prevent caller mutation of static imported snapshot across projections.
  return JSON.parse(JSON.stringify(snapshot.registry)) as KitComponentRegistry;
}
