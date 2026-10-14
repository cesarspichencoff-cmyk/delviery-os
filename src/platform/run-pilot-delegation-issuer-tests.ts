import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { emitirToken } from "./auth/device-token";
import { issuePilotDelegation, type PilotIssuerParams, type RegisteredPilotDevice } from "./auth/pilot-delegation-issuer";
import { authorizePilotEventWrite, type AuthoritativePilotRegistry } from "../entregas/pilot/delegated-authorization";

const now = 1792000000;
const secret = "laboratory-platform-secret-".padEnd(64, "k");
const pair = generateKeyPairSync("ed25519"), other = generateKeyPairSync("ed25519");
const platform = emitirToken({
  device_id:"DEV-LAB-1", unit_id:"UNIT-LAB-1", actor_id:"RIDER-LAB-1",
  issued_by:"authorized_admin_test", agora:new Date((now-10)*1000), validade_s:3600,
  segredo:secret, jti:"platform-session-lab",
}).token;
let current: RegisteredPilotDevice = {
  state:"active", device_id:"DEV-LAB-1", unit_id:"UNIT-LAB-1",
  actor_id:"RIDER-LAB-1", role:"motoboy_interno",
};
const args = (override:Partial<PilotIssuerParams>={}):PilotIssuerParams => ({
  platform_token:platform, platform_signing_secret:secret, private_key:pair.privateKey,
  kid:"issuer-lab-key", now_s:now, jti:"pilot-test-jti",
  registry:{find:async()=>current}, ...override,
});
const online:AuthoritativePilotRegistry={check:async c=>current.state==="active" ? {
  decision:"allow",device_id:current.device_id,actor_id:current.actor_id!,
  unit_id:current.unit_id,role:current.role,
}:{decision:"deny"}};
let checks=0;
async function expectIssue(label:string,status:number,options:Partial<PilotIssuerParams>) {
  const r=await issuePilotDelegation(args(options));
  assert.equal(r.ok?200:r.status,status,label);
  checks++;console.log("PASS",checks,label,status);
}
async function main(){
 let issued=await issuePilotDelegation(args());
 assert.equal(issued.ok,true); if(!issued.ok)throw Error("No issued token");
 checks++;console.log("PASS",checks,"issuer authenticates bound device + role",200);
 const validated=await authorizePilotEventWrite({
  bearer:issued.token, expected_unit_id:"UNIT-LAB-1",
  trusted_public_keys:new Map([["issuer-lab-key",pair.publicKey]]),
  registry:online, now_epoch_s:now,
 });
 assert.equal(validated.ok,true); checks++;console.log("PASS",checks,"end-to-end issuer->pilot verifier",200);
 await expectIssue("missing platform token",401,{platform_token:null});
 await expectIssue("foreign pilot token is not platform token",401,{platform_token:issued.token});
 await expectIssue("platform token signed with wrong secret",401,{platform_signing_secret:"bad-secret-".padEnd(48,"p")});
 await expectIssue("platform secret absent",503,{platform_signing_secret:""});
 await expectIssue("platform signer wrongly used as pilot signer",503,{private_key:pair.publicKey});
 await expectIssue("incorrect issuer kid",503,{kid:""});
 await expectIssue("unknown registry device",503,{registry:{find:async()=>null}});
 await expectIssue("registry failure",503,{registry:{find:async()=>{throw Error("database offline")}}});
 current={...current,state:"revoked"};await expectIssue("revoked device",403,{});current={...current,state:"active"};
 current={...current,state:"unknown"};await expectIssue("unavailable registry",503,{});current={...current,state:"active"};
 current={...current,unit_id:"UNIT-LAB-2"};await expectIssue("device unit changed",403,{});current={...current,unit_id:"UNIT-LAB-1"};
 current={...current,actor_id:"RIDER-LAB-2"};await expectIssue("actor binding changed",403,{});current={...current,actor_id:"RIDER-LAB-1"};
 current={...current,role:"admin_unknown"};await expectIssue("unapproved role",403,{});current={...current,role:"motoboy_interno"};
 await expectIssue("excessive expiration",503,{expires_in_s:301});
 await expectIssue("ttl zero",503,{expires_in_s:0});
 await expectIssue("ttl fractional",503,{expires_in_s:4.2});
 await expectIssue("invalid device clock",503,{now_s:-1});
 await expectIssue("invalid JTI",503,{jti:""});
 const exp=await issuePilotDelegation(args({expires_in_s:20}));
 assert.equal(exp.ok,true);if(!exp.ok)throw Error("failed TTL");
 const expired=await authorizePilotEventWrite({
  bearer:exp.token, expected_unit_id:"UNIT-LAB-1",trusted_public_keys:new Map([["issuer-lab-key",pair.publicKey]]),
  registry:online,now_epoch_s:now+21,
 });
 assert.deepEqual([expired.ok,expired.ok?0:expired.status],[false,401]);checks++;console.log("PASS",checks,"delegate expires");
 current={...current,state:"revoked"};
 const revoke=await authorizePilotEventWrite({
  bearer:issued.token, expected_unit_id:"UNIT-LAB-1",trusted_public_keys:new Map([["issuer-lab-key",pair.publicKey]]),
  registry:online,now_epoch_s:now+10,
 });
 assert.deepEqual([revoke.ok,revoke.ok?0:revoke.status],[false,403]);checks++;console.log("PASS",checks,"revoked after issuance");
 current={...current,state:"active"};
 const fake=await authorizePilotEventWrite({
  bearer:issued.token, expected_unit_id:"UNIT-LAB-1",trusted_public_keys:new Map([["issuer-lab-key",other.publicKey]]),
  registry:online,now_epoch_s:now,
 });
 assert.deepEqual([fake.ok,fake.ok?0:fake.status],[false,401]);checks++;console.log("PASS",checks,"wrong verifier key fails");
 // Original bearer is never accepted by pilot regardless of registry.
 const wrong=await authorizePilotEventWrite({
  bearer:platform, expected_unit_id:"UNIT-LAB-1",trusted_public_keys:new Map([["issuer-lab-key",pair.publicKey]]),
  registry:online,now_epoch_s:now,
 });
 assert.deepEqual([wrong.ok,wrong.ok?0:wrong.status],[false,401]);checks++;console.log("PASS",checks,"no platform bearer replay to pilot");
 console.log("PLATFORM_ISSUER_AND_PILOT_VERIFIER",checks,"PASS");
}
main().catch(e=>{console.error("PLATFORM_ISSUER_TEST_FAIL",e);process.exitCode=1});
