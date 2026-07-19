/* ============================================================================
 * Menor intervenção necessária — pausa geral é última alternativa.
 * Nunca aplica pausa automaticamente.
 * ==========================================================================*/
"use strict";

const ORDER = [
  "observar",
  "preparar_equipe_antes_pico",
  "priorizar_pedidos_especificos",
  "finalizar_pedidos_motoboy_esperando",
  "verificar_comanda_ausente",
  "verificar_pedido_ja_saiu",
  "chamar_ou_cobrar_motoboy",
  "reorganizar_prioridade_praca",
  "apoio_local",
  "pausa_seletiva",
  "pausa_geral"
];

const LABELS = {
  observar: "Observar",
  preparar_equipe_antes_pico: "Preparar equipe antes do pico",
  priorizar_pedidos_especificos: "Priorizar pedidos específicos",
  finalizar_pedidos_motoboy_esperando: "Finalizar pedidos com motoboy esperando",
  verificar_comanda_ausente: "Verificar possível comanda ausente",
  verificar_pedido_ja_saiu: "Verificar se o pedido já saiu",
  chamar_ou_cobrar_motoboy: "Chamar ou cobrar motoboy",
  reorganizar_prioridade_praca: "Reorganizar prioridade da praça",
  apoio_local: "Apoio local",
  pausa_seletiva: "Pausa seletiva por praça ou grupo de itens",
  pausa_geral: "Pausa geral"
};

/**
 * @param {object} input
 * @param {object} input.isf - saída de calcularISF
 * @param {object} input.excecoes - saída de detectarExcecoes
 * @param {object} input.config
 */
function sugerirMenorIntervencao(input) {
  const cfg = (input && input.config) || {};
  const pausa = cfg.pausa || {};
  const isf = (input && input.isf) || {};
  const ex = ((input && input.excecoes) || {}).items || [];
  const conf = isf.confidence || "media";

  if (isf.insufficient_data || conf === "baixa" && Object.keys(isf.por_praca || {}).length === 0) {
    return result("observar", {
      reason: "Não tenho leitura suficiente para recomendar.",
      confidence: "baixa",
      human_decision_required: true
    });
  }

  // Exceções específicas primeiro (menor e mais cirúrgica)
  if (ex.some((e) => e.type === "comanda_ausente")) {
    return result("verificar_comanda_ausente", { reason: "Exceção: possível comanda ausente", exceptions: ex });
  }
  if (ex.some((e) => e.type === "motoboy_esperando" || e.type === "pronto_parado")) {
    return result("finalizar_pedidos_motoboy_esperando", {
      reason: "Exceção: pronto parado / motoboy esperando",
      exceptions: ex
    });
  }
  if (ex.some((e) => e.type === "entregador_alocado_sem_retirada")) {
    return result("chamar_ou_cobrar_motoboy", {
      reason: "Exceção: entregador alocado sem retirada",
      exceptions: ex
    });
  }
  if (ex.some((e) => e.type === "fonte_parcial" || e.type === "fonte_atrasada" || e.type === "fonte_falha")) {
    return result("observar", {
      reason: "Estado técnico da fonte — não fabricar pressão operacional",
      exceptions: ex,
      technical: true
    });
  }

  const crit = isf.praca_critica && isf.por_praca ? isf.por_praca[isf.praca_critica] : null;
  if (!crit || crit.estado === "controlavel") {
    // preparação de pico se contexto
    const tags = (isf.temporal && isf.temporal.tags) || [];
    if (tags.indexOf("preparacao_pico") >= 0) {
      return result("preparar_equipe_antes_pico", { reason: "Janela de preparação antes do pico" });
    }
    return result("observar", { reason: "Operação controlável na leitura atual" });
  }

  if (crit.estado === "atencao") {
    return result("priorizar_pedidos_especificos", {
      reason: `Praça ${crit.praca} em atenção`,
      praca: crit.praca
    });
  }

  if (crit.estado === "proximo_limite") {
    return result("reorganizar_prioridade_praca", {
      reason: `Praça ${crit.praca} próxima do limite`,
      praca: crit.praca,
      next_if_fails: "apoio_local"
    });
  }

  // acima da capacidade
  if (pausa.seletiva_antes_geral !== false) {
    return result("pausa_seletiva", {
      reason: `Praça ${crit.praca} acima da capacidade estimada — pausa seletiva antes da geral`,
      praca: crit.praca,
      auto_apply: false,
      requires_human_confirmation: true,
      next_if_fails: "pausa_geral"
    });
  }

  return result("pausa_geral", {
    reason: "Última alternativa configurada — requer confirmação humana",
    auto_apply: false,
    requires_human_confirmation: true
  });
}

function result(action, extra) {
  const e = extra || {};
  return {
    action,
    label: LABELS[action] || action,
    severity_order: ORDER.indexOf(action),
    reason: e.reason || "",
    praca: e.praca || null,
    exceptions: e.exceptions || [],
    confidence: e.confidence || "media",
    auto_apply: false, // SEMPRE false
    requires_human_confirmation: e.requires_human_confirmation !== false,
    technical: !!e.technical,
    next_if_fails: e.next_if_fails || null,
    principle: "menor_intervencao_capaz_de_recuperar_fluxo",
    not_employee_evaluation: true,
    explanation: e.reason || LABELS[action] || action
  };
}

module.exports = { sugerirMenorIntervencao, ORDER, LABELS };
