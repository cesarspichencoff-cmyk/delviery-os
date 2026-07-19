/* ============================================================================
 * Replay temporal — taxonomia saneada, timezone SP, episódios no pós-processo.
 * CALIBRAÇÃO · MODO SOMBRA · NÃO OPERACIONAL
 * ==========================================================================*/
"use strict";

const CV = require("../index");
const { stamp } = require("./labels");
const { toSaoPaulo } = require("./timezone");
const { classifyOrderSignals, classifyTick } = require("./taxonomy");
const { buildEpisodes } = require("./episodes");
const { sugerirMenorIntervencaoSane } = require("./intervencao-sane");

/**
 * @param {Map|object} byOrder
 * @param {object} opts
 */
function replayOrders(byOrder, opts) {
  const o = opts || {};
  const intervalMin = o.interval_min || 1;
  const config = o.config || CV.loadDefaultConfig();
  // limiares saneados na config se presentes
  if (!config.atraso) config.atraso = {};
  if (config.atraso.pronto_sem_saida_min == null) config.atraso.pronto_sem_saida_min = 12;
  if (config.atraso.motoboy_na_loja_min == null) config.atraso.motoboy_na_loja_min = 5;

  const teamProfiles = o.team_profiles || defaultTeamProfiles();
  const teamProfileId = o.team_profile || "estrutura_media";
  const teamMeta = teamProfiles[teamProfileId] || teamProfiles.estrutura_media;
  const turno = {
    equipe: teamMeta.equipe || teamMeta,
    observacao: teamMeta.simulated
      ? `CAPACIDADE HIPOTÉTICA · perfil simulado: ${teamProfileId}`
      : `perfil: ${teamProfileId}`
  };

  let tMin = null;
  let tMax = null;
  const orderMeta = new Map();
  let discarded = { no_timestamp: 0, empty: 0 };

  const iterable = byOrder instanceof Map ? byOrder : new Map(Object.entries(byOrder || {}));
  for (const [oid, events] of iterable) {
    if (!events || !events.length) {
      discarded.empty++;
      continue;
    }
    const meta = {
      id: oid,
      events: events.slice().sort((a, b) => String(a.timestamp || "").localeCompare(String(b.timestamp || ""))),
      items: [],
      courier_wait_store_min: null,
      courier_wait_epistemic: null,
      alocado_epistemic: null
    };
    for (const e of events) {
      if (!e.timestamp) {
        discarded.no_timestamp++;
        continue;
      }
      const ts = Date.parse(e.timestamp);
      if (!Number.isFinite(ts)) continue;
      if (tMin == null || ts < tMin) tMin = ts;
      if (tMax == null || ts > tMax) tMax = ts;
      if (e.event_type === "item_atribuido_praca" && e.item_name) {
        meta.items.push({
          id: e.item_id,
          nome: e.item_name,
          quantidade: e.quantity || 1,
          praca: e.praca,
          complexidade: e.complexity || "moderado",
          order_id: oid
        });
      }
      if (e.event_type === "motoboy_na_loja" || e.event_type === "motoboy_aguardando") {
        meta.courier_wait_store_min = e.courier_wait_store_min != null ? e.courier_wait_store_min : 5;
        meta.courier_wait_epistemic = e.epistemic;
      }
      if (e.event_type === "motoboy_alocado") meta.alocado_epistemic = e.epistemic;
      // timing on transition payload
      if (e.timing && e.timing.entregador_espera_loja_min && e.timing.entregador_espera_loja_min.value != null) {
        meta.courier_wait_store_min = e.timing.entregador_espera_loja_min.value;
        meta.courier_wait_epistemic = e.timing.entregador_espera_loja_min.epistemic;
      }
    }
    orderMeta.set(oid, meta);
  }

  if (tMin == null || tMax == null) {
    return stamp({ ok: false, error: "no_timestamps", ticks: [], discarded });
  }
  if (o.from) tMin = Math.max(tMin, Date.parse(o.from));
  if (o.to) tMax = Math.min(tMax, Date.parse(o.to));

  const stepMs = intervalMin * 60000;
  const ticks = [];
  const t0run = Date.now();
  let memPeak = 0;

  for (let t = tMin; t <= tMax; t += stepMs) {
    const sp = toSaoPaulo(t);
    const iso = sp.timestamp_utc;
    const active = [];
    const orderClassifications = [];
    const itemsByPraca = {};
    let nReady = 0;
    let nComplex = 0;

    for (const meta of orderMeta.values()) {
      const state = orderStateAt(meta, t);
      if (!state.active) continue;
      active.push(state);
      if (state.pronto && !state.saiu) nReady++;
      for (const it of meta.items) {
        if (it.complexidade && it.complexidade !== "simples") nComplex++;
        if (!it.praca) continue;
        if (!itemsByPraca[it.praca]) itemsByPraca[it.praca] = [];
        itemsByPraca[it.praca].push(
          Object.assign({}, it, {
            urgencia: state.age_min > 50 ? 1.8 : state.age_min > 35 ? 1.4 : 1
          })
        );
      }

      const cls = classifyOrderSignals(
        {
          id: meta.id,
          age_min: state.age_min,
          ready_wait_min: state.ready_wait_min,
          pronto: state.pronto,
          saiu: state.saiu,
          alocado: state.alocado,
          alocado_epistemic: meta.alocado_epistemic,
          courier_wait_store_min: state.motoboy_na_loja ? meta.courier_wait_store_min : null,
          courier_wait_epistemic: meta.courier_wait_epistemic,
          queue_growing: false,
          carga_alta: active.length > 40,
          item_complexo: meta.items.some((i) => i.complexidade === "complexo" || i.complexidade === "muito_complexo"),
          capacidade_baixa: teamProfileId === "estrutura_fraca",
          prontos_acumulando: nReady >= 4
        },
        config
      );
      orderClassifications.push(cls);
    }

    const por_praca = {};
    for (const [praca, items] of Object.entries(itemsByPraca)) {
      por_praca[praca] = {
        items,
        envelhecimento: Math.min(12, active.filter((a) => a.age_min > 35).length * 0.3),
        bloqueios: Math.min(8, nReady * 0.2)
      };
    }
    if (!Object.keys(por_praca).length && active.length) {
      por_praca.conferencia = {
        items: active.slice(0, 15).map((a) => ({
          id: "unknown",
          nome: "item_desconhecido",
          quantidade: 1,
          praca: "conferencia",
          complexidade: "moderado",
          simulated: true
        })),
        envelhecimento: 0,
        bloqueios: 0,
        weak_item_mapping: true
      };
    }

    const av = CV.avaliar({
      config,
      turno,
      por_praca,
      n_pedidos: active.length,
      when: new Date(t),
      orders: [], // exceções vêm da taxonomia saneada, não do detector legado
      confianca: Object.keys(itemsByPraca).length ? "media" : "baixa",
      source: { status: "ready" }
    });

    const tick_class = classifyTick(orderClassifications, {
      ...av.isf,
      n_pedidos: active.length
    });

    // tendência simples: comparar com tick anterior
    const prev = ticks.length ? ticks[ticks.length - 1] : null;
    const growing = prev ? active.length > prev.active_orders + 2 : false;
    const isfCrit = av.isf.praca_critica && av.isf.por_praca[av.isf.praca_critica];
    const trendUp = prev && isfCrit && prev.isf_critica != null && isfCrit.isf > prev.isf_critica + 0.05;

    const iv = sugerirMenorIntervencaoSane({
      isf: av.isf,
      tick_class,
      config,
      trend_up: trendUp || growing,
      confidence: av.isf.confidence
    });

    const shadow = {
      horario_utc: iso,
      horario_local: sp.local_iso,
      local_date: sp.local_date,
      local_hour: sp.local_hour,
      praca: av.isf.praca_critica,
      estado: tick_class.tick_level,
      isf_estado: av.isf.estado_geral,
      sinais: {
        ativos: active.length,
        n_signal: tick_class.n_signal_orders,
        n_attention: tick_class.n_attention_orders,
        n_critical: tick_class.n_critical_orders,
        ready: nReady,
        complex_items: nComplex,
        isf_critica: isfCrit ? isfCrit.isf : null
      },
      confianca: av.isf.confidence,
      menor_intervencao: iv.action,
      intervencao_detail: iv,
      pausa_seletiva_sugerida: iv.action === "pausa_seletiva",
      pausa_geral_sugerida: iv.action === "pausa_geral",
      excecao_critica: tick_class.has_critical,
      capacidade_hipotetica: !!(teamMeta.simulated),
      labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
      not_counterfactual_proof: true,
      not_detection_rate: true
    };

    ticks.push({
      t: iso,
      t_ms: t,
      local_iso: sp.local_iso,
      local_date: sp.local_date,
      local_hour: sp.local_hour,
      local_dow: sp.local_dow,
      active_orders: active.length,
      praca_critica: av.isf.praca_critica,
      isf_critica: isfCrit ? isfCrit.isf : null,
      tick_class,
      shadow,
      components: isfCrit && isfCrit.componentes ? isfCrit.componentes : null
    });

    if (process.memoryUsage && ticks.length % 200 === 0) {
      memPeak = Math.max(memPeak, process.memoryUsage().heapUsed);
    }
  }

  const gapMin =
    (o.episode_gap_min != null
      ? o.episode_gap_min
      : config.episode && config.episode.gap_min != null
        ? config.episode.gap_min
        : 10) || 10;
  const episodes = buildEpisodes(ticks, {
    gap_min: gapMin,
    interval_min: intervalMin,
    // fronteiras de dia/turno — defaults em operational-window (não altera cv-cal-sane-v2)
    operational: (o.operational || (config.episode && config.episode.operational) || undefined)
  });
  const elapsed_ms = Date.now() - t0run;

  // métricas corrigidas
  const n = ticks.length || 1;
  let sigT = 0;
  let attT = 0;
  let critT = 0;
  let pauseSel = 0;
  let pauseGen = 0;
  let confSum = 0;
  let confN = 0;
  let lowConf = 0;
  for (const t of ticks) {
    if (t.tick_class.has_signal) sigT++;
    if (t.tick_class.has_attention) attT++;
    if (t.tick_class.has_critical) critT++;
    if (t.shadow.pausa_seletiva_sugerida) pauseSel++;
    if (t.shadow.pausa_geral_sugerida) pauseGen++;
    if (t.shadow.confianca) {
      confN++;
      confSum += t.shadow.confianca === "alta" ? 1 : t.shadow.confianca === "baixa" ? 0 : 0.5;
      if (t.shadow.confianca === "baixa") lowConf++;
    }
  }

  return stamp({
    ok: true,
    interval_min: intervalMin,
    from: new Date(tMin).toISOString(),
    to: new Date(tMax).toISOString(),
    timezone: "America/Sao_Paulo",
    ticks,
    n_ticks: ticks.length,
    episodes,
    team_profile: teamProfileId,
    team_profiles_available: Object.keys(teamProfiles).filter((k) => typeof teamProfiles[k] === "object" && teamProfiles[k].equipe),
    capacidade_hipotetica: true,
    metrics_corrected: {
      pct_ticks_com_sinal: round3(sigT / n),
      pct_ticks_atencao: round3(attT / n),
      pct_ticks_criticos: round3(critT / n),
      frequencia_classificacao_critica: round3(critT / n),
      note: "Não chamar de taxa de detecção — sem ground truth",
      n_episodios: episodes.n_episodes,
      n_episodios_criticos: episodes.n_critical_episodes,
      n_episodios_atencao: episodes.n_attention_episodes,
      // durações humanas = só episódios mensuráveis (≥2 ticks); null se nenhum
      duracao_media_min: episodes.duration_avg_min,
      duracao_mediana_min: episodes.duration_median_min,
      duracao_p90_min: episodes.duration_p90_min,
      duracao_max_min: episodes.duration_max_min,
      episodios_uma_leitura: episodes.single_tick && episodes.single_tick.n,
      episodios_duracao_mensuravel: episodes.measurable && episodes.measurable.n,
      duracao_media_mensuravel: episodes.measurable && episodes.measurable.duration_avg_min,
      duracao_mediana_mensuravel: episodes.measurable && episodes.measurable.duration_median_min,
      duracao_p90_mensuravel: episodes.measurable && episodes.measurable.duration_p90_min,
      duracao_max_mensuravel: episodes.measurable && episodes.measurable.duration_max_min,
      episodios_atravessando_turno_ou_dia: episodes.episodes_crossing_day,
      pedidos_unicos_afetados: episodes.unique_orders_affected,
      episodios_sem_pedido: episodes.episodes_without_order_id,
      episodios_resolvidos: episodes.episodes_resolved,
      episodios_abertos_fim_janela: episodes.episodes_open_at_end,
      episodios_por_praca: episodes.by_praca,
      episodios_por_tipo: episodes.by_type,
      episodios_por_confianca: episodes.by_confidence,
      episodios_por_epistemic: episodes.by_epistemic,
      n_partidos_por_fronteira: episodes.n_split_by_boundary,
      pausas_seletivas_ticks: pauseSel,
      pausas_gerais_ticks: pauseGen,
      confianca_media_proxy: confN ? round3(confSum / confN) : null,
      ticks_confianca_insuficiente: lowConf
    },
    runtime: {
      elapsed_ms,
      heap_peak_bytes: memPeak || (process.memoryUsage && process.memoryUsage().heapUsed),
      orders_processed: orderMeta.size,
      discarded
    },
    alerts_summary: {
      critical_ticks: critT,
      attention_ticks: attT,
      signal_ticks: sigT,
      pause_sel: pauseSel,
      pause_gen: pauseGen
    },
    modified_source_data: false
  });
}

function orderStateAt(meta, tMs) {
  const events = meta.events;
  let received_ms = null;
  let pronto_ms = null;
  let pronto = false;
  let saiu = false;
  let cancelado = false;
  let alocado = false;
  let motoboy_na_loja = false;
  let active = false;

  for (const e of events) {
    if (!e.timestamp) continue;
    const ts = Date.parse(e.timestamp);
    if (!Number.isFinite(ts) || ts > tMs) continue;
    if (e.event_type === "pedido_recebido" || e.event_type === "pedido_aceito") {
      received_ms = received_ms == null ? ts : Math.min(received_ms, ts);
      active = true;
    }
    if (e.event_type === "pedido_pronto") {
      pronto = true;
      pronto_ms = ts;
    }
    if (e.event_type === "saiu_para_entrega" || e.event_type === "entregue") {
      saiu = true;
      active = false;
    }
    if (e.event_type === "cancelado") {
      cancelado = true;
      active = false;
    }
    if (e.event_type === "motoboy_alocado") alocado = true;
    if (e.event_type === "motoboy_na_loja" || e.event_type === "motoboy_aguardando") motoboy_na_loja = true;
  }
  if (cancelado || saiu) active = false;
  if (received_ms == null) active = false;
  const age_min = received_ms != null ? (tMs - received_ms) / 60000 : 0;
  const ready_wait_min = pronto && !saiu && pronto_ms != null ? (tMs - pronto_ms) / 60000 : 0;
  return {
    active,
    received_ms: received_ms || tMs,
    age_min,
    ready_wait_min,
    pronto,
    saiu,
    cancelado,
    alocado,
    motoboy_na_loja
  };
}

function defaultTeamProfiles() {
  return {
    estrutura_forte: {
      simulated: true,
      label: "CAPACIDADE HIPOTÉTICA · estrutura forte",
      equipe: { sushi: 8, conferencia: 6, caixa: 3, quentes: 3, cozinha: 2, motoboy: 4, flutuantes: 1 }
    },
    estrutura_media: {
      simulated: true,
      label: "CAPACIDADE HIPOTÉTICA · intermediária",
      equipe: { sushi: 5, conferencia: 4, caixa: 2, quentes: 2, cozinha: 1, motoboy: 3, flutuantes: 1 }
    },
    estrutura_fraca: {
      simulated: true,
      label: "CAPACIDADE HIPOTÉTICA · reduzida",
      equipe: { sushi: 3, conferencia: 2, caixa: 1, quentes: 1, cozinha: 1, motoboy: 2, flutuantes: 0 }
    }
  };
}

function round3(x) {
  return Math.round(Number(x) * 1000) / 1000;
}

module.exports = {
  replayOrders,
  orderStateAt,
  defaultTeamProfiles
};
