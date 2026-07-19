#!/usr/bin/env node
/* ============================================================================
 * Fase 2D.2 — regenera MASTER + resumos a partir do full replay.
 * Não altera cv-cal-sane-v2, pesos, taxonomia de classificação ou casos humanos.
 *
 * Preferência: reutilizar episódios serializados se existirem.
 * No artefato sane-final-1784443932438 só há MASTER/profiles com zeros →
 * é necessário re-rodar o replay (não reclassifica motor; só corrige agregação).
 *
 *   node tools/regenerar_relatorio_episodios.js
 *   node tools/regenerar_relatorio_episodios.js --source results/capacidade-viva/sane-final-1784443932438
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
    duration_avg_min: ep.duration_avg_min,
    duration_median_min: ep.duration_median_min,
    duration_p90_min: ep.duration_p90_min,
    duration_max_min: ep.duration_max_min,
    unique_orders: ep.unique_orders_affected,
    without_order_id: ep.episodes_without_order_id,
    resolved: ep.episodes_resolved,
    open_at_end: ep.episodes_open_at_end,
    by_praca: ep.by_praca,
    by_type: ep.by_type,
    by_level: ep.by_level,
    gap_min: ep.gap_min,
    gap_effective_min: ep.gap_effective_min,
    interval_min: ep.interval_min
  };
}

async function main() {
  const root = path.join(__dirname, "..");
  const sourceDir = path.resolve(
    arg("--source", path.join(root, "results", "capacidade-viva", "sane-final-1784443932438"))
  );
  const outDir = path.resolve(
    arg(
      "--out",
      path.join(root, "results", "capacidade-viva", `sane-metrics-2d2-${Date.now()}`)
    )
  );
  fs.mkdirSync(outDir, { recursive: true });

  console.log("=== 2D.2 REGÉNERE RELATÓRIO EPISÓDIOS ===");
  console.log("source:", sourceDir);
  console.log("out:", outDir);

  // Preserve pointer to previous master
  const prevMasterPath = path.join(sourceDir, "99_MASTER_REPORT.json");
  const prevMaster = fs.existsSync(prevMasterPath)
    ? JSON.parse(fs.readFileSync(prevMasterPath, "utf8"))
    : null;
  if (prevMaster) {
    writeJson(path.join(outDir, "00_previous_master_pointer.json"), {
      previous_path: prevMasterPath,
      previous_generated_at: prevMaster.generated_at,
      previous_version: prevMaster.version,
      previous_zeros: {
        duracao_media_min: prevMaster.metrics && prevMaster.metrics.duracao_media_min,
        duracao_max_min: prevMaster.metrics && prevMaster.metrics.duracao_max_min,
        pedidos_unicos_afetados: prevMaster.metrics && prevMaster.metrics.pedidos_unicos_afetados
      },
      note: "Relatório anterior preservado; não sobrescrito."
    });
    // copy previous master into new dir for archive
    fs.copyFileSync(prevMasterPath, path.join(outDir, "99_MASTER_REPORT.previous.json"));
  }

  // Try reuse serialized episodes if present
  const candidateEpisodeFiles = [
    path.join(sourceDir, "04b_episodes_full.json"),
    path.join(sourceDir, "04b_episodes_summary.json"),
    path.join(sourceDir, "episodes.json")
  ];
  let reused = null;
  for (const f of candidateEpisodeFiles) {
    if (!fs.existsSync(f)) continue;
    const raw = JSON.parse(fs.readFileSync(f, "utf8"));
    const list = Array.isArray(raw) ? raw : raw.episodes || raw.sample || [];
    if (list.length > 50 && list[0] && (list[0].started_ms != null || list[0].duration_min != null)) {
      reused = { file: f, list };
      break;
    }
  }

  let fullReplay = false;
  let profileResults = {};
  let primaryRep = null;
  let eventsProcessed = prevMaster && prevMaster.events_processed;
  let ordersProcessed = prevMaster && prevMaster.orders_processed;
  let sensitivity = prevMaster && prevMaster.sensitivity;
  let baselines = prevMaster && prevMaster.baselines;
  let temporal = prevMaster && prevMaster.temporal;
  let catalog_summary = prevMaster && prevMaster.catalog_summary;

  if (reused) {
    console.log("reusing episodes from", reused.file, "n=", reused.list.length);
    const agg = Cal.episodes.reaggregateFromSerialized(reused.list);
    writeJson(path.join(outDir, "04b_episodes_reaggregated.json"), agg);
    primaryRep = {
      ok: true,
      metrics_corrected: {
        ...(prevMaster && prevMaster.metrics),
        n_episodios: agg.n_episodes,
        n_episodios_criticos: agg.n_critical_episodes,
        n_episodios_atencao: agg.n_attention_episodes,
        duracao_media_min: agg.duration_avg_min,
        duracao_mediana_min: agg.duration_median_min,
        duracao_p90_min: agg.duration_p90_min,
        duracao_max_min: agg.duration_max_min,
        pedidos_unicos_afetados: agg.unique_orders_affected,
        episodios_sem_pedido: agg.episodes_without_order_id,
        episodios_resolvidos: agg.episodes_resolved,
        episodios_abertos_fim_janela: agg.episodes_open_at_end,
        episodios_por_praca: agg.by_praca,
        episodios_por_tipo: agg.by_type
      },
      episodes: agg,
      n_ticks: prevMaster && prevMaster.profiles && prevMaster.profiles.estrutura_media
        ? undefined
        : null,
      runtime: { regenerated_from: "serialized_episodes" }
    };
    profileResults.estrutura_media = {
      metrics: primaryRep.metrics_corrected,
      episodes: episodeSummary(primaryRep),
      runtime: primaryRep.runtime,
      capacidade_hipotetica: true
    };
  } else {
    fullReplay = true;
    console.log("NO usable episode list in source — full replay required for metric fix.");
    console.log("Motor weights/taxonomy thresholds/config file NOT modified.");

    const inv = Cal.loader.inventoryKnownSources({});
    writeJson(path.join(outDir, "00_inventory.json"), inv);

    const cardPath =
      (inv.sources.find((s) => s.id === "cardapio_seed" && s.exists) || {}).path ||
      path.join(root, "data", "cardapio_knowledge_seed.json");
    const card = Cal.loader.loadJson(cardPath);
    const catalog = Cal.catalog.buildCatalog(card.ok ? card.data : { itens: [] });
    catalog_summary = {
      n: catalog.n,
      classified: catalog.classified,
      pending: catalog.pending_validation
    };
    writeJson(path.join(outDir, "01_catalog_summary.json"), catalog_summary);

    const ifoodSrc = inv.sources.find((s) => s.id === "ifood_real_jsonl" && s.exists);
    const itensSrc = inv.sources.find((s) => s.id === "itens_jun20_30" && s.exists);
    if (!ifoodSrc) throw new Error("ifood_real_jsonl missing");

    console.log("loading ifood FULL (read-only)...");
    const loadedT = await Cal.loader.loadJsonl(ifoodSrc.path);
    const transitions = loadedT.rows || [];
    let items = [];
    if (itensSrc) {
      console.log("loading itens (read-only)...");
      const loadedI = await Cal.loader.loadJsonl(itensSrc.path);
      items = loadedI.rows || [];
    }
    eventsProcessed = transitions.length + items.length;

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
    ordersProcessed = byOrder.size;
    console.log("orders:", ordersProcessed, "events normalized:", events.length);

    const sanePath = path.join(
      root,
      "data",
      "capacidade-viva",
      "calibration",
      "configs",
      "cv-cal-sane-v2.json"
    );
    const config = JSON.parse(fs.readFileSync(sanePath, "utf8"));
    // do NOT mutate config file; use as-is
    const interval = Number(arg("--interval", "15")) || 15;
    const profiles = ["estrutura_forte", "estrutura_media", "estrutura_fraca"];

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
          full: true,
          from: rep.from,
          to: rep.to,
          n_ticks: rep.n_ticks,
          interval_min: rep.interval_min,
          timezone: rep.timezone,
          metrics_corrected: rep.metrics_corrected,
          runtime: rep.runtime,
          orders_in_replay: byOrder.size
        });
        writeJson(path.join(outDir, "04b_episodes_summary.json"), episodeSummary(rep));
        // sample episodes (not full dump — size)
        writeJson(path.join(outDir, "04b_episodes_sample.json"), {
          n: rep.episodes.n_episodes,
          sample: (rep.episodes.episodes || []).slice(0, 80)
        });
        // full episodes for future reaggregate (metrics fix without full replay)
        writeJson(path.join(outDir, "04b_episodes_full.json"), {
          n: rep.episodes.n_episodes,
          gap_min: rep.episodes.gap_min,
          gap_effective_min: rep.episodes.gap_effective_min,
          interval_min: rep.episodes.interval_min,
          episodes: rep.episodes.episodes
        });
        sensitivity = Cal.sensitivity.analyzeSensitivity(rep.ticks);
        baselines = Cal.baselines.compareBaselines(rep.ticks);
        temporal = Cal.calibrator.evaluateTemporalHypotheses(rep.ticks);
        writeJson(path.join(outDir, "05_sensitivity.json"), sensitivity);
        writeJson(path.join(outDir, "05b_baselines.json"), baselines);
        writeJson(path.join(outDir, "06_temporal_hypotheses.json"), temporal);
      }
    }
  }

  writeJson(path.join(outDir, "08_team_profiles.json"), profileResults);

  const media = profileResults.estrutura_media || {};
  const master = {
    labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
    version: "2D.2-metrics",
    full_replay: fullReplay || !!(prevMaster && prevMaster.full_replay),
    regenerated_report_only: true,
    previous_report: prevMaster
      ? {
          path: prevMasterPath,
          generated_at: prevMaster.generated_at,
          version: prevMaster.version
        }
      : null,
    cause_of_previous_zeros: {
      duration:
        "gap_min (10) < interval_min (15) fragmentava episódios em 1 tick → duration_min=0; + ausência de lista de episódios no MASTER",
      unique_orders:
        "order_id do pedido não era propagado para critical_items/attention_items na taxonomia → Set vazio",
      aggregation: "MASTER copiava métricas já zeradas; não recalculava a partir de started/last_seen"
    },
    generated_at: new Date().toISOString(),
    timezone: "America/Sao_Paulo",
    events_processed: eventsProcessed,
    orders_processed: ordersProcessed,
    metrics: media.metrics,
    episodes: media.episodes,
    profiles: profileResults,
    sensitivity: sensitivity || null,
    baselines: baselines || null,
    temporal: temporal || null,
    catalog_summary: catalog_summary || null,
    review: prevMaster && prevMaster.review,
    config_previous: "cv-cal-sane-v2",
    config_new: "cv-cal-sane-v2",
    config_changed: false,
    classifications_changed: false,
    recovery_liquida_historica: "nao_calculavel_sem_acoes_humanas",
    out_dir: outDir,
    human_summary: buildHumanSummary(media)
  };
  writeJson(path.join(outDir, "99_MASTER_REPORT.json"), master);
  writeJson(path.join(outDir, "10_human_summary.json"), master.human_summary);

  // Human review pack: preserve classifications; only reformat MD
  const reviewJsonPath = path.join(
    root,
    "data",
    "capacidade-viva",
    "calibration",
    "review",
    "casos-validacao.json"
  );
  if (fs.existsSync(reviewJsonPath)) {
    const review = JSON.parse(fs.readFileSync(reviewJsonPath, "utf8"));
    // do not change case classifications — only ensure MD has César fields
    const md = Cal.reviewSet.toMarkdown(review);
    const reviewDir = path.dirname(reviewJsonPath);
    fs.writeFileSync(path.join(reviewDir, "CASOS_VALIDACAO.md"), md, "utf8");
    writeJson(path.join(outDir, "09_review_cases_unchanged.json"), {
      n_cases: review.n_cases,
      counts: review.counts,
      pending: (review.itens_pendentes || []).length,
      classifications_changed: false,
      note: "JSON de casos preservado; MD regenerado para formulário humano"
    });
    console.log("review MD refreshed; cases classifications UNCHANGED");
  }

  console.log("DONE", path.join(outDir, "99_MASTER_REPORT.json"));
  console.log(
    "metrics",
    JSON.stringify(
      {
        avg: media.episodes && media.episodes.duration_avg_min,
        median: media.episodes && media.episodes.duration_median_min,
        p90: media.episodes && media.episodes.duration_p90_min,
        max: media.episodes && media.episodes.duration_max_min,
        unique: media.episodes && media.episodes.unique_orders,
        open: media.episodes && media.episodes.open_at_end,
        resolved: media.episodes && media.episodes.resolved
      },
      null,
      2
    )
  );
}

function buildHumanSummary(media) {
  const ep = (media && media.episodes) || {};
  const m = (media && media.metrics) || {};
  return {
    labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
    operational: false,
    title: "Resumo humano — métricas de episódios (2D.2)",
    duration_avg_min: ep.duration_avg_min != null ? ep.duration_avg_min : "não calculável com o artefato atual",
    duration_median_min:
      ep.duration_median_min != null ? ep.duration_median_min : "não calculável com o artefato atual",
    duration_p90_min: ep.duration_p90_min != null ? ep.duration_p90_min : "não calculável com o artefato atual",
    duration_max_min: ep.duration_max_min != null ? ep.duration_max_min : "não calculável com o artefato atual",
    unique_orders_affected:
      ep.unique_orders != null ? ep.unique_orders : "não calculável com o artefato atual",
    episodes_open: ep.open_at_end != null ? ep.open_at_end : "não calculável com o artefato atual",
    episodes_resolved: ep.resolved != null ? ep.resolved : "não calculável com o artefato atual",
    episodes_by_praca: ep.by_praca || "não calculável com o artefato atual",
    episodes_by_type: ep.by_type || "não calculável com o artefato atual",
    n_episodes: ep.n != null ? ep.n : m.n_episodios,
    note: "Valores null no motor viram texto 'não calculável'; zero só quando a duração observada é literalmente 0 min."
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
