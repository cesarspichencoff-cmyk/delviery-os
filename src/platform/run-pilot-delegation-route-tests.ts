import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { emitirToken } from "./auth/device-token";
import { PgPilotDelegationRegistry } from "./auth/pg-pilot-delegation-registry";
import { tratarDelegacaoPiloto } from "./runtime/rota-delegacao-piloto";
import { authorizePilotEventWrite, type AuthoritativePilotRegistry } from "../entregas/pilot/delegated-authorization";

const time=1792000000;
const secret="laboratory-only-key".padEnd(64,"x");
const keys=generateKeyPairSync("ed25519");
const token=emitirToken({
 device_id:"DEV-L1",unit_id:"LAB-I",actor_id:"RID-L1",issued_by:"lab-admin",
 agora:new Date((time-5)*1000),validade_s:600,segredo:secret,
}).token;
let sqlCount=0;
let row: { device_id:string; actor_id:string; unit_id:string; device_revoked_at:string|null; device_linked:boolean; actor_unit:string; role:string; actor_active:boolean; unit_active:boolean } = {
 device_id:"DEV-L1",actor_id:"RID-L1",unit_id:"LAB-I",
 device_revoked_at:null,device_linked:true,actor_unit:"LAB-I",
 role:"motoboy_interno",actor_active:true,unit_active:true,
};
const sql={query:async <T>(q:string,args?:readonly unknown[]):Promise<T[]>=>{
 assert.match(q,/identity.device/);assert.match(q,/identity.actor/);
 assert.match(q,/identity.unit/);assert.match(q,/secret_hash IS NOT NULL/);
 assert.deepEqual(args,["DEV-L1"]);sqlCount++;
 return [row as T];
}};
const registry=new PgPilotDelegationRegistry(sql as never);
const params={platform_secret:secret,private_key:keys.privateKey,key_id:"lab-key",
 registry,now:()=>new Date(time*1000)};
let tests=0;
async function check(name:string,status:number,authorization:string|undefined,other:any={}){
 const r=await tratarDelegacaoPiloto(authorization,{...params,...other});
 assert.equal(r.status,status,name+" "+JSON.stringify(r.corpo));
 tests++;console.log("ROUTE_PASS",tests,name,status);return r;
}
async function main(){
 const ok=await check("platform bearer mints only pilot token",200,"Bearer "+token);
 assert.equal(typeof ok.corpo.pilot_token,"string");
 assert.equal(ok.corpo.audience,"deliveryos-pilot-event-write");
 const trusted:AuthoritativePilotRegistry={check:async()=>({
  decision:"allow",device_id:"DEV-L1",actor_id:"RID-L1",unit_id:"LAB-I",role:"motoboy_interno",
 })};
 const verification=await authorizePilotEventWrite({
  bearer:String(ok.corpo.pilot_token),expected_unit_id:"LAB-I",
  trusted_public_keys:new Map([["lab-key",keys.publicKey]]),
  registry:trusted,now_epoch_s:time,
 });
 assert.equal(verification.ok,true);
 tests++;console.log("ROUTE_PASS",tests,"route issued token accepted by independent verifier",200);
 await check("configuration absent stays disabled",503,"Bearer "+token,{private_key:null});
 await check("missing auth",401,undefined);
 await check("non-bearer auth",401,token);
 await check("no arbitrary payload role accepted",401,"Bearer fake-token");
 row={...row,device_revoked_at:"2026-10-13T20:00:00Z"};
 await check("revoked device",403,"Bearer "+token);row={...row,device_revoked_at:null};
 row={...row,actor_active:false};
 await check("inactive actor",403,"Bearer "+token);row={...row,actor_active:true};
 row={...row,unit_active:false};
 await check("inactive unit",403,"Bearer "+token);row={...row,unit_active:true};
 row={...row,device_linked:false};
 await check("unlinked device",403,"Bearer "+token);row={...row,device_linked:true};
 row={...row,actor_unit:"LAB-OTHER"};
 await check("actor from another unit",403,"Bearer "+token);row={...row,actor_unit:"LAB-I"};
 row={...row,role:"admin_system"};
 await check("unapproved role",403,"Bearer "+token);row={...row,role:"motoboy_interno"};
 const broken=new PgPilotDelegationRegistry({query:async()=>{throw Error("postgres unavailable")}} as never);
 await check("DB down fails closed",503,"Bearer "+token,{registry:broken});
 const stranger=new PgPilotDelegationRegistry({query:async()=>[]} as never);
 await check("unknown device",503,"Bearer "+token,{registry:stranger});
 assert.ok(sqlCount>=7);
 console.log("AUTH_PLATFORM_HTTP_ROUTE_REGISTRY",tests,"PASS");
}
main().catch(e=>{console.error("ROUTE_TEST_FAILED",e);process.exitCode=1});
