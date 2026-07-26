/**
 * Central de despacho — projeção de localização, timeline e tela.
 *
 * A tela é módulo ESM de navegador; o teste copia a MESMA fonte para um
 * `.mjs` temporário e importa de verdade, para provar comportamento e não
 * inspecionar texto.
 */

import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

import { freshnessOf, ageLabel } from "./dispatch-projection";
import {
  buildTripTimeline,
  timelineIsClean,
  summarizeArrival,
  type TimelineEntry,
} from "./trip-timeline";
import type { GPSPoint } from "../gps/types";
import type { DomainEvent } from "../foundation/types";

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
  } catch (e) {
    failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Coordenada sintética. */
const SYNTH = { latitude: -23.5, longitude: -46.6 };
const NOW = new Date("2026-07-25T12:10:00.000Z");

function point(over: Partial<GPSPoint> = {}): GPSPoint {
  return {
    point_id: "gps:dev:trip:1",
    idempotency_key: "gps:dev:trip:1",
    trip_id: "trip-1",
    device_id: "dev",
    latitude: SYNTH.latitude,
    longitude: SYNTH.longitude,
    accuracy_m: 12,
    occurred_at: "2026-07-25T12:09:30.000Z",
    recorded_at: "2026-07-25T12:09:31.000Z",
    source: "device",
    quality: "good",
    captured_offline: false,
    clock_trust: "trusted",
    schema_version: "gps@1.0.0",
    ...over,
  };
}

function ev(over: Partial<DomainEvent> = {}): DomainEvent {
  return {
    event_id: "e1",
    object_type: "delivery",
    object_id: "d1",
    event_type: "arrival_reported",
    occurred_at: "2026-07-25T12:00:00.000Z",
    recorded_at: "2026-07-25T12:00:01.000Z",
    origin: "device",
    actor_id: "rid-1",
    idempotency_key: "k1",
    payload: {},
    clock_trust: "trusted",
    contract_version: "COR-ENTREGAS-V1@1.0.3",
    ...over,
  } as DomainEvent;
}

/* ------------------------------------------------------------------ *
 * Freshness
 * ------------------------------------------------------------------ */

async function freshnessTests(): Promise<void> {
  await test("sem ponto, o estado é 'sem posição' — não é erro nem branco", () => {
    const d = freshnessOf(undefined, 0, NOW);
    assert.equal(d.freshness, "unknown");
    assert.equal(d.usable, false);
    assert.match(d.label, /Sem posição/);
  });

  await test("ponto recente e preciso é utilizável", () => {
    const d = freshnessOf(point(), 5, NOW);
    assert.equal(d.freshness, "current");
    assert.equal(d.usable, true);
    assert.equal(d.age_s, 30);
  });

  await test("posição velha NUNCA aparece como atual", () => {
    const d = freshnessOf(point({ occurred_at: "2026-07-25T12:07:00.000Z" }), 5, NOW);
    assert.equal(d.freshness, "stale");
    assert.equal(d.usable, false);
    assert.match(d.label, /antiga/i);
  });

  await test("velha e imprecisa é, antes de tudo, VELHA", () => {
    const d = freshnessOf(
      point({ occurred_at: "2026-07-25T12:07:00.000Z", accuracy_m: 400, quality: "unusable" }),
      5,
      NOW,
    );
    assert.equal(d.freshness, "stale", "o operador precisa agir sobre a idade");
  });

  await test("sem ponto há muito tempo vira 'sem sinal'", () => {
    const d = freshnessOf(point({ occurred_at: "2026-07-25T11:50:00.000Z" }), 5, NOW);
    assert.equal(d.freshness, "unavailable");
  });

  await test("ponto recente mas impreciso é sinalizado, não escondido", () => {
    const d = freshnessOf(point({ accuracy_m: 250, quality: "unusable" }), 5, NOW);
    assert.equal(d.freshness, "inaccurate");
    assert.equal(d.usable, false);
  });

  await test("a projeção não devolve coordenada", () => {
    const blob = JSON.stringify(freshnessOf(point(), 5, NOW));
    assert.equal(/latitude|longitude/.test(blob), false);
    assert.equal(/-?\d{1,3}\.\d{4,}/.test(blob), false);
  });

  await test("idade vira texto que o operador lê sem fazer conta", () => {
    assert.equal(ageLabel(30), "há 30s");
    assert.equal(ageLabel(180), "há 3 min");
    assert.equal(ageLabel(7200), "há mais de 1 h");
    assert.equal(ageLabel(undefined), "sem atualização");
  });
}

/* ------------------------------------------------------------------ *
 * Timeline
 * ------------------------------------------------------------------ */

async function timelineTests(): Promise<void> {
  await test("eventos viram frases em português com autor", () => {
    const t = buildTripTimeline([
      ev({ event_type: "trip_created", object_type: "trip", object_id: "trip-1" }),
      ev({ event_type: "arrival_detected", origin: "system", occurred_at: "2026-07-25T12:05:00.000Z" }),
    ]);
    assert.equal(t[0].label, "Viagem montada");
    assert.equal(t[0].author, "operacao");
    assert.equal(t[1].label, "Chegada detectada pelo GPS");
    assert.equal(t[1].author, "sistema");
  });

  await test("chegada detectada, relatada e entrega são três linhas distintas", () => {
    const t = buildTripTimeline([
      ev({ event_type: "arrival_detected", occurred_at: "2026-07-25T12:01:00.000Z" }),
      ev({ event_type: "arrival_reported", occurred_at: "2026-07-25T12:02:00.000Z" }),
      ev({ event_type: "delivery_confirmed", occurred_at: "2026-07-25T12:03:00.000Z" }),
    ]);
    assert.equal(t.length, 3);
    assert.deepEqual(
      t.map((e) => e.author),
      ["sistema", "motoboy", "motoboy"],
    );
  });

  await test("NENHUMA chegada confirma entrega — só delivery_confirmed", () => {
    const t = buildTripTimeline([
      ev({ event_type: "arrival_detected" }),
      ev({ event_type: "arrival_reported", occurred_at: "2026-07-25T12:01:00.000Z" }),
      ev({ event_type: "delivery_confirmed", occurred_at: "2026-07-25T12:02:00.000Z" }),
    ]);
    assert.deepEqual(
      t.map((e) => e.confirms_delivery),
      [false, false, true],
    );
  });

  await test("timeline sai em ordem cronológica mesmo com log fora de ordem", () => {
    const t = buildTripTimeline([
      ev({ event_type: "delivery_confirmed", occurred_at: "2026-07-25T12:05:00.000Z" }),
      ev({ event_type: "trip_started", occurred_at: "2026-07-25T12:00:00.000Z" }),
    ]);
    assert.equal(t[0].event_type, "trip_started");
  });

  await test("retorno em sombra é rotulado como observação", () => {
    const t = buildTripTimeline([
      ev({
        event_type: "return_detected",
        object_type: "trip",
        object_id: "trip-1",
        payload: { mode: "shadow" },
      }),
    ]);
    assert.equal(t[0].shadow, true);
  });

  await test("timeline não carrega coordenada nem endereço", () => {
    const t = buildTripTimeline([
      ev({
        event_type: "arrival_detected",
        payload: { latitude: SYNTH.latitude, longitude: SYNTH.longitude, endereco: "Rua X, 1" },
      }),
    ]);
    assert.equal(timelineIsClean(t), true, "payload sensível vazou para a timeline");
    const blob = JSON.stringify(t);
    assert.equal(/-?\d{1,3}\.\d{4,}/.test(blob), false);
  });

  await test("o detector de timeline suja realmente pega sujeira", () => {
    const sujo = [
      { at: "x", event_type: "y", label: "z", author: "sistema", object_id: "d1", shadow: false, confirms_delivery: false, latitude: SYNTH.latitude },
    ] as unknown as TimelineEntry[];
    assert.equal(timelineIsClean(sujo), false, "o detector não pode ser decorativo");
  });

  await test("evento desconhecido não quebra: vira linha com autor desconhecido", () => {
    const t = buildTripTimeline([ev({ event_type: "evento_novo_do_futuro" })]);
    assert.equal(t[0].label, "evento_novo_do_futuro");
    assert.equal(t[0].author, "desconhecido");
  });

  await test("resumo da chegada distingue os quatro estados possíveis", () => {
    const nenhum = summarizeArrival("d1", []);
    assert.equal(nenhum.label, "A caminho");

    const soDetectado = summarizeArrival(
      "d1",
      buildTripTimeline([ev({ event_type: "arrival_detected" })]),
    );
    assert.match(soDetectado.label, /GPS indica chegada/);

    const soRelatado = summarizeArrival(
      "d1",
      buildTripTimeline([ev({ event_type: "arrival_reported" })]),
    );
    assert.match(soRelatado.label, /avisou que chegou/);

    const ambos = summarizeArrival(
      "d1",
      buildTripTimeline([
        ev({ event_type: "arrival_detected" }),
        ev({ event_type: "arrival_reported", occurred_at: "2026-07-25T12:01:00.000Z" }),
      ]),
    );
    assert.match(ambos.label, /GPS e motoboy/);
    assert.match(ambos.label, /sem confirmação/);

    const confirmado = summarizeArrival(
      "d1",
      buildTripTimeline([
        ev({ event_type: "arrival_reported" }),
        ev({ event_type: "delivery_confirmed", occurred_at: "2026-07-25T12:02:00.000Z" }),
      ]),
    );
    assert.equal(confirmado.label, "Entrega confirmada");
  });

  await test("resumo separa a parada certa quando há várias", () => {
    const t = buildTripTimeline([
      ev({ event_type: "arrival_reported", object_id: "d1" }),
      ev({ event_type: "delivery_confirmed", object_id: "d2", occurred_at: "2026-07-25T12:01:00.000Z" }),
    ]);
    assert.equal(summarizeArrival("d1", t).confirmed_at, undefined);
    assert.ok(summarizeArrival("d2", t).confirmed_at);
  });
}

/* ------------------------------------------------------------------ *
 * Tela do console — comportamento real do módulo ESM
 * ------------------------------------------------------------------ */

async function screenTests(): Promise<void> {
  const source = readFileSync(
    join(process.cwd(), "src/entregas/ui/console/dispatch-location.js"),
    "utf8",
  );
  const dir = mkdtempSync(join(tmpdir(), "entregas-dispatch-ui-"));
  const mjs = join(dir, "dispatch-location.mjs");
  writeFileSync(mjs, source);
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
  const dynamicImport = new Function("s", "return import(s)") as (
    s: string,
  ) => Promise<Record<string, unknown>>;
  const mod = await dynamicImport(pathToFileURL(mjs).href);

  type Screen = {
    refresh: (id: string | null) => Promise<void>;
    state: () => Record<string, unknown>;
  };
  const create = mod.createDispatchLocation as (o?: Record<string, unknown>) => Screen;
  const renderLocationLine = mod.renderLocationLine as (
    el: Record<string, unknown>,
    s: Record<string, unknown>,
  ) => void;
  const renderTimeline = mod.renderTimeline as (
    el: Record<string, unknown>,
    s: Record<string, unknown>,
  ) => void;

  const locationResponse = (over: Record<string, unknown> = {}) => ({
    ok: true,
    trip_id: "trip-1",
    freshness: "current",
    label: "Posição atual",
    age_s: 30,
    accuracy_m: 12,
    point_count: 8,
    usable: true,
    coordinates_visible: true,
    last_point: { latitude: SYNTH.latitude, longitude: SYNTH.longitude, accuracy_m: 12 },
    ...over,
  });

  const timelineResponse = () => ({
    ok: true,
    timeline: buildTripTimeline([
      ev({ event_type: "trip_started", object_type: "trip", object_id: "trip-1" }),
      ev({ event_type: "arrival_reported", occurred_at: "2026-07-25T12:05:00.000Z" }),
    ]),
    arrivals: [summarizeArrival("d1", buildTripTimeline([ev({ event_type: "arrival_reported" })]))],
  });

  function screenWith(loc: Record<string, unknown>): Screen {
    return create({
      fetchJson: async (url: string) =>
        url.includes("/location") ? loc : timelineResponse(),
    });
  }

  await test("sem viagem selecionada, nada é consultado", async () => {
    let calls = 0;
    const s = create({
      fetchJson: async () => {
        calls += 1;
        return null;
      },
    });
    await s.refresh(null);
    assert.equal(calls, 0, "sem foco, o console não pede localização de ninguém");
    assert.equal(s.state().freshness, "unknown");
  });

  await test("com viagem, mostra freshness e contagem de pontos", async () => {
    const s = screenWith(locationResponse());
    await s.refresh("trip-1");
    const st = s.state();
    assert.equal(st.freshness, "current");
    assert.equal(st.usable, true);
    assert.equal(st.point_count, 8);
    assert.equal(st.age_label, "há 30s");
  });

  await test("papel sem autorização vê freshness mas NÃO vê coordenada", async () => {
    const s = screenWith(
      locationResponse({ coordinates_visible: false, last_point: undefined }),
    );
    await s.refresh("trip-1");
    const st = s.state();
    assert.equal(st.freshness, "current", "o estado do sinal continua visível");
    assert.equal(st.coordinates_visible, false);
    assert.equal(st.last_point, undefined);
  });

  await test("mesmo se o servidor mandar ponto por engano, sem permissão não expõe", async () => {
    const s = screenWith(
      locationResponse({
        coordinates_visible: false,
        last_point: { latitude: SYNTH.latitude, longitude: SYNTH.longitude },
      }),
    );
    await s.refresh("trip-1");
    assert.equal(s.state().last_point, undefined, "a tela não confia só no servidor");
  });

  await test("gravidade ordena o que exige ação primeiro", async () => {
    const semSinal = screenWith(
      locationResponse({ freshness: "unavailable", usable: false }),
    );
    await semSinal.refresh("trip-1");
    const atual = screenWith(locationResponse());
    await atual.refresh("trip-1");
    assert.ok(
      (semSinal.state().severity as number) < (atual.state().severity as number),
      "sem sinal precisa vir antes de tudo certo",
    );
  });

  await test("conta paradas que chegaram e não foram confirmadas", async () => {
    const s = screenWith(locationResponse());
    await s.refresh("trip-1");
    assert.equal(s.state().pending_confirmation, 1);
  });

  await test("falha de rede não apaga a tela; só avisa", async () => {
    let first = true;
    const s = create({
      fetchJson: async (url: string) => {
        if (first) return url.includes("/location") ? locationResponse() : timelineResponse();
        throw new Error("rede caiu");
      },
    });
    await s.refresh("trip-1");
    assert.equal(s.state().freshness, "current");
    first = false;
    await s.refresh("trip-1");
    const st = s.state();
    assert.equal(st.freshness, "current", "o que já estava na tela continua");
    assert.ok(String(st.error).length > 0, "mas o operador é avisado");
  });

  await test("a linha renderizada nunca contém coordenada", async () => {
    const s = screenWith(locationResponse());
    await s.refresh("trip-1");
    const el: Record<string, unknown> = { dataset: {}, textContent: "" };
    renderLocationLine(el, s.state());
    const text = String(el.textContent);
    assert.match(text, /Posição atual/);
    assert.equal(/-?\d{1,3}\.\d{4,}/.test(text), false, "coordenada na linha de status");
    assert.equal((el.dataset as Record<string, string>).freshness, "current");
  });

  await test("a timeline renderizada marca autor e destaca só a confirmação", async () => {
    const s = screenWith(locationResponse());
    await s.refresh("trip-1");
    const el: Record<string, unknown> = { dataset: {}, innerHTML: "", textContent: "" };
    renderTimeline(el, s.state());
    const html = String(el.innerHTML);
    assert.match(html, /data-author="motoboy"/);
    assert.match(html, /Cheguei/);
    assert.equal(/-?\d{1,3}\.\d{4,}/.test(html), false);
    assert.equal((el.dataset as Record<string, string>).count, "2");
  });

  await test("viagem sem eventos mostra frase honesta, não área vazia", async () => {
    const s = create({
      fetchJson: async (url: string) =>
        url.includes("/location")
          ? locationResponse({ freshness: "unknown", point_count: 0, usable: false })
          : { ok: true, timeline: [], arrivals: [] },
    });
    await s.refresh("trip-1");
    const el: Record<string, unknown> = { dataset: {}, innerHTML: "", textContent: "" };
    renderTimeline(el, s.state());
    assert.match(String(el.textContent), /Sem eventos/);
  });
}

/* ------------------------------------------------------------------ *
 * Execução
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  console.log("=== Central de despacho — localização e linha do tempo ===");
  await freshnessTests();
  await timelineTests();
  await screenTests();

  if (failures.length) {
    console.error(`\n=== ${failures.length} FALHA(S) ===`);
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`\n=== ${passed} dispatch tests OK ===`);
}

void main();
