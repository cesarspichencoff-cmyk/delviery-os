/**
 * Bateria de preparação de campo — geofence por unidade, modo shadow do
 * retorno e HTTPS local. Executar: npm run test:entregas:field
 *
 * Coordenadas SINTÉTICAS (SIM-). Nenhuma loja real aqui.
 */
import assert from "node:assert/strict";
import {
  loadUnitGeofence,
  validateUnitGeofence,
  geofenceDiagnostic,
  type UnitGeofenceConfig,
} from "./unit-geofence";
import { evaluateReturnWithMode, compareShadowToActual, summarizeShadow } from "./return-shadow";
import { resolveHttps, resolveBind, startupSummary } from "../pilot/https-config";
import { DEFAULT_GPS_POLICY, type GPSPoint, type GeoPoint } from "./types";
import { classifyQuality } from "./validate";

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

const SIM_STORE: GeoPoint = { latitude: -23.5, longitude: -46.6 };
const T0 = "2026-07-25T18:00:00.000Z";
const at = (s: number) => new Date(Date.parse(T0) + s * 1000).toISOString();

function pt(occurred_at: string, over: Partial<GPSPoint> = {}): GPSPoint {
  return {
    point_id: `p-${occurred_at}`,
    idempotency_key: `p-${occurred_at}`,
    trip_id: "SIM-TRIP-1",
    device_id: "SIM-DEV-1",
    latitude: over.latitude ?? SIM_STORE.latitude,
    longitude: over.longitude ?? SIM_STORE.longitude,
    accuracy_m: over.accuracy_m ?? 10,
    speed_mps: over.speed_mps ?? 0,
    occurred_at,
    recorded_at: occurred_at,
    source: "simulator",
    quality: over.quality ?? classifyQuality(over.accuracy_m ?? 10, DEFAULT_GPS_POLICY),
    captured_offline: false,
    clock_trust: "trusted",
    schema_version: "gps@1.0.0",
  };
}

const goodConfig: UnitGeofenceConfig = {
  unit_id: "SIM-UNIT-1",
  latitude: SIM_STORE.latitude,
  longitude: SIM_STORE.longitude,
  radius_m: 80,
  max_accuracy_m: 100,
  min_dwell_s: 60,
  max_speed_mps: 1.5,
  max_freshness_s: 90,
  version: "v1",
  active: true,
  updated_by: "gerente",
  updated_at: T0,
};

console.log("\n=== Entregas field-readiness tests (geofence, shadow, HTTPS) ===\n");

/* ---------------- geofence por unidade ---------------- */

test("configuração válida habilita detecção de retorno", () => {
  const r = loadUnitGeofence(goodConfig);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.policy.store_geofence_radius_m, 80);
  assert.equal(r.ok && r.policy.min_dwell_return_s, 60);
});

test("configuração AUSENTE desabilita retorno automático (falha fechada)", () => {
  const r = loadUnitGeofence(null);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.returnDetectionAvailable, false);
});

test("coordenada 0,0 é recusada (configuração provavelmente vazia)", () => {
  const issues = validateUnitGeofence({ ...goodConfig, latitude: 0, longitude: 0 });
  assert.ok(issues.some((i) => i.field.includes("latitude")));
});

test("valores fora de faixa são recusados", () => {
  assert.ok(validateUnitGeofence({ ...goodConfig, radius_m: 5000 }).length > 0);
  assert.ok(validateUnitGeofence({ ...goodConfig, max_speed_mps: 99 }).length > 0);
  assert.ok(validateUnitGeofence({ ...goodConfig, min_dwell_s: 1 }).length > 0);
});

test("geofence inativa não habilita retorno", () => {
  const r = loadUnitGeofence({ ...goodConfig, active: false });
  assert.equal(r.ok, false);
});

test("version é obrigatória (auditoria de alteração)", () => {
  const issues = validateUnitGeofence({ ...goodConfig, version: "" });
  assert.ok(issues.some((i) => i.field === "version"));
});

test("diagnóstico NÃO expõe coordenada para papel não autorizado", () => {
  const r = loadUnitGeofence(goodConfig);
  const semAcesso = geofenceDiagnostic(r, false);
  const comAcesso = geofenceDiagnostic(r, true);
  assert.equal("latitude" in semAcesso, false);
  assert.equal("longitude" in semAcesso, false);
  assert.equal("latitude" in comAcesso, true);
  assert.equal(semAcesso.version, "v1", "mas mostra a política ativa");
});

test("rollback: voltar à configuração anterior restaura a política", () => {
  const v2 = loadUnitGeofence({ ...goodConfig, radius_m: 200, version: "v2" });
  const v1 = loadUnitGeofence(goodConfig);
  assert.equal(v2.ok && v2.policy.store_geofence_radius_m, 200);
  assert.equal(v1.ok && v1.policy.store_geofence_radius_m, 80);
});

/* ---------------- modo shadow do retorno ---------------- */

function returnPoints(): GPSPoint[] {
  return [pt(at(0)), pt(at(30)), pt(at(60)), pt(at(90))];
}

test("SHADOW nunca encerra a viagem, mesmo com evidência perfeita", () => {
  const d = evaluateReturnWithMode({
    trip_id: "SIM-TRIP-1", mode: "shadow", points: returnPoints(),
    store: SIM_STORE, policy: DEFAULT_GPS_POLICY, now: new Date(at(95)),
  });
  assert.equal(d.shouldClose, false, "shadow JAMAIS fecha");
  assert.equal(d.observation.would_close, true, "mas registra que teria fechado");
  assert.equal(d.evidence, undefined, "não entrega evidência para fechar");
});

test("ACTIVE encerra quando a evidência é cumulativamente válida", () => {
  const d = evaluateReturnWithMode({
    trip_id: "SIM-TRIP-1", mode: "active", points: returnPoints(),
    store: SIM_STORE, policy: DEFAULT_GPS_POLICY, now: new Date(at(95)),
  });
  assert.equal(d.shouldClose, true);
  assert.ok(d.evidence, "entrega a evidência pronta para o comando");
  assert.equal(d.evidence?.in_store_geofence, true);
});

test("ACTIVE não encerra quando falta uma condição", () => {
  const d = evaluateReturnWithMode({
    trip_id: "SIM-TRIP-1", mode: "active", points: [pt(at(0)), pt(at(10))],
    store: SIM_STORE, policy: DEFAULT_GPS_POLICY, now: new Date(at(10)),
  });
  assert.equal(d.shouldClose, false);
  assert.ok(d.observation.reasons.includes("permanencia_insuficiente"));
});

test("DISABLED (sem geofence) não fecha nem avalia detecção", () => {
  const d = evaluateReturnWithMode({
    trip_id: "SIM-TRIP-1", mode: "disabled", points: returnPoints(),
    store: SIM_STORE, policy: DEFAULT_GPS_POLICY, now: new Date(at(95)),
  });
  assert.equal(d.shouldClose, false);
  assert.deepEqual(d.observation.reasons, ["deteccao_desabilitada"]);
});

test("falha da detecção NÃO impede o fechamento manual", () => {
  // Mesmo em disabled/shadow, o comando manual do domínio segue disponível:
  // este módulo nunca bloqueia nada, só deixa de propor o fechamento.
  const d = evaluateReturnWithMode({
    trip_id: "SIM-TRIP-1", mode: "disabled", points: [],
    store: SIM_STORE, policy: DEFAULT_GPS_POLICY, now: new Date(at(95)),
  });
  assert.equal(d.shouldClose, false);
  assert.equal("blocks_manual_close" in d, false, "nada aqui bloqueia encerramento manual");
});

test("comparação sombra × fechamento real calcula o delta", () => {
  const d = evaluateReturnWithMode({
    trip_id: "SIM-TRIP-1", mode: "shadow", points: returnPoints(),
    store: SIM_STORE, policy: DEFAULT_GPS_POLICY, now: new Date(at(95)),
  });
  const cmp = compareShadowToActual(d.observation, at(155));
  assert.equal(cmp.actual_close_at, at(155));
  assert.equal(cmp.delta_s, 60, "humano encerrou 60s depois do que a sombra apontaria");
});

test("resumo do turno agrega sem expor coordenadas", () => {
  const obs = [
    evaluateReturnWithMode({ trip_id: "T1", mode: "shadow", points: returnPoints(), store: SIM_STORE, policy: DEFAULT_GPS_POLICY, now: new Date(at(95)) }).observation,
    evaluateReturnWithMode({ trip_id: "T2", mode: "shadow", points: [pt(at(0))], store: SIM_STORE, policy: DEFAULT_GPS_POLICY, now: new Date(at(5)) }).observation,
  ];
  const s = summarizeShadow(obs);
  assert.equal(s.total, 2);
  assert.equal(s.would_close, 1);
  assert.equal(JSON.stringify(s).includes("-23.5"), false);
});

/* ---------------- HTTPS ---------------- */

const fsOk = { existsSync: () => true };
const fsMissing = { existsSync: () => false };

test("sem ENTREGAS_HTTPS: serve HTTP local, sem erro", () => {
  const r = resolveHttps({}, fsOk);
  assert.equal(r.enabled, false);
  assert.equal(r.fatal, false);
});

test("HTTPS pedido sem paths: FATAL (nunca cai para HTTP em silêncio)", () => {
  const r = resolveHttps({ ENTREGAS_HTTPS: "1" }, fsOk);
  assert.equal(r.enabled, false);
  assert.equal(r.fatal, true);
  assert.match(r.reason ?? "", /ENTREGAS_TLS_CERT/);
});

test("HTTPS com certificado inexistente: FATAL", () => {
  const r = resolveHttps(
    { ENTREGAS_HTTPS: "1", ENTREGAS_TLS_CERT: "/x/cert.pem", ENTREGAS_TLS_KEY: "/x/key.pem" },
    fsMissing,
  );
  assert.equal(r.fatal, true);
});

test("HTTPS com paths válidos: habilitado", () => {
  const r = resolveHttps(
    { ENTREGAS_HTTPS: "1", ENTREGAS_TLS_CERT: "/x/cert.pem", ENTREGAS_TLS_KEY: "/x/key.pem" },
    fsOk,
  );
  assert.equal(r.enabled, true);
  assert.equal(r.fatal, false);
});

test("mensagem de erro do TLS não vaza o caminho da chave", () => {
  const r = resolveHttps(
    { ENTREGAS_HTTPS: "1", ENTREGAS_TLS_CERT: "/x/cert.pem", ENTREGAS_TLS_KEY: "/segredo/chave-da-loja.pem" },
    fsMissing,
  );
  assert.equal((r.reason ?? "").includes("/segredo/"), false);
});

test("bind default é loopback (LAN só por opt-in explícito)", () => {
  const b = resolveBind({}, false);
  assert.equal(b.host, "127.0.0.1");
  assert.equal(b.exposedToLan, false);
});

test("bind na LAN é opt-in e avisa quando falta TLS", () => {
  const semTls = resolveBind({ ENTREGAS_BIND: "0.0.0.0" }, false);
  assert.equal(semTls.exposedToLan, true);
  assert.match(semTls.reason, /Geolocation|TLS|HTTPS/i);

  const comTls = resolveBind({ ENTREGAS_BIND: "0.0.0.0" }, true);
  assert.equal(comTls.exposedToLan, true);
  assert.match(comTls.reason, /TLS/);
});

test("loopback explícito não conta como exposição", () => {
  for (const h of ["127.0.0.1", "localhost", "::1"]) {
    assert.equal(resolveBind({ ENTREGAS_BIND: h }, false).exposedToLan, false, h);
  }
});

test("resumo de inicialização não expõe caminho de certificado", () => {
  const https = resolveHttps(
    { ENTREGAS_HTTPS: "1", ENTREGAS_TLS_CERT: "/x/cert.pem", ENTREGAS_TLS_KEY: "/x/key.pem" },
    fsOk,
  );
  const bind = resolveBind({ ENTREGAS_BIND: "0.0.0.0" }, true);
  const s = startupSummary(https, bind, 5193);
  assert.match(s, /^Entregas piloto: https:/);
  assert.equal(s.includes("/x/"), false);
  assert.equal(s.includes(".pem"), false);
});

/* ---------------- indicador de GPS do rider ---------------- */

interface FakeGeo {
  watchPosition(s: (p: unknown) => void, e: (err: unknown) => void): number;
  clearWatch(id: number): void;
  emit(lat: number, lon: number, accuracy: number, tsIso: string): void;
  emitError(code: number): void;
  cleared: number[];
  active: boolean;
}

function fakeGeolocation(): FakeGeo {
  let success: ((p: unknown) => void) | null = null;
  let fail: ((e: unknown) => void) | null = null;
  let id = 0;
  const cleared: number[] = [];
  return {
    cleared,
    get active() {
      return success !== null;
    },
    watchPosition(s, e) {
      success = s;
      fail = e;
      return ++id;
    },
    clearWatch(watchId) {
      cleared.push(watchId);
      success = null;
      fail = null;
    },
    emit(lat, lon, accuracy, tsIso) {
      success?.({
        coords: { latitude: lat, longitude: lon, accuracy, speed: null, heading: null, altitude: null },
        timestamp: Date.parse(tsIso),
      });
    },
    emitError(code) {
      fail?.({ code, message: "erro" });
    },
  };
}

async function riderStatusTests(): Promise<void> {
  // gps-status.js é ESM de browser (não passa pelo tsc): importado do SOURCE
  // por file:// URL, para provar comportamento real e não apenas texto.
  const { pathToFileURL } = await import("node:url");
  const { join } = await import("node:path");
  const { readFileSync, writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");

  // gps-status.js é ESM, mas o package.json é commonjs — `.js` não carrega
  // como módulo. Copiamos o MESMO código para um .mjs temporário (fora do
  // repositório) só para poder executá-lo e testar comportamento real.
  const source = readFileSync(
    join(process.cwd(), "src/entregas/ui/rider-mobile/gps-status.js"),
    "utf8",
  );
  const tmp = mkdtempSync(join(tmpdir(), "entregas-gps-ui-"));
  const mjs = join(tmp, "gps-status.mjs");
  writeFileSync(mjs, source);

  // `new Function` preserva o import() nativo: o tsc transpilaria um import()
  // literal para require(), que não carrega ESM.
  const dynamicImport = new Function("s", "return import(s)") as (
    s: string,
  ) => Promise<unknown>;
  const mod = await dynamicImport(pathToFileURL(mjs).href);
  process.on("exit", () => rmSync(tmp, { recursive: true, force: true }));
  const { createGpsStatus, renderGpsStatus } = mod as {
    createGpsStatus: (o: Record<string, unknown>) => {
      start(t: string): { ok: boolean; error?: string };
      stop(): void;
      state(): Record<string, unknown>;
      isRunning(): boolean;
      setOnline(v: boolean): void;
    };
    renderGpsStatus: (el: Record<string, unknown>, s: Record<string, unknown>) => void;
  };

  test("rider: sem viagem, indicador diz GPS DESLIGADO e watcher não existe", () => {
    const geo = fakeGeolocation();
    const g = createGpsStatus({ geolocation: geo, now: () => new Date(at(0)) });
    const s = g.state();
    assert.equal(s.banner, "GPS DESLIGADO — SEM VIAGEM ATIVA");
    assert.equal(s.running, false);
    assert.equal(geo.active, false);
  });

  test("rider: start sem trip_id é recusado", () => {
    const geo = fakeGeolocation();
    const g = createGpsStatus({ geolocation: geo, now: () => new Date(at(0)) });
    assert.equal(g.start("").ok, false);
    assert.equal(geo.active, false);
  });

  test("rider: com viagem ativa o indicador mostra GPS ATIVO e a viagem", () => {
    const geo = fakeGeolocation();
    const g = createGpsStatus({ geolocation: geo, now: () => new Date(at(0)) });
    g.start("SIM-TRIP-ABCDEFGH");
    const s = g.state();
    assert.match(String(s.banner), /^GPS ATIVO — VIAGEM /);
    assert.equal(s.running, true);
    assert.equal(geo.active, true);
  });

  test("rider: freshness vira current após ponto recente", () => {
    const geo = fakeGeolocation();
    let nowMs = Date.parse(at(0));
    const g = createGpsStatus({ geolocation: geo, now: () => new Date(nowMs) });
    g.start("SIM-TRIP-1");
    geo.emit(SIM_STORE.latitude, SIM_STORE.longitude, 10, at(0));
    nowMs = Date.parse(at(5));
    assert.equal(g.state().freshness, "current");
  });

  test("rider: posição velha NUNCA aparece como atual (stale)", () => {
    const geo = fakeGeolocation();
    let nowMs = Date.parse(at(0));
    const g = createGpsStatus({ geolocation: geo, now: () => new Date(nowMs) });
    g.start("SIM-TRIP-1");
    geo.emit(SIM_STORE.latitude, SIM_STORE.longitude, 10, at(0));
    nowMs = Date.parse(at(600));
    assert.equal(g.state().freshness, "stale");
  });

  test("rider: accuracy ruim vira inaccurate", () => {
    const geo = fakeGeolocation();
    const g = createGpsStatus({ geolocation: geo, now: () => new Date(at(5)) });
    g.start("SIM-TRIP-1");
    geo.emit(SIM_STORE.latitude, SIM_STORE.longitude, 80, at(0));
    assert.equal(g.state().freshness, "inaccurate");
  });

  test("rider: permissão negada é declarada, sem inventar posição", () => {
    const geo = fakeGeolocation();
    const g = createGpsStatus({ geolocation: geo, now: () => new Date(at(0)) });
    g.start("SIM-TRIP-1");
    geo.emitError(1);
    const s = g.state();
    assert.equal(s.freshness, "permission_denied");
    assert.equal(s.error, "permission_denied");
  });

  test("rider: offline tem precedência sobre idade", () => {
    const geo = fakeGeolocation();
    const g = createGpsStatus({ geolocation: geo, now: () => new Date(at(5)) });
    g.start("SIM-TRIP-1");
    geo.emit(SIM_STORE.latitude, SIM_STORE.longitude, 10, at(0));
    g.setOnline(false);
    assert.equal(g.state().freshness, "offline");
  });

  test("rider: stop() chama clearWatch DE VERDADE e zera o indicador", () => {
    const geo = fakeGeolocation();
    const g = createGpsStatus({ geolocation: geo, now: () => new Date(at(0)) });
    g.start("SIM-TRIP-1");
    assert.equal(geo.active, true);
    g.stop();
    assert.equal(geo.cleared.length, 1, "clearWatch chamado");
    assert.equal(geo.active, false);
    assert.equal(g.isRunning(), false);
    assert.equal(g.state().banner, "GPS DESLIGADO — SEM VIAGEM ATIVA");
  });

  test("rider: encerrar a viagem remove o indicador ativo", () => {
    const geo = fakeGeolocation();
    const g = createGpsStatus({ geolocation: geo, now: () => new Date(at(0)) });
    g.start("SIM-TRIP-1");
    geo.emit(SIM_STORE.latitude, SIM_STORE.longitude, 10, at(0));
    g.stop();
    const s = g.state();
    assert.equal(s.freshness, "unknown");
    assert.equal(s.trip_id, null);
  });

  test("rider: indicador renderizado NUNCA contém coordenada", () => {
    const geo = fakeGeolocation();
    const g = createGpsStatus({ geolocation: geo, now: () => new Date(at(5)) });
    g.start("SIM-TRIP-1");
    geo.emit(SIM_STORE.latitude, SIM_STORE.longitude, 10, at(0));
    const el: Record<string, unknown> = { dataset: {}, textContent: "" };
    renderGpsStatus(el, g.state());
    const txt = String(el.textContent);
    assert.equal(txt.includes("-23.5"), false);
    assert.equal(txt.includes("-46.6"), false);
    assert.match(txt, /GPS ATIVO/);
  });

  test("rider: estado não expõe velocidade média nem produtividade", () => {
    const geo = fakeGeolocation();
    const g = createGpsStatus({ geolocation: geo, now: () => new Date(at(0)) });
    g.start("SIM-TRIP-1");
    const s = JSON.stringify(g.state()).toLowerCase();
    for (const p of ["ranking", "produtividade", "media", "score"]) {
      assert.equal(s.includes(p), false, `não pode conter "${p}"`);
    }
  });
}

riderStatusTests()
  .then(() => {
    console.log(`\n=== ${passed} field-readiness tests OK ===\n`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
