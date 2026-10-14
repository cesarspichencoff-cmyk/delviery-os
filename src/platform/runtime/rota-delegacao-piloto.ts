/**
 * Explicit platform-only exchange endpoint. It never accepts role/actor/unit
 * from request body: verified platform bearer + online registry govern issue.
 */
import type { KeyObject } from "node:crypto";
import {
  issuePilotDelegation, type PilotIssuerRegistry,
} from "../auth/pilot-delegation-issuer";
import type { RespostaDaRota } from "./rota-ingestao";

export const ROTA_DELEGACAO_PILOTO = "/api/device/pilot-delegation";
export interface PilotDelegationRouteDeps {
  platform_secret: string;
  private_key: KeyObject | null;
  key_id: string;
  registry: PilotIssuerRegistry;
  now: () => Date;
}
export async function tratarDelegacaoPiloto(
  authorization: string | undefined,
  deps: PilotDelegationRouteDeps,
): Promise<RespostaDaRota> {
  if (!deps.private_key || !deps.key_id) return {
    status: 503,
    corpo: { ok:false, code:"delegation_disabled", retryable:true },
  };
  const bearer = /^(?:Bearer)\s+([^\s]+)$/i.exec(authorization ?? "");
  if (!bearer) return {
    status:401,
    corpo:{ ok:false, code:"platform_bearer_required" },
  };
  const now = Math.floor(deps.now().getTime()/1000);
  const issued = await issuePilotDelegation({
    platform_token:bearer[1],
    platform_signing_secret:deps.platform_secret,
    private_key:deps.private_key,
    kid:deps.key_id,
    registry:deps.registry,
    now_s:now,
  });
  if (!issued.ok) return {
    status:issued.status,
    corpo:{ ok:false, code:issued.reason, retryable:issued.status===503 },
  };
  return {
    status:200,
    corpo:{
      ok:true, pilot_token:issued.token, expires_in_s:issued.expires_in_s,
      device_id:issued.device_id, actor_id:issued.actor_id, unit_id:issued.unit_id,
      audience:"deliveryos-pilot-event-write",
    },
  };
}
