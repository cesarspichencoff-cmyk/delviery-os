/**
 * Pilot: local Ed25519 check + mandatory online registry through trusted
 * platform endpoint. Does not accept bearer tokens intended for platform.
 */
import type { KeyObject } from "node:crypto";
import {
 authorizePilotEventWrite, type PilotAuthorizationResult,
 type PilotDelegationClaims, type AuthoritativePilotRegistry,
} from "./delegated-authorization";
export interface PilotRemoteAuthorizationOptions {
 bearer: string;
 unit_id: string;
 key_id: string;
 public_key: KeyObject | null;
 platform_base_url: string;
 now_s: number;
 fetchImpl?: typeof fetch;
 timeout_ms?: number;
}
export async function authorizeDelegatedPilotHttp(
 p:PilotRemoteAuthorizationOptions,
):Promise<PilotAuthorizationResult> {
 if (!p.public_key || p.public_key.asymmetricKeyType!=="ed25519" || !p.key_id)
   return {ok:false,status:503,reason:"delegated_auth_disabled"};
 let endpoint:string;
 try {
   const url=new URL(p.platform_base_url);
   if (url.protocol!=="https:" || url.username || url.password || url.search || url.hash)
     return {ok:false,status:503,reason:"invalid_platform_endpoint"};
   endpoint=new URL("/api/device/pilot-identity",url).toString();
 } catch { return {ok:false,status:503,reason:"invalid_platform_endpoint"}; }
 const online:AuthoritativePilotRegistry={check:async (claims:PilotDelegationClaims)=>{
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),Math.min(Math.max(p.timeout_ms??2000,100),5000));
   try {
     const response=await (p.fetchImpl??fetch)(endpoint,{
       method:"GET",
       headers:{
         Authorization:"Bearer "+p.bearer,
         "X-Entregas-Unit":p.unit_id,
         "X-Entregas-Client":"pilot-delegation@0.1.0",
       },
       signal:controller.signal,
     });
     if (response.status===403 || response.status===401) return {decision:"deny"};
     if (response.status!==200) return {decision:"unknown"};
     const body=await response.json() as Record<string,unknown>;
     if (body.ok!==true) return {decision:"unknown"};
     return {decision:"allow",
       device_id:String(body.device_id??""),actor_id:String(body.actor_id??""),
       unit_id:String(body.unit_id??""),role:String(body.role??""),
     };
   } catch {return {decision:"unknown"};}
   finally{clearTimeout(timeout)}
 }};
 return authorizePilotEventWrite({
   bearer:p.bearer,expected_unit_id:p.unit_id,
   trusted_public_keys:new Map([[p.key_id,p.public_key]]),
   registry:online,now_epoch_s:p.now_s,
 });
}
