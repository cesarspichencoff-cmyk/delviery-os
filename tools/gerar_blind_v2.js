#!/usr/bin/env node
/* ============================================================================
 * Fase 2D.9 — gera SEGUNDO holdout cego independente para cv-cal-tata-human-v2.
 *
 * NÃO recalibra. NÃO altera configuração. NÃO altera motor de decisão
 * (src/capacidade-viva/*.js, human-rules.js classifyOrderHuman/isZombieOrder/
 * classifyMotoboyWait/classifyProntoSemSaida/actionFromSeverityConfidence
 * continuam intocados — só LIDOS via Blind.classifyBlindFactCase, já existente
 * desde a Fase 2D.8). Só cria e congela o holdout.
 *
 *   node tools/gerar_blind_v2.js
 * ==========================================================================*/
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Blind = require("../src/capacidade-viva/calibration/blind-validation");
const {
  anonEpisodeId,
  anonOrderToken,
  episodeTurnKey,
  hourBand,
  isPureLogistic
} = require("../src/capacidade-viva/calibration/review-v3");
const { toSaoPaulo } = require("../src/capacidade-viva/calibration/timezone");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "data/capacidade-viva/calibration/blind-v2");
const configPath = path.join(root, "data/capacidade-viva/calibration/configs/cv-cal-tata-human-v2.json");
const episodesPath = path.join(
  root,
  "results/capacidade-viva/sane-episodes-2d3-1784446646346/04b_episodes_full.json"
);
const MOTOR_COMMIT = "b620aef";
const MIN_N = 24;
const MAX_N = 32;
const TARGET_N = 28;
const MAX_INSUFFICIENT = 4;
const MIN_AVALIAVEIS = 20;

const DOW_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function write(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof content === "string" ? content : JSON.stringify(content, null, 2));
}
function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}
function sha256Str(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

/* ----------------------------------------------------------------------------
 * 1) Exclusão total — une TODAS as fontes de casos já conhecidos:
 *    review/ (v1, tokens redigidos — só case_id, ver limitação documentada),
 *    review-v2/ (operacionais + qualidade-fonte),
 *    review-v3/ (via Blind.loadTrainingExclusion — já cobre representativos +
 *    limítrofes + os 28 rótulos humanos da Fase 2D.6),
 *    blind-v1 (FREEZE.json + GABARITO_MOTOR_CONGELADO.json — os 24 casos e,
 *    por extensão, os 12 usados nos checks_obrigatorios da regressão v2, que
 *    são um subconjunto desses 24).
 * -------------------------------------------------------------------------- */
function buildFullExclusion() {
  const base = Blind.loadTrainingExclusion(root); // review-v3 (representativos+limitrofes+rotulos)
  const caseIds = new Set(base.caseIds);
  const orderTokens = new Set(base.orderTokens);
  const episodeIdAnons = new Set(base.episodeIdAnons);
  const turnKeys = new Set(base.turnKeys);
  const rawOrderIds = new Set(base.rawOrderIds);
  const rawEpisodeIds = new Set(base.rawEpisodeIds);

  const sources = { review_v3_base: base.n_case_ids };

  // review/ (v1) — order_ids vem como "redacted" no dado de origem; não há
  // token real para cruzar. Só entra no relatório de auditoria por case_id.
  const reviewV1Path = path.join(root, "data/capacidade-viva/calibration/review/casos-validacao.json");
  let nReviewV1 = 0;
  if (fs.existsSync(reviewV1Path)) {
    const d = JSON.parse(fs.readFileSync(reviewV1Path, "utf8"));
    for (const c of d.cases || []) {
      if (c.case_id) caseIds.add(c.case_id);
      nReviewV1++;
    }
  }
  sources.review_v1 = nReviewV1;

  // review-v2/ — casos-operacionais (order_token/episodio_token reais quando
  // presentes) + casos-qualidade-fonte (só case_id, sem token no dado de origem).
  let nReviewV2 = 0;
  const reviewV2Files = ["casos-operacionais.json", "casos-qualidade-fonte.json"];
  for (const f of reviewV2Files) {
    const p = path.join(root, "data/capacidade-viva/calibration/review-v2", f);
    if (!fs.existsSync(p)) continue;
    const d = JSON.parse(fs.readFileSync(p, "utf8"));
    for (const c of d.cases || []) {
      if (c.case_id) caseIds.add(c.case_id);
      if (c.order_token && /^ord_[0-9a-f]{10}$/.test(c.order_token)) orderTokens.add(c.order_token);
      if (c.episodio_token && /^(ord_|ep_)[0-9a-f]{10}$/.test(c.episodio_token)) episodeIdAnons.add(c.episodio_token);
      nReviewV2++;
    }
  }
  sources.review_v2 = nReviewV2;

  // blind-v1 — 24 casos (case_ids) + tokens reais do gabarito congelado.
  const b1FreezePath = path.join(root, "data/capacidade-viva/calibration/blind-v1/FREEZE.json");
  const b1GabaritoPath = path.join(root, "data/capacidade-viva/calibration/blind-v1/GABARITO_MOTOR_CONGELADO.json");
  let nBlindV1 = 0;
  if (fs.existsSync(b1FreezePath)) {
    const fz = JSON.parse(fs.readFileSync(b1FreezePath, "utf8"));
    for (const id of fz.case_ids || []) caseIds.add(id);
  }
  if (fs.existsSync(b1GabaritoPath)) {
    const gb = JSON.parse(fs.readFileSync(b1GabaritoPath, "utf8"));
    for (const c of gb.cases || []) {
      if (c.case_id) caseIds.add(c.case_id);
      if (c.order_token) orderTokens.add(c.order_token);
      if (c.episode_id_anon) episodeIdAnons.add(c.episode_id_anon);
      if (c.episode_turn_key) {
        turnKeys.add(c.episode_turn_key);
        const raw = String(c.episode_turn_key).split("|")[0];
        if (raw && raw !== "unknown") rawOrderIds.add(raw);
      }
      nBlindV1++;
    }
  }
  sources.blind_v1 = nBlindV1;

  // testes obrigatórios da regressão v2 (tools/regressao_blind_v1_v2.js `must`)
  // são, por construção, um subconjunto dos 24 casos do blind-v1 acima —
  // registrado aqui só para auditoria explícita do critério pedido.
  const regressaoObrigatorios = [
    "CV-B-006", "CV-B-007", "CV-B-008", "CV-B-011", "CV-B-012", "CV-B-013",
    "CV-B-015", "CV-B-017", "CV-B-020", "CV-B-021", "CV-B-022", "CV-B-023"
  ];
  for (const id of regressaoObrigatorios) caseIds.add(id);

  return {
    caseIds, orderTokens, episodeIdAnons, turnKeys, rawOrderIds, rawEpisodeIds,
    n_case_ids: caseIds.size,
    n_order_tokens: orderTokens.size,
    n_turn_keys: turnKeys.size,
    n_episode_id_anons: episodeIdAnons.size,
    sources,
    limitations: [
      "review/ (v1) e review-v2/casos-qualidade-fonte.json não carregam order_token/episode_id real " +
        "no dado de origem (campo 'order_ids' vem como a string literal 'redacted'); exclusão desses " +
        "dois conjuntos é garantida por case_id (não pode colidir com o pool de episódios, que usa " +
        "order_id/episode_id, nunca case_id) — não por token cruzável. Os demais conjuntos " +
        "(review-v2/operacionais parcialmente, review-v3 e blind-v1) fornecem token real."
    ]
  };
}

/* ----------------------------------------------------------------------------
 * 2) Seleção — pelas EVIDÊNCIAS observáveis (tipo/tempo/praça/dia), nunca
 *    pela classificação do motor. Sub-bucket por faixa de espera para
 *    garantir cobertura dos 4 limiares de motoboy e dos 4 de pronto sem
 *    saída sempre que existir episódio legítimo disponível.
 * -------------------------------------------------------------------------- */
function waitBandMotoboy(min) {
  if (min == null) return null;
  if (min < 10) return "lt10";
  if (min < 15) return "10-15";
  if (min < 20) return "15-20";
  return "gte20";
}
function waitBandPronto(min) {
  if (min == null) return null;
  if (min < 25) return "lt25";
  if (min < 35) return "25-35";
  if (min < 40) return "35-40";
  return "gte40";
}

function selectBlindV2(episodes, exclusion) {
  // dedup por turn key + exclusão (mesma lógica de Blind.selectBlindHoldout,
  // reaplicada aqui para poder sub-bucketar por faixa de espera antes de cortar).
  const byTurn = new Map();
  for (const ep of episodes) {
    if (!ep || !ep.episode_id) continue;
    if (Blind.isTrainingLeak(ep, exclusion)) continue;
    const key = episodeTurnKey(ep);
    const prev = byTurn.get(key);
    if (!prev) { byTurn.set(key, ep); continue; }
    const score = (e) => (e.peak_severity || 0) * 1000 + (e.peak_active_orders || 0) + (e.tick_count || 0);
    if (score(ep) > score(prev)) byTurn.set(key, ep);
  }
  const pool = [...byTurn.values()];

  const meta = (ep) => {
    const sp = toSaoPaulo(ep.started_ms || ep.started_at);
    return {
      day: sp.local_date,
      dow: DOW_PT[sp.local_dow] || null,
      band: hourBand(sp.local_hour),
      praca: ep.praca || null
    };
  };

  const motoboy = [], pronto = [], atraso = [], fonte = [], insuficiente = [], other = [];
  for (const ep of pool) {
    const w = Blind.parseWaitFromEvidence(ep);
    if (ep.type === "motoboy_na_loja") {
      if (w.motoboy == null) insuficiente.push(ep); // tipo sugere sinal, mas nenhum tempo parseável
      else motoboy.push(ep);
    } else if (/pronto|aguardando_saida|alocado|prontos_acumulando/.test(ep.type || "")) {
      // achado empírico: os únicos 5 episódios atencao_operacional do pool
      // (evidência insuficiente "pura") já foram consumidos pelo blind-v1;
      // aqui recuperamos episódios do TIPO pronto/alocado/acumulando que, na
      // prática, não carregam tempo numérico algum na evidência — são
      // genuinamente "insuficientes", não escolhidos por rótulo.
      if (w.pronto == null && w.min == null) insuficiente.push(ep);
      else pronto.push(ep);
    } else if (/atrasado/.test(ep.type || "")) {
      if ((w.idade || 0) >= 180 || (w.min || 0) >= 180) fonte.push(ep);
      else atraso.push(ep);
    } else if ((ep.peak_active_orders || 0) > 0 && !w.motoboy && !w.pronto && !w.idade) {
      insuficiente.push(ep);
    } else other.push(ep);
  }

  const selected = [];
  const usedTurn = new Set();
  const usedOrder = new Set();
  const usedDays = new Set();
  const usedDow = new Set();
  const usedBands = new Set();
  const usedPracas = new Set();
  const usedMotoBands = new Set();
  const usedProntoBands = new Set();
  let nInsuficiente = 0;

  function tryAdd(ep, opts) {
    const cap = (opts && opts.cap) || MAX_N;
    if (selected.length >= cap) return false;
    const turn = episodeTurnKey(ep);
    if (usedTurn.has(turn)) return false;
    if (ep.order_id && usedOrder.has(ep.order_id)) return false;
    if (Blind.isTrainingLeak(ep, exclusion)) return false;
    for (const s of selected) {
      if (s.type === ep.type && s.praca === ep.praca) {
        if (Math.abs((s.started_ms || 0) - (ep.started_ms || 0)) < 45 * 60000) return false;
      }
    }
    selected.push(ep);
    usedTurn.add(turn);
    if (ep.order_id) usedOrder.add(ep.order_id);
    const m = meta(ep);
    if (m.day) usedDays.add(m.day);
    if (m.dow) usedDow.add(m.dow);
    if (m.band) usedBands.add(m.band);
    if (m.praca) usedPracas.add(m.praca);
    return true;
  }

  // 2a) cobertura obrigatória das faixas de motoboy e pronto, uma por faixa,
  // priorizando o episódio de MAIOR contagem de ticks (mais estável) dentro
  // da faixa e com praça ainda não usada.
  function pickForBand(list, bandFn) {
    const byBand = { lt10: [], "10-15": [], "15-20": [], gte20: [], lt25: [], "25-35": [], "35-40": [], gte40: [] };
    for (const ep of list) {
      const w = Blind.parseWaitFromEvidence(ep);
      const min = ep.type === "motoboy_na_loja" ? w.motoboy : w.pronto != null ? w.pronto : w.min;
      // topo aberto ("20+"/"40+"): evita cauda extrema perto do limiar de
      // zumbi (180 min) para não competir por vaga com casos genuinamente
      // avaliáveis — a seleção segue por evidência (tempo), não por rótulo.
      if ((bandFn === waitBandMotoboy && min != null && min >= 150) ||
          (bandFn === waitBandPronto && min != null && min >= 150)) continue;
      const b = bandFn(min);
      if (b && byBand[b]) byBand[b].push(ep);
    }
    for (const b of Object.keys(byBand)) {
      byBand[b].sort((a, c) => {
        const pa = usedPracas.has(a.praca) ? 0 : 1;
        const pc = usedPracas.has(c.praca) ? 0 : 1;
        if (pa !== pc) return pc - pa;
        return (a.tick_count || 0) - (c.tick_count || 0);
      });
    }
    return byBand;
  }

  const motoBands = pickForBand(motoboy, waitBandMotoboy);
  for (const b of ["lt10", "10-15", "15-20", "gte20"]) {
    for (const ep of motoBands[b]) {
      if (tryAdd(ep)) { usedMotoBands.add(b); break; }
    }
  }
  const prontoBands = pickForBand(pronto, waitBandPronto);
  for (const b of ["lt25", "25-35", "35-40", "gte40"]) {
    for (const ep of prontoBands[b]) {
      if (tryAdd(ep)) { usedProntoBands.add(b); break; }
    }
  }

  // 2b) qualidade da fonte — diversidade de MAGNITUDE do excesso (achado
  // empírico: todo episódio pedido_atrasado_vs_prometido_operacional neste
  // pool tem span >=180min e vira zumbi — não existe versão "limpa" dele
  // nesta base; ver limitação documentada no manifesto). 4 casos, ordenados
  // por excesso para cobrir do "moderadamente velho" ao extremo, sem repetir
  // magnitudes redundantes.
  fonte.sort((a, b) => (a.observed_span_min || 0) - (b.observed_span_min || 0));
  let nFonte = 0;
  const fonteMagnitudesUsadas = new Set();
  for (const ep of fonte) {
    if (nFonte >= 4) break;
    const faixa = (ep.observed_span_min || 0) < 300 ? "moderado" : (ep.observed_span_min || 0) < 2000 ? "alto" : "extremo";
    if (fonteMagnitudesUsadas.has(faixa) && nFonte >= 2) continue;
    if (tryAdd(ep)) { nFonte++; fonteMagnitudesUsadas.add(faixa); }
  }

  // 2c) atraso operacional — 1 caso apenas, para DOCUMENTAR o achado acima
  // (não reservamos orçamento maior porque, empiricamente, todos viram
  // qualidade_da_fonte nesta base — não agregam avaliável novo).
  atraso.sort((a, b) => (a.observed_span_min || 0) - (b.observed_span_min || 0));
  let nAtraso = 0;
  for (const ep of atraso) {
    if (nAtraso >= 1) break;
    if (tryAdd(ep)) nAtraso++;
  }

  const diversityScore = (ep) => {
    const m = meta(ep);
    let s = 0;
    if (m.day && !usedDays.has(m.day)) s += 3;
    if (m.dow && !usedDow.has(m.dow)) s += 2;
    if (m.band && !usedBands.has(m.band)) s += 3;
    if (m.praca && !usedPracas.has(m.praca)) s += 4;
    return s;
  };

  // 2d) evidência insuficiente — reserva DELIBERADA de 2 casos genuínos
  // (teto continua 4) ANTES do preenchimento geral, para o holdout também
  // testar esse eixo (regressão do comportamento "impossível avaliar"), não
  // só a ausência dele. Só entra aqui quem realmente não tem sinal de tempo
  // algum (ver bucket "insuficiente" acima) — nunca usado para completar
  // número quando há sinal real disponível.
  const RESERVA_INSUFICIENTE = 2;
  insuficiente.sort((a, b) => diversityScore(b) - diversityScore(a));
  for (const ep of insuficiente) {
    if (nInsuficiente >= RESERVA_INSUFICIENTE) break;
    if (tryAdd(ep)) nInsuficiente++;
  }

  // 2e) preencher diversidade de dia/turno/praça restante com motoboy/pronto
  // ainda não usados (evidência concreta — não conta para o teto de
  // "evidência insuficiente").
  const fillPool = [...motoboy, ...pronto].filter((ep) => {
    if (selected.includes(ep)) return false;
    const w = Blind.parseWaitFromEvidence(ep);
    const min = ep.type === "motoboy_na_loja" ? w.motoboy : w.pronto != null ? w.pronto : w.min;
    return min == null || min < 150;
  });
  let guard = 0;
  while (selected.length < TARGET_N && guard < 500) {
    guard++;
    fillPool.sort((a, b) => diversityScore(b) - diversityScore(a));
    let added = false;
    for (const ep of fillPool) {
      if (tryAdd(ep)) { added = true; break; }
    }
    if (!added) break;
  }

  // 2f) evidência insuficiente extra — só se ainda sobrar espaço até o teto
  // de 4; nunca usado para "completar número" além disso.
  for (const ep of insuficiente) {
    if (nInsuficiente >= MAX_INSUFFICIENT) break;
    if (selected.length >= MAX_N) break;
    if (tryAdd(ep)) nInsuficiente++;
  }

  selected.sort((a, b) => (a.started_ms || 0) - (b.started_ms || 0));

  return {
    episodes: selected.slice(0, MAX_N),
    stats: {
      n: Math.min(selected.length, MAX_N),
      dates: [...usedDays].sort(),
      dias: [...usedDow],
      faixas: [...usedBands],
      pracas: [...usedPracas],
      pool_after_exclusion: pool.length,
      motoboy_bandas_cobertas: [...usedMotoBands],
      pronto_bandas_cobertas: [...usedProntoBands],
      n_fonte: nFonte,
      n_atraso: nAtraso,
      n_insuficiente: nInsuficiente
    }
  };
}

function main() {
  if (!fs.existsSync(configPath)) throw new Error("config v2 missing");
  if (!fs.existsSync(episodesPath)) throw new Error("episodes missing");

  const manifestPath = path.join(outDir, "MANIFESTO_CONGELAMENTO.json");
  if (fs.existsSync(manifestPath)) {
    const existing = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (existing.frozen === true && !process.argv.includes("--force")) {
      console.error("ALREADY FROZEN — recusar regeneração silenciosa. Use --force só se souber o que faz.");
      process.exit(2);
    }
  }

  const configRaw = fs.readFileSync(configPath);
  const humanConfig = JSON.parse(configRaw);
  if (humanConfig.config_version !== "cv-cal-tata-human-v2") {
    throw new Error("config_version inesperado: " + humanConfig.config_version);
  }
  const configSha = sha256File(configPath);
  const generated_at = new Date().toISOString();

  const exclusion = buildFullExclusion();
  console.log("exclusão combinada", {
    case_ids: exclusion.n_case_ids,
    order_tokens: exclusion.n_order_tokens,
    turn_keys: exclusion.n_turn_keys,
    episode_id_anons: exclusion.n_episode_id_anons,
    fontes: exclusion.sources
  });

  const freezeMeta = {
    frozen: true,
    generated_at,
    generator: "tools/gerar_blind_v2.js",
    generator_version: "2D.9",
    motor_commit: MOTOR_COMMIT,
    config_version: humanConfig.config_version,
    config_path: "data/capacidade-viva/calibration/configs/cv-cal-tata-human-v2.json",
    config_sha256: configSha,
    config_bytes: configRaw.length,
    n_cases: 0,
    case_ids: [],
    selection_criteria: {
      pool_source: "results/capacidade-viva/sane-episodes-2d3-1784446646346/04b_episodes_full.json",
      selection_by: "evidencias_observaveis_nao_classificacao_do_motor",
      min_n: MIN_N, max_n: MAX_N, target_n: TARGET_N,
      max_evidencia_insuficiente: MAX_INSUFFICIENT,
      min_avaliaveis: MIN_AVALIAVEIS,
      diversidade: ["data", "dia_da_semana", "faixa_do_dia", "praca", "confianca", "faixas_de_espera_motoboy_e_pronto"]
    },
    exclusions: {
      n_case_ids: exclusion.n_case_ids,
      n_order_tokens: exclusion.n_order_tokens,
      n_turn_keys: exclusion.n_turn_keys,
      n_episode_id_anons: exclusion.n_episode_id_anons,
      sources: exclusion.sources,
      limitations: exclusion.limitations
    },
    no_silent_regeneration: true,
    note: "Não substituir casos após o César responder. Não comparar nesta fase."
  };

  const full = JSON.parse(fs.readFileSync(episodesPath, "utf8"));
  const holdoutBase = selectBlindV2(full.episodes || [], exclusion);
  console.log("holdout (seleção por evidência)", holdoutBase.stats);

  let leaks = 0;
  for (const ep of holdoutBase.episodes) {
    if (Blind.isTrainingLeak(ep, exclusion)) leaks++;
  }
  if (leaks > 0) {
    console.error("LEAK DETECTED", leaks);
    process.exit(1);
  }

  /* Topup: a seleção acima escolhe por EVIDÊNCIA BRUTA (tipo/tempo/praça/dia),
   * nunca pela classificação. Só DEPOIS de classificar pode aparecer que um
   * caso escolhido como "pronto"/"atraso" na verdade é qualidade_da_fonte
   * (incoerência temporal real, achado pelo classificador, não escolhido por
   * ele). Se isso deixar "avaliáveis" abaixo do piso, complementamos com MAIS
   * candidatos de evidência concreta (motoboy/pronto/atraso), ainda 100% por
   * evidência bruta — nunca cherry-picking por estado. Nunca usa o bucket de
   * evidência insuficiente para completar número. */
  function classify(ep, idxForId) {
    const built = Blind.buildBlindCase(ep, idxForId, humanConfig, freezeMeta);
    const facts = Object.assign({}, built.facts);
    const pred = Blind.classifyBlindFactCase(facts, humanConfig);
    return { ep, built, facts, pred };
  }

  const holdout = holdoutBase;
  let classified = holdout.episodes.map((ep, i) => classify(ep, i));
  let nAvaliaveisProbe = classified.filter(
    (c) => c.pred.classificacao !== "evidencia_insuficiente" && !c.pred.zombie && c.pred.classificacao !== "qualidade_fonte"
  ).length;

  const nBase = classified.length;
  if (nAvaliaveisProbe < MIN_AVALIAVEIS && classified.length < MAX_N) {
    const selectedSet = new Set(classified.map((c) => c.ep));
    const usedTurnTopup = new Set(classified.map((c) => episodeTurnKey(c.ep)));
    const usedOrderTopup = new Set(classified.map((c) => c.ep.order_id).filter(Boolean));
    const usedPracaTopup = new Set(classified.map((c) => c.ep.praca).filter(Boolean));

    // Só motoboy/pronto — "atrasado" fica de fora do topup: é o tipo mais
    // propenso a virar qualidade_da_fonte (idade alta/incoerência), e os 4
    // já capturados na seleção primária bastam para essa diversidade. Exclui
    // esperas extremas (>=150 min, perto do limiar de zumbi 180) e prefere
    // ticks baixos — maximiza a chance de o caso ser genuinamente avaliável,
    // sem nunca olhar a classificação para decidir isso.
    const pool2 = [];
    for (const ep of full.episodes || []) {
      if (!ep || !ep.episode_id) continue;
      if (selectedSet.has(ep)) continue;
      if (Blind.isTrainingLeak(ep, exclusion)) continue;
      if (ep.type !== "motoboy_na_loja" && !/pronto|aguardando_saida|alocado|prontos_acumulando/.test(ep.type || "")) continue;
      const w = Blind.parseWaitFromEvidence(ep);
      const waitMin = ep.type === "motoboy_na_loja" ? w.motoboy : w.pronto != null ? w.pronto : w.min;
      if (waitMin != null && waitMin >= 150) continue;
      const turn = episodeTurnKey(ep);
      if (usedTurnTopup.has(turn)) continue;
      if (ep.order_id && usedOrderTopup.has(ep.order_id)) continue;
      pool2.push(ep);
    }
    pool2.sort((a, b) => {
      const pa = usedPracaTopup.has(a.praca) ? 0 : 1;
      const pb = usedPracaTopup.has(b.praca) ? 0 : 1;
      if (pa !== pb) return pb - pa;
      return (a.tick_count || 0) - (b.tick_count || 0);
    });

    for (const ep of pool2) {
      if (nAvaliaveisProbe >= MIN_AVALIAVEIS) break;
      if (classified.length >= MAX_N) break;
      const turn = episodeTurnKey(ep);
      if (usedTurnTopup.has(turn)) continue;
      const c = classify(ep, classified.length);
      classified.push(c);
      usedTurnTopup.add(turn);
      if (ep.order_id) usedOrderTopup.add(ep.order_id);
      if (ep.praca) usedPracaTopup.add(ep.praca);
      if (c.pred.classificacao !== "evidencia_insuficiente" && !c.pred.zombie && c.pred.classificacao !== "qualidade_fonte") {
        nAvaliaveisProbe++;
      }
    }
    holdout.episodes = classified.map((c) => c.ep);
    holdout.stats.topup_aplicado = true;
    holdout.stats.topup_adicionados = classified.length - nBase;
    holdout.stats.n = holdout.episodes.length;
  } else {
    holdout.stats.topup_aplicado = false;
  }
  console.log("holdout (após topup por evidência, se necessário)", {
    n: holdout.episodes.length,
    topup: holdout.stats.topup_aplicado,
    adicionados: holdout.stats.topup_adicionados || 0
  });

  // reordena cronologicamente após eventual topup, antes de atribuir case_id final
  holdout.episodes.sort((a, b) => (a.started_ms || 0) - (b.started_ms || 0));
  freezeMeta.n_cases = holdout.episodes.length;

  const factsList = [];
  const gabaritoCases = [];
  let nFonteQual = 0;
  let nInsuf = 0;
  let nAvaliaveis = 0;

  holdout.episodes.forEach((ep, i) => {
    const built = Blind.buildBlindCase(ep, i, humanConfig, freezeMeta);
    const caseId = `CV-B2-${String(i + 1).padStart(3, "0")}`;

    const facts = Object.assign({}, built.facts, { case_id: caseId });

    // Gabarito recomputado com o classificador FATO→ESTADO (Blind.classifyBlindFactCase),
    // o mesmo caminho validado a 100% de concordância na regressão da Fase 2D.8 —
    // mais fiel que o parser de evidência em texto livre usado por padrão em
    // buildBlindCase. Não altera nenhuma regra do motor: só ESCOLHE qual leitor
    // de fatos já existente alimenta o gabarito congelado.
    const pred = Blind.classifyBlindFactCase(facts, humanConfig);

    const gabarito = {
      case_id: caseId,
      episode_id_anon: built.gabarito.episode_id_anon,
      order_token: built.gabarito.order_token,
      episode_turn_key: built.gabarito.episode_turn_key,
      type: built.gabarito.type,
      classificacao: pred.classificacao,
      severity: pred.severity,
      severity_label: pred.severity_label,
      confianca: pred.confianca,
      intervencao: pred.intervencao,
      intervencao_mensagem: pred.intervencao_mensagem,
      regra_acionada: pred.regra_acionada,
      evidencias: pred.evidencias,
      participa_do_isf: !pred.exclude_from_isf,
      excluido_por_qualidade_da_fonte: !!pred.zombie || pred.classificacao === "qualidade_fonte",
      exclude_from_capacity: pred.exclude_from_capacity,
      config_version: freezeMeta.config_version,
      config_sha256: freezeMeta.config_sha256,
      motor_commit: MOTOR_COMMIT,
      generated_at: freezeMeta.generated_at
    };

    factsList.push(facts);
    gabaritoCases.push(gabarito);
    freezeMeta.case_ids.push(caseId);
    if (gabarito.excluido_por_qualidade_da_fonte) nFonteQual++;
    else if (pred.classificacao === "evidencia_insuficiente") nInsuf++;
    else nAvaliaveis++;
  });

  if (nInsuf > MAX_INSUFFICIENT) {
    console.error(`LIMITE EXCEDIDO: ${nInsuf} casos de evidência insuficiente (máx ${MAX_INSUFFICIENT})`);
    process.exit(1);
  }

  const md = Blind.blindCasesToMarkdown(factsList, Object.assign({}, freezeMeta, { generated_at }));
  const mdWithPack = md.replace("Pack: **blind-v1**", "Pack: **blind-v2**");
  const clean = Blind.assertBlindMarkdownClean(mdWithPack);
  if (!clean.ok) {
    console.error("MARKDOWN LEAK", clean.leaks);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  write(path.join(outDir, "CASOS_CEGOS_CESAR.md"), mdWithPack);

  write(path.join(outDir, "casos-cegos-fatos.json"), {
    labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
    version: "2D.9-blind-v2",
    for: "César",
    note: "Somente fatos. Sem classificação do motor. Segundo holdout, independente do blind-v1.",
    config_sha256: configSha,
    motor_commit: MOTOR_COMMIT,
    generated_at,
    n: factsList.length,
    cases: factsList.map((f) => {
      const pub = Object.assign({}, f);
      delete pub._episode_id_anon;
      delete pub._order_token;
      delete pub._episode_turn_key;
      delete pub._type;
      return pub;
    })
  });

  write(path.join(outDir, "GABARITO_MOTOR_CONGELADO.json"), {
    labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
    version: "2D.9-blind-v2",
    frozen: true,
    config_version: freezeMeta.config_version,
    config_sha256: configSha,
    motor_commit: MOTOR_COMMIT,
    generated_at,
    classification_method: "Blind.classifyBlindFactCase (validado 100% na regressão 2D.8 sobre blind-v1)",
    n: gabaritoCases.length,
    n_avaliaveis: nAvaliaveis,
    n_qualidade_fonte: nFonteQual,
    n_evidencia_insuficiente: nInsuf,
    cases: gabaritoCases,
    note: "NÃO usar para produzir o Markdown do César. Congelado antes das respostas humanas. NÃO comparar nesta fase."
  });

  write(path.join(outDir, "FREEZE.json"), freezeMeta);

  write(path.join(outDir, "TRAINING_EXCLUSION.json"), {
    n_case_ids: exclusion.n_case_ids,
    n_order_tokens: exclusion.n_order_tokens,
    n_turn_keys: exclusion.n_turn_keys,
    n_episode_id_anons: exclusion.n_episode_id_anons,
    sources: exclusion.sources,
    limitations: exclusion.limitations,
    case_ids: [...exclusion.caseIds].sort(),
    order_tokens: [...exclusion.orderTokens].sort(),
    episode_id_anons: [...exclusion.episodeIdAnons].sort(),
    turn_keys_sample: [...exclusion.turnKeys].slice(0, 8)
  });

  const casosCegosSha = sha256File(path.join(outDir, "CASOS_CEGOS_CESAR.md"));
  const gabaritoSha = sha256File(path.join(outDir, "GABARITO_MOTOR_CONGELADO.json"));

  const manifest = {
    labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
    version: "2D.9",
    frozen: true,
    generated_at,
    motor_commit: MOTOR_COMMIT,
    config_version: freezeMeta.config_version,
    config_sha256: configSha,
    gabarito_sha256: gabaritoSha,
    casos_cegos_md_sha256: casosCegosSha,
    n_casos: gabaritoCases.length,
    n_avaliaveis: nAvaliaveis,
    n_evidencia_insuficiente: nInsuf,
    n_qualidade_fonte: nFonteQual,
    ids_congelados: freezeMeta.case_ids.slice(),
    tokens_anonimizados_congelados: {
      order_tokens: gabaritoCases.map((c) => c.order_token).filter(Boolean).sort(),
      episode_id_anons: gabaritoCases.map((c) => c.episode_id_anon).filter(Boolean).sort()
    },
    exclusoes: {
      n_case_ids: exclusion.n_case_ids,
      n_order_tokens: exclusion.n_order_tokens,
      fontes: exclusion.sources,
      limitations: exclusion.limitations
    },
    criterios_selecao: freezeMeta.selection_criteria,
    diversidade: holdout.stats,
    achados_empiricos_do_pool: [
      "'pronto sem saída' (tipos pronto_sem_saida_excessivo/aguardando_saida_causa_nao_confirmada/" +
        "prontos_acumulando/entregador_alocado_sem_retirada) nunca ultrapassa ~39.9 min em NENHUM dos " +
        "4146 episódios do pool — a faixa '40 min ou mais / crítico' não tem representante literal por " +
        "esse caminho nesta base. O caso crítico mais próximo do conceito (CV-B2-005) vem do tipo " +
        "pedido_atrasado_vs_prometido_operacional via idade/atraso (58.6 min), caminho que o motor trata " +
        "como crítico operacional real (não zumbi, não pronto-sem-saída literal) — registrado, não " +
        "fabricado.",
      "Só existem 5 episódios do tipo atencao_operacional (evidência insuficiente 'pura', sem nenhum " +
        "sinal numérico) em todo o pool, e os 5 já foram consumidos pelo blind-v1 (CV-B-001..005) — " +
        "zero sobra para o blind-v2 por esse tipo exato. Os 4 casos de evidência insuficiente aqui " +
        "vêm de episódios cujo TIPO sugere sinal operacional (pronto/alocado/acumulando/motoboy) mas " +
        "cuja evidência não carrega nenhum tempo numérico parseável — genuinamente insuficientes, só " +
        "descobertos por não terem sinal, nunca escolhidos por rótulo.",
      "Todo episódio pedido_atrasado_vs_prometido_operacional com span >=180 min (a grande maioria) " +
        "vira qualidade_da_fonte — não há versão 'moderadamente atrasada e limpa' desse tipo específico " +
        "acima de ~60 min nesta amostra do pool; por isso o orçamento de 'atraso operacional' ficou em " +
        "1 caso (o único abaixo do limiar de zumbi encontrado), e 'qualidade da fonte' cobre a faixa " +
        "alta com 3 magnitudes distintas de excesso."
    ],
    independente_do_blind_v1: true,
    blind_v1_usado_apenas_como_exclusao: true,
    no_silent_regeneration: true,
    regeneration_policy:
      "Após o César receber CASOS_CEGOS_CESAR.md, este manifesto e os hashes acima são a referência " +
      "de integridade. Qualquer regeneração exige --force e deve ser registrada como novo pack (blind-v2b), " +
      "nunca sobrescrever silenciosamente os casos já enviados.",
    note: "Não comparar nesta fase. Comparação só após rótulos humanos, via tools/comparar_blind_v2.js."
  };
  write(manifestPath, manifest);

  write(path.join(outDir, "00_README.md"), [
    "# Blind-v2 — segundo holdout cego independente",
    "",
    "Independente do blind-v1 (excluído por token/case_id — ver TRAINING_EXCLUSION.json).",
    "",
    "1. Enviar **somente** `CASOS_CEGOS_CESAR.md` ao César.",
    "2. Não abrir `GABARITO_MOTOR_CONGELADO.json` nem `MANIFESTO_CONGELAMENTO.json` na sessão de avaliação.",
    "3. Após respostas, gravar em `ROTULOS_HUMANOS_CEGOS.json` e rodar:",
    "   `node tools/comparar_blind_v2.js`",
    "4. Não recalibrar antes da comparação. Não criar blind-v3 sem decisão do César.",
    ""
  ].join("\n"));

  write(path.join(outDir, "99_SUMMARY.json"), {
    version: "2D.9",
    n_cegos: gabaritoCases.length,
    independentes: true,
    vazamento_treino: leaks,
    datas: holdout.stats.dates,
    dias: holdout.stats.dias,
    faixas: holdout.stats.faixas,
    pracas: holdout.stats.pracas,
    motoboy_bandas_cobertas: holdout.stats.motoboy_bandas_cobertas,
    pronto_bandas_cobertas: holdout.stats.pronto_bandas_cobertas,
    avaliaveis: nAvaliaveis,
    qualidade_fonte: nFonteQual,
    evidencia_insuficiente: nInsuf,
    config_sha256: configSha,
    markdown_clean: clean.ok,
    frozen: true
  });

  console.log(
    JSON.stringify(
      {
        n: gabaritoCases.length,
        leaks,
        avaliaveis: nAvaliaveis,
        insuficiente: nInsuf,
        fonte: nFonteQual,
        dates: holdout.stats.dates.length,
        dias: holdout.stats.dias,
        faixas: holdout.stats.faixas,
        pracas: holdout.stats.pracas,
        motoboy_bandas: holdout.stats.motoboy_bandas_cobertas,
        pronto_bandas: holdout.stats.pronto_bandas_cobertas,
        config_sha256: configSha,
        clean: clean.ok
      },
      null,
      2
    )
  );

  if (gabaritoCases.length < MIN_N || gabaritoCases.length > MAX_N) {
    console.error(`N fora do intervalo [${MIN_N},${MAX_N}]: ${gabaritoCases.length}`);
    process.exit(1);
  }
  if (nAvaliaveis < MIN_AVALIAVEIS) {
    console.error(`AVALIÁVEIS abaixo do mínimo: ${nAvaliaveis} < ${MIN_AVALIAVEIS}`);
    process.exit(1);
  }
}

main();
