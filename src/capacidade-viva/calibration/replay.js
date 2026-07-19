/* ============================================================================
 * Replay temporal do turno — 1 min (configurável), somente leitura.
 * ==========================================================================*/
"use strict";

const CV = require("../index");
const { stamp } = require("./labels");

/**
 * Constrói série de snapshots por minuto a partir de timelines de pedidos.
 * @param {Map|object} byOrder - order_id → events[]
 * @param {object} opts
 */
function replayOrders(byOrder, opts) {
  const o = opts || {};
  const intervalMin = o.interval_min || 1;
  const config = o.config || CV.loadDefaultConfig();
  const teamProfiles = o.team_profiles || defaultTeamProfiles();
  const teamProfileId = o.team_profile || "estrutura_forte";
  const turno = {
    equipe: teamProfiles[teamProfileId] || teamProfiles.estrutura_forte,
    observacao: `perfil simulado rotulado: ${teamProfileId}`
  };

  // Collect global time range from confirmed timestamps only
  let tMin = null;
  let tMax = null;
  const orderMeta = new Map();

  const iterable = byOrder instanceof Map ? byOrder : new Map(Object.entries(byOrder || {}));
  for (const [oid, events] of iterable) {
    const meta = {
      id: oid,
      events: events.slice().sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp))),
      items: []
    };
    for (const e of events) {
      if (!e.timestamp) continue;
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
    }
    orderMeta.set(oid, meta);
  }

  if (tMin == null || tMax == null) {
    return stamp({ ok: false, error: "no_timestamps", ticks: [] });
  }

  // optional window clip
  if (o.from) tMin = Math.max(tMin, Date.parse(o.from));
  if (o.to) tMax = Math.min(tMax, Date.parse(o.to));

  const stepMs = intervalMin * 60000;
  const ticks = [];
  let alerts = { early: 0, late: 0, critical_turns: 0 };

  for (let t = tMin; t <= tMax; t += stepMs) {
    const iso = new Date(t).toISOString();
    const active = [];
    const ordersForEx = [];
    const itemsByPraca = {};

    for (const meta of orderMeta.values()) {
      const state = orderStateAt(meta.events, t);
      if (!state.active) continue;
      active.push(state);
      const ageMin = (t - state.received_ms) / 60000;
      ordersForEx.push({
        id: meta.id,
        age_min: ageMin,
        wait_min: ageMin,
        pronto: state.pronto && !state.saiu,
        motoboy_esperando: state.motoboy_aguardando,
        allocated_not_picked: state.alocado && !state.saiu && state.pronto,
        courier_waiting: state.motoboy_aguardando
      });
      for (const it of meta.items) {
        if (!it.praca) continue;
        if (!itemsByPraca[it.praca]) itemsByPraca[it.praca] = [];
        itemsByPraca[it.praca].push(
          Object.assign({}, it, {
            urgencia: ageMin > 50 ? 1.8 : ageMin > 35 ? 1.4 : 1
          })
        );
      }
    }

    const por_praca = {};
    for (const [praca, items] of Object.entries(itemsByPraca)) {
      const aged = ordersForEx.filter((o) => o.age_min > 35).length;
      por_praca[praca] = {
        items,
        envelhecimento: Math.min(20, aged * 0.5),
        bloqueios: ordersForEx.filter((o) => o.motoboy_esperando || o.pronto).length
      };
    }

    // if no items mapped, still create empty pracas from active counts (epistemic weak)
    if (!Object.keys(por_praca).length && active.length) {
      por_praca.conferencia = {
        items: active.slice(0, 20).map((a) => ({
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
      orders: ordersForEx,
      confianca: Object.keys(itemsByPraca).length ? "media" : "baixa",
      source: { status: "ready" }
    });

    const iv = av.intervencao;
    const shadow = {
      horario: iso,
      praca: av.isf.praca_critica,
      estado: av.isf.estado_geral,
      sinais: {
        ativos: active.length,
        excecoes: av.excecoes.count,
        isf_critica: av.isf.praca_critica && av.isf.por_praca[av.isf.praca_critica]
          ? av.isf.por_praca[av.isf.praca_critica].isf
          : null
      },
      confianca: av.isf.confidence,
      previsao: null, // opcional — sem série de fila estável por praça em todos os ticks
      menor_intervencao: iv.action,
      pausa_desnecessaria: iv.action === "observar" || iv.action === "preparar_equipe_antes_pico",
      pausa_seletiva_sugerida: iv.action === "pausa_seletiva",
      pausa_geral_sugerida: iv.action === "pausa_geral",
      excecao_critica: av.excecoes.count > 0,
      verificabilidade: "detectavel", // shadow detection only
      labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
      not_counterfactual_proof: true
    };

    if (shadow.estado === "acima_capacidade" || shadow.estado === "proximo_limite") {
      alerts.critical_turns++;
    }
    if (shadow.pausa_seletiva_sugerida || shadow.pausa_geral_sugerida) alerts.early++;

    ticks.push({
      t: iso,
      t_ms: t,
      active_orders: active.length,
      avaliacao: {
        estado_geral: av.isf.estado_geral,
        praca_critica: av.isf.praca_critica,
        mode_hint: av.mode_hint,
        intervencao: iv.action,
        excecoes: av.excecoes.count
      },
      shadow
    });
  }

  return stamp({
    ok: true,
    interval_min: intervalMin,
    from: new Date(tMin).toISOString(),
    to: new Date(tMax).toISOString(),
    ticks,
    n_ticks: ticks.length,
    team_profile: teamProfileId,
    team_profiles_available: Object.keys(teamProfiles),
    alerts_summary: alerts,
    modified_source_data: false
  });
}

function orderStateAt(events, tMs) {
  let received_ms = null;
  let pronto = false;
  let saiu = false;
  let cancelado = false;
  let alocado = false;
  let motoboy_aguardando = false;
  let active = false;

  for (const e of events) {
    if (!e.timestamp) continue;
    const ts = Date.parse(e.timestamp);
    if (!Number.isFinite(ts) || ts > tMs) continue;
    if (e.event_type === "pedido_recebido" || e.event_type === "pedido_aceito") {
      received_ms = received_ms == null ? ts : Math.min(received_ms, ts);
      active = true;
    }
    if (e.event_type === "pedido_pronto") pronto = true;
    if (e.event_type === "saiu_para_entrega" || e.event_type === "entregue") {
      saiu = true;
      active = false;
    }
    if (e.event_type === "cancelado") {
      cancelado = true;
      active = false;
    }
    if (e.event_type === "motoboy_alocado") alocado = true;
    if (e.event_type === "motoboy_aguardando") motoboy_aguardando = true;
  }
  if (cancelado || saiu) active = false;
  if (received_ms == null) active = false;
  return { active, received_ms: received_ms || tMs, pronto, saiu, cancelado, alocado, motoboy_aguardando };
}

function defaultTeamProfiles() {
  return {
    estrutura_forte: {
      sushi: 8,
      conferencia: 6,
      caixa: 3,
      quentes: 3,
      cozinha: 2,
      motoboy: 4,
      flutuantes: 1
    },
    estrutura_media: {
      sushi: 5,
      conferencia: 4,
      caixa: 2,
      quentes: 2,
      cozinha: 1,
      motoboy: 3,
      flutuantes: 1
    },
    estrutura_fraca: {
      sushi: 3,
      conferencia: 2,
      caixa: 1,
      quentes: 1,
      cozinha: 1,
      motoboy: 2,
      flutuantes: 0
    },
    simulated: true,
    note: "Perfis de equipe SIMULADOS e rotulados — sem histórico real de escala"
  };
}

module.exports = {
  replayOrders,
  orderStateAt,
  defaultTeamProfiles
};
