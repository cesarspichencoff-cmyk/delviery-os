#!/usr/bin/env node
/* ============================================================================
 * Calibração Capacidade Viva 2D.1 — saneada · FULL por padrão
 * CALIBRAÇÃO · MODO SOMBRA · NÃO OPERACIONAL
 *
 *   node tools/calibrar_capacidade_viva.js
 *   node tools/calibrar_capacidade_viva.js --fast   # subsample dev
 *   node tools/calibrar_capacidade_viva.js --demo
 * ==========================================================================*/
"use strict";

const fs = require("fs");
const path = require("path");
const Cal = require("../src/capacidade-viva/calibration");

function arg(name, def) {
  const i = process.argv.indexOf(name);
  if (i < 0) return def;
  return process.argv[i + 1] != null && !String(process.argv[i + 1]).startsWith("--")
    ? process.argv[i + 1]
    : true;
}

async function main() {
  const demoOnly = process.argv.includes("--demo");
  const fast = process.argv.includes("--fast");
  const full = !fast; // full is default
  const interval = Number(arg("--interval", "15")) || 15;
  const outDir = path.resolve(
    arg("--out", path.join(__dirname, "..", "results", "capacidade-viva", `sane-${Date.now()}`))
  );
  fs.mkdirSync(outDir, { recursive: true });

  console.log("=== CALIBRAÇÃO · MODO SOMBRA · NÃO OPERACIONAL · 2D.1 ===");
  console.log("mode:", full ? "FULL" : "FAST subsample", "interval", interval);
  console.log("out:", outDir);

  const inv = Cal.loader.inventoryKnownSources({
    ifood_real: arg("--ifood", undefined),
    itens: arg("--itens", undefined)
  });
  fs.writeFileSync(path.join(outDir, "00_inventory.json"), JSON.stringify(inv, null, 2));
  fs.writeFileSync(
    path.join(outDir, "00_timezone.json"),
    JSON.stringify(
      {
        target: Cal.timezone.TARGET_TZ,
        sources: {
          ifood_real_jsonl: Cal.timezone.sourceTimezoneEvidence("ifood_real_jsonl"),
          itens_jsonl: Cal.timezone.sourceTimezoneEvidence("itens_jsonl")
        },
        silent_conversion: false
      },
      null,
      2
    )
  );

  const cardPath =
    (inv.sources.find((s) => s.id === "cardapio_seed" && s.exists) || {}).path ||
    path.join(__dirname, "..", "data", "cardapio_knowledge_seed.json");
  const card = Cal.loader.loadJson(cardPath);
  const catalog = Cal.catalog.buildCatalog(card.ok ? card.data : { itens: [] });
  fs.writeFileSync(path.join(outDir, "01_catalog.json"), JSON.stringify(catalog, null, 2));

  let transitions = [];
  let items = [];
  let quality = {};

  if (!demoOnly) {
    const ifoodSrc = inv.sources.find((s) => s.id === "ifood_real_jsonl" && s.exists);
    if (ifoodSrc) {
      console.log("loading ifood_real FULL (read-only)...");
      const loaded = await Cal.loader.loadJsonl(ifoodSrc.path);
      transitions = loaded.rows || [];
      quality.transitions = Cal.quality.analyzeTransitions(transitions);
      console.log("  events:", transitions.length);
    }
    const itensSrc = inv.sources.find((s) => s.id === "itens_jun20_30" && s.exists);
    if (itensSrc) {
      console.log("loading itens (read-only)...");
      const loaded = await Cal.loader.loadJsonl(itensSrc.path);
      items = loaded.rows || [];
      quality.items = Cal.quality.analyzeItems(items);
      console.log("  item lines:", items.length);
    }
  }
  if (demoOnly || (!transitions.length && !items.length)) {
    console.log("demo synthetic");
    const demo = buildSyntheticBundle();
    transitions = demo.transitions;
    items = demo.items;
    quality.synthetic = true;
    quality.transitions = Cal.quality.analyzeTransitions(transitions);
    quality.items = Cal.quality.analyzeItems(items);
  }
  fs.writeFileSync(path.join(outDir, "02_quality.json"), JSON.stringify(quality, null, 2));

  console.log("normalizing + timezone SP...");
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
  for (const [, list] of timelines.byOrder) {
    const derived = Cal.normalizer.deriveTimingInferences(list);
    if (derived.length) {
      list.push(...derived);
      list.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    }
  }

  let byOrder = timelines.byOrder;
  const ordersTotal = byOrder.size;
  if (!full && byOrder.size > 1500) {
    console.log("FAST: subsample 1500 pedidos");
    byOrder = new Map([...byOrder.entries()].slice(0, 1500));
  } else {
    console.log("FULL: pedidos", byOrder.size);
  }

  // Load sane config v2 if exists, else default + patches
  const sanePath = path.join(
    __dirname,
    "..",
    "data",
    "capacidade-viva",
    "calibration",
    "configs",
    "cv-cal-sane-v2.json"
  );
  let config = Cal.loader.loadJson(
    path.join(__dirname, "..", "data", "capacidade-viva", "config.default.json")
  ).data;
  if (fs.existsSync(sanePath)) {
    config = JSON.parse(fs.readFileSync(sanePath, "utf8"));
    console.log("using", sanePath);
  } else {
    config = patchSaneV2(config);
  }

  const profiles = ["estrutura_forte", "estrutura_media", "estrutura_fraca"];
  const profileResults = {};

  for (const team of profiles) {
    console.log("replay team=", team);
    const rep = Cal.replay.replayOrders(byOrder, {
      interval_min: interval,
      team_profile: team,
      config
    });
    profileResults[team] = {
      metrics: rep.metrics_corrected,
      runtime: rep.runtime,
      n_ticks: rep.n_ticks,
      episodes: {
        n: rep.episodes.n_episodes,
        critical: rep.episodes.n_critical_episodes,
        attention: rep.episodes.n_attention_episodes,
        duration_avg: rep.episodes.duration_avg_min,
        duration_max: rep.episodes.duration_max_min,
        unique_orders: rep.episodes.unique_orders_affected
      },
      capacidade_hipotetica: true
    };
    if (team === "estrutura_media") {
      // primary report artifacts
      fs.writeFileSync(
        path.join(outDir, "04_replay_summary.json"),
        JSON.stringify(
          {
            ok: rep.ok,
            full: full,
            from: rep.from,
            to: rep.to,
            n_ticks: rep.n_ticks,
            interval_min: rep.interval_min,
            timezone: rep.timezone,
            metrics_corrected: rep.metrics_corrected,
            runtime: rep.runtime,
            orders_in_replay: byOrder.size,
            orders_available: ordersTotal
          },
          null,
          2
        )
      );
      fs.writeFileSync(
        path.join(outDir, "04b_episodes_summary.json"),
        JSON.stringify(
          {
            n_episodes: rep.episodes.n_episodes,
            n_critical: rep.episodes.n_critical_episodes,
            n_attention: rep.episodes.n_attention_episodes,
            duration_avg_min: rep.episodes.duration_avg_min,
            duration_max_min: rep.episodes.duration_max_min,
            unique_orders_affected: rep.episodes.unique_orders_affected,
            sample: (rep.episodes.episodes || []).slice(0, 30)
          },
          null,
          2
        )
      );
      const sens = Cal.sensitivity.analyzeSensitivity(rep.ticks);
      fs.writeFileSync(path.join(outDir, "05_sensitivity.json"), JSON.stringify(sens, null, 2));
      const base = Cal.baselines.compareBaselines(rep.ticks);
      fs.writeFileSync(path.join(outDir, "05b_baselines.json"), JSON.stringify(base, null, 2));
      const temporal = Cal.calibrator.evaluateTemporalHypotheses(rep.ticks);
      fs.writeFileSync(path.join(outDir, "06_temporal_hypotheses.json"), JSON.stringify(temporal, null, 2));
      const shadow = Cal.shadow.buildShadowReport(rep);
      fs.writeFileSync(path.join(outDir, "07_shadow_report.json"), JSON.stringify(shadow, null, 2));

      const review = Cal.reviewSet
        ? Cal.reviewSet.buildReviewCases(rep, catalog)
        : require("../src/capacidade-viva/calibration/review-set").buildReviewCases(rep, catalog);
      const reviewDir = path.join(__dirname, "..", "data", "capacidade-viva", "calibration", "review");
      fs.mkdirSync(reviewDir, { recursive: true });
      fs.writeFileSync(path.join(reviewDir, "casos-validacao.json"), JSON.stringify(review, null, 2));
      const md = require("../src/capacidade-viva/calibration/review-set").toMarkdown(review);
      fs.writeFileSync(path.join(reviewDir, "CASOS_VALIDACAO.md"), md, "utf8");
      fs.writeFileSync(path.join(outDir, "09_review_cases.json"), JSON.stringify(review, null, 2));
      console.log("review cases:", review.n_cases, "pending items", (review.itens_pendentes || []).length);

      // keep sample ticks
      fs.writeFileSync(
        path.join(outDir, "04_replay_ticks_sample.json"),
        JSON.stringify(rep.ticks.filter((_, i) => i % 20 === 0).slice(0, 400), null, 2)
      );

      global.__PRIMARY_REP__ = rep;
      global.__REVIEW__ = review;
    }
  }

  fs.writeFileSync(path.join(outDir, "08_team_profiles.json"), JSON.stringify(profileResults, null, 2));

  // persist config v2 if not already
  const cfgDir = path.join(__dirname, "..", "data", "capacidade-viva", "calibration", "configs");
  fs.mkdirSync(cfgDir, { recursive: true });
  const v2path = path.join(cfgDir, "cv-cal-sane-v2.json");
  if (!fs.existsSync(v2path)) {
    fs.writeFileSync(v2path, JSON.stringify(patchSaneV2(Cal.loader.loadJson(path.join(__dirname, "..", "data", "capacidade-viva", "config.default.json")).data), null, 2));
  }
  fs.writeFileSync(path.join(outDir, "05_config_sane_v2.json"), fs.readFileSync(v2path, "utf8"));

  const master = {
    labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
    version: "2D.1-sane",
    full_replay: full,
    generated_at: new Date().toISOString(),
    timezone: "America/Sao_Paulo",
    inventory: inv,
    quality,
    catalog_summary: {
      n: catalog.n,
      classified: catalog.classified,
      pending: catalog.pending_validation
    },
    metrics: profileResults.estrutura_media && profileResults.estrutura_media.metrics,
    episodes: profileResults.estrutura_media && profileResults.estrutura_media.episodes,
    profiles: profileResults,
    config_previous: "cv-cal-complexity_heavy-v1",
    config_new: "cv-cal-sane-v2",
    recovery_liquida_historica: "nao_calculavel_sem_acoes_humanas",
    out_dir: outDir
  };
  fs.writeFileSync(path.join(outDir, "99_MASTER_REPORT.json"), JSON.stringify(master, null, 2));
  console.log("DONE", path.join(outDir, "99_MASTER_REPORT.json"));
}

function patchSaneV2(base) {
  const c = JSON.parse(JSON.stringify(base));
  c.config_version = "cv-cal-sane-v2";
  c.provisional = true;
  c.calibration = {
    labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
    parent: "cv-cal-complexity-heavy-v1",
    changes: [
      "taxonomia sinal/atenção/exceção",
      "envelhecimento isolado não é exceção crítica",
      "pronto sem saída com causa não confirmada",
      "motoboy só com espera na loja evidenciada",
      "gates de pausa seletiva/geral",
      "timezone America/Sao_Paulo explícito",
      "episódios com gap 10 min"
    ],
    at: new Date().toISOString()
  };
  c.atraso = Object.assign({}, c.atraso || {}, {
    pronto_sem_saida_min: 12,
    motoboy_na_loja_min: 5,
    entregador_alocado_sem_retirada_min: 15,
    expedicao_normal_max_min: 8,
    atraso_min: 50,
    proximo_atrasar_min: 35
  });
  c.pesos_carga = {
    quantidade: 0.85,
    complexidade: 1.25,
    urgencia: 1.05,
    concentracao: 1.0,
    dependencias: 1.05
  };
  c.episode = { gap_min: 10 };
  c.pausa = Object.assign({}, c.pausa || {}, {
    seletiva_requer_tendencia: true,
    seletiva_requer_confianca: true,
    geral_requer_multiplas_pracas: true,
    auto_aplicar: false
  });
  return c;
}

function buildSyntheticBundle() {
  const base = Date.parse("2026-06-20T21:00:00.000Z");
  const transitions = [];
  const items = [];
  for (let i = 0; i < 30; i++) {
    const id = "sim-" + i;
    const t0 = new Date(base + i * 180000).toISOString();
    const t1 = new Date(base + i * 180000 + 800000).toISOString();
    const t2 = new Date(base + i * 180000 + 1500000).toISOString();
    transitions.push(
      { pedido_id: id, tipo_evento: "ifood.recebido", timestamp: t0, fonte: "synthetic", confianca: "alta", payload_original: {} },
      { pedido_id: id, tipo_evento: "ifood.aceito", timestamp: t0, fonte: "synthetic", confianca: "alta", payload_original: {} },
      {
        pedido_id: id,
        tipo_evento: "ifood.pronto",
        timestamp: t1,
        fonte: "synthetic",
        confianca: "alta",
        payload_original: {
          "TEMPO DO ENTREGADOR ESPERANDO NA LOJA (MIN)": i % 7 === 0 ? 9 : 1,
          "TEMPO DE ALOCAÇÃO DO ENTREGADOR (MIN)": 10
        }
      },
      { pedido_id: id, tipo_evento: "ifood.saiu", timestamp: t2, fonte: "synthetic", confianca: "alta", payload_original: {} }
    );
    items.push({
      pedido_id: id,
      item_nome: "Hot Roll",
      quantidade: 1,
      data_hora: "20/06/2026 18:00",
      status: "CONCLUDED",
      origem: "synthetic"
    });
  }
  return { transitions, items };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
