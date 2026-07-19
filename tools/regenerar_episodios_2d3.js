#!/usr/bin/env node
/* ============================================================================
 * Fase 2D.3 — regenera episódios com fronteira de dia/turno + freeze pack humano.
 * Não altera cv-cal-sane-v2, pesos, ISF ou taxonomia de classificação.
 *
 *   node tools/regenerar_episodios_2d3.js
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

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

function episodeSummary(rep) {
  const ep = rep.episodes || {};
  return {
    n: ep.n_episodes,
    critical: ep.n_critical_episodes,
    attention: ep.n_attention_episodes,
    single_tick_n: ep.single_tick && ep.single_tick.n,
    measurable_n: ep.measurable && ep.measurable.n,
    duration_avg_measurable: ep.measurable && ep.measurable.duration_avg_min,
    duration_median_measurable: ep.measurable && ep.measurable.duration_median_min,
    duration_p90_measurable: ep.measurable && ep.measurable.duration_p90_min,
    duration_max_measurable: ep.measurable && ep.measurable.duration_max_min,
    unique_orders: ep.unique_orders_affected,
    without_order_id: ep.episodes_without_order_id,
    resolved: ep.episodes_resolved,
    open_at_end: ep.episodes_open_at_end,
    crossing_day: ep.episodes_crossing_day,
    n_split_by_boundary: ep.n_split_by_boundary,
    by_praca: ep.by_praca,
    by_type: ep.by_type,
    by_level: ep.by_level,
    by_confidence: ep.by_confidence,
    by_epistemic: ep.by_epistemic,
    operational: ep.operational
  };
}

async function main() {
  const root = path.join(__dirname, "..");
  const prevDir = path.resolve(
    arg("--prev", path.join(root, "results", "capacidade-viva", "sane-metrics-2d2-1784445182586"))
  );
  const outDir = path.resolve(
    arg("--out", path.join(root, "results", "capacidade-viva", `sane-episodes-2d3-${Date.now()}`))
  );
  fs.mkdirSync(outDir, { recursive: true });

  console.log("=== 2D.3 EPISÓDIOS + FREEZE HUMANO ===");
  console.log("out:", outDir);

  const prevMasterPath = path.join(prevDir, "99_MASTER_REPORT.json");
  let prevMaster = null;
  if (fs.existsSync(prevMasterPath)) {
    prevMaster = JSON.parse(fs.readFileSync(prevMasterPath, "utf8"));
    fs.copyFileSync(prevMasterPath, path.join(outDir, "99_MASTER_REPORT.previous.json"));
    writeJson(path.join(outDir, "00_previous_pointer.json"), {
      previous_path: prevMasterPath,
      previous_version: prevMaster.version,
      previous_episodes: prevMaster.episodes
    });
  }

  // Investigation snapshot of 7335 min from previous full list if present
  const prevFull = path.join(prevDir, "04b_episodes_full.json");
  if (fs.existsSync(prevFull)) {
    const list = JSON.parse(fs.readFileSync(prevFull, "utf8")).episodes || [];
    const top = list.slice().sort((a, b) => (b.duration_min || 0) - (a.duration_min || 0))[0];
    writeJson(path.join(outDir, "01_investigation_7335.json"), {
      episode: top,
      cause:
        "Pedido 778a2735-97af-4f4f-8d5b-189b2c7c49db permaneceu active sem evento terminal (saiu/entregue/cancelado); sinal pedido_atrasado_vs_prometido_operacional renovado a cada tick 15 min; sem quebra de dia operacional → continuidade 2026-06-25→06-30 (7335 min, 490 ticks, open).",
      not_generic_key: true,
      same_order_multi_day: true,
      fix: "quebra obrigatória por dia operacional (cutover 05:00 America/Sao_Paulo) + gap + sem multi-day continuity"
    });
  }

  writeJson(path.join(outDir, "02_logistic_confidence_audit.json"), Cal.reviewSet.logisticConfidenceAudit());

  const inv = Cal.loader.inventoryKnownSources({});
  writeJson(path.join(outDir, "00_inventory.json"), inv);

  const cardPath =
    (inv.sources.find((s) => s.id === "cardapio_seed" && s.exists) || {}).path ||
    path.join(root, "data", "cardapio_knowledge_seed.json");
  const card = Cal.loader.loadJson(cardPath);
  const catalog = Cal.catalog.buildCatalog(card.ok ? card.data : { itens: [] });

  const ifoodSrc = inv.sources.find((s) => s.id === "ifood_real_jsonl" && s.exists);
  const itensSrc = inv.sources.find((s) => s.id === "itens_jun20_30" && s.exists);
  if (!ifoodSrc) throw new Error("ifood_real_jsonl missing");

  console.log("loading data FULL (read-only)...");
  const transitions = (await Cal.loader.loadJsonl(ifoodSrc.path)).rows || [];
  let items = [];
  if (itensSrc) items = (await Cal.loader.loadJsonl(itensSrc.path)).rows || [];

  console.log("normalizing...");
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
  const byOrder = timelines.byOrder;
  console.log("orders:", byOrder.size, "events:", events.length);

  const sanePath = path.join(
    root,
    "data",
    "capacidade-viva",
    "calibration",
    "configs",
    "cv-cal-sane-v2.json"
  );
  const config = JSON.parse(fs.readFileSync(sanePath, "utf8")); // read-only use
  const interval = Number(arg("--interval", "15")) || 15;
  const profiles = ["estrutura_forte", "estrutura_media", "estrutura_fraca"];
  const profileResults = {};
  let primaryRep = null;

  for (const team of profiles) {
    console.log("replay team=", team);
    const rep = Cal.replay.replayOrders(byOrder, {
      interval_min: interval,
      team_profile: team,
      config
    });
    profileResults[team] = {
      metrics: rep.metrics_corrected,
      episodes: episodeSummary(rep),
      runtime: rep.runtime,
      n_ticks: rep.n_ticks,
      capacidade_hipotetica: true
    };
    if (team === "estrutura_media") {
      primaryRep = rep;
      writeJson(path.join(outDir, "04_replay_summary.json"), {
        ok: rep.ok,
        from: rep.from,
        to: rep.to,
        n_ticks: rep.n_ticks,
        interval_min: rep.interval_min,
        timezone: rep.timezone,
        metrics_corrected: rep.metrics_corrected,
        runtime: rep.runtime
      });
      writeJson(path.join(outDir, "04b_episodes_summary.json"), episodeSummary(rep));
      writeJson(path.join(outDir, "04b_episodes_full.json"), {
        n: rep.episodes.n_episodes,
        operational: rep.episodes.operational,
        split_by_boundary: rep.episodes.split_by_boundary,
        episodes: rep.episodes.episodes
      });
      writeJson(path.join(outDir, "04b_split_by_boundary.json"), {
        n: rep.episodes.n_split_by_boundary,
        sample: (rep.episodes.split_by_boundary || []).slice(0, 100)
      });
      // max duration check
      const sorted = (rep.episodes.episodes || [])
        .slice()
        .sort((a, b) => (b.observed_span_min || 0) - (a.observed_span_min || 0));
      writeJson(path.join(outDir, "04b_longest_episodes.json"), sorted.slice(0, 20));
      writeJson(path.join(outDir, "05_sensitivity.json"), Cal.sensitivity.analyzeSensitivity(rep.ticks));
      writeJson(path.join(outDir, "05b_baselines.json"), Cal.baselines.compareBaselines(rep.ticks));
      writeJson(
        path.join(outDir, "06_temporal_hypotheses.json"),
        Cal.calibrator.evaluateTemporalHypotheses(rep.ticks)
      );
    }
  }

  // Praça coverage analysis
  const pracaCoverage = analyzePracaCoverage(primaryRep, catalog);
  writeJson(path.join(outDir, "07_praca_coverage.json"), pracaCoverage);

  writeJson(path.join(outDir, "08_team_profiles.json"), profileResults);

  // Human pack freeze
  const reviewDir = path.join(root, "data", "capacidade-viva", "calibration", "review");
  const prevReviewPath = path.join(reviewDir, "casos-validacao.json");
  const prevReview = fs.existsSync(prevReviewPath)
    ? JSON.parse(fs.readFileSync(prevReviewPath, "utf8"))
    : null;
  // backup previous pack
  if (prevReview) {
    writeJson(path.join(outDir, "09_review_previous.json"), prevReview);
    fs.writeFileSync(
      path.join(reviewDir, "casos-validacao.previous-2d2.json"),
      JSON.stringify(prevReview, null, 2)
    );
  }

  const review = Cal.reviewSet.buildReviewCases(primaryRep, catalog, { freeze_version: "2D.3" });
  // compare classifications change by case_id if possible
  const changed = [];
  if (prevReview && prevReview.cases) {
    const prevById = new Map(prevReview.cases.map((c) => [c.case_id, c]));
    for (const c of review.cases) {
      const p = prevById.get(c.case_id);
      if (!p) {
        changed.push({ case_id: c.case_id, change: "novo_ou_reamostrado" });
        continue;
      }
      if (p.classificacao_motor !== c.classificacao_motor || p.bucket_esperado_motor !== c.bucket_esperado_motor) {
        changed.push({
          case_id: c.case_id,
          before: { class: p.classificacao_motor, bucket: p.bucket_esperado_motor },
          after: { class: c.classificacao_motor, bucket: c.bucket_esperado_motor },
          why: "reamostragem com episódios/fronteiras 2D.3; se bucket igual e só apresentação, não listar"
        });
      }
    }
  }
  writeJson(path.join(outDir, "09_review_cases_changed.json"), {
    n_changed: changed.length,
    changed: changed.slice(0, 40),
    note: "Pack reamostrado a partir do replay 2D.3 para refletir duração/confiança; buckets 10/10/10/10 mantidos."
  });

  fs.mkdirSync(reviewDir, { recursive: true });
  fs.writeFileSync(path.join(reviewDir, "casos-validacao.json"), JSON.stringify(review, null, 2));
  fs.writeFileSync(path.join(reviewDir, "CASOS_VALIDACAO.md"), Cal.reviewSet.toMarkdown(review), "utf8");
  writeJson(path.join(outDir, "09_review_cases.json"), review);

  const media = profileResults.estrutura_media || {};
  const before = prevMaster && prevMaster.episodes;
  const after = media.episodes;

  const comparison = {
    before,
    after,
    episode_count_delta: after && before ? after.n - before.n : null,
    max_before: before && (before.duration_max_min != null ? before.duration_max_min : before.duration_max),
    max_after_measurable: after && after.duration_max_measurable,
    crossing_day_after: after && after.crossing_day
  };
  writeJson(path.join(outDir, "10_comparison_before_after.json"), comparison);

  const human = {
    labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
    operational: false,
    title: "Resumo humano 2D.3 — episódios com fronteira de turno",
    n_episodes: after && after.n,
    single_tick: after && after.single_tick_n,
    measurable: after && after.measurable_n,
    duration_avg_measurable: after && after.duration_avg_measurable,
    duration_median_measurable: after && after.duration_median_measurable,
    duration_p90_measurable: after && after.duration_p90_measurable,
    duration_max_measurable: after && after.duration_max_measurable,
    crossing_day: after && after.crossing_day,
    open: after && after.open_at_end,
    unique_orders: after && after.unique_orders,
    by_praca: after && after.by_praca,
    by_type: after && after.by_type,
    by_epistemic: after && after.by_epistemic,
    praca_coverage_note: pracaCoverage.summary,
    single_tick_label: "observado em uma leitura (não reportar 0 min)",
    review_freeze: "2D.3",
    cases_changed: changed.length,
    pending_items: (review.itens_pendentes || []).length
  };
  writeJson(path.join(outDir, "10_human_summary.json"), human);

  const master = {
    labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
    version: "2D.3-episodes-shift",
    full_replay: true,
    regenerated_for: "fronteira_turno_e_duracao_honesta",
    previous_report: prevMaster
      ? { path: prevMasterPath, version: prevMaster.version, generated_at: prevMaster.generated_at }
      : null,
    investigation_7335: fs.existsSync(path.join(outDir, "01_investigation_7335.json"))
      ? JSON.parse(fs.readFileSync(path.join(outDir, "01_investigation_7335.json"), "utf8"))
      : null,
    generated_at: new Date().toISOString(),
    timezone: "America/Sao_Paulo",
    events_processed: transitions.length + items.length,
    orders_processed: byOrder.size,
    metrics: media.metrics,
    episodes: media.episodes,
    profiles: profileResults,
    praca_coverage: pracaCoverage,
    logistic_audit: Cal.reviewSet.logisticConfidenceAudit(),
    comparison,
    review: {
      n: review.n_cases,
      counts: review.counts,
      pending_items: (review.itens_pendentes || []).length,
      freeze_version: review.freeze_version,
      cases_changed: changed.length
    },
    catalog_summary: {
      n: catalog.n,
      classified: catalog.classified,
      pending: catalog.pending_validation
    },
    config_previous: "cv-cal-sane-v2",
    config_new: "cv-cal-sane-v2",
    config_changed: false,
    isf_changed: false,
    classifications_taxonomy_changed: false,
    out_dir: outDir,
    human_summary: human
  };
  writeJson(path.join(outDir, "99_MASTER_REPORT.json"), master);

  console.log("DONE", path.join(outDir, "99_MASTER_REPORT.json"));
  console.log(
    JSON.stringify(
      {
        n: after && after.n,
        single: after && after.single_tick_n,
        measurable: after && after.measurable_n,
        avg: after && after.duration_avg_measurable,
        median: after && after.duration_median_measurable,
        p90: after && after.duration_p90_measurable,
        max: after && after.duration_max_measurable,
        crossing: after && after.crossing_day,
        open: after && after.open_at_end,
        unique: after && after.unique_orders,
        cases_changed: changed.length
      },
      null,
      2
    )
  );
}

function analyzePracaCoverage(rep, catalog) {
  const by = (rep.episodes && rep.episodes.by_praca) || {};
  const expected = ["sushi", "quentes", "cozinha", "conferencia", "caixa", "motoboy"];
  const notes = {};
  for (const p of expected) {
    const n = by[p] || 0;
    if (n > 0) {
      notes[p] = { episodes: n, status: "com_episodios" };
    } else {
      // distinguish no reading vs no episode
      notes[p] = {
        episodes: 0,
        status: p === "quentes" || p === "cozinha" || p === "caixa" || p === "motoboy"
          ? "ausencia_de_leitura_ou_sinal_agregado_em_outra_praca"
          : "ausencia_de_episodio",
        detail:
          p === "conferencia"
            ? "inesperado se zero"
            : "Episódios logísticos/atraso usam praça crítica do ISF (frequentemente conferencia/sushi). Itens de produção dependem do catálogo+export itens; sem eventos de praça dedicados, não fabricamos distribuição."
      };
    }
  }
  return {
    summary:
      "Episódios concentrados em conferencia e sushi porque (1) praça_critica do ISF no tick e (2) sinais logísticos/atraso não abrem praça de produção independente. Não é prova de que Quentes/Cozinha estiveram calmos — pode ser ausência de leitura/item mapping.",
    by_praca_episodes: by,
    expected_pracas: notes,
    catalog_pending: catalog.pending_validation,
    fabricated: false
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
