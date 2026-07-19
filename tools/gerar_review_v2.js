#!/usr/bin/env node
/* ============================================================================
 * Fase 2D.4 — gera pack humano operacional + qualidade da fonte.
 * NÃO recalibra motor. NÃO altera cv-cal-sane-v2.
 * Uma passagem de extração de candidatos (estrutura_media) para contexto mínimo;
 * episódios 2D.3 reutilizados como reforço.
 *
 *   node tools/gerar_review_v2.js
 * ==========================================================================*/
"use strict";

const fs = require("fs");
const path = require("path");
const Cal = require("../src/capacidade-viva/calibration");
const RV = require("../src/capacidade-viva/calibration/review-v2");
const { orderStateAt } = require("../src/capacidade-viva/calibration/replay");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "data", "capacidade-viva", "calibration", "review-v2");
const episodesPath = path.join(
  root,
  "results",
  "capacidade-viva",
  "sane-episodes-2d3-1784446646346",
  "04b_episodes_full.json"
);

function write(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof content === "string" ? content : JSON.stringify(content, null, 2));
}

async function loadByOrder(catalog) {
  const inv = Cal.loader.inventoryKnownSources({});
  const ifoodSrc = inv.sources.find((s) => s.id === "ifood_real_jsonl" && s.exists);
  const itensSrc = inv.sources.find((s) => s.id === "itens_jun20_30" && s.exists);
  if (!ifoodSrc) throw new Error("ifood missing");
  console.log("loading data (read-only) for candidate extraction...");
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
  return { byOrder: timelines.byOrder, nEvents: events.length, nOrders: timelines.byOrder.size };
}

/**
 * Extrai candidatos enriquecidos — 1 perfil, sem sensibilidade/master.
 * Não é calibração full (3 perfis).
 */
function extractCandidates(byOrder, config) {
  console.log("extracting candidate ticks (estrutura_media only)...");
  // Hook: replay then enrich each tick with age/complexity context
  const rep = Cal.replay.replayOrders(byOrder, {
    interval_min: 15,
    team_profile: "estrutura_media",
    config
  });

  // rebuild orderMeta for context (same as replay internals)
  const orderMeta = buildOrderMeta(byOrder);
  const candidates = [];
  let prevActive = null;

  for (const tick of rep.ticks) {
    const ctx = buildTickContext(orderMeta, tick.t_ms, prevActive);
    prevActive = tick.active_orders;
    tick.context = ctx;
    const cand = RV.candidateFromEnrichedTick(tick, { team_profile: "estrutura_media" });
    // keep only potentially useful: volume>0 or exception or attention or source quality samples
    if (
      cand.pedidos_ativos > 0 ||
      cand.tem_excecao_critica ||
      cand.classificacao_motor === "atencao" ||
      cand.classificacao_motor === "excecao_critica" ||
      cand.pedidos_ativos === 0
    ) {
      candidates.push(cand);
    }
  }

  console.log("ticks", rep.ticks.length, "candidates", candidates.length);
  return { candidates, rep };
}

function buildOrderMeta(byOrder) {
  const orderMeta = new Map();
  for (const [oid, events] of byOrder) {
    if (!events || !events.length) continue;
    const meta = {
      id: oid,
      events: events.slice().sort((a, b) => String(a.timestamp || "").localeCompare(String(b.timestamp || ""))),
      items: [],
      courier_wait_store_min: null,
      courier_wait_epistemic: null,
      alocado_epistemic: null
    };
    for (const e of events) {
      if (e.event_type === "item_atribuido_praca" && e.item_name) {
        meta.items.push({
          nome: e.item_name,
          quantidade: e.quantity || 1,
          praca: e.praca,
          complexidade: e.complexity || "moderado"
        });
      }
      if (e.timing && e.timing.entregador_espera_loja_min && e.timing.entregador_espera_loja_min.value != null) {
        meta.courier_wait_store_min = e.timing.entregador_espera_loja_min.value;
        meta.courier_wait_epistemic = e.timing.entregador_espera_loja_min.epistemic;
      }
    }
    orderMeta.set(oid, meta);
  }
  return orderMeta;
}

function buildTickContext(orderMeta, tMs, prevActive) {
  let itens_totais = 0;
  let itens_simples = 0;
  let itens_moderados = 0;
  let itens_complexos = 0;
  let itens_muito_complexos = 0;
  let oldest = null;
  let near = 0;
  let late = 0;
  let ready = 0;
  let maxReadyWait = null;
  let withoutItems = 0;
  let activeN = 0;

  for (const meta of orderMeta.values()) {
    const st = orderStateAt(meta, tMs);
    if (!st.active) continue;
    activeN++;
    if (!meta.items.length) withoutItems++;
    const age = st.age_min || 0;
    if (oldest == null || age > oldest) oldest = age;
    if (age >= 35 && age < 50) near++;
    if (age >= 50) late++;
    if (st.pronto && !st.saiu) {
      ready++;
      const rw = st.ready_wait_min || 0;
      if (maxReadyWait == null || rw > maxReadyWait) maxReadyWait = rw;
    }
    for (const it of meta.items) {
      const q = it.quantidade || 1;
      itens_totais += q;
      const cx = it.complexidade || "moderado";
      if (cx === "simples") itens_simples += q;
      else if (cx === "moderado") itens_moderados += q;
      else if (cx === "complexo") itens_complexos += q;
      else if (cx === "muito_complexo") itens_muito_complexos += q;
      else itens_moderados += q;
    }
  }

  return {
    itens_totais,
    itens_simples,
    itens_moderados,
    itens_complexos,
    itens_muito_complexos,
    pedido_mais_antigo_min: oldest != null ? Math.round(oldest * 10) / 10 : null,
    pedidos_proximos_atraso: near,
    pedidos_atrasados: late,
    ready,
    maior_tempo_pronto_aguardando_min: maxReadyWait != null ? Math.round(maxReadyWait * 10) / 10 : null,
    ritmo_ultimos_15_min: prevActive != null ? activeN - prevActive : null,
    orders_without_items: withoutItems
  };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  // preserve 2D.3 pointer
  write(path.join(outDir, "00_PRESERVE_2D3.md"), [
    "# Pack 2D.3 preservado",
    "",
    "Não enviar `data/capacidade-viva/calibration/review/CASOS_VALIDACAO.md` (2D.3) ao César.",
    "Use este diretório `review-v2/` (2D.4).",
    "",
    "2D.3 permanece em:",
    "- data/capacidade-viva/calibration/review/casos-validacao.json",
    "- data/capacidade-viva/calibration/review/CASOS_VALIDACAO.md",
    ""
  ].join("\n"));

  const cardPath = path.join(root, "data", "cardapio_knowledge_seed.json");
  const card = Cal.loader.loadJson(cardPath);
  const catalog = Cal.catalog.buildCatalog(card.ok ? card.data : { itens: [] });
  const sanePath = path.join(
    root,
    "data",
    "capacidade-viva",
    "calibration",
    "configs",
    "cv-cal-sane-v2.json"
  );
  const config = JSON.parse(fs.readFileSync(sanePath, "utf8"));

  const { byOrder } = await loadByOrder(catalog);
  const { candidates } = extractCandidates(byOrder, config);

  // reinforce with episodes (unique fps)
  if (fs.existsSync(episodesPath)) {
    const full = JSON.parse(fs.readFileSync(episodesPath, "utf8"));
    let nEp = 0;
    for (const ep of full.episodes || []) {
      const c = RV.candidateFromEpisode(ep, { team_profile: "estrutura_media" });
      // only add if fingerprint not already from tick stream with richer data
      candidates.push(c);
      nEp++;
    }
    console.log("episode candidates added", nEp);
  }

  // prefer richer (from ticks): sort so tick candidates (no from_episode_only) come first in buildPacks...
  // buildPacks iterates sorted by time; for same time prefer non-episode
  candidates.sort((a, b) => {
    const ta = a.t_ms || 0;
    const tb = b.t_ms || 0;
    if (ta !== tb) return ta - tb;
    if (a.from_episode_only && !b.from_episode_only) return 1;
    if (!a.from_episode_only && b.from_episode_only) return -1;
    return 0;
  });

  // Dedupe fingerprints keeping richer
  const byFp = new Map();
  for (const c of candidates) {
    const prev = byFp.get(c.fingerprint);
    if (!prev) {
      byFp.set(c.fingerprint, c);
      continue;
    }
    // keep one with more context
    const score = (x) =>
      (x.itens_totais != null ? 2 : 0) +
      (x.pedido_mais_antigo_min != null ? 2 : 0) +
      (x.from_episode_only ? 0 : 3) +
      (x.pedidos_ativos || 0) / 100;
    if (score(c) > score(prev)) byFp.set(c.fingerprint, c);
  }
  const uniqueCand = [...byFp.values()];
  console.log("unique candidate fps", uniqueCand.length);

  const pack = RV.buildPacks(uniqueCand, { per_bucket: 10 });
  const validation = RV.validateOperationalPack(pack.pack_a);
  console.log("validation", validation);

  // pending items
  const prevReview = path.join(
    root,
    "data",
    "capacidade-viva",
    "calibration",
    "review",
    "casos-validacao.json"
  );
  let pending = [];
  if (fs.existsSync(prevReview)) {
    const pr = JSON.parse(fs.readFileSync(prevReview, "utf8"));
    pending = pr.itens_pendentes || [];
  }
  if (!pending.length && catalog.items) {
    pending = catalog.items
      .filter((i) => i.pendente_validacao)
      .map((i) => ({
        nome: i.item,
        praca_sugerida: i.praca,
        complexidade_sugerida: i.complexidade_inicial,
        evidencia: i.motivo,
        confianca: i.confianca_classificacao
      }));
  }
  const itemsPack = RV.classifyAllPending(pending);

  write(path.join(outDir, "casos-operacionais.json"), {
    labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
    version: "2D.4",
    pack: "operacional",
    generated_at: pack.generated_at,
    n_cases: pack.pack_a.n,
    counts: pack.pack_a.counts,
    fingerprints_unique: pack.pack_a.fingerprints_unique,
    duplicates: pack.pack_a.duplicates,
    validation,
    cases: pack.pack_a.cases,
    stats: pack.stats
  });
  write(path.join(outDir, "casos-qualidade-fonte.json"), {
    labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
    version: "2D.4",
    pack: "qualidade_fonte",
    note: "Não entra no cálculo de concordância operacional",
    n_cases: pack.pack_b.n,
    cases: pack.pack_b.cases
  });
  write(path.join(outDir, "itens-pendentes.json"), itemsPack);

  write(path.join(outDir, "CASOS_OPERACIONAIS.md"), RV.operationalToMarkdown(pack));
  write(path.join(outDir, "CASOS_QUALIDADE_FONTE.md"), RV.qualityToMarkdown(pack));
  write(path.join(outDir, "ITENS_PENDENTES.md"), RV.itemsToMarkdown(itemsPack));

  write(path.join(outDir, "99_SUMMARY.json"), {
    version: "2D.4",
    operational_n: pack.pack_a.n,
    unique: pack.pack_a.fingerprints_unique,
    duplicates: pack.pack_a.duplicates,
    counts: pack.pack_a.counts,
    quality_n: pack.pack_b.n,
    empty_removed: pack.stats.rejected_empty_as_controlavel,
    validation,
    items_counts: itemsPack.counts,
    full_replay_3_profiles: false,
    candidate_extraction_pass: true,
    config_changed: false,
    motor_changed: false
  });

  console.log("DONE", outDir);
  console.log(JSON.stringify({
    operational: pack.pack_a.n,
    counts: pack.pack_a.counts,
    unique: pack.pack_a.fingerprints_unique,
    dup: pack.pack_a.duplicates,
    quality: pack.pack_b.n,
    empty_removed: pack.stats.rejected_empty_as_controlavel,
    items: itemsPack.counts,
    validation_ok: validation.ok,
    errors: validation.errors
  }, null, 2));

  if (!validation.ok || pack.pack_a.n < 40) {
    console.error("PACK INCOMPLETE OR INVALID");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
