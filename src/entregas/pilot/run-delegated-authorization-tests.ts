import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { authorizePilotEventWrite, PILOT_DELEGATION_AUDIENCE, PILOT_DELEGATION_ISSUER,
  PILOT_DELEGATION_SCOPE, PILOT_DELEGATION_VERSION,
  type AuthoritativePilotRegistry, type PilotAuthorizationContext,
  type PilotDelegationClaims } from "./delegated-authorization";

const now = 1_792_000_000;
const key = generateKeyPairSync("ed25519");
const anotherKey = generateKeyPairSync("ed25519");
const registry: AuthoritativePilotRegistry = { check: async c => ({
  decision: "allow", device_id: c.device_id, actor_id: c.actor_id,
  unit_id: c.unit_id, role: c.role,
}) };
const sample: PilotDelegationClaims = {
  v: PILOT_DELEGATION_VERSION, iss: PILOT_DELEGATION_ISSUER,
  aud: PILOT_DELEGATION_AUDIENCE, scope: PILOT_DELEGATION_SCOPE,
  kid: "pilot-public-key-1", jti: "lab-credential-001",
  device_id: "LAB-DEVICE", actor_id: "LAB-RIDER",
  unit_id: "LAB-UNIT", role: "motoboy_interno",
  iat: now - 5, nbf: now - 5, exp: now + 120,
};
const token = (claims: PilotDelegationClaims, privateKey=key.privateKey): string => {
  const first = "pt1." + Buffer.from(JSON.stringify(claims)).toString("base64url");
  return first + "." + sign(null, Buffer.from(first), privateKey).toString("base64url");
};
const ctx = (bearer: string | null, opts: Partial<PilotAuthorizationContext> = {}): PilotAuthorizationContext => ({
  bearer, expected_unit_id:"LAB-UNIT", trusted_public_keys:new Map([["pilot-public-key-1",key.publicKey]]),
  registry, now_epoch_s:now, ...opts,
});
let count = 0;
async function it(name: string, expected: number, bearer: string|null, opts: Partial<PilotAuthorizationContext> = {}) {
  const actual = await authorizePilotEventWrite(ctx(bearer,opts));
  assert.equal(actual.ok ? 200 : actual.status, expected, name + " " + JSON.stringify(actual));
  count++;console.log("PASS",count,name,expected);
}
async function main() {
await it("valid Ed25519 delegated token + live registry", 200,token(sample));
await it("empty token", 401,null);
await it("platform bearer is never pilot bearer",401,
  Buffer.from(JSON.stringify(sample)).toString("base64url")+".platform_signature");
await it("wrong signature",401,token(sample,anotherKey.privateKey));
await it("untrusted kid",401,token({...sample,kid:"other-key"}));
await it("wrong audience",401,token({...sample,aud:"deliveryos-platform"}));
await it("wrong issuer",401,token({...sample,iss:"unknown"}));
await it("wrong scope",401,token({...sample,scope:"*"}));
await it("wrong version",401,token({...sample,v:"pilot-delegation@2.0.0"}));
await it("expired",401,token({...sample,exp:now}));
await it("not yet active",401,token({...sample,nbf:now+30}));
await it("iat in future",401,token({...sample,iat:now+31}));
await it("lifetime > 300 seconds",401,token({...sample,exp:sample.iat+301}));
await it("missing actor",401,token({...sample,actor_id:""}));
await it("unsupported actor role",401,token({...sample,role:"sistema" as PilotDelegationClaims["role"]}));
await it("wrong unit",403,token(sample),{expected_unit_id:"LAB-OTHER-UNIT"});
await it("device revoked in authoritative registry",403,token(sample),
  {registry:{check:async()=>({decision:"deny"})}});
await it("registry unknown is fail closed",503,token(sample),
  {registry:{check:async()=>({decision:"unknown"})}});
await it("registry exception is fail closed",503,token(sample),
  {registry:{check:async()=>{throw Error("temporary outage")}}});
await it("registry subject mismatch",403,token(sample),
  {registry:{check:async()=>({decision:"allow",device_id:"OTHER",actor_id:"LAB-RIDER",unit_id:"LAB-UNIT",role:"motoboy_interno"})}});
await it("registry role mismatch",403,token(sample),
  {registry:{check:async()=>({decision:"allow",device_id:"LAB-DEVICE",actor_id:"LAB-RIDER",unit_id:"LAB-UNIT",role:"gerente"})}});
await it("public key rotation unknown",401,token(sample),
  {trusted_public_keys:new Map([["other-kid",anotherKey.publicKey]])});
await it("oversized bearer",401,"x".repeat(4500));
await it("malformed base64 and token shape",401,"pt1.*.!");
const tampered=token(sample).split(".");
tampered[1]=Buffer.from(JSON.stringify({...sample,unit_id:"LAB-OTHER-UNIT"})).toString("base64url");
await it("tampered claim changes fail signature",401,tampered.join("."));
assert.equal(count,25);
console.log("PILOT_DELEGATED_AUTH_CONTRACT_GREEN",count);

}
main().catch(e => { console.error("PILOT_DELEGATED_AUTH_CONTRACT_FAIL",e); process.exitCode = 1; });
