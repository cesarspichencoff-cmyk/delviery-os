#!/usr/bin/env node
/* Finaliza 2D.3 a partir de 04b_episodes_* já gerados + 1 replay media para pack humano. */
"use strict";

const fs = require("fs");
const path = require("path");
const Cal = require("../src/capacidade-viva/calibration");

const root = path.join(__dirname, "..");
const outDir = path.resolve(
  process.argv[2] ||
    path.join(root, "results", "capacidade-viva", "sane-episodes-2d3-1784446646346")
);

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

async function main() {
  console.log("finalizar 2d3", outDir);
  const summary = JSON.parse(fs.readFileSync(path.join(outDir, "04b_episodes_summary.json"), "utf8"));
  const full = JSON.parse(fs.readFileSync(path.join(outDir, "04b_episodes_full.json"), "utf8"));
  const replaySum = JSON.parse(fs.readFileSync(path.join(outDir, "04_replay_summary.json"), "utf8"));
  const prevMaster = fs.existsSync(path.join(outDir, "99_MASTER_REPORT.previous.json"))
    ? JSON.parse(fs.readFileSync(path.join(outDir, "99_MASTER_REPORT.previous.json"), "utf8"))
    : null;

  // coverage
  const expected = ["sushi", "quentes", "cozinha", "conferencia", "caixa", "motoboy"];
  const by = summary.by_praca || {};
  const notes = {};
  for (const p of expected) {
    const n = by[p] || 0;
    notes[p] =
      n > 0
        ? { episodes: n, status: "com_episodios" }
        : {
            episodes: 0,
            status: "ausencia_de_leitura_ou_sinal_agregado_em_outra_praca",
            detail:
              "Sinais logísticos/atraso usam praça crítica do ISF (conferencia/sushi). Sem fabricar distribuição."
          };
  }
  const pracaCoverage = {
    summary:
      "Concentração em conferencia e sushi = praça_critica do ISF + sinais logísticos; não prova calma em outras praças (ausência de leitura).",
    by_praca_episodes: by,
    expected_pracas: notes,
    fabricated: false
  };
  writeJson(path.join(outDir, "07_praca_coverage.json"), pracaCoverage);

  // load data once for media review pack
  const inv = Cal.loader.inventoryKnownSources({});
  const cardPath =
    (inv.sources.find((s) => s.id === "cardapio_seed" && s.exists) || {}).path ||
    path.join(root, "data", "cardapio_knowledge_seed.json");
  const card = Cal.loader.loadJson(cardPath);
  const catalog = Cal.catalog.buildCatalog(card.ok ? card.data : { itens: [] });
  const ifoodSrc = inv.sources.find((s) => s.id === "ifood_real_jsonl" && s.exists);
  const itensSrc = inv.sources.find((s) => s.id === "itens_jun20_30" && s.exists);
  console.log("reload for review (media only)...");
  const transitions = (await Cal.loader.loadJsonl(ifoodSrc.path)).rows || [];
  let items = [];
  if (itensSrc) items = (await Cal.loader.loadJsonl(itensSrc.path)).rows || [];
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
  const config = JSON.parse(
    fs.readFileSync(
      path.join(root, "data", "capacidade-viva", "calibration", "configs", "cv-cal-sane-v2.json"),
      "utf8"
    )
  );
  console.log("replay media for review...");
  const rep = Cal.replay.replayOrders(timelines.byOrder, {
    interval_min: 15,
    team_profile: "estrutura_media",
    config
  });

  const profileResults = {
    estrutura_media: {
      metrics: rep.metrics_corrected,
      episodes: summary,
      runtime: rep.runtime,
      n_ticks: rep.n_ticks,
      capacidade_hipotetica: true
    }
  };
  // reuse summary as authority (already from first pass)
  profileResults.estrutura_media.metrics = Object.assign({}, rep.metrics_corrected, {
    n_episodios: summary.n,
    n_episodios_criticos: summary.critical,
    n_episodios_atencao: summary.attention
  });
  writeJson(path.join(outDir, "08_team_profiles.json"), profileResults);

  const reviewDir = path.join(root, "data", "capacidade-viva", "calibration", "review");
  const prevReviewPath = path.join(reviewDir, "casos-validacao.json");
  const prevReview = fs.existsSync(prevReviewPath)
    ? JSON.parse(fs.readFileSync(prevReviewPath, "utf8"))
    : null;
  if (prevReview) {
    writeJson(path.join(outDir, "09_review_previous.json"), prevReview);
    fs.writeFileSync(
      path.join(reviewDir, "casos-validacao.previous-2d2.json"),
      JSON.stringify(prevReview, null, 2)
    );
  }

  // attach full episodes to rep for sampling
  rep.episodes = Object.assign({}, rep.episodes, {
    episodes: full.episodes,
    n_episodes: summary.n
  });

  const review = Cal.reviewSet.buildReviewCases(rep, catalog, { freeze_version: "2D.3" });
  const changed = [];
  if (prevReview && prevReview.cases) {
    const prevById = new Map(prevReview.cases.map((c) => [c.case_id, c]));
    for (const c of review.cases) {
      const p = prevById.get(c.case_id);
      if (!p) {
        changed.push({ case_id: c.case_id, change: "reamostrado" });
        continue;
      }
      if (
        p.classificacao_motor !== c.classificacao_motor ||
        p.bucket_esperado_motor !== c.bucket_esperado_motor
      ) {
        changed.push({
          case_id: c.case_id,
          before: { class: p.classificacao_motor, bucket: p.bucket_esperado_motor },
          after: { class: c.classificacao_motor, bucket: c.bucket_esperado_motor },
          why: "reamostragem 2D.3 com fronteiras/duração; buckets 10/10/10/10 mantidos"
        });
      }
    }
  }
  writeJson(path.join(outDir, "09_review_cases_changed.json"), {
    n_changed: changed.length,
    changed
  });

  fs.mkdirSync(reviewDir, { recursive: true });
  fs.writeFileSync(path.join(reviewDir, "casos-validacao.json"), JSON.stringify(review, null, 2));
  fs.writeFileSync(path.join(reviewDir, "CASOS_VALIDACAO.md"), Cal.reviewSet.toMarkdown(review), "utf8");
  writeJson(path.join(outDir, "09_review_cases.json"), review);

  const after = summary;
  const before = prevMaster && prevMaster.episodes;
  const comparison = {
    before,
    after,
    episode_count_delta: before && before.n != null ? after.n - before.n : null,
    max_before: before && (before.duration_max_min != null ? before.duration_max_min : before.duration_max),
    max_after_measurable: after.duration_max_measurable,
    crossing_day_after: after.crossing_day
  };
  writeJson(path.join(outDir, "10_comparison_before_after.json"), comparison);

  const human = {
    labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
    operational: false,
    title: "Resumo humano 2D.3",
    n_episodes: after.n,
    single_tick: after.single_tick_n,
    measurable: after.measurable_n,
    duration_avg_measurable: after.duration_avg_measurable,
    duration_median_measurable: after.duration_median_measurable,
    duration_p90_measurable: after.duration_p90_measurable,
    duration_max_measurable: after.duration_max_measurable,
    crossing_day: after.crossing_day,
    open: after.open_at_end,
    unique_orders: after.unique_orders,
    by_praca: after.by_praca,
    by_type: after.by_type,
    by_epistemic: after.by_epistemic,
    by_confidence: after.by_confidence,
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
      ? { version: prevMaster.version, generated_at: prevMaster.generated_at }
      : null,
    investigation_7335: fs.existsSync(path.join(outDir, "01_investigation_7335.json"))
      ? JSON.parse(fs.readFileSync(path.join(outDir, "01_investigation_7335.json"), "utf8"))
      : null,
    generated_at: new Date().toISOString(),
    timezone: "America/Sao_Paulo",
    events_processed: transitions.length + items.length,
    orders_processed: timelines.byOrder.size,
    metrics: profileResults.estrutura_media.metrics,
    episodes: after,
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
    config_changed: false,
    isf_changed: false,
    classifications_taxonomy_changed: false,
    out_dir: outDir,
    human_summary: human,
    n_invalid_discarded: 0,
    note_invalid:
      "Episódios que cruzariam dia são partidos na fronteira (não descartados). crossing_day deve ser 0."
  };
  writeJson(path.join(outDir, "99_MASTER_REPORT.json"), master);
  console.log("DONE master");
  console.log(
    JSON.stringify(
      {
        n: after.n,
        single: after.single_tick_n,
        measurable: after.measurable_n,
        avg: after.duration_avg_measurable,
        median: after.duration_median_measurable,
        p90: after.duration_p90_measurable,
        max: after.duration_max_measurable,
        crossing: after.crossing_day,
        open: after.open_at_end,
        unique: after.unique_orders,
        cases_changed: changed.length,
        pending: (review.itens_pendentes || []).length
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
