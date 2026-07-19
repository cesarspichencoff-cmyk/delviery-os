/* ============================================================================
 * Exceções críticas — atenção mesmo com volume saudável.
 * Separadas de pressão contínua.
 * ==========================================================================*/
"use strict";

/**
 * @param {object} input
 * @param {Array} input.orders
 * @param {object} input.config
 * @param {object} [input.source] - { status, partial, delayed }
 */
function detectarExcecoes(input) {
  const cfg = (input && input.config) || {};
  const atras = (cfg.atraso) || {};
  const orders = (input && input.orders) || [];
  const source = (input && input.source) || {};
  const out = [];

  for (const o of orders) {
    const age = Number(o.age_min != null ? o.age_min : o.wait_min) || 0;
    const id = o.id || o.order_id || "?";

    if (o.comanda_ausente || o.possible_missing_ticket) {
      out.push(ex("comanda_ausente", id, "Possível comanda ausente", "alta", o));
    }
    if (o.pronto && age >= (atras.pronto_parado_min || 8)) {
      out.push(ex("pronto_parado", id, "Pedido pronto parado", "alta", o));
    }
    if (o.motoboy_esperando || o.courier_waiting) {
      out.push(ex("motoboy_esperando", id, "Motoboy esperando na loja", "alta", o));
    }
    if (o.entregador_alocado_sem_retirada || o.allocated_not_picked) {
      out.push(ex("entregador_alocado_sem_retirada", id, "Entregador alocado sem retirada", "media", o));
    }
    if (o.sem_avanco || o.stalled) {
      out.push(ex("sem_avanco", id, "Pedido sem avanço compatível", "media", o));
    }
    if (o.volume_incompleto || o.volume_incomplete) {
      out.push(ex("volume_incompleto", id, "Volume incompleto", "media", o));
    }
    if (age >= (atras.atrasado_min || 50)) {
      out.push(ex("pedido_atrasado", id, "Pedido atrasado", "alta", o));
    } else if (age >= (atras.proximo_atrasar_min || 35)) {
      out.push(ex("proximo_atrasar", id, "Pedido próximo de atrasar", "media", o));
    }
  }

  if (source.partial || source.status === "degraded") {
    out.push(ex("fonte_parcial", null, "Fonte de dados parcial", "media", { source }));
  }
  if (source.delayed || source.status === "stale") {
    out.push(ex("fonte_atrasada", null, "Fonte de dados atrasada", "media", { source }));
  }
  if (source.status === "failed" || source.status === "disconnected") {
    out.push(ex("fonte_falha", null, "Falha ou perda de conexão na fonte", "alta", { source }));
  }

  // congestionamento por complexidade (sinal explícito)
  if (input.praca_congestionada_complexa) {
    out.push(
      ex(
        "praca_complexa",
        null,
        "Praça congestionada por itens complexos",
        "media",
        { praca: input.praca_congestionada_complexa }
      )
    );
  }

  return {
    kind: "excecao_critica",
    items: out,
    count: out.length,
    // separação explícita de pressão contínua
    not_continuous_pressure: true
  };
}

function ex(type, orderId, title, confidence, payload) {
  return {
    type,
    order_id: orderId,
    title,
    confidence,
    payload,
    requires_investigation: true,
    not_person_blame: true,
    explanation: title + (orderId ? ` · pedido ${orderId}` : "")
  };
}

module.exports = { detectarExcecoes };
