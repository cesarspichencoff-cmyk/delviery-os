import {
  emitPlatformReadAssertion,
  isUsablePlatformReadSecret,
  type PlatformReadScope,
} from "../foundation/platform-read-assertion";

export interface PlatformReadActor {
  actor_id: string;
  role: string;
}

export type PlatformLocationResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; kind: "unavailable" | "unauthorized"; human: string };

export interface PlatformLocationClientOptions {
  platformBaseUrl: string;
  unitId: string;
  actor: PlatformReadActor;
  tripId: string;
  secret: string;
  scope: PlatformReadScope;
  now?: Date;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function endpoint(scope: PlatformReadScope): string {
  return scope === "route"
    ? "/api/dispatch/trip/route"
    : "/api/dispatch/trip/location";
}

export async function fetchCanonicalTripGps(
  o: PlatformLocationClientOptions,
): Promise<PlatformLocationResult> {
  const base = o.platformBaseUrl.trim().replace(/\/$/, "");
  const secret = o.secret.trim();
  if (!base) {
    return { ok: false, status: 503, kind: "unavailable", human: "plataforma não configurada" };
  }
  if (!isUsablePlatformReadSecret(secret)) {
    return { ok: false, status: 503, kind: "unavailable", human: "leitura canônica não configurada" };
  }

  let token: string;
  try {
    token = emitPlatformReadAssertion({
      unit_id: o.unitId,
      actor_id: o.actor.actor_id,
      role: o.actor.role,
      trip_id: o.tripId,
      scope: o.scope,
      now: o.now ?? new Date(),
      secret,
    });
  } catch {
    return { ok: false, status: 403, kind: "unauthorized", human: "perfil sem acesso à rota" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), o.timeoutMs ?? 2_000);
  try {
    const url =
      `${base}${endpoint(o.scope)}?trip_id=${encodeURIComponent(o.tripId)}`;
    const r = await (o.fetchImpl ?? fetch)(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Entregas-Client": "pilot-dispatch-read@1.0.0",
      },
      signal: controller.signal,
    });
    const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (r.status === 200) return { ok: true, body };
    if (r.status === 401 || r.status === 403) {
      return {
        ok: false,
        status: r.status,
        kind: "unauthorized",
        human: "A leitura canônica recusou esta consulta.",
      };
    }
    return {
      ok: false,
      status: r.status,
      kind: "unavailable",
      human: "A localização canônica está temporariamente indisponível.",
    };
  } catch {
    return {
      ok: false,
      status: 503,
      kind: "unavailable",
      human: "A localização canônica está temporariamente indisponível.",
    };
  } finally {
    clearTimeout(timer);
  }
}
