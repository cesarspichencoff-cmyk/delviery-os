/* ============================================================================
 * Carga ponderada por praça — sem precisão falsa.
 * carga ≈ quantidade × complexidade × urgência × concentração × dependências
 * ==========================================================================*/
"use strict";

const { classifyItem } = require("./complexidade");

/**
 * @param {object} input
 * @param {Array} input.items - itens da comanda/fila da praça
 * @param {object} input.config
 * @param {object} [input.urgency_by_order] - order_id → 1..2
 */
function cargaPonderadaPraca(input) {
  const cfg = (input && input.config) || {};
  const pesos = (cfg.pesos_carga) || {};
  const wQ = pesos.quantidade != null ? pesos.quantidade : 1;
  const wC = pesos.complexidade != null ? pesos.complexidade : 1;
  const wU = pesos.urgencia != null ? pesos.urgencia : 1;
  const wK = pesos.concentracao != null ? pesos.concentracao : 1;
  const wD = pesos.dependencias != null ? pesos.dependencias : 1;

  const items = (input && input.items) || [];
  const components = [];
  let total = 0;

  for (const raw of items) {
    const it = classifyItem(raw, cfg);
    const qtd = Number(raw.quantidade != null ? raw.quantidade : raw.qty != null ? raw.qty : 1) || 1;
    const urg = Number(
      (input.urgency_by_order && raw.order_id && input.urgency_by_order[raw.order_id]) ||
        raw.urgencia ||
        1
    );
    const conc = Number(it.concentracao) || 1;
    const dep = 1 + 0.15 * (it.dependencias || []).length;
    const piece = qtd * wQ * (it.peso * wC) * (urg * wU) * (conc * wK) * (dep * wD);
    total += piece;
    components.push({
      item_id: it.item_id,
      praca: it.praca,
      quantidade: qtd,
      complexidade: it.complexidade,
      peso_complexidade: it.peso,
      urgencia: urg,
      concentracao: conc,
      dependencias: (it.dependencias || []).length,
      contribuicao: round2(piece),
      explanation: it.explanation
    });
  }

  return {
    carga: round2(total),
    n_itens: items.length,
    components,
    formula: "qtd × complexidade × urgência × concentração × dependências (pesos config)",
    epistemic: "inference",
    false_precision: false,
    note: "Valor relativo para comparação — não é score de ranking"
  };
}

function round2(x) {
  return Math.round(Number(x) * 100) / 100;
}

module.exports = { cargaPonderadaPraca, round2 };
