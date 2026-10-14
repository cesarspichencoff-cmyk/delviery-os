/**
 * Contract candidate: read-only verifier for delegated pilot EVENT_WRITE credentials.
 * Not wired to any HTTP route; signing/issuance belongs to the trusted platform.
 *
 * A platform device token (two segments) is NOT a pilot credential. Only a
 * separately signed Ed25519 token for this explicit audience may pass.
 * An authoritative online device/actor registry check is still required.
 */
import { verify, type KeyObject } from "node:crypto";

export const PILOT_DELEGATION_VERSION = "pilot-delegation@0.1.0";
export const PILOT_DELEGATION_AUDIENCE = "deliveryos-pilot-event-write";
export const PILOT_DELEGATION_ISSUER = "deliveryos-platform-delegator";
export const PILOT_DELEGATION_SCOPE = "entregas:events:write";
export const PILOT_MAX_TOKEN_SECONDS = 300;

export interface PilotDelegationClaims {
  v: string;
  iss: string;
  aud: string;
  scope: string;
  kid: string;
  jti: string;
  device_id: string;
  actor_id: string;
  unit_id: string;
  role: "motoboy_interno" | "lider_delivery" | "gerente";
  iat: number;
  nbf: number;
  exp: number;
}
export interface AuthoritativePilotRegistry {
  check(claims: PilotDelegationClaims): Promise<
    | { decision: "allow"; device_id: string; actor_id: string; unit_id: string; role: string }
    | { decision: "deny" }
    | { decision: "unknown" }
  >;
}
export type PilotAuthorizationResult =
  | { ok: true; claims: PilotDelegationClaims }
  | { ok: false; status: 401 | 403 | 503; reason: string };

export interface PilotAuthorizationContext {
  bearer: string | null | undefined;
  expected_unit_id: string;
  /** Pinned public keys only. No issuer-private key is ever given to pilot. */
  trusted_public_keys: ReadonlyMap<string, KeyObject>;
  registry: AuthoritativePilotRegistry;
  now_epoch_s: number;
}

const rejected = (status: 401 | 403 | 503, reason: string): PilotAuthorizationResult =>
  ({ ok: false, status, reason });
const nonempty = (v: unknown): v is string =>
  typeof v === "string" && v.length >= 1 && v.length <= 128 && v.trim() === v;
const encoded = (v: string): boolean => /^[A-Za-z0-9_-]+$/.test(v);

export async function authorizePilotEventWrite(
  ctx: PilotAuthorizationContext,
): Promise<PilotAuthorizationResult> {
  const token = (ctx.bearer ?? "").trim();
  // Explicit prefix + 3 segments excludes the original 2-part platform token.
  if (token.length < 20 || token.length > 4096) return rejected(401, "token_absent_or_oversized");
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "pt1" || !encoded(parts[1]) || !encoded(parts[2]))
    return rejected(401, "invalid_pilot_token_format");
  let claims: PilotDelegationClaims;
  let signature: Buffer;
  try {
    const payload = Buffer.from(parts[1], "base64url");
    signature = Buffer.from(parts[2], "base64url");
    if (payload.length > 2048 || signature.length !== 64 ||
        payload.toString("base64url") !== parts[1] ||
        signature.toString("base64url") !== parts[2])
      return rejected(401, "invalid_pilot_token_encoding");
    const parsed: unknown = JSON.parse(payload.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return rejected(401, "invalid_pilot_claims");
    claims = parsed as PilotDelegationClaims;
  } catch { return rejected(401, "invalid_pilot_claims"); }

  if (!nonempty(claims.kid)) return rejected(401, "missing_key_id");
  const publicKey = ctx.trusted_public_keys.get(claims.kid);
  if (!publicKey || publicKey.asymmetricKeyType !== "ed25519") return rejected(401, "unknown_signing_key");
  try {
    if (!verify(null, Buffer.from(parts[0] + "." + parts[1], "utf8"), publicKey, signature))
      return rejected(401, "invalid_pilot_signature");
  } catch { return rejected(401, "invalid_pilot_signature"); }

  if (claims.v !== PILOT_DELEGATION_VERSION ||
      claims.iss !== PILOT_DELEGATION_ISSUER ||
      claims.aud !== PILOT_DELEGATION_AUDIENCE ||
      claims.scope !== PILOT_DELEGATION_SCOPE)
    return rejected(401, "wrong_pilot_contract");
  if (![claims.device_id, claims.actor_id, claims.unit_id, claims.jti].every(nonempty) ||
      !["motoboy_interno", "lider_delivery", "gerente"].includes(claims.role))
    return rejected(401, "incomplete_identity");
  if (![claims.iat, claims.nbf, claims.exp, ctx.now_epoch_s].every(Number.isSafeInteger))
    return rejected(401, "invalid_token_clock");
  if (claims.iat > ctx.now_epoch_s + 30 || claims.nbf > ctx.now_epoch_s ||
      claims.exp <= ctx.now_epoch_s || claims.exp <= claims.iat ||
      claims.exp - claims.iat > PILOT_MAX_TOKEN_SECONDS ||
      claims.nbf < claims.iat - 30)
    return rejected(401, "expired_or_invalid_lifetime");
  if (claims.unit_id !== ctx.expected_unit_id) return rejected(403, "wrong_unit");

  // Signed does not mean *still authorized*: registry revocation is authoritative.
  // An unavailable registry is UNKNOWN, never implicit approval or cached allow.
  let result: Awaited<ReturnType<AuthoritativePilotRegistry["check"]>>;
  try { result = await ctx.registry.check(claims); }
  catch { return rejected(503, "registry_unavailable"); }
  if (result.decision === "unknown") return rejected(503, "registry_unavailable");
  if (result.decision !== "allow") return rejected(403, "device_or_actor_revoked");
  if (result.device_id !== claims.device_id || result.actor_id !== claims.actor_id ||
      result.unit_id !== claims.unit_id || result.role !== claims.role)
    return rejected(403, "registered_identity_mismatch");
  return { ok: true, claims };
}
