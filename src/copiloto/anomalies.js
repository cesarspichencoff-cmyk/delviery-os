/**
 * Detecção de anomalias — situações incomuns sem limite fixo.
 * Nunca vira acusação de pessoa.
 */
"use strict";

function detectAnomalies(snapshot) {
  const s = snapshot || {};
  const areas = s.areas || {};
  const orders = s.orders || [];
  const out = [];

  // 1) Tempo piorando sem aumento de volume
  for (const [id, a] of Object.entries(areas)) {
    if (a.volume_trend === "stable" || a.volume_trend === "down") {
      if (a.dwell_trend === "worsening" && (a.median_dwell_min || 0) > (a.baseline_dwell || 0) * 1.2) {
        out.push(anomaly({
          id: `dwell_up_volume_flat_${id}`,
          area: id,
          title: "Tempo piorando sem mais volume",
          what_changed: `Tempo mediano em ${a.label || id} subiu com volume estável/baixo`,
          comparison: `dwell ${a.median_dwell_min} vs baseline ${a.baseline_dwell}; volume ${a.volume_trend}`,
          evidence: [
            { k: "median_dwell_min", v: a.median_dwell_min },
            { k: "baseline_dwell", v: a.baseline_dwell },
            { k: "volume_trend", v: a.volume_trend }
          ],
          hypothesis: "Gargalo de processo, item complexo ou capacidade reduzida (não atribuído a pessoa)",
          alternative: "Dado de tempo com atraso de fonte ou composição atípica",
          confidence: a.confidence || "media",
          verify_action: `Checar 2-3 pedidos abertos em ${a.label || id} e se a fonte de tempo está fresca`
        }));
      }
    }
  }

  // 2) Quentes se afastando do ritmo do Sushi
  if (areas.sushi && areas.quentes) {
    const sq = areas.sushi.queue_depth || 0;
    const qq = areas.quentes.queue_depth || 0;
    if (sq >= 3 && qq > sq * 1.5) {
      out.push(anomaly({
        id: "quentes_desync_sushi",
        area: "quentes",
        title: "Quentes descolado do ritmo do Sushi",
        what_changed: "Fila de Quentes bem acima do Sushi no mesmo momento",
        comparison: `Quentes ${qq} vs Sushi ${sq}`,
        evidence: [{ k: "quentes_queue", v: qq }, { k: "sushi_queue", v: sq }],
        hypothesis: "Pedidos com mais itens quentes ou bancada de quentes mais lenta que o usual",
        alternative: "Subcontagem de Sushi por classificação de praça",
        confidence: "media",
        verify_action: "Comparar composição dos últimos 5 pedidos e carga da bancada de quentes"
      }));
    }
  }

  // 3) Conferência acumulando com produção estável
  if (areas.conferencia && areas.sushi) {
    const cq = areas.conferencia.queue_depth || 0;
    const sushiStable = areas.sushi.trend === "stable" || areas.sushi.pressure_level === "normal";
    if (cq >= 5 && sushiStable) {
      out.push(anomaly({
        id: "conference_buildup_stable_prod",
        area: "conferencia",
        title: "Conferência acumulando com produção estável",
        what_changed: "Pedidos prontos/em conferência sobem sem pressão de produção",
        comparison: `Conferência ${cq}; produção estável`,
        evidence: [{ k: "conference_queue", v: cq }, { k: "sushi_level", v: areas.sushi.pressure_level }],
        hypothesis: "Gargalo de montagem/conferência ou espera de motoboy refletida como fila de conferência",
        alternative: "Marca de 'pronto' atrasada ou pedidos grandes concentrados",
        confidence: "media",
        verify_action: "Ver se os pedidos em conferência já têm motoboy e se há 2ª sacola/obs"
      }));
    }
  }

  // 4) Pedidos pequenos mais lentos que grandes
  const small = orders.filter((o) => (o.item_count || 0) <= 2 && o.wait_min != null);
  const large = orders.filter((o) => (o.item_count || 0) >= 6 && o.wait_min != null);
  if (small.length >= 3 && large.length >= 2) {
    const avgS = avg(small.map((o) => o.wait_min));
    const avgL = avg(large.map((o) => o.wait_min));
    if (avgS > avgL * 1.25) {
      out.push(anomaly({
        id: "small_orders_slower",
        area: null,
        title: "Pedidos pequenos mais lentos que grandes",
        what_changed: "Tempo médio de pedidos pequenos superou o de pedidos grandes",
        comparison: `pequenos ${round1(avgS)} min vs grandes ${round1(avgL)} min`,
        evidence: [{ k: "avg_small", v: round1(avgS) }, { k: "avg_large", v: round1(avgL) }],
        hypothesis: "Fila compartilhada priorizando combos; ou batching de produção",
        alternative: "Amostra pequena ou IDs com composição incompleta",
        confidence: small.length >= 5 ? "media" : "baixa",
        verify_action: "Abrir 3 pedidos pequenos antigos e ver se estão parados em uma praça só"
      }));
    }
  }

  // 5) Motoboys disponíveis sem saída
  if (areas.motoboy) {
    const ready = areas.motoboy.ready_orders || s.ready_without_courier || 0;
    const couriers = areas.motoboy.available_couriers;
    if (typeof couriers === "number" && couriers > 0 && ready >= 3) {
      out.push(anomaly({
        id: "couriers_idle_orders_ready",
        area: "motoboy",
        title: "Motoboy disponível e pedidos prontos parados",
        what_changed: "Há entregadores e pedidos prontos sem saída",
        comparison: `${couriers} motoboy(s) · ${ready} prontos`,
        evidence: [{ k: "available_couriers", v: couriers }, { k: "ready", v: ready }],
        hypothesis: "Atribuição manual atrasada, agrupamento de rota ou pedido aguardando item",
        alternative: "Sinal de disponibilidade de motoboy desatualizado",
        confidence: "media",
        verify_action: "Conferir saída dos 2 prontos mais antigos e status de atribuição"
      }));
    }
  }

  // 6) Tipo de pedido concentrando atraso
  const byType = {};
  for (const o of orders) {
    if (o.delay_min == null || o.delay_min <= 0) continue;
    const t = o.order_type || o.complexity || "unknown";
    if (!byType[t]) byType[t] = [];
    byType[t].push(o.delay_min);
  }
  for (const [t, delays] of Object.entries(byType)) {
    if (delays.length >= 3 && avg(delays) > 10) {
      out.push(anomaly({
        id: `type_delay_${t}`,
        area: null,
        title: `Atraso concentrado em pedidos ${t}`,
        what_changed: `Pedidos do tipo ${t} concentram atraso`,
        comparison: `${delays.length} pedidos · média ${round1(avg(delays))} min de atraso`,
        evidence: [{ k: "type", v: t }, { k: "n", v: delays.length }, { k: "avg_delay", v: round1(avg(delays)) }],
        hypothesis: "Complexidade ou praça dominante desse tipo sob pressão",
        alternative: "Classificação de tipo incompleta",
        confidence: "media",
        verify_action: `Olhar composição de 2 pedidos ${t} atrasados`
      }));
    }
  }

  // 7) Fontes incompatíveis
  if (s.source_mismatch) {
    out.push(anomaly({
      id: "source_mismatch",
      area: null,
      title: "Fontes de dados incompatíveis",
      what_changed: "Duas fontes descrevem estados diferentes para o mesmo recorte",
      comparison: s.source_mismatch.detail || "mismatch detectado",
      evidence: s.source_mismatch.evidence || [],
      hypothesis: "Atraso de sincronização ou ID curto ambíguo",
      alternative: "Relógio dessincronizado entre fontes",
      confidence: "alta",
      verify_action: "Não agir na operação; validar freshness e IDs antes de qualquer Foco",
      kind: "technical"
    }));
  }

  // 8) Dado stale / técnico
  if (s.technical_state === "degraded" || s.technical_state === "failed") {
    out.push(anomaly({
      id: "technical_degraded",
      area: null,
      title: "Qualidade técnica da leitura comprometida",
      what_changed: `Estado técnico: ${s.technical_state}`,
      comparison: s.technical_detail || "freshness ou completude abaixo do aceitável",
      evidence: [{ k: "technical_state", v: s.technical_state }],
      hypothesis: "Desconexão, atraso de evento ou parse incompleto",
      alternative: "Janela de silêncio real da operação (improvável se volume > 0)",
      confidence: "alta",
      verify_action: "Checar conexão das fontes e último evento recebido",
      kind: "technical"
    }));
  }

  return out;
}

function anomaly(fields) {
  return {
    anomaly_id: fields.id,
    kind: fields.kind || "operational",
    area: fields.area,
    title: fields.title,
    what_changed: fields.what_changed,
    comparison: fields.comparison,
    evidence: fields.evidence || [],
    hypothesis: fields.hypothesis,
    alternative_explanation: fields.alternative,
    confidence: fields.confidence,
    verify_action: fields.verify_action,
    // proibições
    not_a_person_judgment: true,
    epistemic: "hypothesis"
  };
}

function avg(a) {
  return a.reduce((x, y) => x + y, 0) / a.length;
}
function round1(x) {
  return Math.round(x * 10) / 10;
}

module.exports = { detectAnomalies };
