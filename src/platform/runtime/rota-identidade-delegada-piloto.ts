/**
 * Platform online validation of an explicitly scoped pilot credential.
 * No device-token exchange takes place here; invalid/revoked fail closed.
 */
import type { KeyObject } from "node:crypto";
import {
  authorizePilotEventWrite, type PilotDelegationClaims,
  type AuthoritativePilotRegistry,
} from "../../entregas/pilot/delegated-authorization";
import type { PilotIssuerRegistry } from "../auth/pilot-delegation-issuer";
import type { RespostaDaRota } from "./rota-ingestao";

export const ROTA_IDENTIDADE_DELEGADA_PILOTO = "/api/device/pilot-identity";
export interface PilotIdentityRouteDeps {
  key_id: string;
  public_key: KeyObject | null;
  registry: PilotIssuerRegistry;
  now: () => Date;
}
export async function tratarIdentidadeDelegadaPiloto(
  auth: string | undefined, unit: string | undefined, deps: PilotIdentityRouteDeps,
): Promise<RespostaDaRota> {
  if (!deps.public_key || !deps.key_id) return { status:503, corpo:{ok:false,code:"delegation_disabled"} };
  if (!unit || !/^[A-Za-z0-9_:-]{1,128}$/.test(unit)) return {
    status:400,corpo:{ok:false,code:"unit_header_required"},
  };
  if (!auth || !/^Bearer\s+[^\s]+$/i.test(auth)) return {
    status:401,corpo:{ok:false,code:"delegation_bearer_required"},
  };
  const token=auth.replace(/^Bearer\s+/i,"");
  const liveRegistry:AuthoritativePilotRegistry = {
    check:async (claims:PilotDelegationClaims) => {
      const current=await deps.registry.find(claims.device_id);
      if (!current || current.state!=="active") return {decision:"deny"};
      if (!current.actor_id) return {decision:"deny"};
      return {
        decision:"allow",
        device_id:current.device_id,actor_id:current.actor_id,
        unit_id:current.unit_id,role:current.role,
      };
    },
  };
  const proof=await authorizePilotEventWrite({
    bearer:token,expected_unit_id:unit,
    trusted_public_keys:new Map([[deps.key_id,deps.public_key]]),
    registry:liveRegistry,now_epoch_s:Math.floor(deps.now().getTime()/1000),
  });
  if (!proof.ok) return {status:proof.status,corpo:{ok:false,code:proof.reason}};
  return {status:200,corpo:{
    ok:true,actor_id:proof.claims.actor_id,unit_id:proof.claims.unit_id,
    device_id:proof.claims.device_id,role:proof.claims.role,
    audience:proof.claims.aud,scope:proof.claims.scope,
  }};
}
