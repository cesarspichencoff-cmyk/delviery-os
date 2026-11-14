/**
 * Concessão de captura por viagem — a resposta à lacuna X1.
 *
 * O piloto é o dono da atribuição viagem → motoboy. A plataforma é a dona da
 * identidade do aparelho (token, pré-vínculo, revogação). Nenhuma das duas
 * sozinha sabe se ESTE aparelho pode gravar posição NESTA viagem; antes desta
 * concessão, a ingestão aceitava qualquer `trip_id` de um aparelho autenticado.
 *
 * O piloto emite a concessão na consulta de estado de captura que o aparelho já
 * faz, depois de decidir pelo próprio domínio que a viagem é do motoboy
 * vinculado ao aparelho. Ela prende unidade, motoboy, aparelho, viagem e a
 * janela da viagem. O aparelho só a carrega; a plataforma confere a assinatura
 * e confere cada ponto contra ela.
 *
 * Mesmo mecanismo da asserção de leitura do despacho (HMAC-SHA256 por unidade,
 * segredo compartilhado só entre piloto e plataforma), com SEGREDO PRÓPRIO e
 * propósito no corpo: uma asserção de leitura nunca vale como concessão de
 * escrita, nem o contrário. Nada de identidade nova.
 *
 * A janela é o que deixa a sincronização offline honesta: pontos captados
 * durante a viagem e enviados depois do encerramento entram; ponto novo depois
 * do encerramento não entra.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const TRIP_CAPTURE_GRANT_VERSION = "trip-capture-grant@1";
export const TRIP_CAPTURE_GRANT_PURPOSE = "gps_capture";
export const TRIP_GRANT_SECRET_MIN_LENGTH = 32;
/** Validade do documento para subir fila offline depois da viagem. */
export const TRIP_GRANT_MAX_VALIDITY_S = 72 * 60 * 60;
/** Viagem aberta: a janela vai até agora + isto, e é renovada a cada consulta. */
export const TRIP_GRANT_OPEN_WINDOW_S = 15 * 60;
/** Folga de relógio do aparelho nas bordas da janela. */
export const TRIP_GRANT_EDGE_SLACK_S = 120;
/** Maior janela aceitável para uma viagem. */
export const TRIP_GRANT_MAX_WINDOW_S = 12 * 60 * 60;

export interface TripCaptureGrantClaims {
  v: string;
  purpose: string;
  unit_id: string;
  actor_id: string;
  device_id: string;
  trip_id: string;
  /** Início da janela em que a captura vale (início da viagem). */
  window_start: number;
  /** Fim da janela: encerramento da viagem, ou agora + janela aberta. */
  window_end: number;
  iat: number;
  exp: number;
}

export function isUsableTripGrantSecret(secret: string): boolean {
  const s = secret.trim();
  return s.length >= TRIP_GRANT_SECRET_MIN_LENGTH && !/(CHANGE_ME|EXEMPLO|TODO|GERE[_ -]|SUBSTITUA)/i.test(s);
}

const b64u = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4), "base64");
const mac = (body: string, secret: string) =>
  b64u(createHmac("sha256", secret).update(TRIP_CAPTURE_GRANT_PURPOSE + "\n" + body).digest());
const idOk = (x: unknown): x is string => typeof x === "string" && x.length > 0 && x.length <= 128 && x.trim() === x;

/**
 * Emite a concessão. Quem chama já decidiu, pelo domínio, que a viagem é do
 * motoboy deste aparelho; esta função não decide nada, só prende o que recebeu.
 */
export function emitTripCaptureGrant(o: {
  unit_id: string;
  actor_id: string;
  device_id: string;
  trip_id: string;
  /** Início da viagem; ausente = agora (viagem sem saída registrada ainda). */
  started_at: Date | null;
  /** Encerramento; ausente = viagem aberta. */
  closed_at: Date | null;
  now: Date;
  secret: string;
}): string {
  if (!isUsableTripGrantSecret(o.secret)) throw new Error("segredo da concessão de viagem ausente, curto ou placeholder");
  for (const [k, v] of Object.entries({ unit_id: o.unit_id, actor_id: o.actor_id, device_id: o.device_id, trip_id: o.trip_id }))
    if (!idOk(v)) throw new Error(`${k} inválido`);
  const nowS = Math.floor(o.now.getTime() / 1000);
  const start = o.started_at ? Math.floor(o.started_at.getTime() / 1000) : nowS;
  const end = o.closed_at ? Math.floor(o.closed_at.getTime() / 1000) : nowS + TRIP_GRANT_OPEN_WINDOW_S;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) throw new Error("janela da viagem inválida");
  // Viagem mais longa que o teto não recebe janela inteira: a concessão cobre só o fim dela.
  const windowStart = end - start > TRIP_GRANT_MAX_WINDOW_S ? end - TRIP_GRANT_MAX_WINDOW_S : start;
  const claims: TripCaptureGrantClaims = {
    v: TRIP_CAPTURE_GRANT_VERSION, purpose: TRIP_CAPTURE_GRANT_PURPOSE,
    unit_id: o.unit_id, actor_id: o.actor_id, device_id: o.device_id, trip_id: o.trip_id,
    window_start: windowStart, window_end: end, iat: nowS, exp: nowS + TRIP_GRANT_MAX_VALIDITY_S,
  };
  const body = b64u(Buffer.from(JSON.stringify(claims), "utf8"));
  return `tg1.${body}.${mac(body, o.secret)}`;
}

export type VerifyTripGrantResult =
  | { ok: true; claims: TripCaptureGrantClaims }
  | { ok: false; reason: string };

/** Confere assinatura, versão, propósito e validade. Não confere a quem pertence: isso é de quem chama. */
export function verifyTripCaptureGrant(
  token: unknown,
  secretsByUnit: ReadonlyMap<string, string>,
  now: Date,
): VerifyTripGrantResult {
  if (typeof token !== "string" || !token || token.length > 2048) return { ok: false, reason: "concessao_ausente" };
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "tg1" || !parts[1] || !parts[2]) return { ok: false, reason: "concessao_malformada" };
  const [, body, supplied] = parts;
  let c: Partial<TripCaptureGrantClaims>;
  try { c = JSON.parse(fromB64u(body).toString("utf8")) as Partial<TripCaptureGrantClaims>; }
  catch { return { ok: false, reason: "concessao_malformada" }; }
  if (!c || typeof c !== "object") return { ok: false, reason: "concessao_malformada" };
  const secret = typeof c.unit_id === "string" ? secretsByUnit.get(c.unit_id) : undefined;
  if (!secret || !isUsableTripGrantSecret(secret)) return { ok: false, reason: "unidade_nao_autorizada" };
  const a = Buffer.from(supplied, "utf8"), b = Buffer.from(mac(body, secret), "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "assinatura_invalida" };
  const ints = [c.window_start, c.window_end, c.iat, c.exp];
  if (c.v !== TRIP_CAPTURE_GRANT_VERSION || c.purpose !== TRIP_CAPTURE_GRANT_PURPOSE ||
      ![c.unit_id, c.actor_id, c.device_id, c.trip_id].every(idOk) || !ints.every((n) => Number.isSafeInteger(n)))
    return { ok: false, reason: "claims_invalidas" };
  const k = c as TripCaptureGrantClaims;
  const nowS = Math.floor(now.getTime() / 1000);
  if (k.iat > nowS + 60) return { ok: false, reason: "emitida_no_futuro" };
  if (k.exp <= nowS) return { ok: false, reason: "concessao_expirada" };
  if (k.exp - k.iat > TRIP_GRANT_MAX_VALIDITY_S || k.window_end < k.window_start ||
      k.window_end - k.window_start > TRIP_GRANT_MAX_WINDOW_S + TRIP_GRANT_OPEN_WINDOW_S)
    return { ok: false, reason: "janela_invalida" };
  return { ok: true, claims: k };
}

/**
 * O ponto cabe na janela da viagem?
 *
 * Vale se foi CAPTADO dentro da janela (o relógio do aparelho diz) ou se CHEGOU
 * ao servidor dentro dela (o relógio do servidor diz). O segundo caso existe por
 * causa da política de relógio já decidida: ponto com horário suspeito é aceito e
 * preservado, e o crítico carimba a confiança do relógio à parte. Com a viagem
 * encerrada, só o primeiro caso vale — ponto novo depois do fim não entra.
 * A identidade (motoboy, aparelho, viagem) já foi exigida antes; isto só limita
 * o tempo dentro da viagem do próprio motoboy.
 */
export function pointFitsGrant(occurredAtMs: number, receivedAtMs: number, claims: TripCaptureGrantClaims): boolean {
  const dentro = (ms: number) => {
    if (!Number.isFinite(ms)) return false;
    const t = Math.floor(ms / 1000);
    return t >= claims.window_start - TRIP_GRANT_EDGE_SLACK_S && t <= claims.window_end + TRIP_GRANT_EDGE_SLACK_S;
  };
  return dentro(occurredAtMs) || dentro(receivedAtMs);
}

/** Segredos por unidade, do ambiente. Mesmo formato dos segredos de leitura do despacho. */
export function loadTripGrantSecrets(raw: string | undefined, nome: string): ReadonlyMap<string, string> {
  const texto = (raw ?? "").trim();
  if (!texto) return new Map();
  let parsed: unknown;
  try { parsed = JSON.parse(texto); } catch { throw new Error(`${nome} não é JSON válido`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${nome} precisa ser objeto unit_id->segredo`);
  const out = new Map<string, string>();
  for (const [unit, s] of Object.entries(parsed as Record<string, unknown>)) {
    const secret = typeof s === "string" ? s.trim() : "";
    if (!idOk(unit)) throw new Error(`unit_id inválido em ${nome}`);
    if (!isUsableTripGrantSecret(secret)) throw new Error(`segredo de concessão de ${unit} precisa ter ao menos ${TRIP_GRANT_SECRET_MIN_LENGTH} caracteres e não pode ser placeholder`);
    out.set(unit, secret);
  }
  if (!out.size) throw new Error(`${nome} não pode ser objeto vazio`);
  return out;
}
