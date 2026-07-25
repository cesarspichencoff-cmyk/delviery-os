/**
 * Testes do adendo: provider nativo, captura adaptativa, map matching,
 * unidade ITAIM e termo de ciência.
 *
 * O que estes testes NÃO provam, e é importante que fique dito: eles não
 * provam o serviço Android. Não há projeto Kotlin nem aparelho neste
 * ambiente. O que está provado aqui é o contrato da ponte, a tradução para o
 * canônico e todas as travas — que é exatamente o que pode ser provado sem
 * aparelho, e o que impede o lado nativo de burlar as regras quando existir.
 */

import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

import {
  AndroidBridgeProvider,
  FOREGROUND_NOTIFICATION_TEXT,
  notificationIsSafe,
  type AndroidBridgeCapabilities,
  type AndroidBridgeMessage,
  type AndroidBridgePort,
} from "./android-bridge";
import { GpsTracker } from "./tracker";
import { DEFAULT_GPS_POLICY } from "./types";
import { OfflineQueue, MemoryOfflineStorage, DEFAULT_OFFLINE_CONFIG } from "../offline/queue";

import {
  decideCapture,
  validateAdaptivePolicy,
  activityMovementHint,
  DEFAULT_ADAPTIVE_POLICY,
} from "./adaptive-capture";
import { buildOperationalTrack, buildRawTrack } from "./track-projection";
import {
  runMapMatching,
  SimulatedMapMatchingProvider,
  DisabledMapMatchingProvider,
  DEFAULT_MAP_MATCHING_CONFIG,
  type MapMatchingProvider,
} from "./map-matching";
import {
  validateUnitConfig,
  loadUnitConfig,
  computeReferencePoint,
  evaluateAgainstGeofence,
  ITAIM_CONFIG_TEMPLATE,
  PILOT_UNIT_REFERENCE,
  type UnitConfig,
} from "./unit-config";
import {
  TERM_ITAIM_V1,
  TERM_SUMMARY_ITAIM,
  hashTerm,
  isPublishable,
  pendingFields,
  isMaterialChange,
  PENDING,
  type LocationTerm,
} from "../consent/term";
import {
  buildAcknowledgement,
  AcknowledgementStore,
  MemoryAckStorage,
  ACK_FORBIDDEN_KEYS,
  type AckStorage,
} from "../consent/acknowledgement";
import {
  evaluateGate,
  FIRST_RUN_STEPS,
  stepIndex,
  type PermissionSnapshot,
} from "../consent/location-gate";

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(
      () => {
        passed += 1;
      },
      (e) => {
        failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      },
    );
}

/* ------------------------------------------------------------------ *
 * Utilidades
 * ------------------------------------------------------------------ */

/** Fila offline real — o ponto tem de passar pelo caminho de verdade. */
function newQueue(): OfflineQueue {
  return new OfflineQueue(
    new MemoryOfflineStorage(),
    { ...DEFAULT_OFFLINE_CONFIG, device_id: "dev-1" },
    () => new Date("2026-07-25T12:00:10.000Z"),
  );
}

/** Ponte falsa controlável — o lugar do Kotlin nos testes. */
class FakeBridge implements AndroidBridgePort {
  started: { trip_id: string; notification_text: string }[] = [];
  stopped = 0;
  private handler: ((m: AndroidBridgeMessage) => void) | null = null;
  constructor(private readonly caps: AndroidBridgeCapabilities) {}
  startService(args: { trip_id: string; notification_text: string }): void {
    this.started.push(args);
  }
  stopService(): void {
    this.stopped += 1;
  }
  onMessage(handler: (m: AndroidBridgeMessage) => void): void {
    this.handler = handler;
  }
  capabilities(): AndroidBridgeCapabilities {
    return this.caps;
  }
  emit(m: AndroidBridgeMessage): void {
    this.handler?.(m);
  }
}

const CAPS: AndroidBridgeCapabilities = {
  runtime: "android",
  app_version: "1.0.0",
  foreground_service: true,
  native_geofencing: true,
  activity_recognition: true,
  sdk_int: 33,
};

/** Coordenadas sintéticas — nunca localização real de funcionário ou cliente. */
const SYNTH = { latitude: -23.5, longitude: -46.6 };

function androidMsg(over: Partial<Record<string, unknown>> = {}) {
  return {
    type: "location" as const,
    latitude: SYNTH.latitude,
    longitude: SYNTH.longitude,
    accuracy_m: 12,
    speed_mps: 5,
    bearing_deg: 90,
    time_ms: Date.parse("2026-07-25T12:00:00.000Z"),
    elapsed_realtime_ns: 1_000_000_000,
    provider: "fused" as const,
    ...over,
  };
}

/** Termo completo — o que o responsável produz depois de preencher. */
function approvedTerm(over: Partial<LocationTerm> = {}): LocationTerm {
  return {
    ...TERM_ITAIM_V1,
    effective_date: "2026-08-01",
    controller: {
      legal_name: "EXEMPLO COMERCIO DE ALIMENTOS LTDA",
      cnpj: "00.000.000/0001-00",
      contact_channel: "canal-interno@exemplo",
      contact_owner: "gerencia_operacao",
    },
    approved: true,
    ...over,
  };
}

const PERM_OK: PermissionSnapshot = {
  foreground: "granted_precise",
  background: "not_requested",
  observed_at: "2026-07-25T12:00:00.000Z",
};

function storeWith(records: string[] = []): AcknowledgementStore {
  return new AcknowledgementStore(new MemoryAckStorage(records));
}

function gate(over: Partial<Parameters<typeof evaluateGate>[0]> = {}) {
  const term = approvedTerm();
  return evaluateGate({
    captureEnabled: true,
    activeTripId: "trip-1",
    rider_id: "rid-1",
    term,
    termPublishable: isPublishable(term),
    store: storeWith(),
    permission: PERM_OK,
    ...over,
  });
}

/* ------------------------------------------------------------------ *
 * 1. Tecnologia nativa
 * ------------------------------------------------------------------ */

async function nativeTests(): Promise<void> {
  await test("adapter Android implementa a porta GeolocationProvider", () => {
    const b = new FakeBridge(CAPS);
    const p = new AndroidBridgeProvider(b);
    assert.equal(p.kind, "device");
    assert.equal(typeof p.start, "function");
    assert.equal(typeof p.stop, "function");
    assert.equal(typeof p.isRunning, "function");
    assert.equal(p.supportsBackground, true, "com foreground service declarado");
  });

  await test("background NÃO é declarado quando o runtime não sustenta", () => {
    const b = new FakeBridge({ ...CAPS, foreground_service: false });
    const p = new AndroidBridgeProvider(b);
    assert.equal(p.supportsBackground, false);
  });

  await test("ponto Android vira GPSPoint canônico pela cadeia real", () => {
    const b = new FakeBridge(CAPS);
    const p = new AndroidBridgeProvider(b);
    const queue = newQueue();
    const t = new GpsTracker({
      provider: p,
      policy: DEFAULT_GPS_POLICY,
      queue,
      device_id: "dev-1",
      now: () => new Date("2026-07-25T12:00:10.000Z"),
      captureEnabled: true,
    });
    t.start("trip-1");
    b.emit(androidMsg());
    const pts = t.collected();
    assert.equal(pts.length, 1, "um ponto aceito");
    const pt = pts[0];
    assert.equal(pt.trip_id, "trip-1");
    assert.equal(pt.device_id, "dev-1");
    assert.equal(pt.source, "device");
    assert.equal(pt.schema_version, "gps@1.0.0");
    assert.equal(pt.occurred_at, "2026-07-25T12:00:00.000Z", "time_ms vira ISO");
    assert.equal(pt.heading_deg, 90, "bearing_deg vira heading_deg");
    assert.ok(pt.point_id.startsWith("gps:dev-1:trip-1:"));
  });

  await test("localização simulada é rejeitada com motivo explícito", () => {
    const b = new FakeBridge(CAPS);
    const p = new AndroidBridgeProvider(b);
    const t = new GpsTracker({
      provider: p,
      policy: DEFAULT_GPS_POLICY,
      queue: newQueue(),
      device_id: "dev-1",
      now: () => new Date("2026-07-25T12:00:10.000Z"),
      captureEnabled: true,
    });
    t.start("trip-1");
    b.emit(androidMsg({ is_mock: true }));
    assert.equal(t.collected().length, 0, "ponto simulado não entra no histórico");
    assert.equal(t.status().rejections.mock_location, 1, "rejeição visível");
    assert.equal(p.status().mock_samples_seen, 1);
  });

  await test("serviço só inicia amarrado a uma viagem", () => {
    const b = new FakeBridge(CAPS);
    const p = new AndroidBridgeProvider(b);
    p.startForTrip("trip-9", () => {});
    assert.equal(b.started.length, 1);
    assert.equal(b.started[0].trip_id, "trip-9");
    assert.equal(p.activeTrip(), "trip-9");
  });

  await test("tracker não liga o provider sem viagem ativa", () => {
    const b = new FakeBridge(CAPS);
    const p = new AndroidBridgeProvider(b);
    const t = new GpsTracker({
      provider: p,
      policy: DEFAULT_GPS_POLICY,
      queue: newQueue(),
      device_id: "dev-1",
      now: () => new Date(),
      captureEnabled: true,
    });
    const r = t.start("");
    assert.equal(r.ok, false);
    assert.equal(r.error, "no_active_trip");
    assert.equal(p.isRunning(), false);
  });

  await test("captura desligada por flag não liga nada", () => {
    const b = new FakeBridge(CAPS);
    const p = new AndroidBridgeProvider(b);
    const t = new GpsTracker({
      provider: p,
      policy: DEFAULT_GPS_POLICY,
      queue: newQueue(),
      device_id: "dev-1",
      now: () => new Date(),
      captureEnabled: false,
    });
    const r = t.start("trip-1");
    assert.equal(r.ok, false);
    assert.equal(r.error, "capture_disabled");
    assert.equal(b.started.length, 0);
  });

  await test("notificação persistente aparece e não vaza dado sensível", () => {
    const b = new FakeBridge(CAPS);
    const p = new AndroidBridgeProvider(b);
    p.startForTrip("trip-1", () => {});
    assert.equal(b.started[0].notification_text, FOREGROUND_NOTIFICATION_TEXT);
    assert.ok(notificationIsSafe(FOREGROUND_NOTIFICATION_TEXT));
    b.emit({
      type: "service_state",
      foreground_service_running: true,
      notification_visible: true,
      bound_trip_id: "trip-1",
    });
    assert.equal(p.status().notification_visible, true);
    assert.equal(p.status().bound_trip_id, "trip-1");
  });

  await test("notificação com endereço ou coordenada é recusada pela regra", () => {
    assert.equal(notificationIsSafe("Entregando na Rua X, 100"), false);
    assert.equal(notificationIsSafe("lat -23.5 lon -46.6"), false);
    assert.equal(notificationIsSafe("Pedido de R$ 90 para o cliente"), false);
  });

  await test("stop() desliga o serviço nativo de verdade e para de aceitar ponto", () => {
    const b = new FakeBridge(CAPS);
    const p = new AndroidBridgeProvider(b);
    const t = new GpsTracker({
      provider: p,
      policy: DEFAULT_GPS_POLICY,
      queue: newQueue(),
      device_id: "dev-1",
      now: () => new Date("2026-07-25T12:00:10.000Z"),
      captureEnabled: true,
    });
    t.start("trip-1");
    b.emit(androidMsg());
    assert.equal(t.collected().length, 1);
    t.stop();
    assert.equal(b.stopped, 1, "stopService chamado no lado nativo");
    assert.equal(p.isRunning(), false);
    b.emit(androidMsg({ time_ms: Date.parse("2026-07-25T12:00:05.000Z") }));
    assert.equal(t.collected().length, 1, "nenhum ponto novo depois do stop");
  });

  await test("recuperação após reinício do serviço fica registrada", () => {
    const b = new FakeBridge(CAPS);
    const p = new AndroidBridgeProvider(b);
    p.startForTrip("trip-1", () => {});
    assert.equal(p.status().recovered_after_restart, false);
    b.emit({
      type: "service_state",
      foreground_service_running: true,
      notification_visible: true,
      bound_trip_id: "trip-1",
      recovered_after_restart: true,
    });
    assert.equal(p.status().recovered_after_restart, true);
  });

  await test("tela bloqueada não cria estado falso: sem ponto, nada é inventado", () => {
    const b = new FakeBridge(CAPS);
    const p = new AndroidBridgeProvider(b);
    const t = new GpsTracker({
      provider: p,
      policy: DEFAULT_GPS_POLICY,
      queue: newQueue(),
      device_id: "dev-1",
      now: () => new Date("2026-07-25T12:00:10.000Z"),
      captureEnabled: true,
    });
    t.start("trip-1");
    // Tela apaga: o serviço segue rodando, mas nenhuma posição chega.
    b.emit({
      type: "service_state",
      foreground_service_running: true,
      notification_visible: true,
      bound_trip_id: "trip-1",
    });
    assert.equal(t.collected().length, 0, "nenhum ponto sintético");
    assert.equal(t.status().running, true, "serviço continua honestamente ligado");
  });

  await test("restrição de bateria fica visível, não escondida", () => {
    const b = new FakeBridge(CAPS);
    const p = new AndroidBridgeProvider(b);
    b.emit({
      type: "service_state",
      foreground_service_running: true,
      notification_visible: true,
      bound_trip_id: "trip-1",
      battery_saver_active: true,
    });
    assert.equal(p.status().battery_saver_active, true);
    const d = decideCapture({ returning: false, battery_saver: true });
    assert.equal(d.degraded, true, "degradação declarada");
    assert.match(d.reason, /economia de bateria/);
  });

  await test("salto de relógio de calendário é detectado pelo monotônico", () => {
    const b = new FakeBridge(CAPS);
    const p = new AndroidBridgeProvider(b);
    p.startForTrip("trip-1", () => {});
    b.emit(androidMsg({ time_ms: 1_000_000, elapsed_realtime_ns: 1_000_000_000 }));
    assert.equal(p.status().clock_jump_detected, false);
    // Calendário anda 1 hora; monotônico anda 10 s → alguém mexeu na hora.
    b.emit(androidMsg({ time_ms: 4_600_000, elapsed_realtime_ns: 11_000_000_000 }));
    assert.equal(p.status().clock_jump_detected, true);
  });
}

/* ------------------------------------------------------------------ *
 * 2. Captura adaptativa
 * ------------------------------------------------------------------ */

async function adaptiveTests(): Promise<void> {
  await test("política padrão é válida", () => {
    assert.deepEqual(validateAdaptivePolicy(DEFAULT_ADAPTIVE_POLICY), []);
  });

  await test("política inválida é recusada com motivo", () => {
    const bad = {
      ...DEFAULT_ADAPTIVE_POLICY,
      interval_s: { ...DEFAULT_ADAPTIVE_POLICY.interval_s, parado: 1 },
    };
    const issues = validateAdaptivePolicy(bad);
    assert.ok(issues.some((i) => i.includes("parado")));
  });

  await test("em movimento amostra mais que parado", () => {
    const moving = decideCapture({ returning: false, speed_mps: 8 });
    const still = decideCapture({ returning: false, speed_mps: 0 });
    assert.equal(moving.context, "em_movimento");
    assert.equal(still.context, "parado");
    assert.ok(moving.interval_s < still.interval_s);
  });

  await test("perto da parada pede precisão alta", () => {
    const d = decideCapture({
      returning: false,
      speed_mps: 8,
      current: SYNTH,
      next_stop: { latitude: SYNTH.latitude + 0.0005, longitude: SYNTH.longitude },
    });
    assert.equal(d.context, "proximo_da_parada");
    assert.equal(d.accuracy, "high");
  });

  await test("perto da loja prioriza precisão para geofence e permanência", () => {
    const d = decideCapture({
      returning: true,
      speed_mps: 1,
      current: SYNTH,
      unit: { latitude: SYNTH.latitude + 0.0005, longitude: SYNTH.longitude },
    });
    assert.equal(d.context, "proximo_da_loja");
    assert.equal(d.accuracy, "high");
  });

  await test("bateria crítica reduz cadência e declara a degradação", () => {
    const d = decideCapture({ returning: false, speed_mps: 8, battery_level: 0.05 });
    assert.equal(d.context, "bateria_critica");
    assert.equal(d.degraded, true);
    assert.ok(d.interval_s > decideCapture({ returning: false, speed_mps: 8 }).interval_s);
  });

  await test("limitação vence oportunidade: bateria crítica perto da parada", () => {
    const d = decideCapture({
      returning: false,
      battery_level: 0.05,
      current: SYNTH,
      next_stop: { latitude: SYNTH.latitude + 0.0005, longitude: SYNTH.longitude },
    });
    assert.equal(d.context, "bateria_critica", "limitação não é mascarada");
  });

  await test("GPS impreciso não vira confiança artificial", () => {
    const d = decideCapture({ returning: false, speed_mps: 8, accuracy_m: 300 });
    assert.equal(d.context, "sinal_impreciso");
    assert.equal(d.degraded, true);
    assert.equal(d.accuracy !== "high", true, "não pede precisão alta para ponto ruim");
  });

  await test("parado por muito tempo cai para cadência longa, sob o teto", () => {
    const d = decideCapture({ returning: false, still_for_s: 900 });
    assert.equal(d.context, "sem_movimento_prolongado");
    assert.ok(d.interval_s <= DEFAULT_ADAPTIVE_POLICY.max_interval_s);
  });

  await test("toda decisão carrega a versão da política", () => {
    const d = decideCapture({ returning: false });
    assert.equal(d.policy_version, DEFAULT_ADAPTIVE_POLICY.version);
  });

  await test("reconhecimento de atividade só opina com flag e confiança", () => {
    const hint = { state: "em_veiculo" as const, confidence: 90, observed_at: "x" };
    assert.equal(activityMovementHint(hint, false), undefined, "flag desligada");
    assert.equal(activityMovementHint({ ...hint, confidence: 30 }, true), undefined);
    assert.equal(activityMovementHint(hint, true), true);
    assert.equal(
      activityMovementHint({ ...hint, state: "parado" }, true),
      false,
    );
    assert.equal(
      activityMovementHint({ ...hint, state: "desconhecido" }, true),
      undefined,
    );
  });
}

/* ------------------------------------------------------------------ *
 * 3. Projeção derivada e map matching
 * ------------------------------------------------------------------ */

function rawPoint(over: Record<string, unknown> = {}) {
  return {
    point_id: `gps:dev:trip:${String(over.occurred_at ?? "2026-07-25T12:00:00.000Z")}`,
    idempotency_key: "k",
    trip_id: "trip-1",
    device_id: "dev",
    latitude: SYNTH.latitude,
    longitude: SYNTH.longitude,
    accuracy_m: 10,
    occurred_at: "2026-07-25T12:00:00.000Z",
    recorded_at: "2026-07-25T12:00:00.000Z",
    source: "device" as const,
    quality: "good" as const,
    captured_offline: false,
    clock_trust: "trusted" as const,
    schema_version: "gps@1.0.0",
    ...over,
  };
}

async function projectionTests(): Promise<void> {
  await test("trilha operacional não altera o array bruto", () => {
    const raw = [
      rawPoint(),
      rawPoint({ occurred_at: "2026-07-25T12:00:30.000Z", latitude: SYNTH.latitude + 0.0002 }),
    ];
    const snapshot = JSON.stringify(raw);
    const t = buildOperationalTrack("trip-1", raw);
    assert.equal(JSON.stringify(raw), snapshot, "bruto byte a byte intacto");
    assert.equal(t.layer, "operacional");
    assert.equal(t.raw_count, 2);
  });

  await test("ponto inutilizável sai da leitura operacional mas conta no bruto", () => {
    const raw = [
      rawPoint(),
      rawPoint({
        occurred_at: "2026-07-25T12:00:30.000Z",
        accuracy_m: 800,
        quality: "unusable" as const,
      }),
      rawPoint({ occurred_at: "2026-07-25T12:01:00.000Z", latitude: SYNTH.latitude + 0.0002 }),
    ];
    const t = buildOperationalTrack("trip-1", raw);
    assert.equal(t.points.length, 2);
    assert.equal(t.raw_count, 3);
    assert.equal(t.excluded[0].reason, "precisao_inutilizavel");
    const brutoView = buildRawTrack("trip-1", raw);
    assert.equal(brutoView.points.length, 3, "camada bruta mostra tudo");
  });

  await test("salto impossível é excluído com motivo, não apagado", () => {
    const raw = [
      rawPoint(),
      // 5 km em 1 segundo.
      rawPoint({ occurred_at: "2026-07-25T12:00:01.000Z", latitude: SYNTH.latitude + 0.05 }),
    ];
    const t = buildOperationalTrack("trip-1", raw);
    assert.equal(t.excluded.length, 1);
    assert.equal(t.excluded[0].reason, "salto_impossivel");
    assert.equal(t.raw_count, 2, "bruto continua com os dois");
  });

  await test("um ponto só não vira rota — a tela recebe 'insuficiente'", () => {
    const t = buildOperationalTrack("trip-1", [rawPoint()]);
    assert.equal(t.insufficient, true);
    assert.match(t.note ?? "", /insuficientes/);
  });

  await test("map matching desligado é o padrão e não bloqueia nada", async () => {
    const raw = [rawPoint(), rawPoint({ occurred_at: "2026-07-25T12:00:30.000Z" })];
    const op = buildOperationalTrack("trip-1", raw);
    const r = await runMapMatching({
      config: DEFAULT_MAP_MATCHING_CONFIG,
      provider: new DisabledMapMatchingProvider(),
      trip_id: "trip-1",
      operational: op,
      raw,
      online: true,
    });
    assert.equal(r.track, undefined);
    assert.match(r.skipped_reason ?? "", /desligado/);
    assert.equal(r.raw_preserved, true);
  });

  await test("provedor externo sem autorização não transmite coordenada", async () => {
    const external: MapMatchingProvider = {
      name: "google_roads",
      version: "v1",
      sends_data_externally: true,
      async match() {
        throw new Error("não deveria ser chamado");
      },
    };
    const raw = [
      rawPoint(),
      rawPoint({ occurred_at: "2026-07-25T12:00:30.000Z", latitude: SYNTH.latitude + 0.0002 }),
    ];
    const r = await runMapMatching({
      config: { enabled: true, provider: "google_roads", external_transmission_authorized: false },
      provider: external,
      trip_id: "trip-1",
      operational: buildOperationalTrack("trip-1", raw),
      raw,
      online: true,
    });
    assert.equal(r.track, undefined);
    assert.match(r.skipped_reason ?? "", /sem autorização/);
  });

  await test("falha do provedor não interrompe a viagem", async () => {
    const broken: MapMatchingProvider = {
      name: "mapbox",
      version: "v1",
      sends_data_externally: true,
      async match() {
        throw new Error("timeout do serviço");
      },
    };
    const raw = [
      rawPoint(),
      rawPoint({ occurred_at: "2026-07-25T12:00:30.000Z", latitude: SYNTH.latitude + 0.0002 }),
    ];
    const r = await runMapMatching({
      config: {
        enabled: true,
        provider: "mapbox",
        external_transmission_authorized: true,
        authorized_by: "responsavel_produto",
      },
      provider: broken,
      trip_id: "trip-1",
      operational: buildOperationalTrack("trip-1", raw),
      raw,
      online: true,
    });
    assert.equal(r.track, undefined, "sem camada ajustada");
    assert.match(r.skipped_reason ?? "", /timeout do serviço/);
    assert.equal(r.raw_preserved, true, "histórico intacto");
  });

  await test("offline adia o ajuste sem perder pontos", async () => {
    const raw = [
      rawPoint(),
      rawPoint({ occurred_at: "2026-07-25T12:00:30.000Z", latitude: SYNTH.latitude + 0.0002 }),
    ];
    const r = await runMapMatching({
      config: { enabled: true, provider: "simulator", external_transmission_authorized: false },
      provider: new SimulatedMapMatchingProvider(),
      trip_id: "trip-1",
      operational: buildOperationalTrack("trip-1", raw),
      raw,
      online: false,
    });
    assert.match(r.skipped_reason ?? "", /sincronização/);
    assert.equal(r.raw_preserved, true);
  });

  await test("map matching bem-sucedido é camada separada e registra provedor", async () => {
    const raw = [
      rawPoint(),
      rawPoint({ occurred_at: "2026-07-25T12:00:30.000Z", latitude: SYNTH.latitude + 0.0002 }),
    ];
    const snapshot = JSON.stringify(raw);
    const r = await runMapMatching({
      config: { enabled: true, provider: "simulator", external_transmission_authorized: false },
      provider: new SimulatedMapMatchingProvider(() => new Date("2026-07-25T13:00:00.000Z")),
      trip_id: "trip-1",
      operational: buildOperationalTrack("trip-1", raw),
      raw,
      online: true,
    });
    assert.ok(r.track);
    assert.equal(r.track?.layer, "ajustado_rua");
    assert.equal(r.track?.provider, "simulator");
    assert.equal(r.track?.provider_version, "sim@1.0.0");
    assert.equal(typeof r.track?.provider_confidence, "number");
    assert.equal(JSON.stringify(raw), snapshot, "fonte histórica inalterada");
  });
}

/* ------------------------------------------------------------------ *
 * 4. Unidade ITAIM
 * ------------------------------------------------------------------ */

async function unitTests(): Promise<void> {
  await test("modelo do ITAIM não é utilizável sem preenchimento", () => {
    const issues = validateUnitConfig(ITAIM_CONFIG_TEMPLATE);
    assert.ok(issues.length > 0, "modelo copiado sem edição falha");
    assert.ok(issues.some((i) => i.field === "latitude/longitude"));
    assert.ok(issues.some((i) => i.field === "confirmed_by"));
  });

  await test("endereço de referência existe mas não vira coordenada", () => {
    assert.equal(PILOT_UNIT_REFERENCE.unit_id, "ITAIM");
    assert.match(PILOT_UNIT_REFERENCE.reference_address, /João Cachoeira/);
    assert.equal(ITAIM_CONFIG_TEMPLATE.latitude, 0);
    assert.equal(ITAIM_CONFIG_TEMPLATE.longitude, 0);
  });

  await test("config válida do ITAIM alimenta a política de GPS", () => {
    const cfg: UnitConfig = {
      ...ITAIM_CONFIG_TEMPLATE,
      latitude: SYNTH.latitude,
      longitude: SYNTH.longitude,
      active: true,
      confirmed_by: "gerencia_operacao",
      confirmed_at: "2026-07-25T12:00:00.000Z",
      sample_count: 8,
      sample_spread_m: 9,
    };
    const r = loadUnitConfig(cfg);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.policy.store_geofence_radius_m, cfg.return_radius_m);
      assert.equal(r.policy.stop_geofence_radius_m, cfg.arrival_radius_m);
      assert.equal(r.policy.min_dwell_return_s, cfg.minimum_dwell_s);
    }
  });

  await test("unidade inativa desliga a detecção automática de retorno", () => {
    const r = loadUnitConfig({
      ...ITAIM_CONFIG_TEMPLATE,
      latitude: SYNTH.latitude,
      longitude: SYNTH.longitude,
      confirmed_by: "gerencia_operacao",
      active: false,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.returnDetectionAvailable, false);
  });

  await test("poucas amostras não confirmam a coordenada", () => {
    const s = Array.from({ length: 3 }, (_, i) => ({
      latitude: SYNTH.latitude,
      longitude: SYNTH.longitude,
      accuracy_m: 10,
      occurred_at: `2026-07-25T12:0${i}:00.000Z`,
    }));
    const r = computeReferencePoint(s);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /ao menos 5 amostras/);
  });

  await test("amostras ruins são descartadas antes da média", () => {
    const good = Array.from({ length: 6 }, (_, i) => ({
      latitude: SYNTH.latitude,
      longitude: SYNTH.longitude,
      accuracy_m: 8,
      occurred_at: `2026-07-25T12:0${i}:00.000Z`,
    }));
    const r = computeReferencePoint([
      ...good,
      { latitude: SYNTH.latitude, longitude: SYNTH.longitude, accuracy_m: 200, occurred_at: "x" },
      { latitude: 0, longitude: 0, accuracy_m: 5, occurred_at: "y" },
    ]);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.sample_count, 6);
      assert.equal(r.discarded, 2);
    }
  });

  await test("amostras dispersas mandam repetir a captura", () => {
    const s = Array.from({ length: 6 }, (_, i) => ({
      latitude: SYNTH.latitude + i * 0.001, // ~110 m de espalhamento
      longitude: SYNTH.longitude,
      accuracy_m: 8,
      occurred_at: `2026-07-25T12:0${i}:00.000Z`,
    }));
    const r = computeReferencePoint(s);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /repetir a captura/);
  });

  await test("ponto com margem atravessando a cerca é INCERTO, não prova", () => {
    const center = SYNTH;
    const near = { latitude: SYNTH.latitude + 0.0006, longitude: SYNTH.longitude }; // ~67 m
    const e = evaluateAgainstGeofence({
      point: near,
      accuracy_m: 60,
      center,
      radius_m: 80,
    });
    assert.equal(e.verdict, "incerto");
    assert.match(e.reason, /não serve como prova isolada/);
  });

  await test("ponto preciso e bem dentro é DENTRO; ponto claramente longe é FORA", () => {
    const dentro = evaluateAgainstGeofence({
      point: SYNTH,
      accuracy_m: 10,
      center: SYNTH,
      radius_m: 80,
    });
    assert.equal(dentro.verdict, "dentro");
    const fora = evaluateAgainstGeofence({
      point: { latitude: SYNTH.latitude + 0.01, longitude: SYNTH.longitude },
      accuracy_m: 10,
      center: SYNTH,
      radius_m: 80,
    });
    assert.equal(fora.verdict, "fora");
  });
}

/* ------------------------------------------------------------------ *
 * 5. Termo de ciência
 * ------------------------------------------------------------------ */

async function termTests(): Promise<void> {
  await test("termo inicial NÃO é publicável: campos dependem do responsável", () => {
    assert.equal(isPublishable(TERM_ITAIM_V1), false);
    const p = pendingFields(TERM_ITAIM_V1);
    const fields = p.map((x) => x.field);
    assert.ok(fields.includes("controller.legal_name"));
    assert.ok(fields.includes("controller.cnpj"));
    assert.ok(fields.includes("controller.contact_channel"));
    assert.ok(fields.includes("effective_date"));
    assert.ok(fields.includes("approved"));
  });

  await test("nenhum campo pendente sobra no texto publicável", () => {
    const t = approvedTerm();
    assert.equal(isPublishable(t), true);
    assert.equal(t.body.includes(PENDING), false);
    assert.equal(JSON.stringify(t).includes(PENDING), false);
  });

  await test("termo não contém coordenada nem endereço de cliente", () => {
    const blob = JSON.stringify(approvedTerm()) + TERM_SUMMARY_ITAIM;
    assert.equal(/-?\d{1,3}\.\d{4,}/.test(blob), false, "sem par de coordenadas");
    for (const k of ["latitude", "longitude", "coords"]) {
      assert.equal(blob.toLowerCase().includes(k), false, `sem ${k}`);
    }
  });

  await test("termo diz o essencial em português simples", () => {
    const b = approvedTerm().body.toLowerCase();
    for (const frase of [
      "viagem ativa",
      "não confirma sozinha",
      "ranking",
      "punição",
      "sem sinal",
      "acesso",
      "retenção",
    ]) {
      assert.ok(b.includes(frase), `termo deve falar de "${frase}"`);
    }
  });

  await test("hash muda quando o conteúdo material muda, e só então", () => {
    const a = approvedTerm();
    const h = hashTerm(a);
    assert.equal(hashTerm(approvedTerm()), h, "mesmo conteúdo, mesmo hash");
    const outraRetencao = approvedTerm({
      retention: { operational_event_days: 365, detailed_point_days: 7, after_expiry: "delete" },
    });
    assert.notEqual(hashTerm(outraRetencao), h);
  });

  await test("mudança material é detectada; correção ortográfica não é", () => {
    const a = approvedTerm();
    const ortografia = approvedTerm({ version: "1.0.1", body: a.body.replace("localização", "localizacão") });
    assert.equal(isMaterialChange(a, ortografia), false, "só a versão publicada mudou");
    const retencao = approvedTerm({
      material_version: "2",
      retention: { operational_event_days: 730, detailed_point_days: 90, after_expiry: "delete" },
    });
    assert.equal(isMaterialChange(a, retencao), true);
    const papeis = approvedTerm({
      material_version: "2",
      access_roles: ["despacho_autorizado"],
    });
    assert.equal(isMaterialChange(a, papeis), true);
  });

  await test("aceite gera registro com o hash do texto exibido", () => {
    const term = approvedTerm();
    const r = buildAcknowledgement({
      rider_id: "rid-1",
      term,
      status: "accepted",
      accepted_at: "2026-07-25T12:00:00.000Z",
      device_id: "dev-pseudo-1",
      app_version: "1.0.0",
      origin: "rider_app",
      correlation_id: "corr-1",
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.record.term_hash, hashTerm(term));
      assert.equal(r.record.unit_id, "ITAIM");
      assert.equal(r.record.term_version, term.version);
      assert.equal(r.record.schema_version, "consent@1.0.0");
    }
  });

  await test("termo não publicável não pode gerar aceite", () => {
    const r = buildAcknowledgement({
      rider_id: "rid-1",
      term: TERM_ITAIM_V1,
      status: "accepted",
      accepted_at: "2026-07-25T12:00:00.000Z",
      device_id: "dev-1",
      app_version: "1.0.0",
      origin: "rider_app",
      correlation_id: "c",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /campos pendentes/);
  });

  await test("registro de aceite não carrega dado excessivo", () => {
    const r = buildAcknowledgement({
      rider_id: "rid-1",
      term: approvedTerm(),
      status: "accepted",
      accepted_at: "2026-07-25T12:00:00.000Z",
      device_id: "dev-pseudo-1",
      app_version: "1.0.0",
      origin: "rider_app",
      correlation_id: "c",
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    const keys = Object.keys(r.record).map((k) => k.toLowerCase());
    for (const forbidden of ACK_FORBIDDEN_KEYS) {
      assert.equal(keys.includes(forbidden), false, `campo proibido: ${forbidden}`);
    }
    const blob = JSON.stringify(r.record);
    assert.equal(/-?\d{1,3}\.\d{4,}/.test(blob), false, "sem coordenada no aceite");
  });

  await test("aceite é idempotente: duas vezes, um registro", () => {
    const term = approvedTerm();
    const store = storeWith();
    const build = () =>
      buildAcknowledgement({
        rider_id: "rid-1",
        term,
        status: "accepted",
        accepted_at: "2026-07-25T12:00:00.000Z",
        device_id: "dev-1",
        app_version: "1.0.0",
        origin: "rider_app",
        correlation_id: "c",
      });
    const a = build();
    const b = build();
    assert.ok(a.ok && b.ok);
    if (!a.ok || !b.ok) return;
    assert.equal(a.record.acknowledgement_id, b.record.acknowledgement_id);
    assert.equal(store.append(a.record).stored, true);
    assert.equal(store.append(b.record).stored, false, "segundo não grava");
    assert.equal(store.all().length, 1);
  });

  await test("aceite sobrevive ao reinício do aplicativo", () => {
    const term = approvedTerm();
    const storage = new MemoryAckStorage();
    const first = new AcknowledgementStore(storage);
    const r = buildAcknowledgement({
      rider_id: "rid-1",
      term,
      status: "accepted",
      accepted_at: "2026-07-25T12:00:00.000Z",
      device_id: "dev-1",
      app_version: "1.0.0",
      origin: "rider_app",
      correlation_id: "c",
    });
    assert.ok(r.ok);
    if (!r.ok) return;
    first.append(r.record);

    // Reinício: objeto novo, mesmos bytes.
    const afterRestart = new AcknowledgementStore(new MemoryAckStorage(storage.snapshot()));
    assert.equal(afterRestart.all().length, 1);
    assert.ok(afterRestart.findAccepted("rid-1", term), "aceite continua válido");
  });

  await test("aceite sobrevive a reinício com arquivo real em disco", () => {
    const dir = mkdtempSync(join(tmpdir(), "entregas-consent-"));
    const file = join(dir, "acks.jsonl");
    const fileStorage: AckStorage = {
      appendLine: (line) => appendFileSync(file, line + "\n", "utf8"),
      readLines: () => (existsSync(file) ? readFileSync(file, "utf8").split("\n") : []),
    };
    try {
      const term = approvedTerm();
      const r = buildAcknowledgement({
        rider_id: "rid-1",
        term,
        status: "accepted",
        accepted_at: "2026-07-25T12:00:00.000Z",
        device_id: "dev-1",
        app_version: "1.0.0",
        origin: "rider_app",
        correlation_id: "c",
      });
      assert.ok(r.ok);
      if (!r.ok) return;
      new AcknowledgementStore(fileStorage).append(r.record);
      assert.ok(existsSync(file), "gravou em disco");
      const reopened = new AcknowledgementStore(fileStorage);
      assert.equal(reopened.all().length, 1);
      assert.ok(reopened.findAccepted("rid-1", term));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test("registro é append-only: reescrita posterior não altera o original", () => {
    const term = approvedTerm();
    const r = buildAcknowledgement({
      rider_id: "rid-1",
      term,
      status: "accepted",
      accepted_at: "2026-07-25T12:00:00.000Z",
      device_id: "dev-1",
      app_version: "1.0.0",
      origin: "rider_app",
      correlation_id: "c",
    });
    assert.ok(r.ok);
    if (!r.ok) return;
    const adulterado = { ...r.record, status: "declined" as const, accepted_at: "2020-01-01T00:00:00.000Z" };
    const storage = new MemoryAckStorage([
      JSON.stringify(r.record),
      JSON.stringify(adulterado),
    ]);
    const store = new AcknowledgementStore(storage);
    assert.equal(store.all().length, 1, "id repetido não duplica");
    assert.equal(store.all()[0].status, "accepted", "o primeiro registro prevalece");
  });

  await test("linha corrompida não derruba a store nem apaga o resto", () => {
    const term = approvedTerm();
    const r = buildAcknowledgement({
      rider_id: "rid-1",
      term,
      status: "accepted",
      accepted_at: "2026-07-25T12:00:00.000Z",
      device_id: "dev-1",
      app_version: "1.0.0",
      origin: "rider_app",
      correlation_id: "c",
    });
    assert.ok(r.ok);
    if (!r.ok) return;
    const store = new AcknowledgementStore(
      new MemoryAckStorage(["{lixo", JSON.stringify(r.record), ""]),
    );
    assert.equal(store.all().length, 1);
  });

  await test("recibo pode ser recuperado pelo motoboy", () => {
    const term = approvedTerm();
    const store = storeWith();
    const r = buildAcknowledgement({
      rider_id: "rid-1",
      term,
      status: "accepted",
      accepted_at: "2026-07-25T12:00:00.000Z",
      device_id: "dev-1",
      app_version: "1.0.0",
      origin: "rider_app",
      correlation_id: "c",
    });
    assert.ok(r.ok);
    if (!r.ok) return;
    store.append(r.record);
    const recibo = store.receipt(r.record.acknowledgement_id);
    assert.ok(recibo);
    assert.equal(recibo?.situacao, "aceito");
    assert.equal(recibo?.impressao_do_texto, hashTerm(term));
    assert.equal(recibo?.versao_do_termo, term.version);
  });
}

/* ------------------------------------------------------------------ *
 * 6. Portão: termo × permissão × viagem
 * ------------------------------------------------------------------ */

async function gateTests(): Promise<void> {
  await test("primeira utilização exige termo antes de qualquer captura", () => {
    const d = gate();
    assert.equal(d.allowed, false);
    assert.ok(d.blocks.includes("term_not_acknowledged"));
    assert.equal(d.term_ok, false);
  });

  await test("termo aceito + permissão + viagem libera a captura", () => {
    const term = approvedTerm();
    const store = storeWith();
    const r = buildAcknowledgement({
      rider_id: "rid-1",
      term,
      status: "accepted",
      accepted_at: "2026-07-25T12:00:00.000Z",
      device_id: "dev-1",
      app_version: "1.0.0",
      origin: "rider_app",
      correlation_id: "c",
    });
    assert.ok(r.ok);
    if (!r.ok) return;
    store.append(r.record);
    const d = gate({ store });
    assert.equal(d.allowed, true, d.blocks.join(","));
    assert.equal(d.term_ok, true);
  });

  await test("termo recusado NÃO ativa GPS", () => {
    const term = approvedTerm();
    const store = storeWith();
    const r = buildAcknowledgement({
      rider_id: "rid-1",
      term,
      status: "declined",
      accepted_at: "2026-07-25T12:00:00.000Z",
      device_id: "dev-1",
      app_version: "1.0.0",
      origin: "rider_app",
      correlation_id: "c",
    });
    assert.ok(r.ok);
    if (!r.ok) return;
    store.append(r.record);
    const d = gate({ store });
    assert.equal(d.allowed, false);
    assert.ok(d.blocks.includes("term_declined"));
    assert.match(d.message, /procure o responsável/i);
  });

  await test("versão materialmente nova exige nova ciência", () => {
    const antigo = approvedTerm();
    const store = storeWith();
    const r = buildAcknowledgement({
      rider_id: "rid-1",
      term: antigo,
      status: "accepted",
      accepted_at: "2026-07-25T12:00:00.000Z",
      device_id: "dev-1",
      app_version: "1.0.0",
      origin: "rider_app",
      correlation_id: "c",
    });
    assert.ok(r.ok);
    if (!r.ok) return;
    store.append(r.record);

    const novo = approvedTerm({
      version: "2.0.0",
      material_version: "2",
      retention: { operational_event_days: 365, detailed_point_days: 180, after_expiry: "delete" },
    });
    const d = gate({ store, term: novo });
    assert.equal(d.allowed, false);
    assert.ok(d.blocks.includes("term_version_outdated"));
    assert.match(d.message, /nova versão/i);
  });

  await test("aceite antigo não autoriza versão materialmente diferente", () => {
    const antigo = approvedTerm();
    const store = storeWith();
    const r = buildAcknowledgement({
      rider_id: "rid-1",
      term: antigo,
      status: "accepted",
      accepted_at: "2026-07-25T12:00:00.000Z",
      device_id: "dev-1",
      app_version: "1.0.0",
      origin: "rider_app",
      correlation_id: "c",
    });
    assert.ok(r.ok);
    if (!r.ok) return;
    store.append(r.record);
    const novo = approvedTerm({
      material_version: "2",
      access_roles: ["despacho_autorizado"],
    });
    assert.equal(store.findAccepted("rid-1", novo), undefined);
  });

  await test("termo aceito NÃO substitui a permissão do Android", () => {
    const term = approvedTerm();
    const store = storeWith();
    const r = buildAcknowledgement({
      rider_id: "rid-1",
      term,
      status: "accepted",
      accepted_at: "2026-07-25T12:00:00.000Z",
      device_id: "dev-1",
      app_version: "1.0.0",
      origin: "rider_app",
      correlation_id: "c",
    });
    assert.ok(r.ok);
    if (!r.ok) return;
    store.append(r.record);
    const d = gate({
      store,
      permission: { foreground: "denied", background: "not_requested", observed_at: "x" },
    });
    assert.equal(d.allowed, false);
    assert.ok(d.blocks.includes("permission_denied"));
    assert.equal(d.term_ok, true, "o termo continua aceito — são coisas separadas");
  });

  await test("permissão revogada bloqueia e diz o que aconteceu", () => {
    const d = gate({
      permission: { foreground: "revoked", background: "not_requested", observed_at: "x" },
    });
    assert.ok(d.blocks.includes("permission_revoked"));
  });

  await test("permissão aproximada é sinalizada, não escondida", () => {
    const d = gate({
      permission: { foreground: "granted_approximate", background: "not_requested", observed_at: "x" },
    });
    assert.equal(d.approximate_only, true);
  });

  await test("sem viagem ativa não há captura, mesmo com tudo autorizado", () => {
    const d = gate({ activeTripId: null });
    assert.equal(d.allowed, false);
    assert.ok(d.blocks.includes("no_active_trip"));
  });

  await test("termo não publicável bloqueia antes de pedir qualquer permissão", () => {
    const d = gate({ term: TERM_ITAIM_V1, termPublishable: false });
    assert.equal(d.allowed, false);
    assert.ok(d.blocks.includes("term_not_publishable"));
  });

  await test("a permissão do Android nunca vem antes do termo no fluxo", () => {
    assert.ok(
      stepIndex("termo_completo") < stepIndex("permissao_localizacao_precisa"),
      "termo antes da permissão",
    );
    assert.ok(
      stepIndex("registro_da_ciencia") < stepIndex("permissao_localizacao_precisa"),
      "ciência registrada antes da permissão",
    );
    assert.equal(FIRST_RUN_STEPS[0], "explicacao_resumida");
    assert.equal(FIRST_RUN_STEPS[FIRST_RUN_STEPS.length - 1], "parada_ao_final");
  });
}

/* ------------------------------------------------------------------ *
 * 7. Tela do termo — comportamento real do módulo do navegador
 * ------------------------------------------------------------------ */

async function consentScreenTests(): Promise<void> {
  // O módulo é ESM de navegador e o pacote é commonjs. Copiamos a MESMA fonte
  // para um .mjs temporário e importamos de verdade — comportamento, não texto.
  const source = readFileSync(
    join(process.cwd(), "src/entregas/ui/rider-mobile/consent-screen.js"),
    "utf8",
  );
  const dir = mkdtempSync(join(tmpdir(), "entregas-consent-ui-"));
  const mjs = join(dir, "consent-screen.mjs");
  writeFileSync(mjs, source);
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
  const dynamicImport = new Function("s", "return import(s)") as (
    s: string,
  ) => Promise<Record<string, unknown>>;
  const mod = await dynamicImport(pathToFileURL(mjs).href);
  const createConsentScreen = mod.createConsentScreen as (o?: Record<string, unknown>) => {
    state: () => Record<string, unknown>;
    setChecked: (v: boolean) => boolean;
    toggleFull: () => boolean;
    accept: (c?: Record<string, unknown>) => Promise<{ ok: boolean }>;
    decline: (c?: Record<string, unknown>) => Promise<unknown>;
    consentGranted: () => boolean;
  };
  const renderConsentScreen = mod.renderConsentScreen as (
    el: Record<string, unknown>,
    s: Record<string, unknown>,
  ) => void;
  const LABELS = mod.CONSENT_LABELS as Record<string, string>;
  const DECLINE_CONSEQUENCE = mod.DECLINE_CONSEQUENCE as string;

  await test("checkbox começa desmarcado e o aceite começa bloqueado", () => {
    const s = createConsentScreen({ term: approvedTerm(), summary: TERM_SUMMARY_ITAIM });
    assert.equal(s.state().checked, false);
    assert.equal(s.state().can_accept, false);
  });

  await test("só marcar o checkbox habilita CONCORDAR E CONTINUAR", () => {
    const s = createConsentScreen({ term: approvedTerm() });
    s.setChecked(true);
    assert.equal(s.state().can_accept, true);
    s.setChecked(false);
    assert.equal(s.state().can_accept, false, "desmarcar volta a bloquear");
  });

  await test("aceitar sem marcar o checkbox não registra nada", async () => {
    let called = 0;
    const s = createConsentScreen({
      term: approvedTerm(),
      onAccept: async () => {
        called += 1;
        return { ok: true };
      },
    });
    const r = await s.accept({});
    assert.equal(r.ok, false);
    assert.equal(called, 0, "não chamou o registro");
    assert.equal(s.consentGranted(), false);
  });

  await test("aceitar marcado registra e marca consentimento", async () => {
    let received: Record<string, unknown> | null = null;
    const s = createConsentScreen({
      term: approvedTerm(),
      onAccept: async (ctx: Record<string, unknown>) => {
        received = ctx;
        return { ok: true };
      },
    });
    s.setChecked(true);
    const r = await s.accept({ rider_id: "rid-1" });
    assert.equal(r.ok, true);
    assert.equal(s.consentGranted(), true);
    assert.ok(received, "o registro recebeu o contexto");
  });

  await test("recusar não concede consentimento", async () => {
    const s = createConsentScreen({ term: approvedTerm() });
    s.setChecked(true);
    await s.decline({});
    assert.equal(s.consentGranted(), false);
    assert.equal(s.state().result, "declined");
  });

  await test("sem termo publicável a tela diz o motivo e não deixa aceitar", () => {
    const s = createConsentScreen({ term: null });
    assert.equal(s.state().available, false);
    assert.equal(s.state().can_accept, false);
    assert.match(String(s.state().unavailable_reason), /ainda não foi liberado/);
  });

  await test("os quatro comandos exigidos existem, com os textos combinados", () => {
    assert.equal(LABELS.read_full, "LER TERMO COMPLETO");
    assert.equal(LABELS.accept, "CONCORDAR E CONTINUAR");
    assert.equal(LABELS.decline, "NÃO CONCORDAR / VOLTAR");
    assert.equal(LABELS.copy, "BAIXAR OU RECEBER UMA CÓPIA");
    assert.match(LABELS.checkbox, /^Li e compreendi/);
  });

  await test("consequência da recusa é neutra: sem ameaça, com encaminhamento", () => {
    const t = DECLINE_CONSEQUENCE.toLowerCase();
    for (const ameaca of ["demiss", "advert", "puni", "desconto", "obrigat"]) {
      assert.equal(t.includes(ameaca), false, `não pode conter "${ameaca}"`);
    }
    assert.match(t, /procure o responsável/);
  });

  await test("texto completo só aparece quando o motoboy pede — e o resumo sempre", () => {
    const s = createConsentScreen({ term: approvedTerm(), summary: TERM_SUMMARY_ITAIM });
    assert.equal(s.state().body, "", "não despeja o texto inteiro de cara");
    assert.equal(s.state().summary, TERM_SUMMARY_ITAIM);
    s.toggleFull();
    assert.ok(String(s.state().body).length > 100, "texto completo disponível a um toque");
  });

  await test("a tela renderizada mostra retenção e contato, e nenhuma coordenada", () => {
    const s = createConsentScreen({ term: approvedTerm(), summary: TERM_SUMMARY_ITAIM });
    const el: Record<string, unknown> = { dataset: {}, textContent: "" };
    renderConsentScreen(el, s.state());
    const text = String(el.textContent);
    assert.match(text, /30 dias/, "prazo do ponto detalhado visível");
    assert.match(text, /canal-interno@exemplo/, "canal de contato visível");
    assert.equal(/-?\d{1,3}\.\d{4,}/.test(text), false, "sem coordenada na tela");
    assert.equal((el.dataset as Record<string, string>).checked, "false");
  });
}

/* ------------------------------------------------------------------ *
 * Execução
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  await nativeTests();
  await adaptiveTests();
  await projectionTests();
  await unitTests();
  await termTests();
  await gateTests();
  await consentScreenTests();

  if (failures.length) {
    console.error(`\n=== ${failures.length} FALHA(S) ===`);
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`\n=== ${passed} native+consent tests OK ===`);
}

void main();
