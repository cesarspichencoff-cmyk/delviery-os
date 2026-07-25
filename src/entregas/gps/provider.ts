/**
 * Porta de geolocalização + adapters. O domínio NUNCA fala com
 * `navigator.geolocation` diretamente — fala com `GeolocationProvider`.
 * Isso permite trocar device real ↔ simulador ↔ fixture sem tocar em
 * máquina de estado, detecção ou persistência.
 */

import type { GeoPoint, GpsError, GpsPolicy } from "./types";

/** Amostra crua entregue por um provedor, antes de validação. */
export interface ProviderSample {
  latitude: number;
  longitude: number;
  accuracy_m: number;
  speed_mps?: number;
  heading_deg?: number;
  altitude_m?: number;
  /** Horário do aparelho (ISO). */
  occurred_at: string;
  /** Android informa quando a posição veio de provedor simulado. */
  is_mock?: boolean;
  /** Provedor que originou a posição (fused/gps/network), quando conhecido. */
  provider_name?: string;
}

export type ProviderEvent =
  | { type: "sample"; sample: ProviderSample }
  | { type: "error"; error: GpsError; detail?: string };

export type ProviderListener = (ev: ProviderEvent) => void;

/**
 * Contrato mínimo de qualquer fonte de localização.
 * `start` só deve ser chamado com viagem ativa — a trava é aplicada pelo
 * tracker, não pelo provider (o provider é burro por desenho).
 */
export interface GeolocationProvider {
  readonly kind: "device" | "simulator" | "fixture";
  /** Suporte a captura com app em segundo plano — declarado, nunca presumido. */
  readonly supportsBackground: boolean;
  start(listener: ProviderListener): void;
  stop(): void;
  isRunning(): boolean;
}

/* ------------------------------------------------------------------ *
 * Adapter real — Geolocation API (PWA/navegador)
 * ------------------------------------------------------------------ */

/** Subconjunto da API do navegador que usamos — evita depender de lib DOM. */
export interface BrowserGeolocationLike {
  watchPosition(
    success: (pos: {
      coords: {
        latitude: number;
        longitude: number;
        accuracy: number;
        speed: number | null;
        heading: number | null;
        altitude: number | null;
      };
      timestamp: number;
    }) => void,
    error: (err: { code: number; message: string }) => void,
    options?: { enableHighAccuracy?: boolean; maximumAge?: number; timeout?: number },
  ): number;
  clearWatch(id: number): void;
}

/**
 * Provider real. `supportsBackground = false` de propósito: a Geolocation API
 * do navegador NÃO garante captura confiável com o app minimizado ou a tela
 * bloqueada. Declarar `true` aqui sem prova em aparelho seria exatamente o
 * P1 "background declarado sem prova". Evoluir para runtime nativo/PWA com
 * Background Geolocation trocará apenas este adapter.
 */
export class BrowserGeolocationProvider implements GeolocationProvider {
  readonly kind = "device" as const;
  readonly supportsBackground = false;
  private watchId: number | null = null;

  constructor(
    private readonly geo: BrowserGeolocationLike,
    private readonly policy: GpsPolicy,
  ) {}

  start(listener: ProviderListener): void {
    if (this.watchId !== null) return; // idempotente: nunca dois watchers
    this.watchId = this.geo.watchPosition(
      (pos) => {
        listener({
          type: "sample",
          sample: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy_m: pos.coords.accuracy,
            speed_mps: pos.coords.speed ?? undefined,
            heading_deg: pos.coords.heading ?? undefined,
            altitude_m: pos.coords.altitude ?? undefined,
            occurred_at: new Date(pos.timestamp).toISOString(),
          },
        });
      },
      (err) => {
        // Códigos padrão: 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT
        const map: Record<number, GpsError> = {
          1: "permission_denied",
          2: "position_unavailable",
          3: "timeout",
        };
        listener({
          type: "error",
          error: map[err.code] ?? "position_unavailable",
          detail: err.message,
        });
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: this.policy.sample_interval_s * 1000 * 2,
      },
    );
  }

  stop(): void {
    if (this.watchId === null) return;
    this.geo.clearWatch(this.watchId);
    this.watchId = null;
  }

  isRunning(): boolean {
    return this.watchId !== null;
  }
}

/* ------------------------------------------------------------------ *
 * Simulador determinístico — testes e ensaio do piloto, sem aparelho
 * ------------------------------------------------------------------ */

export interface SimulatedLeg {
  /** Coordenada sintética — NUNCA endereço real de cliente ou funcionário. */
  point: GeoPoint;
  accuracy_m?: number;
  speed_mps?: number;
  /** Segundos após o início da simulação. */
  at_s: number;
}

/**
 * Provider simulado: entrega uma trilha pré-definida sob controle do
 * chamador (`advance`). Determinístico — sem timers, sem aleatoriedade,
 * sem rede. Coordenadas sempre sintéticas.
 */
export class SimulatedGeolocationProvider implements GeolocationProvider {
  readonly kind = "simulator" as const;
  readonly supportsBackground = false;
  private listener: ProviderListener | null = null;
  private cursor = 0;

  constructor(
    private readonly legs: readonly SimulatedLeg[],
    private readonly startIso: string,
  ) {}

  start(listener: ProviderListener): void {
    this.listener = listener;
  }

  stop(): void {
    this.listener = null;
  }

  isRunning(): boolean {
    return this.listener !== null;
  }

  /** Emite as amostras até `untilSeconds`. Nada acontece se estiver parado. */
  advance(untilSeconds: number): number {
    if (!this.listener) return 0;
    let emitted = 0;
    const base = Date.parse(this.startIso);
    while (
      this.cursor < this.legs.length &&
      this.legs[this.cursor].at_s <= untilSeconds
    ) {
      const leg = this.legs[this.cursor];
      this.listener({
        type: "sample",
        sample: {
          latitude: leg.point.latitude,
          longitude: leg.point.longitude,
          accuracy_m: leg.accuracy_m ?? 10,
          speed_mps: leg.speed_mps,
          occurred_at: new Date(base + leg.at_s * 1000).toISOString(),
        },
      });
      this.cursor += 1;
      emitted += 1;
    }
    return emitted;
  }

  /** Injeta erro (permissão negada, sinal perdido) para teste de caminho triste. */
  emitError(error: GpsError, detail?: string): void {
    this.listener?.({ type: "error", error, detail });
  }
}
