import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { emitirToken } from "../../platform/auth/device-token";
import { issuePilotDelegation, type RegisteredPilotDevice } from "../../platform/auth/pilot-delegation-issuer";
import { tratarIdentidadeDelegadaPiloto } from "../../platform/runtime/rota-identidade-delegada-piloto";
import { authorizeDelegatedPilotHttp } from "./delegated-http-authorization";

const now=1792000000,secret="platform-only-lab-secret".padEnd(55,"x");
const kp=generateKeyPairSync("ed25519"),wrong=generateKeyPairSync("ed25519");
const platformToken=emitirToken({
 device_id:"LAB-DEV",unit_id:"LAB-UNIT",actor_id:"LAB-RIDER",
 issued_by:"human-admin-lab",agora:new Date((now-10)*1000),validade_s:3600,segredo:secret,
}).token;
let current:RegisteredPilotDevice={state:"active",device_id:"LAB-DEV",
 unit_id:"LAB-UNIT",actor_id:"LAB-RIDER",role:"motoboy_interno"};
const repo={find:async()=>current};
const issuedPromise=issuePilotDelegation({
 platform_token:platformToken,platform_signing_secret:secret,private_key:kp.privateKey,
 kid:"lab-k1",registry:repo,now_s:now,
});
let issuedToken="";
let requestCount=0;
const platformFetch=(async (input:RequestInfo|URL,init?:RequestInit):Promise<Response>=>{
 requestCount++;
 assert.equal(String(input),"https://critical.lab.test/api/device/pilot-identity");
 const headers=new Headers(init?.headers);
 assert.equal(headers.get("X-Entregas-Unit"),"LAB-UNIT");
 const auth=headers.get("Authorization")??"";
 assert.equal(auth,"Bearer "+issuedToken,"must send scoped token, not platform bearer");
 const result=await tratarIdentidadeDelegadaPiloto(auth,
  headers.get("X-Entregas-Unit")??undefined,{
   key_id:"lab-k1",public_key:kp.publicKey,registry:repo,
   now:()=>new Date(now*1000),
  });
 return new Response(JSON.stringify(result.corpo),{status:result.status,
  headers:{"content-type":"application/json"}});
}) as typeof fetch;
let count=0;
async function check(name:string,expected:number,overrides:Record<string,unknown>={}){
 const r=await authorizeDelegatedPilotHttp({
  bearer:issuedToken,unit_id:"LAB-UNIT",key_id:"lab-k1",
  public_key:kp.publicKey,platform_base_url:"https://critical.lab.test",
  now_s:now,fetchImpl:platformFetch,...overrides,
 });
 const status=r.ok?200:r.status;
 assert.equal(status,expected,name+" "+JSON.stringify(r));
 count++;console.log("PILOT_HTTP_AUTH_PASS",count,name,status);
}
async function main(){
 const issued=await issuedPromise;
 if(!issued.ok)throw Error("issuer failed");
 issuedToken=issued.token;
 await check("signed issuer + online platform current registry",200);
 assert.equal(requestCount,1);
 current={...current,state:"revoked"};await check("revoked after issue",403);
 current={...current,state:"active"};
 current={...current,role:"gerente"};await check("role changed after issue",403);
 current={...current,role:"motoboy_interno"};
 await check("wrong pilot unit",403,{unit_id:"OTHER-UNIT",fetchImpl:undefined as never});
 await check("wrong pinned public key",401,{public_key:wrong.publicKey});
 await check("platform bearer rejected",401,{bearer:platformToken});
 await check("HTTP platform forbidden",503,{platform_base_url:"http://critical.lab.test"});
 await check("missing key",503,{public_key:null});
 await check("expired credential",401,{now_s:now+181});
 await check("registry down yields unknown",503,{fetchImpl:(async()=>{throw Error("offline")}) as typeof fetch});
 await check("online identity mismatch",403,{fetchImpl:(async()=>new Response(JSON.stringify({
  ok:true,device_id:"LAB-DEV",actor_id:"LAB-OTHER",unit_id:"LAB-UNIT",role:"motoboy_interno",
 }),{status:200})) as typeof fetch});
 await check("platform HTTP 401 means denied",403,{fetchImpl:(async()=>new Response("{}",{status:401})) as typeof fetch});
 await check("platform HTTP 503 means unavailable",503,{fetchImpl:(async()=>new Response("{}",{status:503})) as typeof fetch});
 const noBearer=await tratarIdentidadeDelegadaPiloto(undefined,"LAB-UNIT",{
  public_key:kp.publicKey,key_id:"lab-k1",registry:repo,now:()=>new Date(now*1000),
 });
 assert.equal(noBearer.status,401);count++;console.log("PILOT_HTTP_AUTH_PASS",count,"identity route missing bearer");
 const noConfig=await tratarIdentidadeDelegadaPiloto("Bearer "+issuedToken,"LAB-UNIT",{
  public_key:null,key_id:"",registry:repo,now:()=>new Date(now*1000),
 });
 assert.equal(noConfig.status,503);count++;console.log("PILOT_HTTP_AUTH_PASS",count,"identity route disabled by default");
 const noUnit=await tratarIdentidadeDelegadaPiloto("Bearer "+issuedToken,undefined,{
  public_key:kp.publicKey,key_id:"lab-k1",registry:repo,now:()=>new Date(now*1000),
 });
 assert.equal(noUnit.status,400);count++;console.log("PILOT_HTTP_AUTH_PASS",count,"identity route needs unit");
 console.log("PILOT_HTTP_DELEGATION_CONTRACT",count,"PASS");
}
main().catch(e=>{console.error("DELEGATION_HTTP_TEST_FAILED",e);process.exitCode=1});
