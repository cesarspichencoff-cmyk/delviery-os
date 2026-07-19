/* ============================================================================
 * Validação cega da calibração humana — holdout sem vazamento de treino.
 * Não altera config/motor. CALIBRAÇÃO · MODO SOMBRA · NÃO OPERACIONAL
 * ==========================================================================*/
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { stamp } = require("./labels");
const { toSaoPaulo } = require("./timezone");
const { operationalDayKey } = require("./operational-window");
const {
  anonEpisodeId,
  anonOrderToken,
  episodeTurnKey,
  hourBand,
  isPureLogistic,
  LOGISTIC_TYPES
} = require("./review-v3");
const {
  classifyOrderHuman,
  isZombieOrder,
  classifyMotoboyWait,
  classifyProntoSemSaida,
  actionFromSeverityConfidence
} = require("./human-rules");
const { sugerirMenorIntervencaoSane } = require("./intervencao-sane");

const DOW_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/**
 * Carrega conjunto de exclusão a partir dos artefatos de treino 2D.5/2D.6.
 */
function loadTrainingExclusion(rootDir) {
  const root = rootDir || path.join(__dirname, "../../..");
  const repPath = path.join(root, "data/capacidade-viva/calibration/review-v3/casos-representativos.json");
  const limPath = path.join(root, "data/capacidade-viva/calibration/review-v3/casos-limitrofes.json");
  const labPath = path.join(root, "data/capacidade-viva/calibration/review-v3/rotulos-humanos-cesar.json");

  const caseIds = new Set();
  const orderTokens = new Set();
  const episodeIdAnons = new Set();
  const turnKeys = new Set();
  const rawOrderIds = new Set();
  const rawEpisodeIds = new Set();

  function ingestCases(cases) {
    for (const c of cases || []) {
      if (c.case_id) caseIds.add(c.case_id);
      if (c.order_token) orderTokens.add(c.order_token);
      if (c.episode_id_anon) episodeIdAnons.add(c.episode_id_anon);
      if (c.episode_turn_key) {
        turnKeys.add(c.episode_turn_key);
        const raw = String(c.episode_turn_key).split("|")[0];
        if (raw && raw !== "unknown") rawOrderIds.add(raw);
      }
    }
  }

  if (fs.existsSync(repPath)) {
    const rep = JSON.parse(fs.readFileSync(repPath, "utf8"));
    ingestCases(rep.cases);
  }
  if (fs.existsSync(limPath)) {
    const lim = JSON.parse(fs.readFileSync(limPath, "utf8"));
    ingestCases(lim.cases);
  }
  if (fs.existsSync(labPath)) {
    const lab = JSON.parse(fs.readFileSync(labPath, "utf8"));
    for (const id of Object.keys(lab.representativos || {})) caseIds.add(id);
    for (const id of Object.keys(lab.limitrofes || {})) caseIds.add(id);
  }

  return {
    caseIds,
    orderTokens,
    episodeIdAnons,
    turnKeys,
    rawOrderIds,
    rawEpisodeIds,
    n_case_ids: caseIds.size,
    n_order_tokens: orderTokens.size,
    n_turn_keys: turnKeys.size
  };
}

/**
 * True se o episódio vaza treino (mesmo pedido/turno/token/episode).
 */
function isTrainingLeak(ep, exclusion) {
  const ex = exclusion || {};
  const turn = episodeTurnKey(ep);
  if (ex.turnKeys && ex.turnKeys.has(turn)) return true;
  if (ep.order_id && ex.rawOrderIds && ex.rawOrderIds.has(ep.order_id)) {
    // mesmo pedido em qualquer turno de treino — excluir
    return true;
  }
  if (ep.episode_id && ex.rawEpisodeIds && ex.rawEpisodeIds.has(ep.episode_id)) return true;
  const ot = anonOrderToken(ep.order_id);
  if (ot && ex.orderTokens && ex.orderTokens.has(ot)) return true;
  const ea = anonEpisodeId(ep.episode_id);
  if (ea && ex.episodeIdAnons && ex.episodeIdAnons.has(ea)) return true;
  return false;
}

function parseWaitFromEvidence(ep) {
  const text = Array.isArray(ep.evidence) ? ep.evidence.join(" ") : String(ep.evidence || "");
  const out = { kind: null, min: null, pronto: null, idade: null, motoboy: null };
  const m1 = text.match(/espera na loja\s+([\d.]+)\s*min/i);
  if (m1) out.motoboy = Number(m1[1]);
  const m2 = text.match(/pronto sem saída[^\d]*([\d.]+)\s*min/i);
  if (m2) out.pronto = Number(m2[1]);
  const m2b = text.match(/pronto há\s+([\d.]+)\s*min/i);
  if (m2b && out.pronto == null) out.pronto = Number(m2b[1]);
  const m3 = text.match(/idade\s+([\d.]+)/i);
  if (m3) out.idade = Number(m3[1]);
  const m4 = text.match(/([\d.]+)\s*min/);
  if (m4 && ep.type === "motoboy_na_loja" && out.motoboy == null) out.motoboy = Number(m4[1]);
  if (m4 && /pronto|saida/.test(ep.type || "") && out.pronto == null) out.pronto = Number(m4[1]);
  if (m4 && /atrasado/.test(ep.type || "") && out.idade == null) out.idade = Number(m4[1]);
  // primary kind for legacy callers
  if (out.motoboy != null) {
    out.kind = "motoboy";
    out.min = out.motoboy;
  } else if (out.pronto != null) {
    out.kind = "pronto";
    out.min = out.pronto;
  } else if (out.idade != null) {
    out.kind = "idade";
    out.min = out.idade;
  }
  return out;
}

/**
 * Classifica a partir de fatos cegos (casos-cegos-fatos) — preferido para regressão v2.
 */
function classifyBlindFactCase(fact, humanConfig) {
  const f = fact || {};
  const courier =
    f.motoboy_confirmado_na_loja && f.tempo_espera_motoboy_min != null
      ? Number(f.tempo_espera_motoboy_min)
      : null;
  const ready =
    f.maior_tempo_pronto_aguardando_min != null
      ? Number(f.maior_tempo_pronto_aguardando_min)
      : courier != null
        ? courier
        : 0;
  const age = f.tempo_atraso_min != null ? Number(f.tempo_atraso_min) : 0;

  const hasTemporal =
    courier != null ||
    (ready != null && ready > 0) ||
    (age != null && age > 0) ||
    f.pedido_atrasado === true;

  const onlyVolume =
    !hasTemporal &&
    (f.pedidos_ativos != null || f.pedidos_ativos === 0) &&
    !f.ritmo_recente &&
    !(f.dados_ausentes && f.dados_ausentes.length === 0);

  const state = {
    id: f.case_id,
    age_min: age,
    ready_wait_min: ready,
    pronto: ready > 0 || courier != null || f.pedidos_prontos > 0,
    saiu: false,
    cancelado: false,
    alocado: false,
    courier_wait_store_min: courier,
    courier_wait_epistemic: courier != null ? "confirmado" : null,
    ready_epistemic: f.confianca_da_evidencia === "alta" ? "confirmado" : "inferido_baixa_confianca",
    prontos_acumulando: false,
    age_is_proxy_from_volume: false,
    crosses_operational_days: ready >= 180 || age >= 180
  };

  // alocado: se 15 min pronto sem motoboy e tipo implícito — só quando ready>=15 e sem motoboy
  // (regressão CV-B-015)
  if (!courier && ready > 0 && ready < 40 && f.motoboy_confirmado_na_loja === false && age === 0) {
    // pode ser alocado ou pronto simples — classificado por faixas de pronto
    state.alocado = ready >= 15 && ready < 25 ? true : false;
  }

  const ctx = {
    n_ready: ready >= 25 ? Math.max(1, f.pedidos_prontos || 1) : 0,
    n_delayed: age >= 40 ? 1 : 0,
    n_motoboys_waiting: courier != null ? 1 : 0,
    queue_growing: false,
    praca_pressionada: false,
    only_active_orders: onlyVolume,
    volume_only: onlyVolume,
    insufficient_evidence: onlyVolume
  };

  const cls = classifyOrderHuman(state, humanConfig, ctx);
  return packClassification(cls, humanConfig, {
    type: courier != null ? "motoboy_na_loja" : ready > 0 ? "pronto_sem_saida" : onlyVolume ? "volume" : "geral",
    evidence: [
      courier != null ? `espera motoboy ${courier} min` : null,
      ready > 0 ? `pronto sem saída ${ready} min` : null,
      age > 0 ? `idade/atraso ${age} min` : null,
      onlyVolume ? `pedidos_ativos=${f.pedidos_ativos}` : null
    ].filter(Boolean)
  });
}

function packClassification(cls, humanConfig, meta) {
  const iv = sugerirMenorIntervencaoSane({
    tick_class: {
      has_critical: cls.level === "excecao_critica",
      has_attention: cls.level === "atencao",
      critical_items: cls.exceptions || [],
      attention_items: cls.attentions || [],
      n_zombie_orders: cls.zombie ? 1 : 0
    },
    isf: { confidence: cls.confidence || "media", por_praca: {}, praca_critica: null },
    config: humanConfig,
    confidence: cls.confidence || "media"
  });

  let regra = "geral";
  if (cls.zombie || cls.level === "qualidade_fonte") regra = "zombie_qualidade_fonte";
  else if (cls.level === "evidencia_insuficiente") regra = "evidencia_insuficiente";
  else if (meta && meta.type === "motoboy_na_loja") regra = "motoboy_ancoras_humanas";
  else if (meta && /pronto/.test(meta.type || "")) regra = "pronto_sem_saida_ancoras";
  else if (meta && /atrasado/.test(meta.type || "")) regra = "atraso_operacional_40";

  // intervenção para evidência insuficiente
  let intervencao = iv.action;
  let intervencao_mensagem = iv.message || iv.reason || null;
  if (cls.level === "evidencia_insuficiente" || cls.insufficient_evidence) {
    intervencao = "nao_classificar_pressao";
    intervencao_mensagem = cls.action;
  }
  if (cls.level === "qualidade_fonte") {
    intervencao = "corrigir_status_pedido_antigo";
    intervencao_mensagem = cls.action;
  }

  return {
    classificacao: cls.level,
    severity: cls.severity != null ? cls.severity : null,
    severity_label: cls.severity_label || null,
    confianca: cls.confidence || "media",
    epistemic: null,
    intervencao,
    intervencao_mensagem,
    regra_acionada: regra,
    evidencias: (meta && meta.evidence) || [],
    exclude_from_capacity: !!cls.exclude_from_capacity,
    exclude_from_isf: !!cls.exclude_from_isf,
    zombie: !!cls.zombie,
    insufficient_evidence: !!cls.insufficient_evidence,
    human_cls: cls
  };
}

/**
 * Classifica episódio com config humana (v1 ou v2).
 */
function classifyEpisodeWithHumanConfig(ep, humanConfig) {
  const wait = parseWaitFromEvidence(ep);

  // Não inventar idade a partir de volume (evita falsa atenção)
  let age = wait.idade != null ? wait.idade : wait.kind === "idade" ? wait.min : null;
  let ageIsProxy = false;
  if (age == null && ep.observed_span_min != null && ep.type && /atrasado/.test(ep.type)) {
    age = Math.max(ep.observed_span_min, 0);
  }
  if (age == null) {
    age = 0;
    ageIsProxy = true;
  }

  let courier = null;
  let ready = 0;
  if (ep.type === "motoboy_na_loja" || wait.motoboy != null) {
    courier = wait.motoboy != null ? wait.motoboy : wait.kind === "motoboy" ? wait.min : null;
    if (courier == null && ep.type === "motoboy_na_loja") courier = 10;
    ready = courier != null ? courier : 0;
  }
  if (wait.pronto != null) ready = Math.max(ready, wait.pronto);
  if (/pronto|alocado|aguardando_saida|prontos_acumulando/.test(ep.type || "") && ready === 0) {
    ready = wait.min != null && wait.kind === "pronto" ? wait.min : ep.observed_span_min || 0;
  }

  // volume-only episodes (atenção geral sem tempos)
  const onlyVolume =
    !courier &&
    !ready &&
    !wait.idade &&
    (!ep.type || /geral|volume|carga|atencao_operacional/i.test(ep.type || "")) &&
    (ep.peak_active_orders != null || /atenção operacional geral/i.test(String(ep.evidence || "")));

  const state = {
    id: ep.order_id || ep.episode_id,
    age_min: age,
    ready_wait_min: ready,
    pronto: ep.type !== "pedido_atrasado_vs_prometido_operacional" || ready > 0 || age > 40,
    saiu: false,
    cancelado: false,
    alocado: ep.type === "entregador_alocado_sem_retirada",
    alocado_epistemic: "inferido_alta_confianca",
    courier_wait_store_min: courier,
    courier_wait_epistemic: courier != null ? "inferido_alta_confianca" : null,
    prontos_acumulando: ep.type === "prontos_acumulando",
    queue_growing: false,
    carga_alta: false,
    item_complexo: false,
    capacidade_baixa: false,
    age_is_proxy_from_volume: ageIsProxy,
    crosses_operational_days: ready >= 180 || age >= 180
  };

  // atraso com idade real e possível pronto longo no observed_span
  if (/atrasado/.test(ep.type || "") && ep.observed_span_min != null && ready < ep.observed_span_min) {
    // se o span for absurdo, tratar como ready para fonte
    if (ep.observed_span_min >= 180) {
      state.ready_wait_min = Math.max(state.ready_wait_min, ep.observed_span_min);
    }
  }

  const ctx = {
    n_ready: ready >= 25 ? 2 : 0,
    n_delayed: !ageIsProxy && age >= 40 ? 1 : 0,
    n_motoboys_waiting: courier != null ? 1 : 0,
    queue_growing: false,
    praca_pressionada: false,
    only_active_orders: onlyVolume,
    volume_only: onlyVolume,
    insufficient_evidence: onlyVolume
  };

  const cls = classifyOrderHuman(state, humanConfig, ctx);
  return packClassification(cls, humanConfig, {
    type: ep.type,
    evidence: Array.isArray(ep.evidence) ? ep.evidence.slice() : ep.evidence ? [ep.evidence] : []
  });
}

/**
 * Seleciona holdout 16–24 episódios independentes.
 */
function selectBlindHoldout(episodes, exclusion, opts) {
  const o = opts || {};
  const minN = o.min_n != null ? o.min_n : 16;
  const maxN = o.max_n != null ? o.max_n : 24;
  const list = Array.isArray(episodes) ? episodes : [];

  // dedup por turn key
  const byTurn = new Map();
  for (const ep of list) {
    if (!ep || !ep.episode_id) continue;
    if (isTrainingLeak(ep, exclusion)) continue;
    const key = episodeTurnKey(ep);
    const prev = byTurn.get(key);
    if (!prev) {
      byTurn.set(key, ep);
      continue;
    }
    const score = (e) => (e.peak_severity || 0) * 1000 + (e.peak_active_orders || 0) + (e.tick_count || 0);
    if (score(ep) > score(prev)) byTurn.set(key, ep);
  }

  const pool = [...byTurn.values()];
  const usedTurn = new Set();
  const usedOrder = new Set();
  const usedDays = new Set();
  const usedDow = new Set();
  const usedBands = new Set();
  const usedPracas = new Set();
  const usedTypes = new Set();
  const selected = [];

  function meta(ep) {
    const sp = toSaoPaulo(ep.started_ms || ep.started_at);
    return {
      day: sp.local_date,
      dow: DOW_PT[sp.local_dow] || null,
      band: hourBand(sp.local_hour),
      praca: ep.praca || null,
      type: ep.type || null
    };
  }

  function diversityScore(ep) {
    const m = meta(ep);
    let s = 0;
    if (m.day && !usedDays.has(m.day)) s += 5;
    if (m.dow && !usedDow.has(m.dow)) s += 4;
    if (m.band && !usedBands.has(m.band)) s += 3;
    if (m.praca && !usedPracas.has(m.praca)) s += 4;
    if (m.type && !usedTypes.has(m.type)) s += 3;
    if ((ep.tick_count || 0) >= 2) s += 1;
    // prefer variety of wait times
    const w = parseWaitFromEvidence(ep);
    if (w.min != null) {
      if (w.min < 10) s += 1;
      else if (w.min < 20) s += 1;
      else s += 1;
    }
    if (ep.level === "excecao_critica") s += 0.5;
    if (ep.level === "atencao") s += 0.5;
    // zombie-like for fonte diversity
    const age = parseWaitFromEvidence(ep);
    if (age.kind === "idade" && age.min > 180) s += 2;
    return s;
  }

  // buckets for soft mix
  const buckets = {
    motoboy: [],
    pronto: [],
    atraso: [],
    normal_baixa: [],
    fonte: [],
    other: []
  };
  for (const ep of pool) {
    const w = parseWaitFromEvidence(ep);
    if (w.kind === "idade" && w.min >= 180) buckets.fonte.push(ep);
    else if (ep.type === "motoboy_na_loja") buckets.motoboy.push(ep);
    else if (/pronto|aguardando_saida|alocado|prontos_acumulando/.test(ep.type || "")) buckets.pronto.push(ep);
    else if (/atrasado/.test(ep.type || "")) {
      if (w.min >= 180) buckets.fonte.push(ep);
      else buckets.atraso.push(ep);
    } else if ((ep.peak_active_orders || 0) > 0 && (ep.peak_active_orders || 0) <= 12) buckets.normal_baixa.push(ep);
    else buckets.other.push(ep);
  }
  for (const k of Object.keys(buckets)) {
    buckets[k].sort((a, b) => diversityScore(b) - diversityScore(a));
  }

  function tryAdd(ep) {
    if (selected.length >= maxN) return false;
    const turn = episodeTurnKey(ep);
    if (usedTurn.has(turn)) return false;
    if (ep.order_id && usedOrder.has(ep.order_id)) return false;
    if (isTrainingLeak(ep, exclusion)) return false;
    // avoid near-duplicates same type+praca within 45 min
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
    if (m.type) usedTypes.add(m.type);
    return true;
  }

  const order = ["motoboy", "pronto", "atraso", "fonte", "normal_baixa", "other"];
  let progress = true;
  while (selected.length < maxN && progress) {
    progress = false;
    for (const b of order) {
      if (selected.length >= maxN) break;
      buckets[b].sort((a, c) => diversityScore(c) - diversityScore(a));
      for (const ep of buckets[b]) {
        if (usedTurn.has(episodeTurnKey(ep))) continue;
        if (tryAdd(ep)) {
          progress = true;
          break;
        }
      }
    }
  }

  // fill to min if needed
  if (selected.length < minN) {
    pool.sort((a, b) => diversityScore(b) - diversityScore(a));
    for (const ep of pool) {
      if (selected.length >= minN) break;
      tryAdd(ep);
    }
  }

  selected.sort((a, b) => (a.started_ms || 0) - (b.started_ms || 0));

  return {
    episodes: selected.slice(0, maxN),
    stats: {
      n: Math.min(selected.length, maxN),
      dates: [...usedDays].sort(),
      dias: [...usedDow],
      faixas: [...usedBands],
      pracas: [...usedPracas],
      types: [...usedTypes],
      pool_after_exclusion: pool.length
    }
  };
}

/**
 * Monta caso cego (fatos) + gabarito (motor).
 */
function buildBlindCase(ep, idx, humanConfig, freezeMeta) {
  const sp = toSaoPaulo(ep.started_ms || ep.started_at);
  const wait = parseWaitFromEvidence(ep);
  const pureLog = isPureLogistic(ep);
  const pred = classifyEpisodeWithHumanConfig(ep, humanConfig);

  const caseId = `CV-B-${String(idx + 1).padStart(3, "0")}`;

  // fatos operacionais apenas
  const facts = stamp({
    case_id: caseId,
    data: sp.local_date,
    horario_local: ep.started_at || sp.local_iso,
    horario_fim_local: ep.last_seen_at || null,
    dia_semana: DOW_PT[sp.local_dow] || null,
    faixa_horario: hourBand(sp.local_hour),
    praca: ep.praca || null,
    pedidos_ativos: ep.peak_active_orders != null ? ep.peak_active_orders : null,
    pedidos_prontos: pureLog || /pronto|motoboy|alocado|aguardando/.test(ep.type || "") ? 1 : null,
    maior_tempo_pronto_aguardando_min:
      wait.kind === "pronto" || wait.kind === "motoboy"
        ? wait.min
        : ep.observed_span_min != null && pureLog
          ? ep.observed_span_min
          : null,
    motoboy_confirmado_na_loja: ep.type === "motoboy_na_loja",
    tempo_espera_motoboy_min: ep.type === "motoboy_na_loja" ? wait.min : null,
    pedido_atrasado: /atrasado/.test(ep.type || ""),
    tempo_atraso_min: wait.kind === "idade" ? wait.min : null,
    ritmo_recente: null,
    saude_da_fonte:
      pred.zombie || pred.classificacao === "qualidade_fonte"
        ? "suspeita_ou_incompativel"
        : (ep.peak_active_orders || 0) > 0
          ? "parcial_ou_conhecida"
          : "insuficiente",
    confianca_da_evidencia:
      ep.epistemic === "confirmado" || ep.confidence === "alta"
        ? "alta"
        : ep.epistemic === "inferido_baixa_confianca" || !ep.evidence || !ep.evidence.length
          ? "baixa"
          : "media",
    dados_ausentes: [
      "equipe_real_por_turno",
      "ritmo_15min_detalhado",
      ...(pureLog ? [] : ["distribuicao_itens"])
    ],
    // tokens internos só no gabarito lateral — NÃO no MD césar
    _episode_id_anon: anonEpisodeId(ep.episode_id),
    _order_token: anonOrderToken(ep.order_id),
    _episode_turn_key: episodeTurnKey(ep),
    _type: ep.type
  });

  const gabarito = {
    case_id: caseId,
    episode_id_anon: anonEpisodeId(ep.episode_id),
    order_token: anonOrderToken(ep.order_id),
    episode_turn_key: episodeTurnKey(ep),
    type: ep.type,
    classificacao: pred.classificacao,
    severity: pred.severity,
    severity_label: pred.severity_label,
    confianca: pred.confianca,
    intervencao: pred.intervencao,
    intervencao_mensagem: pred.intervencao_mensagem,
    regra_acionada: pred.regra_acionada,
    evidencias: pred.evidencias,
    zombie: pred.zombie,
    exclude_from_capacity: pred.exclude_from_capacity,
    config_version: freezeMeta.config_version,
    config_sha256: freezeMeta.config_sha256,
    generated_at: freezeMeta.generated_at
  };

  return { facts, gabarito };
}

/**
 * Markdown cego — sem classificação/bucket/severidade/intervenção.
 */
function blindCasesToMarkdown(factsList, freezeMeta) {
  const lines = [];
  lines.push("# Casos cegos — validação humana independente");
  lines.push("");
  lines.push("**CALIBRAÇÃO · MODO SOMBRA · NÃO OPERACIONAL**");
  lines.push("");
  lines.push("Avalie cada caso **somente com os fatos abaixo**.");
  lines.push("Este arquivo não contém saída automática do sistema.");
  lines.push("");
  lines.push(`Pack: **blind-v1** · gerado: ${freezeMeta.generated_at}`);
  lines.push(`Referência congelada: \`${freezeMeta.config_sha256.slice(0, 16)}…\``);
  lines.push(`n=${factsList.length}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const c of factsList) {
    lines.push(`## ${c.case_id}`);
    lines.push("");
    lines.push("### Fatos operacionais");
    lines.push(`- Número do caso: ${c.case_id}`);
    lines.push(`- Data: ${fmt(c.data)}`);
    lines.push(`- Horário local (America/Sao_Paulo): ${fmt(c.horario_local)}`);
    lines.push(`- Dia da semana: ${fmt(c.dia_semana)}`);
    lines.push(`- Faixa: ${fmt(c.faixa_horario)}`);
    lines.push(`- Praça: ${fmt(c.praca)}`);
    lines.push(`- Pedidos ativos: ${fmtNum(c.pedidos_ativos)}`);
    lines.push(`- Pedidos prontos (proxy): ${fmtNum(c.pedidos_prontos)}`);
    lines.push(`- Maior tempo pronto aguardando (min): ${fmtNum(c.maior_tempo_pronto_aguardando_min)}`);
    lines.push(`- Motoboy confirmado na loja: ${c.motoboy_confirmado_na_loja ? "sim" : "não / sem evidência"}`);
    lines.push(`- Tempo de espera do motoboy (min): ${fmtNum(c.tempo_espera_motoboy_min)}`);
    lines.push(`- Pedido atrasado: ${c.pedido_atrasado ? "sim / possível" : "não indicado"}`);
    lines.push(`- Tempo de atraso / idade (min): ${fmtNum(c.tempo_atraso_min)}`);
    lines.push(`- Ritmo recente: ${fmt(c.ritmo_recente)}`);
    lines.push(`- Saúde da fonte: ${fmt(c.saude_da_fonte)}`);
    lines.push(`- Confiança da evidência: ${fmt(c.confianca_da_evidencia)}`);
    lines.push(`- Dados ausentes: ${fmtList(c.dados_ausentes)}`);
    lines.push("");
    lines.push("### Sua avaliação");
    lines.push("- Estado real:");
    lines.push("  - [ ] normal");
    lines.push("  - [ ] atenção");
    lines.push("  - [ ] quase crítico");
    lines.push("  - [ ] crítico");
    lines.push("  - [ ] qualidade da fonte");
    lines.push("  - [ ] impossível avaliar");
    lines.push("- Ação que deveria ser tomada: _______________________________________________");
    lines.push("- Observação: ___________________________________________________");
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Garante que o markdown cego não vaza classificação.
 */
function assertBlindMarkdownClean(md) {
  const forbidden = [
    /classifica[cç][aã]o do motor/i,
    /\bbucket\b/i,
    /\bseveridade\b/i,
    /interven[cç][aã]o sugerida/i,
    /excecao_critica/i,
    /cv-cal-tata/i,
    /regra_acionada/i,
    /\bISF\b/,
    /quase_critico_motor/i,
    /\bgabarito\b/i,
    /intervir_agora/i,
    /severity_label/i
  ];
  const leaks = [];
  for (const re of forbidden) {
    if (re.test(md)) leaks.push(String(re));
  }
  return { ok: leaks.length === 0, leaks };
}

function fileSha256(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function fmt(v) {
  if (v == null || v === "") return "—";
  return String(v);
}
function fmtNum(v) {
  if (v == null || v === "") return "—";
  if (typeof v === "number" && !Number.isFinite(v)) return "—";
  return String(v);
}
function fmtList(v) {
  if (v == null) return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  return String(v);
}

/**
 * Estrutura para comparação futura (não executa sem rótulos).
 */
function prepareComparisonScaffold(gabaritoPath, labelsPath) {
  return {
    ready: false,
    gabarito_path: gabaritoPath,
    labels_path: labelsPath,
    metrics: [
      "concordancia_exata",
      "concordancia_dentro_de_um_nivel",
      "falsos_criticos",
      "criticos_nao_detectados",
      "falsos_qualidade_fonte",
      "zumbis_contaminaram_capacidade",
      "qualidade_intervencoes"
    ],
    note: "Executar somente após preencher rótulos humanos cegos. Não recalibrar antes."
  };
}

/**
 * Normaliza arquivo de rótulos cegos (formato César: rotulos[].caso/estado/acao).
 * Não modifica o arquivo — só a estrutura em memória.
 */
function normalizeHumanBlindLabels(labelsDoc) {
  if (!labelsDoc) return {};
  if (labelsDoc.by_case_id) return labelsDoc.by_case_id;
  if (Array.isArray(labelsDoc.cases)) {
    return Object.fromEntries(
      labelsDoc.cases.map((c) => [
        c.case_id || c.caso,
        {
          case_id: c.case_id || c.caso,
          estado_real: normalizeEstado(c.estado_real || c.estado),
          acao: c.acao || c.acao_recomendada || null,
          observacao: c.observacao || null
        }
      ])
    );
  }
  if (Array.isArray(labelsDoc.rotulos)) {
    return Object.fromEntries(
      labelsDoc.rotulos.map((c) => [
        c.caso || c.case_id,
        {
          case_id: c.caso || c.case_id,
          estado_real: normalizeEstado(c.estado || c.estado_real),
          acao: c.acao || null,
          observacao: c.observacao || null
        }
      ])
    );
  }
  // mapa direto case_id → {estado}
  const out = {};
  for (const [k, v] of Object.entries(labelsDoc)) {
    if (k === "configuracao_avaliada" || k === "referencia_congelada" || k === "avaliador") continue;
    if (v && typeof v === "object" && (v.estado || v.estado_real)) {
      out[k] = {
        case_id: k,
        estado_real: normalizeEstado(v.estado_real || v.estado),
        acao: v.acao || null
      };
    }
  }
  return out;
}

function normalizeEstado(e) {
  if (!e) return null;
  const s = String(e)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
  if (s === "qualidade_da_fonte" || s === "qualidade_fonte") return "qualidade_fonte";
  if (s === "impossivel_avaliar" || s === "impossivel") return "impossivel_avaliar";
  if (s === "quase_critico" || s === "quase-critico") return "quase_critico";
  if (s === "atencao" || s === "atenção") return "atencao";
  if (s === "critico" || s === "crítico") return "critico";
  if (s === "normal" || s === "observacao" || s === "observação") return s === "normal" ? "normal" : "normal";
  return s;
}

/**
 * Mapeia rótulo humano cego → buckets comparáveis.
 * @param {Array} gabaritoCases
 * @param {object} humanLabelsByCaseId — já normalizado OU documento bruto
 */
function compareBlindLabels(gabaritoCases, humanLabelsByCaseId) {
  let byId = humanLabelsByCaseId || {};
  // se veio documento bruto com rotulos[]
  if (byId.rotulos || byId.cases || byId.configuracao_avaliada) {
    byId = normalizeHumanBlindLabels(byId);
  }
  if (!byId || !Object.keys(byId).length) {
    return { ok: false, error: "sem_rotulos_humanos", n: 0 };
  }

  const rows = [];
  let exact = 0;
  let within1 = 0;
  let falseCritical = 0;
  let missedCritical = 0;
  let falseFonte = 0;
  let zombieContamination = 0;
  let n = 0;
  let nImpossivel = 0;
  let nComparaveis = 0;

  const order = ["normal", "atencao", "quase_critico", "critico", "qualidade_fonte"];

  function motorToHumanScale(cls, severityLabel) {
    if (cls === "qualidade_fonte") return "qualidade_fonte";
    if (cls === "evidencia_insuficiente") return "impossivel_avaliar";
    if (cls === "excecao_critica") return "critico";
    if (severityLabel === "quase_critico") return "quase_critico";
    if (severityLabel === "normal") return "normal";
    if (cls === "atencao") return "atencao";
    if (cls === "sinal" || cls === "quieto") return "normal";
    return "atencao";
  }

  for (const g of gabaritoCases || []) {
    const h = byId[g.case_id];
    if (!h || !h.estado_real) continue;
    n++;
    const m = motorToHumanScale(g.classificacao, g.severity_label);
    const human = h.estado_real;

    if (human === "impossivel_avaliar") {
      nImpossivel++;
      rows.push({
        case_id: g.case_id,
        motor: m,
        human,
        exact: false,
        skipped_for_agreement: true,
        acao_humana: h.acao || null,
        intervencao_motor: g.intervencao || null
      });
      continue;
    }

    nComparaveis++;
    if (m === human) exact++;
    const mi = order.indexOf(m);
    const hi = order.indexOf(human);
    if (mi >= 0 && hi >= 0 && Math.abs(mi - hi) <= 1) within1++;
    // falso crítico: motor crítico, humano não (e não quase crítico)
    if (m === "critico" && human !== "critico" && human !== "quase_critico") falseCritical++;
    if (human === "critico" && m !== "critico") missedCritical++;
    if (m === "qualidade_fonte" && human !== "qualidade_fonte") falseFonte++;
    // zumbi que o motor NÃO marcou como fonte mas humano sim, ou motor marcou capacidade
    if (human === "qualidade_fonte" && !g.zombie && g.classificacao !== "qualidade_fonte") {
      /* missed fonte */
    }
    if (g.zombie && human !== "qualidade_fonte" && m !== "qualidade_fonte") {
      /* motor said zombie but human didn't - ok */
    }
    // contaminação: motor NÃO excluiu (não zombie/fonte) mas humano diz fonte
    if (human === "qualidade_fonte" && !g.exclude_from_capacity && g.classificacao !== "qualidade_fonte") {
      zombieContamination++;
    }

    rows.push({
      case_id: g.case_id,
      motor: m,
      human,
      exact: m === human,
      within1: mi >= 0 && hi >= 0 && Math.abs(mi - hi) <= 1,
      acao_humana: h.acao || null,
      intervencao_motor: g.intervencao || null,
      intervencao_mensagem_motor: g.intervencao_mensagem || null
    });
  }

  return {
    ok: true,
    n,
    n_comparaveis: nComparaveis,
    n_impossivel_avaliar: nImpossivel,
    concordancia_exata: nComparaveis ? exact / nComparaveis : null,
    concordancia_exata_count: exact,
    concordancia_dentro_de_um_nivel: nComparaveis ? within1 / nComparaveis : null,
    concordancia_dentro_de_um_nivel_count: within1,
    falsos_criticos: falseCritical,
    criticos_nao_detectados: missedCritical,
    falsos_qualidade_fonte: falseFonte,
    zumbis_contaminaram_capacidade: zombieContamination,
    rows
  };
}

module.exports = {
  loadTrainingExclusion,
  isTrainingLeak,
  parseWaitFromEvidence,
  classifyEpisodeWithHumanConfig,
  classifyBlindFactCase,
  packClassification,
  selectBlindHoldout,
  buildBlindCase,
  blindCasesToMarkdown,
  assertBlindMarkdownClean,
  fileSha256,
  prepareComparisonScaffold,
  normalizeHumanBlindLabels,
  normalizeEstado,
  compareBlindLabels
};
