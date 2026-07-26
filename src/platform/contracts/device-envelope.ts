/**
 * Envelopes versionados para agentes de campo.
 *
 * Dois clientes, o mesmo problema: um processo fora do nosso controle observa
 * o mundo, guarda o que viu, e manda quando consegue. Entre observar e chegar
 * pode passar minuto ou hora, o processo pode reiniciar, e o mesmo pacote
 * pode chegar duas vezes.
 *
 *  - **Android** (existe hoje): o motoboy em viagem;
 *  - **Store Agent** (futuro): o agente na loja lendo fontes autorizadas.
 *
 * Três carimbos que nunca se fundem, porque respondem a perguntas diferentes:
 *
 *   occurred_at  — quando aconteceu no mundo
 *   observed_at  — quando o agente viu
 *   received_at  — quando o servidor recebeu
 *
 * Fundir os dois primeiros faz uma sincronização atrasada parecer um evento
 * atrasado, e é assim que se acusa um motoboy de demorar quando ele só estava
 * sem sinal.
 */

export const DEVICE_ENVELOPE_VERSION = "device-envelope@1.0.0";
export const SOURCE_ENVELOPE_VERSION = "source-envelope@1.0.0";

/** Versão mínima aceita. Abaixo disso, o servidor manda atualizar. */
export const MIN_ANDROID_APP_VERSION = "1.0.0";

/* ------------------------------------------------------------------ *
 * Android
 * ------------------------------------------------------------------ */

export interface DeviceIdentity {
  /** Pseudônimo gerado no aparelho. Nunca IMEI, MAC ou telefone. */
  device_id: string;
  unit_id: string;
  /** Ator operacional vinculado ao aparelho. */
  actor_id: string;
  app_version: string;
  /** Versão do envelope que o cliente fala. */
  envelope_version: string;
}

export interface DeviceEnvelope<T> {
  envelope_version: string;
  device: DeviceIdentity;
  /** Ordem local do aparelho — permite ordenar sem confiar no relógio dele. */
  sequence_local: number;
  /** Chave de negócio. É ela que deduplica no servidor. */
  idempotency_key: string;
  correlation_id: string;
  occurred_at: string;
  /** true quando o cliente está reenviando algo que já mandou. */
  replay: boolean;
  trip_id?: string;
  payload: T;
}

/** Recibo durável: o que o aparelho guarda para saber que pode limpar a fila. */
export interface DeviceReceipt {
  idempotency_key: string;
  accepted: boolean;
  /** `duplicate` é ACEITAÇÃO: já estava lá, o aparelho pode apagar. */
  outcome: "stored" | "duplicate" | "rejected";
  reason?: string;
  received_at: string;
  /** Até esta sequência o servidor já tem tudo — o cliente poda a fila. */
  ack_through_sequence?: number;
}

export const ENVELOPE_REJECTIONS = [
  "unknown_device",
  "revoked_device",
  "unit_mismatch",
  "app_too_old",
  "envelope_unsupported",
  "no_active_trip",
  "malformed",
] as const;
export type EnvelopeRejection = (typeof ENVELOPE_REJECTIONS)[number];

export interface DeviceRegistry {
  isKnown(device_id: string): boolean;
  isRevoked(device_id: string): boolean;
  unitOf(device_id: string): string | undefined;
}

/** Compara versões `x.y.z`. Sufixos (`-debug`) são ignorados. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v.split("-")[0].split(".").map((n) => Number.parseInt(n, 10) || 0);
  const [pa, pb] = [parse(a), parse(b)];
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export type EnvelopeCheck =
  | { ok: true }
  | { ok: false; rejection: EnvelopeRejection; detail: string };

/**
 * Valida o envelope ANTES de qualquer efeito.
 *
 * A ordem das recusas é deliberada: primeiro "quem é você" (aparelho
 * desconhecido ou revogado), depois "você deveria estar falando comigo"
 * (unidade, versão), e só então a forma. Um aparelho revogado não merece uma
 * mensagem sobre o formato do payload.
 */
export function checkEnvelope(
  envelope: DeviceEnvelope<unknown>,
  registry: DeviceRegistry,
  minVersion = MIN_ANDROID_APP_VERSION,
): EnvelopeCheck {
  const d = envelope.device;

  if (!d?.device_id?.trim()) {
    return { ok: false, rejection: "malformed", detail: "device_id ausente" };
  }
  if (!registry.isKnown(d.device_id)) {
    return { ok: false, rejection: "unknown_device", detail: "aparelho não cadastrado" };
  }
  // Revogação vence tudo: é a forma de tirar um aparelho perdido do ar.
  if (registry.isRevoked(d.device_id)) {
    return { ok: false, rejection: "revoked_device", detail: "aparelho revogado" };
  }
  const unidade = registry.unitOf(d.device_id);
  if (unidade && d.unit_id && unidade !== d.unit_id) {
    return { ok: false, rejection: "unit_mismatch", detail: "unidade divergente do cadastro" };
  }
  if (compareVersions(d.app_version ?? "0.0.0", minVersion) < 0) {
    return {
      ok: false,
      rejection: "app_too_old",
      detail: `versão ${d.app_version} abaixo da mínima ${minVersion}`,
    };
  }
  // Major diferente é incompatível; minor maior é aceito (aditivo).
  const major = (v: string) => v.split("@")[1]?.split(".")[0] ?? "";
  if (major(envelope.envelope_version) !== major(DEVICE_ENVELOPE_VERSION)) {
    return {
      ok: false,
      rejection: "envelope_unsupported",
      detail: `envelope ${envelope.envelope_version} incompatível com ${DEVICE_ENVELOPE_VERSION}`,
    };
  }
  if (!envelope.idempotency_key?.trim()) {
    return { ok: false, rejection: "malformed", detail: "idempotency_key ausente" };
  }
  if (!Number.isInteger(envelope.sequence_local) || envelope.sequence_local < 0) {
    return { ok: false, rejection: "malformed", detail: "sequence_local inválida" };
  }
  if (!envelope.occurred_at || Number.isNaN(Date.parse(envelope.occurred_at))) {
    return { ok: false, rejection: "malformed", detail: "occurred_at inválido" };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Store Agent (futuro — fixtures sintéticas apenas)
 * ------------------------------------------------------------------ */

export interface SourceAgentIdentity {
  agent_id: string;
  unit_id: string;
  /** Origem observada. Nesta missão só existe em fixture sintética. */
  source: string;
  agent_version: string;
  envelope_version: string;
}

export interface SourceEventEnvelope<T> {
  envelope_version: string;
  agent: SourceAgentIdentity;
  sequence_local: number;
  /** Retomada: por onde continuar depois de uma queda. */
  cursor?: string;
  idempotency_key: string;
  /** Quando o agente VIU. */
  observed_at: string;
  /** Quando aconteceu na origem, quando dá para saber. Pode ser ausente. */
  occurred_at?: string;
  replay: boolean;
  /** Hash do que foi observado — permite auditar sem guardar a evidência. */
  evidence_hash?: string;
  payload: T;
}

export interface AgentHeartbeat {
  agent_id: string;
  unit_id: string;
  at: string;
  /** Último cursor confirmado — mostra se o agente está andando ou travado. */
  cursor?: string;
  pending_local: number;
  healthy: boolean;
  detail?: string;
}

/**
 * Saúde do agente pelo heartbeat.
 *
 * Silêncio é o sinal mais importante e o mais fácil de ignorar: um agente que
 * parou de falar não reporta erro nenhum. Por isso a ausência de heartbeat é
 * tratada como estado, e não como falta de informação.
 */
export function agentHealth(
  last: AgentHeartbeat | undefined,
  now: Date,
  staleAfterS = 300,
): { state: "healthy" | "degraded" | "unavailable"; detail: string } {
  if (!last) return { state: "unavailable", detail: "nunca reportou" };
  const idade = (now.getTime() - Date.parse(last.at)) / 1000;
  if (idade > staleAfterS) {
    return { state: "unavailable", detail: `sem sinal há ${Math.round(idade)}s` };
  }
  if (!last.healthy) return { state: "degraded", detail: last.detail ?? "agente reportou problema" };
  if (last.pending_local > 500) {
    return { state: "degraded", detail: `${last.pending_local} itens represados no agente` };
  }
  return { state: "healthy", detail: "em dia" };
}
