/**
 * Platform-side, strictly scoped pilot write token issuer.
 * Pure use-case; not an HTTP route, not connected to a live registry.
 * The signing private key never leaves the platform.
 */
import { randomBytes, sign, type KeyObject } from "node:crypto";
import { verificarToken } from "./device-token";
import {
  PILOT_DELEGATION_AUDIENCE, PILOT_DELEGATION_ISSUER,
  PILOT_DELEGATION_SCOPE, PILOT_DELEGATION_VERSION,
  PILOT_MAX_TOKEN_SECONDS, type PilotDelegationClaims,
} from "../../entregas/pilot/delegated-authorization";

export interface RegisteredPilotDevice {
  state: "active" | "revoked" | "unknown";
  device_id: string;
  actor_id: string | null;
  unit_id: string;
  role: string;
}
export interface PilotIssuerRegistry {
  find(device_id: string): Promise<RegisteredPilotDevice | null>;
}
export interface PilotIssuerParams {
  /** Must be the bearer of an authenticated platform device, never a claim from body. */
  platform_token: string | null | undefined;
  platform_signing_secret: string;
  /** Independent Ed25519 signing key, not the platform device HMAC secret. */
  private_key: KeyObject;
  kid: string;
  registry: PilotIssuerRegistry;
  now_s: number;
  expires_in_s?: number;
  jti?: string;
}
export type PilotIssueResult =
  | { ok: true; token: string; expires_in_s: number; device_id: string; actor_id: string; unit_id: string }
  | { ok: false; status: 401 | 403 | 503; reason: string };

const denied = (status: 401 | 403 | 503, reason: string): PilotIssueResult =>
  ({ ok: false, status, reason });
const validId = (x: unknown): x is string =>
  typeof x === "string" && x.length > 0 && x.length <= 128 && x.trim() === x;

export async function issuePilotDelegation(p: PilotIssuerParams): Promise<PilotIssueResult> {
  if (!Number.isSafeInteger(p.now_s) || p.now_s <= 0) return denied(503, "bad_issuer_clock");
  if (!validId(p.kid) || p.private_key.type !== "private" ||
      p.private_key.asymmetricKeyType !== "ed25519")
    return denied(503, "issuer_signing_key_not_configured");
  if (typeof p.platform_signing_secret !== "string" || p.platform_signing_secret.length < 32)
    return denied(503, "platform_signing_key_not_configured");
  const raw = (p.platform_token ?? "").trim();
  if (!raw || raw.startsWith("pt1.") || raw.length > 4096)
    return denied(401, "platform_device_token_required");
  const result = verificarToken(raw, p.platform_signing_secret, new Date(p.now_s * 1000));
  if (!result.ok) return denied(401, "platform_device_token_invalid");
  const claims = result.claims;
  if (!validId(claims.device_id) || !validId(claims.unit_id) ||
      !validId(claims.actor_id)) return denied(401, "device_actor_binding_incomplete");
  // Online registry: revocation remains authoritative even while the platform
  // token is valid. Unknown/unavailable NEVER falls back to token-only allow.
  let device: RegisteredPilotDevice | null;
  try { device = await p.registry.find(claims.device_id); }
  catch { return denied(503, "registry_unavailable"); }
  if (!device || device.state === "unknown") return denied(503, "registry_unavailable");
  if (device.state !== "active") return denied(403, "device_revoked");
  if (device.device_id !== claims.device_id ||
      device.unit_id !== claims.unit_id ||
      device.actor_id !== claims.actor_id)
    return denied(403, "registered_device_actor_unit_mismatch");
  if (!["motoboy_interno", "lider_delivery", "gerente"].includes(device.role))
    return denied(403, "role_not_eligible_for_pilot");
  const ttl = p.expires_in_s ?? 180;
  if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > PILOT_MAX_TOKEN_SECONDS)
    return denied(503, "delegation_ttl_out_of_range");
  const jti = p.jti ?? randomBytes(16).toString("base64url");
  if (!validId(jti)) return denied(503, "delegation_identifier_invalid");
  const tokenClaims: PilotDelegationClaims = {
    v: PILOT_DELEGATION_VERSION,
    iss: PILOT_DELEGATION_ISSUER,
    aud: PILOT_DELEGATION_AUDIENCE,
    scope: PILOT_DELEGATION_SCOPE,
    kid: p.kid, jti,
    device_id: device.device_id,
    unit_id: device.unit_id,
    actor_id: device.actor_id!,
    role: device.role as PilotDelegationClaims["role"],
    iat: p.now_s, nbf: p.now_s, exp: p.now_s + ttl,
  };
  const unsigned = "pt1." + Buffer.from(JSON.stringify(tokenClaims), "utf8").toString("base64url");
  const signature = sign(null, Buffer.from(unsigned, "utf8"), p.private_key).toString("base64url");
  return {
    ok: true, token: unsigned + "." + signature,
    device_id: tokenClaims.device_id, actor_id: tokenClaims.actor_id,
    unit_id: tokenClaims.unit_id, expires_in_s: ttl,
  };
}
