/**
 * Testes da calibração / modo sombra.
 * node tests/capacidade-viva/calibration/run.js
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Cal = require("../../../src/capacidade-viva/calibration");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  OK ", name);
  } catch (e) {
    failed++;
    console.log("  FAIL", name, "-", e.message);
  }
}

console.log("=== labels ===");
test("stamp marca não operacional", () => {
  const s = Cal.labels.stamp({ x: 1 });
  assert.strictEqual(s.operational, false);
  assert.ok(s.labels.indexOf("MODO SOMBRA") >= 0);
});

console.log("=== loader ===");
test("inventory não inventa arquivos", () => {
  const inv = Cal.loader.inventoryKnownSources({});
  assert.ok(Array.isArray(inv.sources));
  assert.strictEqual(inv.six_months_local, false);
});

test("loadJsonl missing file", async () => {
  const r = await Cal.loader.loadJsonl(path.join(__dirname, "nao_existe.jsonl"));
  assert.strictEqual(r.ok, false);
});

console.log("=== normalizer ===");
test("timezone parse BR", () => {
  const iso = Cal.normalizer.parseBrDateTime("20/06/2026 19:30");
  assert.ok(iso && iso.indexOf("2026-06-20") === 0);
});

test("evento fora de ordem detectado", () => {
  const events = [
    Cal.normalizer.normalizeTransition({
      pedido_id: "o1",
      tipo_evento: "ifood.pronto",
      timestamp: "2026-06-20T20:00:00.000Z",
      confianca: "alta",
      payload_original: {}
    }),
    Cal.normalizer.normalizeTransition({
      pedido_id: "o1",
      tipo_evento: "ifood.recebido",
      timestamp: "2026-06-20T20:10:00.000Z",
      confianca: "alta",
      payload_original: {}
    })
  ].filter(Boolean);
  const tl = Cal.normalizer.buildOrderTimelines(events);
  assert.ok(tl.quality.out_of_order >= 1);
});

test("duplicidade de chave evento", () => {
  const e = Cal.normalizer.normalizeTransition({
    pedido_id: "o2",
    tipo_evento: "ifood.recebido",
    timestamp: "2026-06-20T18:00:00.000Z",
    confianca: "alta",
    payload_original: {}
  });
  const tl = Cal.normalizer.buildOrderTimelines([e, e]);
  assert.ok(tl.quality.duplicate_event_keys >= 1);
});

test("dado ausente não vira fato", () => {
  const e = Cal.normalizer.normalizeItemLine(
    { pedido_id: "x", item_nome: "Item Inexistente XYZ", quantidade: 1, data_hora: "20/06/2026 12:00" },
    {}
  );
  assert.strictEqual(e.epistemic, Cal.labels.EPISTEMIC.AUSENTE);
  assert.strictEqual(e.praca, null);
});

console.log("=== catalog ===");
test("complexidade e pendentes", () => {
  const seed = require("../../../data/cardapio_knowledge_seed.json");
  const cat = Cal.catalog.buildCatalog(seed);
  assert.ok(cat.n >= 100);
  assert.ok(cat.classified + cat.pending_validation === cat.n);
});

console.log("=== replay ===");
test("replay gera ticks sem modificar origem", () => {
  const base = Date.parse("2026-06-20T22:00:00.000Z");
  const byOrder = new Map();
  byOrder.set("p1", [
    {
      order_id: "p1",
      timestamp: new Date(base).toISOString(),
      event_type: "pedido_recebido",
      epistemic: "confirmado"
    },
    {
      order_id: "p1",
      timestamp: new Date(base + 600000).toISOString(),
      event_type: "pedido_pronto",
      epistemic: "confirmado"
    },
    {
      order_id: "p1",
      timestamp: new Date(base).toISOString(),
      event_type: "item_atribuido_praca",
      item_name: "Hot Roll",
      quantity: 1,
      praca: "quentes",
      complexity: "complexo"
    },
    {
      order_id: "p1",
      timestamp: new Date(base + 900000).toISOString(),
      event_type: "saiu_para_entrega",
      epistemic: "confirmado"
    }
  ]);
  const rep = Cal.replay.replayOrders(byOrder, { interval_min: 5, team_profile: "estrutura_media" });
  assert.ok(rep.ok);
  assert.ok(rep.n_ticks >= 1);
  assert.strictEqual(rep.modified_source_data, false);
  assert.ok(rep.ticks[0].shadow.labels.indexOf("MODO SOMBRA") >= 0);
});

console.log("=== calibrator ===");
test("split cal/val e anti-overfit score", () => {
  const ticks = [];
  for (let d = 1; d <= 9; d++) {
    for (let h = 0; h < 3; h++) {
      ticks.push({
        t: `2026-06-0${d}T${10 + h}:00:00.000Z`,
        t_ms: Date.parse(`2026-06-0${d}T${10 + h}:00:00.000Z`),
        active_orders: d * 2,
        shadow: {
          estado: d > 6 ? "acima_capacidade" : "controlavel",
          pausa_seletiva_sugerida: false,
          pausa_geral_sugerida: false,
          menor_intervencao: "observar",
          excecao_critica: false,
          confianca: "media"
        }
      });
    }
  }
  const sp = Cal.calibrator.splitTicks(ticks, { cal_ratio: 0.67 });
  assert.ok(sp.cal.length && sp.val.length);
  const sc = Cal.calibrator.scoreShadow(sp.cal);
  assert.ok(sc.n_ticks > 0);
  assert.strictEqual(sc.false_alert_rate, "nao_verificavel_sem_rotulo_externo");
});

console.log("=== config versionada ===");
test("não sobrescreve silenciosamente — arquivos distintos", () => {
  const dir = path.join(__dirname, "..", "..", "..", "data", "capacidade-viva", "calibration", "configs");
  fs.mkdirSync(dir, { recursive: true });
  const a = path.join(dir, "test-a.json");
  const b = path.join(dir, "test-b.json");
  fs.writeFileSync(a, JSON.stringify({ config_version: "a" }), "utf8");
  fs.writeFileSync(b, JSON.stringify({ config_version: "b" }), "utf8");
  assert.notStrictEqual(JSON.parse(fs.readFileSync(a, "utf8")).config_version, JSON.parse(fs.readFileSync(b, "utf8")).config_version);
  fs.unlinkSync(a);
  fs.unlinkSync(b);
});

console.log("=== shadow ===");
test("recuperação líquida histórica marcada não calculável sem ações", () => {
  const rep = { ticks: [{ shadow: { verificabilidade: "detectavel", estado: "controlavel" } }] };
  const sh = Cal.shadow.buildShadowReport(rep);
  assert.ok(sh.recovery_liquida_historica.status.indexOf("nao_calculavel") >= 0);
});

console.log("=== ISF / praça crítica (via replay) ===");
test("exceção motoboy no replay", () => {
  const base = Date.parse("2026-06-20T23:00:00.000Z");
  const byOrder = new Map([
    [
      "m1",
      [
        { order_id: "m1", timestamp: new Date(base).toISOString(), event_type: "pedido_recebido" },
        { order_id: "m1", timestamp: new Date(base + 5 * 60000).toISOString(), event_type: "pedido_pronto" },
        {
          order_id: "m1",
          timestamp: new Date(base + 5 * 60000).toISOString(),
          event_type: "motoboy_aguardando",
          epistemic: "inferido_alta_confianca"
        },
        {
          order_id: "m1",
          timestamp: new Date(base).toISOString(),
          event_type: "item_atribuido_praca",
          item_name: "X",
          praca: "conferencia",
          quantity: 1,
          complexity: "simples"
        },
        {
          order_id: "m1",
          timestamp: new Date(base + 20 * 60000).toISOString(),
          event_type: "saiu_para_entrega"
        }
      ]
    ]
  ]);
  const rep = Cal.replay.replayOrders(byOrder, { interval_min: 5 });
  assert.ok(rep.ticks.some((t) => t.shadow && t.shadow.excecao_critica));
});

console.log("\n=== RESULT ===");
console.log(`passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
