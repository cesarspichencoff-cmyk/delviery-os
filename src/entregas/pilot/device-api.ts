/**
 * API do aparelho — a ponte entre o Android e o domínio.
 *
 * Os handlers vivem aqui, e não dentro do servidor HTTP, por um motivo
 * prático: assim dá para testá-los sem subir porta, sem rede e sem
 * certificado. O servidor só faz roteamento.
 *
 * Princípio que organiza o arquivo: **o aparelho propõe, o domínio dispõe.**
 * O Android manda pontos e intenções; quem decide se a transição é válida,
 * se a entrega está confirmada e se a viagem fecha continua sendo o
 * ApplicationService. Nada aqui replica máquina de estados.
 */

import { createHash } from "node:crypto";
import type { GPSPoint, GpsPolicy } from "../gps/types";
import { DEFAULT_GPS_POLICY } from "../gps/types";
import { validateSample, type RawGpsSample } from "../gps/validate";
import type { GpsFeatureFlags } from "../gps/flags";
import { DEFAULT_ADAPTIVE_POLICY } from "../gps/adaptive-capture";
import { hashTerm, isPublishable, type LocationTerm } from "../consent/term";
import {
  AcknowledgementStore,
  type AcknowledgementRecord,
  ACK_FORBIDDEN_KEYS,
} from "../consent/acknowledgement";
import type { UnitConfigLoad } from "../gps/unit-config";

export const DEVICE_API_VERSION = "device-api@1.0.0";

/** Papéis que podem consultar rota e coordenada (COR §21.1). */
export const ROUTE_VIEWER_ROLES = ["gerente", "lider_delivery", "operador_expedicao"] as const;
export type RouteViewerRole = (typeof ROUTE_VIEWER_ROLES)[number];

export function canSeeRoute(role: string | undefined): boolean {
  return (ROUTE_VIEWER_ROLES as readonly string[]).includes(role ?? "");
}

export interface DeviceApiResponse {
  status: number;
  body: Record<string, unknown>;
}

function ok(body: Record<string, unknown>): DeviceApiResponse {
  return { status: 200, body: { ok: true, ...body } };
}
function bad(status: number, human: string, code: string): DeviceApiResponse {
  return { status, body: { ok: false, code, human } };
}

/* ------------------------------------------------------------------ *
 * Sessão do aparelho
 * ------------------------------------------------------------------ */

export interface DeviceSessionInput {
  device_id: string;
  app_version: string;
  client: string;
}

export interface AuthorizedDevice {
  device_id: string;
  rider_id: string;
  label: string;
}

/**
 * Autentica o aparelho.
 *
 * Duas condições, e as duas importam: o token de sessão precisa ser válido
 * (é o mesmo mecanismo do console) E o `device_id` precisa estar na lista de
 * aparelhos autorizados. Token sozinho não basta — se ele vazar, um aparelho
 * qualquer não entra.
 *
 * A lista de aparelhos é configuração do responsável. Vazia significa
 * "nenhum aparelho autorizado ainda", e é o default seguro.
 */
export function handleDeviceSession(args: {
  input: Partial<DeviceSessionInput>;
  actorRole?: string;
  actorId?: string;
  authorizedDevices: readonly AuthorizedDevice[];
}): DeviceApiResponse {
  if (!args.actorRole) {
    return bad(401, "Acesso não autorizado. Use o token fornecido pelo responsável.", "no_session");
  }
  const deviceId = (args.input.device_id ?? "").trim();
  if (!deviceId) {
    return bad(400, "Aparelho sem identificação.", "no_device_id");
  }
  const known = args.authorizedDevices.find((d) => d.device_id === deviceId);
  if (!known) {
    return bad(
      403,
      "Este aparelho não está autorizado. Peça ao responsável para cadastrá-lo.",
      "device_not_authorized",
    );
  }
  return ok({
    device_id: known.device_id,
    rider_id: known.rider_id,
    unit_id: undefined,
    api_version: DEVICE_API_VERSION,
  });
}

/* ------------------------------------------------------------------ *
 * Políticas, flags e termo vigente
 * ------------------------------------------------------------------ */

/**
 * Tudo que o aparelho precisa para decidir sozinho quando estiver offline.
 *
 * Repare no que NÃO vai aqui: a coordenada da unidade. O aparelho não
 * precisa dela para capturar, e mandá-la para todo celular seria espalhar a
 * geofence sem necessidade. O retorno é avaliado no servidor.
 */
export function buildPolicies(args: {
  flags: GpsFeatureFlags;
  term: LocationTerm;
  unit: UnitConfigLoad;
  policy?: GpsPolicy;
}): DeviceApiResponse {
  const publishable = isPublishable(args.term);
  return ok({
    api_version: DEVICE_API_VERSION,
    flags: {
      gps_capture_enabled: args.flags.gps_capture_enabled,
      offline_queue_enabled: args.flags.offline_queue_enabled,
      gps_return_detection_enabled: args.flags.gps_return_detection_enabled,
    },
    term: {
      version: args.term.version,
      material_version: args.term.material_version,
      unit_id: args.term.unit_id,
      // Hash só faz sentido quando o termo é apresentável.
      hash: publishable ? hashTerm(args.term) : null,
      publishable,
      language: args.term.language,
    },
    capture_policy: {
      version: DEFAULT_ADAPTIVE_POLICY.version,
      interval_s: DEFAULT_ADAPTIVE_POLICY.interval_s,
      accuracy: DEFAULT_ADAPTIVE_POLICY.accuracy,
      max_interval_s: DEFAULT_ADAPTIVE_POLICY.max_interval_s,
    },
    gps_policy: {
      max_accuracy_usable_m: (args.policy ?? DEFAULT_GPS_POLICY).max_accuracy_usable_m,
      freshness_window_s: (args.policy ?? DEFAULT_GPS_POLICY).freshness_window_s,
      retention_days: (args.policy ?? DEFAULT_GPS_POLICY).retention_days,
    },
    unit: {
      unit_id: args.unit.ok ? args.unit.config.unit_id : null,
      configured: args.unit.ok,
      return_detection_available: args.unit.ok,
    },
  });
}

/* ------------------------------------------------------------------ *
 * Lote de pontos
 * ------------------------------------------------------------------ */

export interface GpsBatchResult {
  accepted: number;
  duplicated: number;
  rejected: number;
  reasons: Record<string, number>;
  accepted_points: GPSPoint[];
}

/**
 * Ingere um lote vindo do aparelho.
 *
 * Cada ponto passa pela MESMA validação que o caminho de navegador usa —
 * `validateSample`. O Android não tem porta de entrada privilegiada: se
 * mandar ponto sem viagem ativa, com dispositivo divergente ou com
 * localização simulada, é rejeitado igual.
 *
 * Duplicata não é erro: é o comportamento esperado de um reenvio depois de
 * queda de rede, e por isso é contada à parte.
 */
export function ingestGpsBatch(args: {
  points: unknown[];
  activeTripIds: ReadonlySet<string>;
  knownPointIds: Set<string>;
  sessionDeviceId: string;
  policy?: GpsPolicy;
  now: Date;
}): GpsBatchResult {
  const policy = args.policy ?? DEFAULT_GPS_POLICY;
  const result: GpsBatchResult = {
    accepted: 0,
    duplicated: 0,
    rejected: 0,
    reasons: {},
    accepted_points: [],
  };

  for (const raw of args.points) {
    const p = raw as Record<string, unknown>;
    const tripId = typeof p.trip_id === "string" ? p.trip_id : "";
    const sample: RawGpsSample = {
      trip_id: tripId,
      device_id: typeof p.device_id === "string" ? p.device_id : "",
      latitude: Number(p.latitude),
      longitude: Number(p.longitude),
      accuracy_m: Number(p.accuracy_m),
      speed_mps: p.speed_mps == null ? undefined : Number(p.speed_mps),
      heading_deg: p.heading_deg == null ? undefined : Number(p.heading_deg),
      altitude_m: p.altitude_m == null ? undefined : Number(p.altitude_m),
      occurred_at: typeof p.occurred_at === "string" ? p.occurred_at : "",
      source: "device",
      captured_offline: p.captured_offline === true,
      is_mock: p.is_mock === true,
    };

    const validation = validateSample(sample, {
      // Viagem ativa é do SERVIDOR, não do que o aparelho afirma.
      active_trip_id: args.activeTripIds.has(tripId) ? tripId : null,
      session_device_id: args.sessionDeviceId,
      policy,
      now: args.now,
      known_point_ids: args.knownPointIds,
    });

    if (!validation.ok) {
      if (validation.rejection === "duplicate") {
        result.duplicated += 1;
      } else {
        result.rejected += 1;
      }
      result.reasons[validation.rejection] = (result.reasons[validation.rejection] ?? 0) + 1;
      continue;
    }

    args.knownPointIds.add(validation.point.point_id);
    result.accepted_points.push({
      ...validation.point,
      synced_at: args.now.toISOString(),
    });
    result.accepted += 1;
  }

  return result;
}

/* ------------------------------------------------------------------ *
 * Aceite do termo
 * ------------------------------------------------------------------ */

const REQUIRED_ACK_FIELDS = [
  "acknowledgement_id",
  "rider_id",
  "unit_id",
  "term_version",
  "term_material_version",
  "term_hash",
  "status",
  "accepted_at",
  "device_id",
] as const;

/**
 * Registra o aceite vindo do aparelho.
 *
 * Três recusas, e cada uma existe por um motivo concreto:
 *  - hash diferente do termo vigente: o aparelho aceitou um texto que não é
 *    o que está no ar. Aceitar isso deixaria o registro provando a coisa
 *    errada;
 *  - campo proibido no corpo: coordenada, documento ou foto não entram, nem
 *    por engano nem por versão futura do app;
 *  - termo não publicável: não há o que aceitar ainda.
 */
export function handleTermAcknowledge(args: {
  input: Record<string, unknown>;
  term: LocationTerm;
  store: AcknowledgementStore;
  now: Date;
}): DeviceApiResponse {
  if (!isPublishable(args.term)) {
    return bad(409, "O termo ainda não foi liberado pelo responsável.", "term_not_publishable");
  }

  const lowerKeys = Object.keys(args.input).map((k) => k.toLowerCase());
  const offending = ACK_FORBIDDEN_KEYS.filter((k) => lowerKeys.includes(k));
  if (offending.length) {
    return bad(400, "O registro de aceite não pode conter esses dados.", "forbidden_field");
  }

  for (const f of REQUIRED_ACK_FIELDS) {
    if (typeof args.input[f] !== "string" || !(args.input[f] as string).trim()) {
      return bad(400, "Registro de aceite incompleto.", "incomplete_ack");
    }
  }

  const expected = hashTerm(args.term);
  if (args.input.term_hash !== expected) {
    return bad(
      409,
      "O termo mudou. É preciso ler e aceitar a versão atual.",
      "term_hash_mismatch",
    );
  }

  const status = args.input.status === "declined" ? "declined" : "accepted";
  const record: AcknowledgementRecord = {
    acknowledgement_id: String(args.input.acknowledgement_id),
    rider_id: String(args.input.rider_id),
    unit_id: String(args.input.unit_id),
    term_version: String(args.input.term_version),
    term_material_version: String(args.input.term_material_version),
    term_hash: expected,
    status,
    accepted_at: String(args.input.accepted_at),
    recorded_at: args.now.toISOString(),
    device_id: String(args.input.device_id),
    app_version: String(args.input.app_version ?? "desconhecido"),
    language: String(args.input.language ?? args.term.language),
    origin: "rider_app",
    correlation_id: String(args.input.correlation_id ?? record_correlation(args.input)),
    schema_version: String(args.input.schema_version ?? "consent@1.0.0"),
  };

  const stored = args.store.append(record);
  return ok({
    acknowledgement_id: stored.record.acknowledgement_id,
    // `stored: false` é sucesso: o aceite já estava registrado.
    stored: stored.stored,
    receipt: args.store.receipt(stored.record.acknowledgement_id),
  });
}

function record_correlation(input: Record<string, unknown>): string {
  return createHash("sha256")
    .update(`${String(input.rider_id)}|${String(input.accepted_at)}`)
    .digest("hex")
    .slice(0, 16);
}

/* ------------------------------------------------------------------ *
 * Projeção de rota para o console
 * ------------------------------------------------------------------ */

export interface RouteAccessResult {
  allowed: boolean;
  human?: string;
}

/**
 * Consulta de rota é auditável e restrita (COR §21.1). Papel não autorizado
 * não recebe coordenada — nem uma, nem "só a última".
 */
export function authorizeRouteAccess(role: string | undefined): RouteAccessResult {
  if (canSeeRoute(role)) return { allowed: true };
  return {
    allowed: false,
    human: "Seu perfil não tem acesso à rota do motoboy.",
  };
}

export interface RouteAuditEntry {
  at: string;
  actor_id: string;
  role: string;
  trip_id: string;
  granted: boolean;
  point_count: number;
}

/** Registro de consulta — sem coordenada, só o fato de ter consultado. */
export function buildRouteAudit(args: {
  actor_id: string;
  role: string;
  trip_id: string;
  granted: boolean;
  point_count: number;
  now: Date;
}): RouteAuditEntry {
  return {
    at: args.now.toISOString(),
    actor_id: args.actor_id,
    role: args.role,
    trip_id: args.trip_id,
    granted: args.granted,
    point_count: args.granted ? args.point_count : 0,
  };
}
