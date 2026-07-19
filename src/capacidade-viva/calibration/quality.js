/* ============================================================================
 * Relatório de qualidade dos dados — sem inventar.
 * ==========================================================================*/
"use strict";

const { EPISTEMIC, stamp } = require("./labels");

function analyzeTransitions(rows) {
  const types = {};
  let minT = null;
  let maxT = null;
  const orders = new Set();
  let missingTs = 0;
  let missingOrder = 0;
  for (const r of rows) {
    const t = r.tipo_evento || "?";
    types[t] = (types[t] || 0) + 1;
    if (r.pedido_id) orders.add(r.pedido_id);
    else missingOrder++;
    if (!r.timestamp) missingTs++;
    else {
      if (!minT || r.timestamp < minT) minT = r.timestamp;
      if (!maxT || r.timestamp > maxT) maxT = r.timestamp;
    }
  }
  return stamp({
    source_kind: "real",
    records: rows.length,
    unique_orders: orders.size,
    period: { min: minT, max: maxT },
    event_types: types,
    missing_timestamp: missingTs,
    missing_order_id: missingOrder,
    fields_confirmed: [
      "pedido_id",
      "timestamp",
      "tipo_evento",
      "fonte",
      "estado_novo",
      "payload_original (subset iFood)"
    ],
    fields_inferred: [
      "motoboy_aguardando (via tempo espera loja)",
      "motoboy_alocado (via tempo alocação)"
    ],
    fields_absent: [
      "item_id no evento de fluxo",
      "praca no evento de fluxo",
      "equipe por turno",
      "comanda física",
      "histórico 6 meses completo"
    ],
    pii_risk: "payload pode conter nome de loja; sem CPF/telefone no schema observado — ainda assim tratar com cuidado",
    timezone: "timestamps ISO Z no log; payload em horário local BR"
  });
}

function analyzeItems(rows) {
  const orders = new Set();
  let minD = null;
  let maxD = null;
  let noName = 0;
  const status = {};
  for (const r of rows) {
    if (r.pedido_id) orders.add(r.pedido_id);
    if (!r.item_nome) noName++;
    status[r.status || "?"] = (status[r.status || "?"] || 0) + 1;
    if (r.data_hora) {
      if (!minD || r.data_hora < minD) minD = r.data_hora;
      if (!maxD || r.data_hora > maxD) maxD = r.data_hora;
    }
  }
  return stamp({
    source_kind: "real_hybrid_parser",
    records: rows.length,
    unique_orders: orders.size,
    period_br: { min: minD, max: maxD },
    status,
    missing_item_name: noName,
    fields_confirmed: ["pedido_id", "item_nome", "quantidade", "data_hora", "status", "origem"],
    fields_inferred: ["praca via cardápio seed", "complexidade via regras+cardápio"],
    fields_absent: ["preço item (nulo no export)", "praca nativa no arquivo de itens"],
    confidence_parser: "alta no parser; casamento de praça depende do seed"
  });
}

function classifySignal(level) {
  const ok = [EPISTEMIC.CONFIRMADO, EPISTEMIC.INFERIDO_ALTA, EPISTEMIC.INFERIDO_BAIXA, EPISTEMIC.AUSENTE];
  if (ok.indexOf(level) < 0) throw new Error("invalid_epistemic");
  return level;
}

module.exports = {
  analyzeTransitions,
  analyzeItems,
  classifySignal,
  EPISTEMIC
};
