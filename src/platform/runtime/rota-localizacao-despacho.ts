import type { SourceMode } from "../contracts/event-catalog";
import type { TransactionalSqlClient } from "../persistence/sql-client";
import { extrairBearer } from "../auth/device-auth";
import { lerLocalizacaoCanonicaDaViagem } from "../leitura/localizacao-de-viagem";
import {
  isUsablePlatformReadSecret,
  PLATFORM_READ_SECRET_MIN_LENGTH,
  verifyPlatformReadAssertion,
} from "../../entregas/foundation/platform-read-assertion";
import { canSeeRoute } from "../../entregas/foundation/route-access";

export const ROTA_DESPACHO_LOCALIZACAO = "/api/dispatch/trip/location";
export const ROTA_DESPACHO_ROTA = "/api/dispatch/trip/route";

export function loadPilotReadSecrets(
  env: NodeJS.ProcessEnv = process.env,
): ReadonlyMap<string, string> {
  const raw = (env.DELIVERYOS_PILOT_READ_SECRETS ?? "").trim();
  if (!raw) return new Map();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("DELIVERYOS_PILOT_READ_SECRETS não é JSON válido");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("DELIVERYOS_PILOT_READ_SECRETS precisa ser objeto unit_id->segredo");
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (!entries.length) {
    throw new Error("DELIVERYOS_PILOT_READ_SECRETS não pode ser objeto vazio");
  }
  const out = new Map<string, string>();
  for (const [unitRaw, secretRaw] of entries) {
    const unit = unitRaw.trim();
    const secret = typeof secretRaw === "string" ? secretRaw.trim() : "";
    if (!unit) throw new Error("unit_id vazio em DELIVERYOS_PILOT_READ_SECRETS");
    if (!isUsablePlatformReadSecret(secret)) {
      throw new Error(`segredo de leitura de ${unit} precisa ter ao menos ${PLATFORM_READ_SECRET_MIN_LENGTH} caracteres e não pode ser placeholder`);
    }
    out.set(unit, secret);
  }
  return out;
}

export interface DispatchReadDeps {
  cliente: TransactionalSqlClient;
  source_mode: SourceMode;
  secretsByUnit: ReadonlyMap<string, string>;
  now: () => Date;
}

export interface DispatchReadResponse {
  status: number;
  body: Record<string, unknown>;
}

function deny(status: number, code: string): DispatchReadResponse {
  return { status, body: { ok: false, code } };
}
async function authorize(
  authorization: string | null | undefined,
  tripId: string,
  expectedScope: "location" | "route",
  deps: DispatchReadDeps,
) {
  if (!deps.secretsByUnit.size) {
    return { ok: false as const, response: deny(503, "dispatch_read_not_configured") };
  }
  const token = extrairBearer(authorization);
  const verified = verifyPlatformReadAssertion(token, deps.secretsByUnit, deps.now());
  if (!verified.ok) {
    return { ok: false as const, response: deny(401, verified.reason) };
  }
  if (verified.claims.scope !== expectedScope) {
    return { ok: false as const, response: deny(403, "scope_divergente") };
  }
  if (verified.claims.trip_id !== tripId) {
    return { ok: false as const, response: deny(403, "trip_divergente") };
  }
  if (expectedScope === "route" && !canSeeRoute(verified.claims.role)) {
    return { ok: false as const, response: deny(403, "papel_sem_acesso") };
  }
  return { ok: true as const, claims: verified.claims };
}

export async function handleDispatchLocation(
  authorization: string | null | undefined,
  tripId: string,
  deps: DispatchReadDeps,
): Promise<DispatchReadResponse> {
  if (!tripId.trim()) return deny(400, "trip_id_obrigatorio");
  const auth = await authorize(authorization, tripId.trim(), "location", deps);
  if (!auth.ok) return auth.response;

  const loc = await lerLocalizacaoCanonicaDaViagem(deps.cliente, {
    unit_id: auth.claims.unit_id,
    trip_id: tripId.trim(),
    source_mode: deps.source_mode,
  });
  const last = loc.last_point;
  const coordinatesVisible = canSeeRoute(auth.claims.role);
  return {
    status: 200,
    body: {
      ok: true,
      source: loc.fonte,
      unit_id: loc.unit_id,
      trip_id: loc.trip_id,
      source_mode: loc.source_mode,
      point_count: loc.point_count,
      coordinates_visible: coordinatesVisible,
      last_observation: last
        ? {
            occurred_at: last.occurred_at,
            recorded_at: last.recorded_at,
            accuracy_m: last.accuracy_m,
            ...(coordinatesVisible
              ? { latitude: last.latitude, longitude: last.longitude }
              : {}),
          }
        : null,
    },
  };
}
export async function handleDispatchRoute(
  authorization: string | null | undefined,
  tripId: string,
  deps: DispatchReadDeps,
): Promise<DispatchReadResponse> {
  if (!tripId.trim()) return deny(400, "trip_id_obrigatorio");
  const auth = await authorize(authorization, tripId.trim(), "route", deps);
  if (!auth.ok) return auth.response;

  const loc = await lerLocalizacaoCanonicaDaViagem(deps.cliente, {
    unit_id: auth.claims.unit_id,
    trip_id: tripId.trim(),
    source_mode: deps.source_mode,
  });
  return {
    status: 200,
    body: {
      ok: true,
      source: loc.fonte,
      unit_id: loc.unit_id,
      trip_id: loc.trip_id,
      source_mode: loc.source_mode,
      point_count: loc.point_count,
      points: loc.points.map((p) => ({
        point_id: p.event_id,
        idempotency_key: p.idempotency_key,
        trip_id: p.trip_id,
        device_id: p.device_id,
        latitude: p.latitude,
        longitude: p.longitude,
        accuracy_m: p.accuracy_m,
        speed_mps: p.speed_mps,
        heading_deg: p.heading_deg,
        altitude_m: p.altitude_m,
        occurred_at: p.occurred_at,
        recorded_at: p.recorded_at,
        source: "device",
        captured_offline: p.captured_offline,
        clock_trust: p.clock_trust,
        schema_version: "gps@1.0.0",
      })),
    },
  };
}
