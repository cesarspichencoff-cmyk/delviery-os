/**
 * Map matching — encaixar a trilha nas ruas.
 *
 * Está aqui PREPARADO e DESLIGADO. O que este arquivo entrega hoje é a porta
 * versionada e a garantia de que ligar um provedor externo depois não vai
 * bagunçar nada: o bruto continua sendo a fonte histórica, o resultado é
 * apenas mais uma camada derivada, e falha do serviço não pode atrapalhar a
 * viagem.
 *
 * Nenhum provedor pago está implementado. Mandar coordenada de motoboy para
 * terceiro é decisão do responsável pelo produto, não detalhe técnico — por
 * isso o provider externo exige autorização explícita e registrada.
 */

import type { GPSPoint } from "./types";
import type { TrackProjection, OperationalPoint } from "./track-projection";

export const MAP_MATCHING_PROVIDERS = [
  "disabled",
  "simulator",
  "google_roads",
  "mapbox",
] as const;
export type MapMatchingProviderName = (typeof MAP_MATCHING_PROVIDERS)[number];

/** Provedores que enviam coordenada para fora — exigem autorização. */
export const EXTERNAL_PROVIDERS: readonly MapMatchingProviderName[] = [
  "google_roads",
  "mapbox",
];

export interface MapMatchingRequest {
  trip_id: string;
  points: readonly OperationalPoint[];
}

export interface MapMatchedTrack extends TrackProjection {
  layer: "ajustado_rua";
  provider: MapMatchingProviderName;
  provider_version: string;
  /** Confiança declarada pelo provedor, quando houver. */
  provider_confidence?: number;
  matched_at: string;
}

export type MapMatchingResult =
  | { ok: true; track: MapMatchedTrack }
  | { ok: false; reason: string; provider: MapMatchingProviderName };

/** Porta versionada. Qualquer provedor implementa exatamente isto. */
export interface MapMatchingProvider {
  readonly name: MapMatchingProviderName;
  readonly version: string;
  /** true quando o provedor envia coordenada para fora do ambiente. */
  readonly sends_data_externally: boolean;
  match(req: MapMatchingRequest): Promise<MapMatchingResult>;
}

export interface MapMatchingConfig {
  enabled: boolean;
  provider: MapMatchingProviderName;
  /**
   * Autorização explícita do responsável para enviar coordenada a terceiro.
   * Sem isto, provedor externo não roda — nem com a flag ligada.
   */
  external_transmission_authorized: boolean;
  authorized_by?: string;
  authorized_at?: string;
}

/** Default do piloto: desligado, sem autorização. */
export const DEFAULT_MAP_MATCHING_CONFIG: MapMatchingConfig = {
  enabled: false,
  provider: "disabled",
  external_transmission_authorized: false,
};

/** Provedor nulo — o padrão. Não chama nada, não falha, não atrasa. */
export class DisabledMapMatchingProvider implements MapMatchingProvider {
  readonly name = "disabled" as const;
  readonly version = "0";
  readonly sends_data_externally = false;
  async match(): Promise<MapMatchingResult> {
    return { ok: false, reason: "map matching desligado", provider: "disabled" };
  }
}

/**
 * Simulador determinístico. Não consulta rua nenhuma: apenas devolve a mesma
 * trilha rotulada como ajustada, para exercitar o caminho de dados sem rede.
 * Serve para provar o encanamento, não a qualidade do encaixe — e o
 * `provider_confidence` baixo diz isso na cara.
 */
export class SimulatedMapMatchingProvider implements MapMatchingProvider {
  readonly name = "simulator" as const;
  readonly version = "sim@1.0.0";
  readonly sends_data_externally = false;
  constructor(private readonly now: () => Date = () => new Date()) {}

  async match(req: MapMatchingRequest): Promise<MapMatchingResult> {
    if (req.points.length < 2) {
      return { ok: false, reason: "pontos insuficientes", provider: this.name };
    }
    return {
      ok: true,
      track: {
        layer: "ajustado_rua",
        trip_id: req.trip_id,
        points: req.points.map((p) => ({ ...p })),
        excluded: [],
        confidence: 0.5,
        insufficient: false,
        provider: this.name,
        provider_version: this.version,
        provider_confidence: 0.5,
        matched_at: this.now().toISOString(),
        raw_count: req.points.length,
      },
    };
  }
}

export interface MapMatchingRunResult {
  /** A camada ajustada, quando houve. Ausência NUNCA é erro de viagem. */
  track?: MapMatchedTrack;
  /** Motivo de não ter rodado ou de ter falhado — sempre explícito. */
  skipped_reason?: string;
  /** true quando o bruto seguiu intacto (sempre deve ser true). */
  raw_preserved: boolean;
}

/**
 * Executa o map matching com todas as travas.
 *
 * Falha, timeout ou provedor ausente devolvem `skipped_reason` — nunca lançam.
 * A viagem não depende disto e não pode ser interrompida por isto.
 */
export async function runMapMatching(args: {
  config: MapMatchingConfig;
  provider: MapMatchingProvider;
  trip_id: string;
  operational: TrackProjection;
  /** Bruto, só para conferir que continua intacto ao final. */
  raw: readonly GPSPoint[];
  online: boolean;
}): Promise<MapMatchingRunResult> {
  const rawBefore = args.raw.length;
  const done = (r: Omit<MapMatchingRunResult, "raw_preserved">): MapMatchingRunResult => ({
    ...r,
    raw_preserved: args.raw.length === rawBefore,
  });

  if (!args.config.enabled) {
    return done({ skipped_reason: "map matching desligado por configuração" });
  }
  if (args.provider.name === "disabled") {
    return done({ skipped_reason: "nenhum provedor configurado" });
  }
  if (
    args.provider.sends_data_externally &&
    !args.config.external_transmission_authorized
  ) {
    // Trava dura: sem autorização, coordenada de motoboy não sai daqui.
    return done({
      skipped_reason:
        "provedor externo sem autorização do responsável para transmitir coordenadas",
    });
  }
  if (!args.online) {
    // Offline continua funcionando: a rota ajustada pode nascer na sincronização.
    return done({ skipped_reason: "sem rede — ajuste adiado para a sincronização" });
  }
  if (args.operational.insufficient) {
    return done({ skipped_reason: args.operational.note ?? "trilha insuficiente" });
  }

  try {
    const r = await args.provider.match({
      trip_id: args.trip_id,
      points: args.operational.points,
    });
    if (!r.ok) return done({ skipped_reason: r.reason });
    return done({ track: r.track });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return done({ skipped_reason: `falha do provedor: ${msg}` });
  }
}
