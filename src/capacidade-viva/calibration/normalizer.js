/* ============================================================================
 * Normalização → eventos de pedido para replay (sem inventar).
 * ==========================================================================*/
"use strict";

const { EPISTEMIC, stamp } = require("./labels");
const { enrichEventTimezone, parseBrWallClockToUtcIso } = require("./timezone");

const EVENT_MAP = {
  "ifood.recebido": "pedido_recebido",
  "ifood.aceito": "pedido_aceito",
  "ifood.pronto": "pedido_pronto",
  "ifood.saiu": "saiu_para_entrega",
  "ifood.entregue": "entregue",
  "ifood.cancelado": "cancelado",
  "ifood.problema_pos_entrega": "problema_pos_entrega"
};

/**
 * Normaliza linha de ifood_real.jsonl (Transicao).
 */
function normalizeTransition(row) {
  const tipo = row.tipo_evento || row.tipo;
  const eventType = EVENT_MAP[tipo] || null;
  if (!eventType) {
    return null;
  }
  const payload = row.payload_original || {};
  const base = stamp({
    order_id: row.pedido_id,
    source: row.fonte || "ifood",
    timestamp: row.timestamp,
    timestamp_original: row.timestamp,
    event_type: eventType,
    order_status: row.estado_novo || payload["STATUS FINAL DO PEDIDO"] || null,
    item_id: null,
    item_name: null,
    quantity: null,
    praca: null,
    confidence: row.confianca === "alta" || row.confianca === "high" ? "alta" : "media",
    confirmed: true,
    epistemic: EPISTEMIC.CONFIRMADO,
    explanation: `Evento explícito ${tipo} no log Camada 0`,
    raw_type: tipo,
    // timing fields when present on payload (confirmados se numéricos)
    timing: extractTiming(payload)
  });
  return enrichEventTimezone(base, "ifood_real_jsonl");
}

function extractTiming(payload) {
  const t = {};
  const map = {
    preparo_min: "TEMPO DE PREPARO DO PEDIDO (MIN)",
    alocacao_entregador_min: "TEMPO DE ALOCAÇÃO DO ENTREGADOR (MIN)",
    pronto_btn_min: "TEMPO DE ACIONAMENTO DO BOTÃO PRONTO (MIN)",
    entregador_caminho_loja_min: "TEMPO DO ENTREGADOR À CAMINHO DA LOJA (MIN)",
    entregador_espera_loja_min: "TEMPO DO ENTREGADOR ESPERANDO NA LOJA (MIN)",
    entregador_caminho_cliente_min: "TEMPO DO ENTREGADOR À CAMINHO DO CLIENTE (MIN)",
    prometido_entrega_min: "TEMPO PROMETIDO DE ENTREGA (MIN)",
    entrega_realizada_min: "TEMPO DA ENTREGA REALIZADA (MIN)",
    atraso_vs_prometido_min: "TEMPO DE ATRASO EM RELAÇÃO AO TEMPO PROMETIDO DE ENTREGA (MIN)"
  };
  for (const [k, col] of Object.entries(map)) {
    const v = payload[col];
    if (v === "" || v == null) {
      t[k] = { value: null, epistemic: EPISTEMIC.AUSENTE };
    } else {
      const n = Number(String(v).replace(",", "."));
      t[k] = {
        value: Number.isFinite(n) ? n : null,
        epistemic: Number.isFinite(n) ? EPISTEMIC.CONFIRMADO : EPISTEMIC.AUSENTE,
        source_field: col
      };
    }
  }
  return t;
}

/**
 * Eventos derivados de timing (inferência) — nunca como fato se fraco.
 * Só gera se temos minutos numéricos e timestamp de aceite/recebido.
 */
function deriveTimingInferences(orderTimeline) {
  const events = [];
  const byType = {};
  for (const e of orderTimeline) byType[e.event_type] = e;
  const base = byType.pedido_recebido || byType.pedido_aceito;
  if (!base || !base.timestamp) return events;
  const t0 = Date.parse(base.timestamp);
  if (!Number.isFinite(t0)) return events;
  const timing = base.timing || (byType.pedido_pronto && byType.pedido_pronto.timing) || {};

  // motoboy NA LOJA: só com campo explícito de espera — limiar configurável (default 5, provisório)
  const limLoja = 5;
  const espera = timing.entregador_espera_loja_min;
  if (espera && espera.epistemic === EPISTEMIC.CONFIRMADO && espera.value != null && espera.value >= limLoja) {
    const pronto = byType.pedido_pronto;
    if (pronto) {
      events.push(
        enrichEventTimezone(
          stamp({
            order_id: base.order_id,
            source: "calibration.inference",
            timestamp: pronto.timestamp,
            timestamp_original: pronto.timestamp,
            event_type: "motoboy_na_loja",
            order_status: null,
            confidence: "alta",
            confirmed: false,
            epistemic: EPISTEMIC.INFERIDO_ALTA,
            courier_wait_store_min: espera.value,
            explanation: `Campo TEMPO DO ENTREGADOR ESPERANDO NA LOJA=${espera.value} min ≥ ${limLoja} (provisório)`
          }),
          "ifood_real_jsonl"
        )
      );
    }
  }

  // alocado: se alocação_entregador presente — NÃO implica "esperando na loja"
  const aloc = timing.alocacao_entregador_min;
  if (aloc && aloc.epistemic === EPISTEMIC.CONFIRMADO && aloc.value != null) {
    const ts = new Date(t0 + aloc.value * 60000).toISOString();
    events.push(
      enrichEventTimezone(
        stamp({
          order_id: base.order_id,
          source: "calibration.inference",
          timestamp: ts,
          timestamp_original: ts,
          event_type: "motoboy_alocado",
          confidence: "media",
          confirmed: false,
          epistemic: EPISTEMIC.INFERIDO_ALTA,
          explanation: `Tempo de alocação do entregador=${aloc.value} min desde o pedido (não prova presença na loja)`
        }),
        "ifood_real_jsonl"
      )
    );
  }

  // caminho da loja — alocado ainda distante (sinal, não exceção crítica)
  const cam = timing.entregador_caminho_loja_min;
  if (cam && cam.epistemic === EPISTEMIC.CONFIRMADO && cam.value != null && cam.value >= 8) {
    const pronto = byType.pedido_pronto;
    if (pronto) {
      events.push(
        enrichEventTimezone(
          stamp({
            order_id: base.order_id,
            source: "calibration.inference",
            timestamp: pronto.timestamp,
            event_type: "entregador_caminho_loja",
            confidence: "media",
            confirmed: false,
            epistemic: EPISTEMIC.INFERIDO_ALTA,
            explanation: `Entregador à caminho da loja ${cam.value} min — distante, não "esperando"`
          }),
          "ifood_real_jsonl"
        )
      );
    }
  }

  return events;
}

/**
 * Item lines → eventos de item (praça via catálogo se disponível).
 */
function normalizeItemLine(row, catalogByName) {
  const name = row.item_nome || row.nome;
  const cat = catalogByName && name ? catalogByName[normalizeName(name)] : null;
  let epistemic = EPISTEMIC.CONFIRMADO;
  let praca = null;
  let conf = "alta";
  if (cat && cat.praca) {
    praca = cat.praca;
    epistemic = EPISTEMIC.CONFIRMADO;
  } else {
    praca = null;
    epistemic = EPISTEMIC.AUSENTE;
    conf = "baixa";
  }
  // parse BR datetime as America/Sao_Paulo wall clock (não silencioso)
  const parsed = parseBrWallClockToUtcIso(row.data_hora);
  const ts = parsed.ok ? parsed.timestamp_utc : null;
  const base = stamp({
    order_id: row.pedido_id,
    source: row.origem || "itens_jsonl",
    timestamp: ts,
    timestamp_original: row.data_hora,
    event_type: "item_atribuido_praca",
    order_status: row.status || null,
    item_id: cat && cat.id ? cat.id : null,
    item_name: name,
    quantity: Number(row.quantidade) || 1,
    praca,
    confidence: conf,
    confirmed: !!name,
    epistemic,
    explanation: cat
      ? `Item casado com cardápio seed → praça ${praca}`
      : "Item sem casamento no cardápio — praça ausente",
    complexity: cat && cat.complexidade ? cat.complexidade : null,
    complexity_epistemic: cat && cat.complexidade_epistemic,
    timezone_parse: parsed.ok
      ? { timezone: "America/Sao_Paulo", conversion: "BR wall → UTC", silent: false }
      : { error: parsed.error }
  });
  return ts ? enrichEventTimezone(base, "itens_jsonl") : base;
}

function parseBrDateTime(s) {
  const p = parseBrWallClockToUtcIso(s);
  return p.ok ? p.timestamp_utc : null;
}

function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Agrupa e ordena eventos por pedido; detecta fora de ordem / duplicatas.
 */
function buildOrderTimelines(events) {
  const byOrder = new Map();
  for (const e of events) {
    if (!e || !e.order_id) continue;
    if (!byOrder.has(e.order_id)) byOrder.set(e.order_id, []);
    byOrder.get(e.order_id).push(e);
  }
  const quality = {
    out_of_order: 0,
    duplicate_event_keys: 0,
    orders: byOrder.size
  };
  for (const [id, list] of byOrder) {
    list.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    // check monotonic status chain where possible
    const seen = new Set();
    for (const e of list) {
      const k = e.event_type + "|" + e.timestamp;
      if (seen.has(k)) quality.duplicate_event_keys++;
      seen.add(k);
    }
    const idx = {};
    list.forEach((e, i) => {
      idx[e.event_type] = i;
    });
    if (idx.pedido_pronto != null && idx.pedido_recebido != null && idx.pedido_pronto < idx.pedido_recebido) {
      quality.out_of_order++;
    }
    if (idx.saiu_para_entrega != null && idx.pedido_pronto != null && idx.saiu_para_entrega < idx.pedido_pronto) {
      quality.out_of_order++;
    }
  }
  return stamp({ byOrder, quality });
}

module.exports = {
  normalizeTransition,
  normalizeItemLine,
  deriveTimingInferences,
  buildOrderTimelines,
  parseBrDateTime,
  normalizeName,
  EVENT_MAP,
  EPISTEMIC
};
