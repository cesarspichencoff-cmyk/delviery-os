/**
 * Bateria de GPS operacional — COR §13, §21.1, §22 + Adendo GPS Piloto.
 * Executar: npm run test:entregas:gps
 *
 * TODAS as coordenadas são SINTÉTICAS (prefixo SIM-). Nenhuma localização
 * real de funcionário ou cliente entra em fixture (Adendo §4.10).
 */
import assert from "node:assert/strict";
import {
  DEFAULT_GPS_POLICY,
  type GPSPoint,
  type GeoPoint,
} from "./types";
import { validateSample, pointId, classifyQuality } from "./validate";
import {
  distanceMeters,
  isInsideGeofence,
  continuousDwellSeconds,
  computeFreshness,
  buildLocationProjection,
  evaluateArrival,
  evaluateReturn,
  evaluateSignal,
  shouldSample,
  sortByOccurredAt,
} from "./detection";
import { SimulatedGeolocationProvider } from "./provider";
import { GpsTracker } from "./tracker";
import { OfflineQueue, MemoryOfflineStorage, DEFAULT_OFFLINE_CONFIG } from "../offline/queue";
import { SAFE_DEFAULT_FLAGS, validateFlags, loadFlags } from "./flags";

let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  OK  ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}`);
    throw e;
  }
}

/** Loja sintética — não é endereço real. */
const SIM_STORE: GeoPoint = { latitude: -23.500000, longitude: -46.600000 };
/** Destino sintético a ~1,1 km da loja. */
const SIM_DEST: GeoPoint = { latitude: -23.510000, longitude: -46.600000 };
const DEVICE = "SIM-DEV-001";
const TRIP = "SIM-TRIP-1";
const policy = DEFAULT_GPS_POLICY;

function pt(over: Partial<GPSPoint> & { occurred_at: string }): GPSPoint {
  return {
    point_id: over.point_id ?? pointId(DEVICE, TRIP, over.occurred_at),
    idempotency_key: over.idempotency_key ?? pointId(DEVICE, TRIP, over.occurred_at),
    trip_id: over.trip_id ?? TRIP,
    device_id: over.device_id ?? DEVICE,
    latitude: over.latitude ?? SIM_STORE.latitude,
    longitude: over.longitude ?? SIM_STORE.longitude,
    accuracy_m: over.accuracy_m ?? 10,
    speed_mps: over.speed_mps,
    heading_deg: over.heading_deg,
    occurred_at: over.occurred_at,
    recorded_at: over.recorded_at ?? over.occurred_at,
    source: over.source ?? "simulator",
    quality: over.quality ?? classifyQuality(over.accuracy_m ?? 10, policy),
    captured_offline: over.captured_offline ?? false,
    clock_trust: over.clock_trust ?? "trusted",
    schema_version: "gps@1.0.0",
  };
}

const T0 = "2026-07-25T18:00:00.000Z";
const at = (s: number) => new Date(Date.parse(T0) + s * 1000).toISOString();

console.log("\n=== Entregas GPS tests (COR §13/§21/§22 + Adendo) ===\n");

/* ---------------- validação e trava de viagem ativa ---------------- */

test("ponto SEM viagem ativa é rejeitado (trava estrutural de privacidade)", () => {
  const r = validateSample(
    { trip_id: TRIP, device_id: DEVICE, latitude: -23.5, longitude: -46.6, accuracy_m: 10, occurred_at: T0, source: "simulator" },
    { active_trip_id: null, session_device_id: DEVICE, policy, now: new Date(T0) },
  );
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.rejection, "trip_not_active");
});

test("ponto de OUTRA viagem é rejeitado", () => {
  const r = validateSample(
    { trip_id: "SIM-TRIP-OUTRA", device_id: DEVICE, latitude: -23.5, longitude: -46.6, accuracy_m: 10, occurred_at: T0, source: "simulator" },
    { active_trip_id: TRIP, session_device_id: DEVICE, policy, now: new Date(T0) },
  );
  assert.equal(r.ok === false && r.rejection, "trip_mismatch");
});

test("ponto de OUTRO dispositivo é rejeitado", () => {
  const r = validateSample(
    { trip_id: TRIP, device_id: "SIM-DEV-INTRUSO", latitude: -23.5, longitude: -46.6, accuracy_m: 10, occurred_at: T0, source: "simulator" },
    { active_trip_id: TRIP, session_device_id: DEVICE, policy, now: new Date(T0) },
  );
  assert.equal(r.ok === false && r.rejection, "device_mismatch");
});

test("coordenadas fora de faixa são rejeitadas", () => {
  const ctx = { active_trip_id: TRIP, session_device_id: DEVICE, policy, now: new Date(T0) };
  const lat = validateSample({ trip_id: TRIP, device_id: DEVICE, latitude: 91, longitude: -46.6, accuracy_m: 10, occurred_at: T0, source: "simulator" as const }, ctx);
  const lon = validateSample({ trip_id: TRIP, device_id: DEVICE, latitude: -23.5, longitude: 181, accuracy_m: 10, occurred_at: T0, source: "simulator" as const }, ctx);
  assert.equal(lat.ok === false && lat.rejection, "invalid_latitude");
  assert.equal(lon.ok === false && lon.rejection, "invalid_longitude");
});

test("timestamp impossível (futuro distante) é rejeitado", () => {
  const r = validateSample(
    { trip_id: TRIP, device_id: DEVICE, latitude: -23.5, longitude: -46.6, accuracy_m: 10, occurred_at: "2030-01-01T00:00:00.000Z", source: "simulator" },
    { active_trip_id: TRIP, session_device_id: DEVICE, policy, now: new Date(T0) },
  );
  assert.equal(r.ok === false && r.rejection, "impossible_timestamp");
});

test("duplicata pelo mesmo point_id é rejeitada", () => {
  const id = pointId(DEVICE, TRIP, T0);
  const r = validateSample(
    { trip_id: TRIP, device_id: DEVICE, latitude: -23.5, longitude: -46.6, accuracy_m: 10, occurred_at: T0, source: "simulator" },
    { active_trip_id: TRIP, session_device_id: DEVICE, policy, now: new Date(T0), known_point_ids: new Set([id]) },
  );
  assert.equal(r.ok === false && r.rejection, "duplicate");
});

test("accuracy classifica good/degraded/unusable pela política", () => {
  assert.equal(classifyQuality(10, policy), "good");
  assert.equal(classifyQuality(50, policy), "degraded");
  assert.equal(classifyQuality(500, policy), "unusable");
});

/* ---------------- freshness ---------------- */

test("freshness: sem viagem ativa = unknown (nada a apresentar)", () => {
  const f = computeFreshness({ points: [], policy, now: new Date(T0), hasActiveTrip: false, online: true });
  assert.equal(f.freshness, "unknown");
});

test("freshness: ponto recente e preciso = current", () => {
  const f = computeFreshness({ points: [pt({ occurred_at: at(0) })], policy, now: new Date(at(10)), hasActiveTrip: true, online: true });
  assert.equal(f.freshness, "current");
});

test("freshness: ponto velho NUNCA aparece como atual = stale", () => {
  const f = computeFreshness({ points: [pt({ occurred_at: at(0) })], policy, now: new Date(at(600)), hasActiveTrip: true, online: true });
  assert.equal(f.freshness, "stale");
  assert.ok((f.age_s ?? 0) > policy.freshness_window_s);
});

test("freshness: accuracy ruim = inaccurate (não mente que é preciso)", () => {
  const f = computeFreshness({ points: [pt({ occurred_at: at(0), accuracy_m: 60 })], policy, now: new Date(at(10)), hasActiveTrip: true, online: true });
  assert.equal(f.freshness, "inaccurate");
});

test("freshness: offline tem precedência sobre idade", () => {
  const f = computeFreshness({ points: [pt({ occurred_at: at(0) })], policy, now: new Date(at(10)), hasActiveTrip: true, online: false });
  assert.equal(f.freshness, "offline");
});

test("freshness: permissão negada é declarada, não confundida com sem sinal", () => {
  const f = computeFreshness({ points: [], policy, now: new Date(T0), hasActiveTrip: true, online: true, permissionDenied: true });
  assert.equal(f.freshness, "permission_denied");
});

test("projeção traz rótulo honesto e contagem de rota", () => {
  const proj = buildLocationProjection({
    trip_id: TRIP, points: [pt({ occurred_at: at(0) }), pt({ occurred_at: at(30) })],
    policy, now: new Date(at(600)), hasActiveTrip: true, online: true, pending_offline: 2,
  });
  assert.equal(proj.freshness, "stale");
  assert.match(proj.label, /antiga/i);
  assert.equal(proj.route_points, 2);
  assert.equal(proj.pending_offline, 2);
});

/* ---------------- geometria e dwell ---------------- */

test("haversine e geofence coerentes", () => {
  const d = distanceMeters(SIM_STORE, SIM_DEST);
  assert.ok(d > 1000 && d < 1200, `distância sintética ~1.1km, obtido ${d}`);
  assert.equal(isInsideGeofence(SIM_STORE, SIM_STORE, 80), true);
  assert.equal(isInsideGeofence(SIM_DEST, SIM_STORE, 80), false);
});

test("dwell contínuo: sai do cálculo assim que houver ponto fora", () => {
  const pts = [
    pt({ occurred_at: at(0), ...SIM_STORE }),
    pt({ occurred_at: at(60), ...SIM_DEST }),   // saiu
    pt({ occurred_at: at(120), ...SIM_STORE }), // voltou
    pt({ occurred_at: at(180), ...SIM_STORE }),
  ];
  const d = continuousDwellSeconds({ points: pts, center: SIM_STORE, radius_m: 80, now: new Date(at(180)) });
  assert.equal(d.dwell_s, 60, "conta só a permanência contínua final");
  assert.equal(d.samples, 2);
});

test("ordem temporal é reconstruída (nunca confia na ordem de chegada)", () => {
  const pts = [pt({ occurred_at: at(120) }), pt({ occurred_at: at(0) }), pt({ occurred_at: at(60) })];
  const sorted = sortByOccurredAt(pts);
  assert.deepEqual(sorted.map((p) => p.occurred_at), [at(0), at(60), at(120)]);
});

test("amostragem evita ponto redundante quando parado", () => {
  const last = pt({ occurred_at: at(0), ...SIM_STORE });
  const perto = shouldSample({ candidate: { ...SIM_STORE, occurred_at: at(5) }, last, policy });
  const depois = shouldSample({ candidate: { ...SIM_STORE, occurred_at: at(60) }, last, policy });
  assert.equal(perto, false, "mesmo lugar, pouco tempo: não amostra");
  assert.equal(depois, true, "cadência mínima de tempo respeitada");
});

/* ---------------- chegada ---------------- */

test("chegada detectada com geofence + dwell + accuracy", () => {
  const pts = [
    pt({ occurred_at: at(0), ...SIM_DEST }),
    pt({ occurred_at: at(30), ...SIM_DEST }),
    pt({ occurred_at: at(60), ...SIM_DEST }),
  ];
  const r = evaluateArrival({ points: pts, destination: SIM_DEST, policy, now: new Date(at(60)) });
  assert.equal(r.detected, true, r.reasons.join(","));
  assert.ok(r.evidence_point_ids.length >= 3);
});

test("chegada NÃO detectada quando falta permanência", () => {
  const pts = [pt({ occurred_at: at(0), ...SIM_DEST }), pt({ occurred_at: at(5), ...SIM_DEST })];
  const r = evaluateArrival({ points: pts, destination: SIM_DEST, policy, now: new Date(at(5)) });
  assert.equal(r.detected, false);
  assert.ok(r.reasons.includes("permanencia_insuficiente"));
});

test("chegada NÃO detectada longe do destino", () => {
  const pts = [pt({ occurred_at: at(0), ...SIM_STORE }), pt({ occurred_at: at(60), ...SIM_STORE })];
  const r = evaluateArrival({ points: pts, destination: SIM_DEST, policy, now: new Date(at(60)) });
  assert.equal(r.detected, false);
  assert.ok(r.reasons.includes("fora_do_geofence_do_destino"));
});

test("chegada detectada NÃO confirma entrega (contrato de separação)", () => {
  const pts = [pt({ occurred_at: at(0), ...SIM_DEST }), pt({ occurred_at: at(60), ...SIM_DEST })];
  const r = evaluateArrival({ points: pts, destination: SIM_DEST, policy, now: new Date(at(60)) });
  const asAny = r as unknown as Record<string, unknown>;
  assert.equal("delivery_confirmed" in asAny, false);
  assert.equal("entregue" in asAny, false);
  // O motor só produz evidência; confirmação é ato humano fora deste módulo.
  assert.deepEqual(Object.keys(r).sort(), ["accuracy_m", "detected", "distance_m", "dwell_s", "evidence_point_ids", "reasons"]);
});

/* ---------------- retorno ---------------- */

function returnPoints(): GPSPoint[] {
  return [
    pt({ occurred_at: at(0), ...SIM_STORE, speed_mps: 0.2 }),
    pt({ occurred_at: at(30), ...SIM_STORE, speed_mps: 0.1 }),
    pt({ occurred_at: at(60), ...SIM_STORE, speed_mps: 0.0 }),
    pt({ occurred_at: at(90), ...SIM_STORE, speed_mps: 0.0 }),
  ];
}

test("retorno detectado com TODAS as condições cumulativas", () => {
  const r = evaluateReturn({ points: returnPoints(), store: SIM_STORE, policy, now: new Date(at(95)) });
  assert.equal(r.detected, true, r.reasons.join(","));
  assert.equal(r.evidence.in_store_geofence, true);
  assert.equal(r.evidence.gps_recent, true);
  assert.ok(r.evidence.dwell_s >= policy.min_dwell_return_s);
  assert.ok(r.samples >= policy.min_samples_return);
  assert.ok(r.detected_at, "carimba o momento da detecção");
  assert.ok(r.evidence_point_ids.length > 0, "prova de proveniência");
});

test("sem retorno quando falta dwell", () => {
  const pts = [pt({ occurred_at: at(0), ...SIM_STORE, speed_mps: 0 }), pt({ occurred_at: at(10), ...SIM_STORE, speed_mps: 0 })];
  const r = evaluateReturn({ points: pts, store: SIM_STORE, policy, now: new Date(at(10)) });
  assert.equal(r.detected, false);
  assert.ok(r.reasons.includes("permanencia_insuficiente"));
});

test("sem retorno quando está fora do geofence da loja", () => {
  const pts = returnPoints().map((p) => ({ ...p, latitude: SIM_DEST.latitude, longitude: SIM_DEST.longitude }));
  const r = evaluateReturn({ points: pts, store: SIM_STORE, policy, now: new Date(at(95)) });
  assert.equal(r.detected, false);
  assert.ok(r.reasons.includes("fora_do_geofence_da_loja"));
});

test("sem retorno quando o GPS está desatualizado", () => {
  const r = evaluateReturn({ points: returnPoints(), store: SIM_STORE, policy, now: new Date(at(900)) });
  assert.equal(r.detected, false);
  assert.ok(r.reasons.includes("gps_desatualizado"));
  assert.equal(r.evidence.gps_recent, false);
});

test("sem retorno quando a velocidade está acima do limite", () => {
  const pts = returnPoints().map((p) => ({ ...p, speed_mps: 8 }));
  const r = evaluateReturn({ points: pts, store: SIM_STORE, policy, now: new Date(at(95)) });
  assert.equal(r.detected, false);
  assert.ok(r.reasons.includes("velocidade_acima_do_limite"));
});

test("sem retorno quando a accuracy é insuficiente", () => {
  const pts = returnPoints().map((p) => ({ ...p, accuracy_m: 500, quality: "unusable" as const }));
  const r = evaluateReturn({ points: pts, store: SIM_STORE, policy, now: new Date(at(95)) });
  assert.equal(r.detected, false);
  assert.ok(r.reasons.includes("sem_pontos_utilizaveis"));
});

test("velocidade AUSENTE não vira 'parado' por otimismo", () => {
  const pts = returnPoints().map((p) => ({ ...p, speed_mps: undefined }));
  const r = evaluateReturn({ points: pts, store: SIM_STORE, policy, now: new Date(at(95)) });
  assert.equal(r.detected, false);
  assert.ok(r.reasons.includes("velocidade_acima_do_limite"), "sem dado de velocidade, critério não é dado por satisfeito");
});

test("exceção bloqueante impede retorno automático (COR §13.1)", () => {
  const r = evaluateReturn({ points: returnPoints(), store: SIM_STORE, policy, now: new Date(at(95)), blockingException: true });
  assert.equal(r.detected, false);
  assert.ok(r.reasons.includes("excecao_bloqueante"));
});

test("recusa também é auditável: evidência preenchida mesmo quando não detecta", () => {
  const r = evaluateReturn({ points: [], store: SIM_STORE, policy, now: new Date(at(95)) });
  assert.equal(r.detected, false);
  assert.equal(typeof r.evidence.max_horizontal_accuracy_m, "number");
  assert.equal(typeof r.evidence.min_dwell_s, "number");
  assert.equal(typeof r.evidence.max_speed_mps, "number");
});

test("evidência traz o limite APLICADO junto do valor medido", () => {
  const r = evaluateReturn({ points: returnPoints(), store: SIM_STORE, policy, now: new Date(at(95)) });
  assert.equal(r.evidence.min_dwell_s, policy.min_dwell_return_s);
  assert.equal(r.evidence.max_speed_mps, policy.max_speed_return_mps);
  assert.equal(r.evidence.max_horizontal_accuracy_m, policy.max_accuracy_usable_m);
});

/* ---------------- sinal perdido / recuperado ---------------- */

test("sinal perdido após silêncio prolongado (trip_signal_lost)", () => {
  const s = evaluateSignal({ points: [pt({ occurred_at: at(0) })], policy, now: new Date(at(600)), previouslyLost: false });
  assert.equal(s.status, "lost");
});

test("sinal recuperado quando volta ponto recente (trip_signal_recovered)", () => {
  const s = evaluateSignal({ points: [pt({ occurred_at: at(600) })], policy, now: new Date(at(610)), previouslyLost: true });
  assert.equal(s.status, "recovered");
});

test("não reemite o mesmo evento de sinal repetidamente", () => {
  const s = evaluateSignal({ points: [pt({ occurred_at: at(0) })], policy, now: new Date(at(600)), previouslyLost: true });
  assert.equal(s.status, "ok");
});

/* ---------------- tracker: ligar/desligar ---------------- */

function makeTracker(captureEnabled = true) {
  const queue = new OfflineQueue(new MemoryOfflineStorage(), { ...DEFAULT_OFFLINE_CONFIG, device_id: DEVICE }, () => new Date(at(0)));
  const provider = new SimulatedGeolocationProvider(
    [
      { point: SIM_STORE, at_s: 0, speed_mps: 0 },
      { point: SIM_STORE, at_s: 30, speed_mps: 0 },
      { point: SIM_STORE, at_s: 60, speed_mps: 0 },
    ],
    T0,
  );
  let nowMs = Date.parse(T0);
  const tracker = new GpsTracker({
    provider, policy, queue, device_id: DEVICE,
    now: () => new Date(nowMs), captureEnabled,
  });
  return { tracker, provider, queue, setNow: (s: number) => { nowMs = Date.parse(T0) + s * 1000; } };
}

test("tracker NÃO liga com a flag de captura desligada", () => {
  const { tracker, provider } = makeTracker(false);
  const r = tracker.start(TRIP);
  assert.equal(r.ok, false);
  assert.equal(r.error, "capture_disabled");
  assert.equal(provider.isRunning(), false);
});

test("tracker NÃO liga sem trip_id", () => {
  const { tracker, provider } = makeTracker(true);
  const r = tracker.start("");
  assert.equal(r.ok, false);
  assert.equal(r.error, "no_active_trip");
  assert.equal(provider.isRunning(), false);
});

test("tracker captura durante viagem ativa e enfileira offline", () => {
  const { tracker, provider, queue, setNow } = makeTracker(true);
  tracker.start(TRIP);
  setNow(60);
  provider.advance(60);
  assert.ok(tracker.status().accepted >= 2, "capturou pontos");
  assert.ok(queue.pendingCount() >= 2, "gravou na fila ANTES da rede");
});

test("stop() DESLIGA o watcher de verdade e nenhum ponto novo é aceito", () => {
  const { tracker, provider, setNow } = makeTracker(true);
  tracker.start(TRIP);
  setNow(30);
  provider.advance(30);
  const antes = tracker.status().accepted;

  tracker.stop();
  assert.equal(provider.isRunning(), false, "watcher realmente desligado");
  assert.equal(tracker.status().trip_id, null);

  setNow(60);
  provider.advance(60); // provider parado: não deve emitir nada
  assert.equal(tracker.status().accepted, antes, "nenhum ponto após o encerramento");
});

test("ponto que chega sem viagem ativa é contabilizado como rejeitado, nunca aceito", () => {
  const { tracker } = makeTracker(true);
  tracker.ingestExternal({
    trip_id: TRIP, device_id: DEVICE, latitude: -23.5, longitude: -46.6,
    accuracy_m: 10, occurred_at: at(0), source: "simulator",
  });
  assert.equal(tracker.status().accepted, 0);
  assert.equal(tracker.status().rejections.trip_not_active, 1);
});

test("permissão negada é reportada como erro, sem inventar posição", () => {
  const { tracker, provider } = makeTracker(true);
  tracker.start(TRIP);
  provider.emitError("permission_denied");
  assert.equal(tracker.status().last_error, "permission_denied");
  assert.equal(tracker.status().accepted, 0);
});

test("start() é idempotente: não cria dois watchers", () => {
  const { tracker, provider, setNow } = makeTracker(true);
  tracker.start(TRIP);
  tracker.start(TRIP);
  setNow(60);
  provider.advance(60);
  const ids = new Set(tracker.collected().map((p) => p.point_id));
  assert.equal(ids.size, tracker.collected().length, "sem pontos duplicados");
});

/* ---------------- flags ---------------- */

test("default das flags é seguro (tudo desligado)", () => {
  for (const [, v] of Object.entries(SAFE_DEFAULT_FLAGS)) assert.equal(v, false);
});

test("background NUNCA fica ligado se o runtime não sustenta (falha fechada)", () => {
  const r = validateFlags({ ...SAFE_DEFAULT_FLAGS, gps_background_enabled: true }, false);
  assert.equal(r.ok, false);
  assert.equal(r.effective.gps_background_enabled, false);
  assert.equal(r.issues[0].flag, "gps_background_enabled");
});

test("retorno automático exige captura ligada", () => {
  const r = validateFlags({ ...SAFE_DEFAULT_FLAGS, gps_return_detection_enabled: true }, false);
  assert.equal(r.effective.gps_return_detection_enabled, false);
});

test("loadFlags preenche ausentes com o default seguro", () => {
  const f = loadFlags({ gps_capture_enabled: true });
  assert.equal(f.gps_capture_enabled, true);
  assert.equal(f.gps_map_enabled, false);
});

/* ---------------- privacidade ---------------- */

test("provider real declara supportsBackground=false (nunca prometido sem prova)", async () => {
  const { BrowserGeolocationProvider } = await import("./provider");
  const p = new BrowserGeolocationProvider(
    { watchPosition: () => 1, clearWatch: () => {} },
    policy,
  );
  assert.equal(p.supportsBackground, false);
});

test("status do tracker NÃO expõe coordenadas (diagnóstico sem localização)", () => {
  const { tracker, provider, setNow } = makeTracker(true);
  tracker.start(TRIP);
  setNow(60);
  provider.advance(60);
  const serialized = JSON.stringify(tracker.status());
  assert.equal(serialized.includes("latitude"), false);
  assert.equal(serialized.includes("-23.5"), false);
  assert.equal(serialized.includes("-46.6"), false);
});

test("fixtures são sintéticas (SIM-) e sem PII", () => {
  assert.ok(DEVICE.startsWith("SIM-"));
  assert.ok(TRIP.startsWith("SIM-"));
  assert.equal(/\d{11}|@|CPF/i.test(DEVICE + TRIP), false);
});

test("nenhuma saída do motor contém ranking, score ou métrica de pessoa", () => {
  const r = evaluateReturn({ points: returnPoints(), store: SIM_STORE, policy, now: new Date(at(95)) });
  const s = JSON.stringify(r).toLowerCase();
  for (const proibido of ["ranking", "score", "produtividade", "desempenho", "nota"]) {
    assert.equal(s.includes(proibido), false, `saída não pode conter "${proibido}"`);
  }
});

console.log(`\n=== ${passed} GPS tests OK ===\n`);
