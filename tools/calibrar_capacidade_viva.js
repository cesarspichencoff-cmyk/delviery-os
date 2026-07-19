#!/usr/bin/env node
/* ============================================================================
 * Calibração Capacidade Viva — MODO SOMBRA · NÃO OPERACIONAL
 *
 * Uso:
 *   node tools/calibrar_capacidade_viva.js
 *   node tools/calibrar_capacidade_viva.js --ifood path/to/ifood_real.jsonl
 *   node tools/calibrar_capacidade_viva.js --interval 5 --team estrutura_media
 *   node tools/calibrar_capacidade_viva.js --demo   # só fixtures sintéticas rotuladas
 *
 * Não modifica dados de origem. Saída em results/capacidade-viva/ (gitignored).
 * ==========================================================================*/
"use strict";

const fs = require("fs");
const path = require("path");
const Cal = require("../src/capacidade-viva/calibration");

function arg(name, def) {
  const i = process.argv.indexOf(name);
  if (i < 0) return def;
  return process.argv[i + 1] != null ? process.argv[i + 1] : true;
}

async function main() {
  const demoOnly = process.argv.includes("--demo");
  const interval = Number(arg("--interval", "5")) || 5;
  const team = arg("--team", "estrutura_media");
  const outDir = path.resolve(arg("--out", path.join(__dirname, "..", "results", "capacidade-viva", `run-${Date.now()}`)));
  fs.mkdirSync(outDir, { recursive: true });

  console.log("=== CAPACIDADE VIVA · CALIBRAÇÃO · MODO SOMBRA · NÃO OPERACIONAL ===");
  console.log("out:", outDir);

  const inv = Cal.loader.inventoryKnownSources({
    ifood_real: arg("--ifood", undefined),
    itens: arg("--itens", undefined),
    cardapio: arg("--cardapio", undefined)
  });
  fs.writeFileSync(path.join(outDir, "00_inventory.json"), JSON.stringify(inv, null, 2));

  // Cardápio
  const cardPath =
    (inv.sources.find((s) => s.id === "cardapio_seed" && s.exists) || {}).path ||
    path.join(__dirname, "..", "data", "cardapio_knowledge_seed.json");
  const card = Cal.loader.loadJson(cardPath);
  const catalog = Cal.catalog.buildCatalog(card.ok ? card.data : { itens: [] });
  fs.writeFileSync(path.join(outDir, "01_catalog.json"), JSON.stringify(catalog, null, 2));

  let transitions = [];
  let items = [];
  let quality = { transitions: null, items: null };

  if (!demoOnly) {
    const ifoodSrc = inv.sources.find((s) => s.id === "ifood_real_jsonl" && s.exists);
    if (ifoodSrc) {
      console.log("loading ifood_real (read-only)...");
      const loaded = await Cal.loader.loadJsonl(ifoodSrc.path);
      transitions = loaded.rows || [];
      quality.transitions = Cal.quality.analyzeTransitions(transitions);
      console.log("  events:", transitions.length);
    } else {
      console.log("AVISO: ifood_real.jsonl não encontrado — sem fabricação de 6 meses.");
    }

    const itensSrc = inv.sources.find((s) => s.id === "itens_jun20_30" && s.exists);
    if (itensSrc) {
      console.log("loading itens jun20-30 (read-only)...");
      const loaded = await Cal.loader.loadJsonl(itensSrc.path);
      items = loaded.rows || [];
      quality.items = Cal.quality.analyzeItems(items);
      console.log("  item lines:", items.length);
    }
  }

  // Demo fallback sintético rotulado
  if (demoOnly || (!transitions.length && !items.length)) {
    console.log("modo demo/sintético rotulado");
    const demo = buildSyntheticBundle();
    transitions = demo.transitions;
    items = demo.items;
    quality.synthetic = true;
    quality.transitions = Cal.quality.analyzeTransitions(transitions);
    quality.items = Cal.quality.analyzeItems(items);
  }

  fs.writeFileSync(path.join(outDir, "02_quality.json"), JSON.stringify(quality, null, 2));

  // Normalize events
  console.log("normalizing events...");
  const events = [];
  for (const row of transitions) {
    const e = Cal.normalizer.normalizeTransition(row);
    if (e) events.push(e);
  }
  for (const row of items) {
    const e = Cal.normalizer.normalizeItemLine(row, catalog.byName);
    if (e) events.push(e);
  }

  const timelines = Cal.normalizer.buildOrderTimelines(events);
  // derive inferences per order
  for (const [oid, list] of timelines.byOrder) {
    const derived = Cal.normalizer.deriveTimingInferences(list);
    if (derived.length) {
      list.push(...derived);
      list.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    }
  }
  fs.writeFileSync(
    path.join(outDir, "03_timelines_meta.json"),
    JSON.stringify(
      {
        labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
        orders: timelines.byOrder.size,
        quality: timelines.quality,
        events_normalized: events.length
      },
      null,
      2
    )
  );

  // Replay (may subsample for speed if huge)
  let byOrder = timelines.byOrder;
  if (byOrder.size > 2500 && !process.argv.includes("--full")) {
    console.log("subsample 2000 pedidos para calibração prática (--full para todos)");
    const entries = [...byOrder.entries()].slice(0, 2000);
    byOrder = new Map(entries);
  }

  console.log("replay interval=", interval, "team=", team);
  const replay = Cal.replay.replayOrders(byOrder, {
    interval_min: interval,
    team_profile: team
  });
  fs.writeFileSync(
    path.join(outDir, "04_replay_summary.json"),
    JSON.stringify(
      {
        ok: replay.ok,
        from: replay.from,
        to: replay.to,
        n_ticks: replay.n_ticks,
        interval_min: replay.interval_min,
        team_profile: replay.team_profile,
        alerts_summary: replay.alerts_summary
      },
      null,
      2
    )
  );
  // sample ticks only (full can be large)
  fs.writeFileSync(
    path.join(outDir, "04_replay_ticks_sample.json"),
    JSON.stringify((replay.ticks || []).filter((_, i) => i % 10 === 0).slice(0, 500), null, 2)
  );

  console.log("calibrating weights...");
  const cal = Cal.calibrator.calibrateWeights(byOrder, {
    interval_min: Math.max(interval, 10),
    team_profile: team
  });
  fs.writeFileSync(path.join(outDir, "05_calibration.json"), JSON.stringify(cal, null, 2));
  if (cal.recommended_config) {
    const cfgPath = path.join(outDir, "05_config_recommended.json");
    fs.writeFileSync(cfgPath, JSON.stringify(cal.recommended_config, null, 2));
    // also versioned copy in data configs (not silent overwrite of default)
    const cfgDir = path.join(__dirname, "..", "data", "capacidade-viva", "calibration", "configs");
    fs.mkdirSync(cfgDir, { recursive: true });
    const versioned = path.join(cfgDir, `${cal.recommended_config.config_version || "cal"}.json`);
    fs.writeFileSync(versioned, JSON.stringify(cal.recommended_config, null, 2));
    console.log("config versionada:", versioned);
  }

  const temporal = Cal.calibrator.evaluateTemporalHypotheses(replay.ticks || []);
  fs.writeFileSync(path.join(outDir, "06_temporal_hypotheses.json"), JSON.stringify(temporal, null, 2));

  const shadow = Cal.shadow.buildShadowReport(replay);
  fs.writeFileSync(path.join(outDir, "07_shadow_report.json"), JSON.stringify(shadow, null, 2));

  // Import contract for missing 6 months
  const importContract = {
    labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
    missing_for_six_months: [
      "relatorios_pedidos_ifood_mes_a_mes (jan–maio ou período pedido)",
      "exports HTML itens multi-mês se desejado",
      "escala de equipe por turno (se existir)"
    ],
    expected_formats: ["xlsx iFood pedidos", "jsonl Transicao", "jsonl itens"],
    drop_path_suggestion: "data/raw/incoming/ifood_YYYY-MM/",
    do_not_invent: true
  };
  fs.writeFileSync(path.join(outDir, "08_import_contract.json"), JSON.stringify(importContract, null, 2));

  const master = {
    labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
    operational: false,
    generated_at: new Date().toISOString(),
    inventory: inv,
    quality,
    catalog_summary: {
      n: catalog.n,
      classified: catalog.classified,
      pending: catalog.pending_validation
    },
    replay: {
      from: replay.from,
      to: replay.to,
      n_ticks: replay.n_ticks,
      interval_min: replay.interval_min
    },
    calibration: {
      recommended: cal.recommended && cal.recommended.id,
      stability_gap: cal.recommended && cal.recommended.stability_gap
    },
    shadow_metrics: shadow.metrics,
    temporal: temporal.hypotheses,
    recovery_liquida: shadow.recovery_liquida_historica,
    out_dir: outDir
  };
  fs.writeFileSync(path.join(outDir, "99_MASTER_REPORT.json"), JSON.stringify(master, null, 2));
  console.log("DONE", path.join(outDir, "99_MASTER_REPORT.json"));
}

function buildSyntheticBundle() {
  const base = Date.parse("2026-06-20T18:00:00.000Z");
  const transitions = [];
  const items = [];
  for (let i = 0; i < 40; i++) {
    const id = "sim-order-" + i;
    const t0 = new Date(base + i * 120000).toISOString();
    const t1 = new Date(base + i * 120000 + 600000).toISOString();
    const t2 = new Date(base + i * 120000 + 900000).toISOString();
    transitions.push(
      { pedido_id: id, tipo_evento: "ifood.recebido", timestamp: t0, fonte: "synthetic", confianca: "alta", payload_original: {} },
      { pedido_id: id, tipo_evento: "ifood.aceito", timestamp: t0, fonte: "synthetic", confianca: "alta", payload_original: {} },
      {
        pedido_id: id,
        tipo_evento: "ifood.pronto",
        timestamp: t1,
        fonte: "synthetic",
        confianca: "alta",
        payload_original: { "TEMPO DO ENTREGADOR ESPERANDO NA LOJA (MIN)": i % 5 === 0 ? 8 : 1 }
      },
      { pedido_id: id, tipo_evento: "ifood.saiu", timestamp: t2, fonte: "synthetic", confianca: "alta", payload_original: {} }
    );
    items.push({
      pedido_id: id,
      item_nome: i % 2 ? "Hot Roll" : "Uramaki",
      quantidade: 1,
      data_hora: "20/06/2026 15:00",
      status: "CONCLUDED",
      origem: "synthetic_fixture"
    });
  }
  return { transitions, items, simulated: true };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
