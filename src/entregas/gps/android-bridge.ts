/**
 * Ponte com o runtime Android — adapter da porta `GeolocationProvider`.
 *
 * O domínio continua sem conhecer Android: este arquivo é o único ponto onde
 * o formato do `FusedLocationProviderClient` aparece, e ele o traduz para
 * `ProviderSample`, que já existia. Trocar de runtime troca este adapter e
 * mais nada — máquina de estado, detecção, fila e projeções ficam intactas.
 *
 * Fluxo: Fused Location Provider → ponte → ProviderSample → validação →
 * GPSPoint canônico → fila offline → event log → projeções → despacho.
 *
 * IMPORTANTE, e escrito aqui para não se perder: o lado Kotlin deste contrato
 * NÃO existe neste repositório e não foi compilado nem executado em aparelho.
 * O que está provado por teste é a tradução e as travas — não o serviço nativo.
 */

import type {
  GeolocationProvider,
  ProviderListener,
  ProviderSample,
} from "./provider";
import type { GpsError } from "./types";

/** Provedores de posição do Android que aceitamos identificar. */
export const ANDROID_LOCATION_PROVIDERS = ["fused", "gps", "network", "passive", "unknown"] as const;
export type AndroidLocationProvider = (typeof ANDROID_LOCATION_PROVIDERS)[number];

/**
 * Uma posição como o Android a entrega. Campos espelham `android.location.Location`
 * de propósito — traduzir aqui, e não lá, mantém a ponte nativa burra.
 */
export interface AndroidLocationMessage {
  type: "location";
  latitude: number;
  longitude: number;
  /** `Location.getAccuracy()` — erro horizontal em metros. */
  accuracy_m: number;
  speed_mps?: number;
  bearing_deg?: number;
  altitude_m?: number;
  /** `Location.getTime()` — relógio de calendário, pode saltar. */
  time_ms: number;
  /**
   * `Location.getElapsedRealtimeNanos()` — relógio monotônico desde o boot.
   * Não salta com ajuste de fuso ou de hora, por isso serve de contraprova.
   */
  elapsed_realtime_ns?: number;
  provider?: AndroidLocationProvider;
  /** `Location.isFromMockProvider()`. */
  is_mock?: boolean;
}

/** Estado do serviço nativo, reportado pela ponte — nunca presumido daqui. */
export interface AndroidServiceMessage {
  type: "service_state";
  /** Foreground Service do tipo `location` está rodando. */
  foreground_service_running: boolean;
  /** Notificação persistente visível ao motoboy. */
  notification_visible: boolean;
  /** trip_id ao qual o serviço está amarrado. */
  bound_trip_id: string | null;
  /** Economia de bateria restringindo o app. */
  battery_saver_active?: boolean;
  /** Sistema matou e o serviço se recuperou. */
  recovered_after_restart?: boolean;
}

export interface AndroidErrorMessage {
  type: "error";
  error: GpsError;
  detail?: string;
}

export type AndroidBridgeMessage =
  | AndroidLocationMessage
  | AndroidServiceMessage
  | AndroidErrorMessage;

/**
 * Capacidades declaradas no aperto de mão com a ponte. Nada aqui é presumido:
 * `supportsBackground` só fica true se o runtime nativo AFIRMAR que tem
 * serviço em primeiro plano — é a mesma trava que impediu o adapter de
 * navegador de mentir sobre background.
 */
export interface AndroidBridgeCapabilities {
  runtime: "android";
  app_version: string;
  /** Serviço em primeiro plano do tipo location disponível. */
  foreground_service: boolean;
  /** Geofencing nativo disponível. */
  native_geofencing: boolean;
  /** Reconhecimento de atividade disponível. */
  activity_recognition: boolean;
  /** API mínima do aparelho. */
  sdk_int: number;
}

/** Porta de saída para o lado nativo — comandos que a ponte executa. */
export interface AndroidBridgePort {
  /** Liga o serviço em primeiro plano amarrado a UMA viagem. */
  startService(args: { trip_id: string; notification_text: string }): void;
  /** Desliga o serviço e a captura. */
  stopService(): void;
  /** Registra o receptor de mensagens da ponte. */
  onMessage(handler: (m: AndroidBridgeMessage) => void): void;
  capabilities(): AndroidBridgeCapabilities;
}

/**
 * Texto da notificação persistente. Fixo e pobre de propósito: não pode
 * conter endereço, coordenada, valor, nome de cliente ou qualquer dado
 * sensível (Adendo §1.4). É constante para poder ser testado.
 */
export const FOREGROUND_NOTIFICATION_TEXT =
  "TATÁ Entregas — localização ativa durante a viagem";

/** Termos proibidos na notificação — testado, não confiado. */
export const NOTIFICATION_FORBIDDEN_TERMS = [
  "rua",
  "avenida",
  "número",
  "cliente",
  "pedido",
  "r$",
  "valor",
  "lat",
  "lon",
] as const;

export interface AndroidProviderStatus {
  service_running: boolean;
  notification_visible: boolean;
  bound_trip_id: string | null;
  battery_saver_active: boolean;
  recovered_after_restart: boolean;
  mock_samples_seen: number;
  /** Diferença entre relógio de calendário e monotônico, quando dá para medir. */
  clock_jump_detected: boolean;
}

/**
 * Adapter Android. Implementa exatamente a mesma porta que o provider de
 * navegador — o tracker não sabe qual dos dois está rodando.
 */
export class AndroidBridgeProvider implements GeolocationProvider {
  readonly kind = "device" as const;
  private listener: ProviderListener | null = null;
  private running = false;
  private tripId: string | null = null;
  private serviceRunning = false;
  private notificationVisible = false;
  private boundTripId: string | null = null;
  private batterySaver = false;
  private recovered = false;
  private mockSeen = 0;
  private clockJump = false;
  /** Última dupla (calendário, monotônico) para detectar salto de relógio. */
  private lastPair: { time_ms: number; mono_ns: number } | null = null;

  constructor(private readonly bridge: AndroidBridgePort) {
    this.bridge.onMessage((m) => this.onMessage(m));
  }

  /**
   * Background só é verdade se o runtime nativo declarar serviço em primeiro
   * plano. Sem essa declaração, false — igual ao adapter de navegador.
   */
  get supportsBackground(): boolean {
    return this.bridge.capabilities().foreground_service === true;
  }

  start(listener: ProviderListener): void {
    this.listener = listener;
    // O tracker já garantiu viagem ativa; a ponte recebe o trip_id para
    // amarrar o serviço — serviço sem viagem não deve existir.
    this.running = true;
  }

  /** Liga o serviço nativo para UMA viagem. */
  startForTrip(trip_id: string, listener: ProviderListener): void {
    this.start(listener);
    this.tripId = trip_id;
    this.bridge.startService({
      trip_id,
      notification_text: FOREGROUND_NOTIFICATION_TEXT,
    });
  }

  stop(): void {
    this.bridge.stopService();
    this.running = false;
    this.listener = null;
    this.tripId = null;
    this.lastPair = null;
  }

  isRunning(): boolean {
    return this.running;
  }

  private onMessage(m: AndroidBridgeMessage): void {
    if (m.type === "service_state") {
      this.serviceRunning = m.foreground_service_running;
      this.notificationVisible = m.notification_visible;
      this.boundTripId = m.bound_trip_id;
      this.batterySaver = m.battery_saver_active === true;
      if (m.recovered_after_restart) this.recovered = true;
      return;
    }
    if (m.type === "error") {
      this.listener?.({ type: "error", error: m.error, detail: m.detail });
      return;
    }
    if (!this.running || !this.listener) return; // parado é parado
    if (m.is_mock === true) this.mockSeen += 1;
    this.listener({ type: "sample", sample: this.toSample(m) });
  }

  /** Tradução Android → canônico. Único lugar do sistema que faz isso. */
  private toSample(m: AndroidLocationMessage): ProviderSample & {
    is_mock?: boolean;
    provider_name?: string;
  } {
    if (typeof m.elapsed_realtime_ns === "number") {
      const pair = { time_ms: m.time_ms, mono_ns: m.elapsed_realtime_ns };
      if (this.lastPair) {
        // Os dois relógios devem andar juntos. Se o de calendário anda muito
        // mais (ou menos) que o monotônico, alguém mexeu na hora do aparelho.
        const wall = pair.time_ms - this.lastPair.time_ms;
        const mono = (pair.mono_ns - this.lastPair.mono_ns) / 1e6;
        if (Math.abs(wall - mono) > 5000) this.clockJump = true;
      }
      this.lastPair = pair;
    }
    return {
      latitude: m.latitude,
      longitude: m.longitude,
      accuracy_m: m.accuracy_m,
      speed_mps: m.speed_mps,
      heading_deg: m.bearing_deg,
      altitude_m: m.altitude_m,
      occurred_at: new Date(m.time_ms).toISOString(),
      is_mock: m.is_mock === true,
      provider_name: m.provider ?? "unknown",
    };
  }

  status(): AndroidProviderStatus {
    return {
      service_running: this.serviceRunning,
      notification_visible: this.notificationVisible,
      bound_trip_id: this.boundTripId,
      battery_saver_active: this.batterySaver,
      recovered_after_restart: this.recovered,
      mock_samples_seen: this.mockSeen,
      clock_jump_detected: this.clockJump,
    };
  }

  /** trip_id que este provider está servindo — para conferir amarração. */
  activeTrip(): string | null {
    return this.tripId;
  }
}

/**
 * Confere se a notificação persistente é aceitável. Existe como função para
 * o teste poder afirmar a regra, e não só a constante atual.
 */
export function notificationIsSafe(text: string): boolean {
  const lower = text.toLowerCase();
  return !NOTIFICATION_FORBIDDEN_TERMS.some((t) => lower.includes(t));
}
