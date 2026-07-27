/**
 * Ingestão de lotes do aparelho — a ponte entre o campo e o event log.
 *
 * O Android já existe, já está testado, e fala um formato próprio: um lote
 * plano em `POST /api/gps/batch`, com `device_id` dentro de cada ponto. O
 * `DeviceEnvelope` da plataforma espera outra forma.
 *
 * A decisão é adaptar NO SERVIDOR. Mudar o Kotlin significa recompilar e
 * reinstalar em cada aparelho em campo — e um aparelho na rua com versão velha
 * pararia de sincronizar no dia do deploy. O servidor é a peça barata de mudar;
 * o parque de celulares é a cara. Então o servidor se adapta ao campo.
 *
 * O que este módulo NÃO faz: gravar. Ele traduz e valida, e devolve fatos
 * prontos. Quem grava é o `PlatformUnitOfWork`, em transação, junto da mensagem
 * de outbox.
 */

import { createHash } from "node:crypto";
import {
  checkEvent,
  type EventEnvelope,
  type SourceMode,
} from "../contracts/event-catalog";

export const INGEST_VERSION = "device-ingest@1.0.0";

/** Um lote maior que isto é recusado antes de qualquer análise. */
export const MAX_PONTOS_POR_LOTE = 500;

/* ------------------------------------------------------------------ *
 * O que o Android manda hoje
 * ------------------------------------------------------------------ */

/** Ponto exatamente como o `SyncWorker` do Android monta. */
export interface PontoAndroid {
  point_id: string;
  idempotency_key: string;
  trip_id: string;
  device_id: string;
  latitude: number;
  longitude: number;
  accuracy_m: number;
  speed_mps?: number;
  heading_deg?: number;
  altitude_m?: number;
  occurred_at: string;
  elapsed_realtime_ns?: number;
  provider?: string;
  is_mock?: boolean;
  captured_offline?: boolean;
  sequence_local: number;
  source?: string;
}

export interface LoteGpsAndroid {
  schema_version?: string;
  correlation_id?: string;
  points?: unknown;
}

/* ------------------------------------------------------------------ *
 * Identidade e revogação
 * ------------------------------------------------------------------ */

export interface DispositivoConhecido {
  device_id: string;
  unit_id: string;
  actor_id?: string;
  revoked_at?: string | null;
}

export interface RegistroDeDispositivos {
  buscar(device_id: string): Promise<DispositivoConhecido | null>;
}

export type RecusaIngest =
  | "sem_autenticacao"
  | "dispositivo_desconhecido"
  | "dispositivo_revogado"
  | "lote_malformado"
  | "lote_grande_demais"
  | "unidade_divergente"
  | "device_id_divergente";

export interface ResultadoIngest {
  ok: boolean;
  recusa?: RecusaIngest;
  detalhe?: string;
  /** Fatos prontos para gravar. */
  fatos: readonly EventEnvelope[];
  /** Pontos recusados individualmente, sem derrubar o lote. */
  rejeitados: readonly { idempotency_key: string; motivo: string }[];
  /**
   * Até que sequência o aparelho pode limpar a fila local.
   *
   * Só avança sobre o que foi ACEITO em sequência contínua. Um ponto recusado
   * no meio trava o recibo ali — senão o aparelho apagaria um ponto que nunca
   * entrou, e o buraco seria permanente.
   */
  ack_through_sequence?: number;
}

/* ------------------------------------------------------------------ *
 * Tradução
 * ------------------------------------------------------------------ */

function ehIso(v: unknown): v is string {
  return typeof v === "string" && Number.isFinite(Date.parse(v));
}

function coordenadaValida(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/**
 * Traduz um lote do Android em fatos do catálogo.
 *
 * A ordem das recusas é o desenho, não detalhe: primeiro QUEM é (autenticação,
 * cadastro, revogação), depois se deveria estar falando (unidade), e só então a
 * forma do conteúdo. Um aparelho revogado recebe "revogado" mesmo com o lote
 * quebrado em todo o resto — é assim que um celular perdido sai do ar sem
 * receber dica de como voltar.
 */
export async function traduzirLoteGps(args: {
  corpo: LoteGpsAndroid;
  device_id_autenticado: string | null;
  registro: RegistroDeDispositivos;
  recebido_em: Date;
  source_mode: SourceMode;
}): Promise<ResultadoIngest> {
  const vazio = { fatos: [], rejeitados: [] };

  if (!args.device_id_autenticado) {
    return { ok: false, recusa: "sem_autenticacao", detalhe: "sem credencial de aparelho", ...vazio };
  }

  const dispositivo = await args.registro.buscar(args.device_id_autenticado);
  if (!dispositivo) {
    return { ok: false, recusa: "dispositivo_desconhecido", detalhe: "aparelho não cadastrado", ...vazio };
  }
  if (dispositivo.revoked_at) {
    return {
      ok: false,
      recusa: "dispositivo_revogado",
      detalhe: "aparelho revogado",
      ...vazio,
    };
  }

  const pontos = args.corpo.points;
  if (!Array.isArray(pontos)) {
    return { ok: false, recusa: "lote_malformado", detalhe: "points ausente", ...vazio };
  }
  if (pontos.length === 0) {
    // Lote vazio é aceito: o aparelho pode estar só confirmando que está vivo.
    return { ok: true, fatos: [], rejeitados: [] };
  }
  if (pontos.length > MAX_PONTOS_POR_LOTE) {
    return {
      ok: false,
      recusa: "lote_grande_demais",
      detalhe: `${pontos.length} pontos excede ${MAX_PONTOS_POR_LOTE}`,
      ...vazio,
    };
  }

  const rejeitados: { idempotency_key: string; motivo: string }[] = [];
  const aceitos: { ponto: PontoAndroid; fato: EventEnvelope }[] = [];

  for (const bruto of pontos as PontoAndroid[]) {
    const chave = typeof bruto?.idempotency_key === "string" ? bruto.idempotency_key : "";
    const recusar = (motivo: string): void => {
      rejeitados.push({ idempotency_key: chave || "(sem chave)", motivo });
    };

    if (!chave.trim()) {
      recusar("sem chave de idempotência");
      continue;
    }
    // Um aparelho não pode mandar ponto em nome de outro. Sem esta checagem,
    // qualquer credencial válida poderia escrever a história de qualquer
    // viagem — e a auditoria apontaria o aparelho errado.
    if (bruto.device_id !== dispositivo.device_id) {
      recusar("device_id do ponto diverge do aparelho autenticado");
      continue;
    }
    if (typeof bruto.trip_id !== "string" || !bruto.trip_id.trim()) {
      recusar("sem trip_id");
      continue;
    }
    if (!coordenadaValida(bruto.latitude, bruto.longitude)) {
      recusar("coordenada inválida");
      continue;
    }
    if (!ehIso(bruto.occurred_at)) {
      recusar("occurred_at inválido");
      continue;
    }
    if (!Number.isInteger(bruto.sequence_local) || bruto.sequence_local < 0) {
      recusar("sequence_local inválida");
      continue;
    }
    if (bruto.is_mock === true) {
      // Localização simulada num lote `real` é contradição. Recusar é o único
      // caminho honesto: aceitar contaminaria o histórico da operação.
      recusar("localização simulada em lote real");
      continue;
    }

    const fato: EventEnvelope = {
      event_id: `ev-${createHash("sha256").update(chave).digest("hex").slice(0, 24)}`,
      event_type: "gps_batch_received",
      event_version: "gps_batch_received@1.0.0",
      unit_id: dispositivo.unit_id,
      trip_id: bruto.trip_id,
      device_id: dispositivo.device_id,
      actor_id: dispositivo.actor_id,
      occurred_at: new Date(bruto.occurred_at).toISOString(),
      // O aparelho diz quando aconteceu; o servidor diz quando recebeu. A
      // distância entre os dois é a latência de sincronização, e ela precisa
      // continuar mensurável depois.
      observed_at: args.recebido_em.toISOString(),
      origin: "device",
      source_mode: args.source_mode,
      sequence: bruto.sequence_local,
      idempotency_key: chave,
      correlation_id: args.corpo.correlation_id,
      payload: {
        latitude: bruto.latitude,
        longitude: bruto.longitude,
        accuracy_m: bruto.accuracy_m,
        speed_mps: bruto.speed_mps,
        heading_deg: bruto.heading_deg,
        altitude_m: bruto.altitude_m,
        provider: bruto.provider,
        captured_offline: bruto.captured_offline === true,
        elapsed_realtime_ns: bruto.elapsed_realtime_ns,
      },
    };

    // O catálogo é a última palavra — inclusive sobre PII no payload.
    const checado = checkEvent(fato);
    if (!checado.ok) {
      recusar(`${checado.rejection}: ${checado.detail}`);
      continue;
    }

    aceitos.push({ ponto: bruto, fato: checado.envelope });
  }

  return {
    ok: true,
    fatos: aceitos.map((a) => a.fato),
    rejeitados,
    ack_through_sequence: calcularAck(pontos as PontoAndroid[], rejeitados),
  };
}

/**
 * Até onde o aparelho pode apagar.
 *
 * Percorre o lote em ordem de sequência e para na PRIMEIRA recusa. Devolver o
 * maior aceito seria mais generoso e estaria errado: o aparelho apagaria tudo
 * até ali, inclusive o ponto recusado no meio, e aquele buraco não voltaria
 * nunca mais.
 */
function calcularAck(
  pontos: readonly PontoAndroid[],
  rejeitados: readonly { idempotency_key: string }[],
): number | undefined {
  const ruins = new Set(rejeitados.map((r) => r.idempotency_key));
  const ordenados = [...pontos]
    .filter((p) => Number.isInteger(p?.sequence_local))
    .sort((a, b) => a.sequence_local - b.sequence_local);

  let ack: number | undefined;
  for (const p of ordenados) {
    if (ruins.has(p.idempotency_key)) break;
    ack = p.sequence_local;
  }
  return ack;
}

/* ------------------------------------------------------------------ *
 * Recibo
 * ------------------------------------------------------------------ */

export interface Recibo {
  received_at: string;
  accepted: number;
  duplicate: number;
  rejected: number;
  ack_through_sequence?: number;
  rejections: readonly { idempotency_key: string; motivo: string }[];
  ingest_version: string;
}

/**
 * Recibo do lote.
 *
 * `duplicate` é contado à parte de `rejected` porque duplicata é SUCESSO: o
 * fato já está gravado e o aparelho pode limpar a fila local. Contá-la como
 * erro faria o aparelho reenviar para sempre o que já chegou.
 */
export function montarRecibo(args: {
  resultado: ResultadoIngest;
  gravados: number;
  recebido_em: Date;
}): Recibo {
  const aceitos = args.resultado.fatos.length;
  return {
    received_at: args.recebido_em.toISOString(),
    accepted: args.gravados,
    duplicate: Math.max(0, aceitos - args.gravados),
    rejected: args.resultado.rejeitados.length,
    ack_through_sequence: args.resultado.ack_through_sequence,
    rejections: args.resultado.rejeitados,
    ingest_version: INGEST_VERSION,
  };
}
