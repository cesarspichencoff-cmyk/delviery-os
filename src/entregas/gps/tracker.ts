/**
 * Tracker de GPS — orquestra provider + validação + fila offline.
 *
 * É AQUI que mora a trava estrutural de privacidade: o tracker só liga o
 * provider quando existe viagem ativa E a flag está ligada E o dispositivo
 * confere. Ao encerrar/cancelar/abandonar a viagem, `stop()` desliga o
 * watcher de verdade — não apenas ignora os pontos (COR §21.1, Adendo §4).
 *
 * Nenhuma coordenada é impressa em log por este módulo.
 */

import type { GeolocationProvider, ProviderEvent } from "./provider";
import type { GPSPoint, GpsError, GpsPolicy, GpsRejection } from "./types";
import { validateSample, type RawGpsSample } from "./validate";
import { shouldSample } from "./detection";
import type { OfflineQueue } from "../offline/queue";

export interface TrackerDeps {
  provider: GeolocationProvider;
  policy: GpsPolicy;
  queue: OfflineQueue;
  device_id: string;
  now: () => Date;
  /** Flag central; false = nunca liga. */
  captureEnabled: boolean;
  /** Notificação para a interface (status do GPS). */
  onStatus?: (s: TrackerStatus) => void;
}

export interface TrackerStatus {
  running: boolean;
  trip_id: string | null;
  last_error?: GpsError;
  accepted: number;
  rejected: number;
  /** Motivos de rejeição acumulados — diagnóstico sem expor coordenada. */
  rejections: Partial<Record<GpsRejection, number>>;
}

export class GpsTracker {
  private activeTripId: string | null = null;
  private accepted = 0;
  private rejected = 0;
  private rejections: Partial<Record<GpsRejection, number>> = {};
  private lastError?: GpsError;
  private lastPoint?: GPSPoint;
  private readonly knownIds = new Set<string>();
  private readonly points: GPSPoint[] = [];

  constructor(private readonly deps: TrackerDeps) {}

  /**
   * Liga a captura para UMA viagem. Recusa quando não há viagem, quando a
   * flag está desligada ou quando já está rastreando outra viagem.
   */
  start(trip_id: string): { ok: boolean; error?: GpsError } {
    if (!this.deps.captureEnabled) {
      this.lastError = "capture_disabled";
      this.emit();
      return { ok: false, error: "capture_disabled" };
    }
    if (!trip_id) {
      this.lastError = "no_active_trip";
      this.emit();
      return { ok: false, error: "no_active_trip" };
    }
    if (this.activeTripId && this.activeTripId !== trip_id) {
      // Nunca rastrear duas viagens ao mesmo tempo.
      this.stop();
    }
    if (this.provider.isRunning() && this.activeTripId === trip_id) {
      return { ok: true }; // idempotente
    }
    this.activeTripId = trip_id;
    this.provider.start((ev) => this.onProviderEvent(ev));
    this.emit();
    return { ok: true };
  }

  private get provider(): GeolocationProvider {
    return this.deps.provider;
  }

  /**
   * Desliga a captura de verdade. Chamado ao encerrar, cancelar ou
   * abandonar a viagem. Após isto, nenhum ponto novo é aceito.
   */
  stop(): void {
    this.provider.stop();
    this.activeTripId = null;
    this.emit();
  }

  private onProviderEvent(ev: ProviderEvent): void {
    if (ev.type === "error") {
      this.lastError = ev.error;
      this.emit();
      return;
    }
    this.ingest(ev.sample);
  }

  /** Valida, amostra e enfileira. Nunca lança. */
  private ingest(sample: {
    latitude: number;
    longitude: number;
    accuracy_m: number;
    speed_mps?: number;
    heading_deg?: number;
    altitude_m?: number;
    occurred_at: string;
  }): void {
    // Trava dura: sem viagem ativa, o ponto não existe para o sistema.
    if (!this.activeTripId) {
      this.countRejection("trip_not_active");
      return;
    }

    const raw: RawGpsSample = {
      trip_id: this.activeTripId,
      device_id: this.deps.device_id,
      latitude: sample.latitude,
      longitude: sample.longitude,
      accuracy_m: sample.accuracy_m,
      speed_mps: sample.speed_mps,
      heading_deg: sample.heading_deg,
      altitude_m: sample.altitude_m,
      occurred_at: sample.occurred_at,
      source: this.provider.kind === "simulator" ? "simulator" : "device",
    };

    const result = validateSample(raw, {
      active_trip_id: this.activeTripId,
      session_device_id: this.deps.device_id,
      policy: this.deps.policy,
      now: this.deps.now(),
      known_point_ids: this.knownIds,
    });

    if (!result.ok) {
      this.countRejection(result.rejection);
      return;
    }

    // Amostragem: descarta redundância quando parado, preservando cadência.
    if (
      !shouldSample({
        candidate: {
          latitude: result.point.latitude,
          longitude: result.point.longitude,
          occurred_at: result.point.occurred_at,
        },
        last: this.lastPoint,
        policy: this.deps.policy,
      })
    ) {
      return;
    }

    this.knownIds.add(result.point.point_id);
    this.points.push(result.point);
    this.lastPoint = result.point;
    this.accepted += 1;

    // Grava na fila ANTES de qualquer rede.
    this.deps.queue.enqueue({
      event_id: result.point.point_id,
      idempotency_key: result.point.idempotency_key,
      kind: "gps_point",
      payload: { ...result.point } as unknown as Record<string, unknown>,
      occurred_at: result.point.occurred_at,
      trip_id: result.point.trip_id,
    });
    this.emit();
  }

  private countRejection(r: GpsRejection): void {
    this.rejected += 1;
    this.rejections[r] = (this.rejections[r] ?? 0) + 1;
  }

  private emit(): void {
    this.deps.onStatus?.(this.status());
  }

  status(): TrackerStatus {
    return {
      running: this.provider.isRunning(),
      trip_id: this.activeTripId,
      last_error: this.lastError,
      accepted: this.accepted,
      rejected: this.rejected,
      rejections: { ...this.rejections },
    };
  }

  /** Pontos aceitos nesta sessão (para projeção/detecção). */
  collected(): readonly GPSPoint[] {
    return this.points.slice();
  }

  /** Injeção direta de amostra — usada por lote offline e por teste. */
  ingestExternal(sample: RawGpsSample): void {
    this.ingest(sample);
  }
}
