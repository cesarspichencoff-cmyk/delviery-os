import { createHmac, timingSafeEqual } from "node:crypto";
import { canSeeRoute } from "./route-access";

export const PLATFORM_READ_ASSERTION_VERSION = "platform-read-assertion@1.0.0";
export const PLATFORM_READ_ASSERTION_MAX_TTL_S = 60;
export const PLATFORM_READ_SECRET_MIN_LENGTH = 32;

export function isUsablePlatformReadSecret(secret: string): boolean {
  const s = secret.trim();
  return s.length >= PLATFORM_READ_SECRET_MIN_LENGTH &&
    !/(CHANGE_ME|EXEMPLO|TODO|GERE[_ -]|SUBSTITUA)/i.test(s);
}

export type PlatformReadScope = "location" | "route";

export interface PlatformReadClaims {
  unit_id: string;
  actor_id: string;
  role: string;
  trip_id: string;
  scope: PlatformReadScope;
  iat: number;
  exp: number;
  v: string;
}

function base64url(b: Buffer): string {
  return b.toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function decodeBase64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function signature(body: string, secret: string): string {
  return base64url(createHmac("sha256", secret).update(body).digest());
}

export function emitPlatformReadAssertion(o: {
  unit_id: string;
  actor_id: string;
  role: string;
  trip_id: string;
  scope: PlatformReadScope;
  now: Date;
  secret: string;
  ttl_s?: number;
}): string {
  if (!isUsablePlatformReadSecret(o.secret)) {
    throw new Error("segredo de leitura da plataforma ausente, curto ou placeholder");
  }
  for (const [name, value] of Object.entries({
    unit_id: o.unit_id,
    actor_id: o.actor_id,
    role: o.role,
    trip_id: o.trip_id,
  })) {
    if (!String(value).trim()) throw new Error(`${name} obrigatório`);
  }
  const ttl = o.ttl_s ?? 30;
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > PLATFORM_READ_ASSERTION_MAX_TTL_S) {
    throw new Error("ttl de leitura inválido");
  }
  if (o.scope === "route" && !canSeeRoute(o.role)) {
    throw new Error("papel sem acesso à rota");
  }
  const iat = Math.floor(o.now.getTime() / 1000);
  const claims: PlatformReadClaims = {
    unit_id: o.unit_id.trim(),
    actor_id: o.actor_id.trim(),
    role: o.role.trim(),
    trip_id: o.trip_id.trim(),
    scope: o.scope,
    iat,
    exp: iat + ttl,
    v: PLATFORM_READ_ASSERTION_VERSION,
  };
  const body = base64url(Buffer.from(JSON.stringify(claims), "utf8"));
  return `${body}.${signature(body, o.secret)}`;
}

export type VerifyPlatformReadResult =
  | { ok: true; claims: PlatformReadClaims }
  | { ok: false; reason: string };

export function verifyPlatformReadAssertion(
  token: string | null | undefined,
  secretsByUnit: ReadonlyMap<string, string>,
  now: Date,
): VerifyPlatformReadResult {
  if (!token?.trim()) return { ok: false, reason: "credencial_ausente" };
  const parts = token.trim().split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: "credencial_malformada" };
  }
  const [body, supplied] = parts;

  let untrusted: Partial<PlatformReadClaims>;
  try {
    untrusted = JSON.parse(decodeBase64url(body).toString("utf8")) as Partial<PlatformReadClaims>;
  } catch {
    return { ok: false, reason: "credencial_malformada" };
  }
  const unit = typeof untrusted.unit_id === "string" ? untrusted.unit_id : "";
  const secret = secretsByUnit.get(unit);
  if (!secret || secret.length < PLATFORM_READ_SECRET_MIN_LENGTH) {
    return { ok: false, reason: "unidade_nao_autorizada" };
  }

  const expected = signature(body, secret);
  const a = Buffer.from(supplied, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "assinatura_invalida" };
  }

  const c = untrusted as PlatformReadClaims;
  if (
    c.v !== PLATFORM_READ_ASSERTION_VERSION ||
    !c.unit_id ||
    !c.actor_id ||
    !c.role ||
    !c.trip_id ||
    (c.scope !== "location" && c.scope !== "route") ||
    !Number.isInteger(c.iat) ||
    !Number.isInteger(c.exp)
  ) {
    return { ok: false, reason: "claims_invalidas" };
  }
  if (c.scope === "route" && !canSeeRoute(c.role)) {
    return { ok: false, reason: "papel_sem_acesso" };
  }

  const nowS = Math.floor(now.getTime() / 1000);
  if (c.iat > nowS + 10) return { ok: false, reason: "emitida_no_futuro" };
  if (c.exp <= nowS) return { ok: false, reason: "credencial_expirada" };
  if (c.exp <= c.iat || c.exp - c.iat > PLATFORM_READ_ASSERTION_MAX_TTL_S) {
    return { ok: false, reason: "ttl_invalido" };
  }
  return { ok: true, claims: c };
}
