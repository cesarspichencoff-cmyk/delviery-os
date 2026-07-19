/* ============================================================================
 * Intervenção com gates para pausa seletiva/geral.
 * ==========================================================================*/
"use strict";

const { stamp } = require("./labels");

const ORDER = [
  "observar",
  "preparar_equipe_antes_pico",
  "priorizar_pedidos_especificos",
  "finalizar_pedidos_motoboy_esperando",
  "verificar_pedido_ja_saiu",
  "chamar_ou_cobrar_motoboy",
  "reorganizar_prioridade_praca",
  "apoio_local",
  "pausa_seletiva",
  "pausa_geral"
];

/**
 * @param {object} input
 * @param {object} input.isf
 * @param {object} input.tick_class
 * @param {object} input.config
 * @param {boolean} input.trend_up
 * @param {string} input.confidence
 */
function sugerirMenorIntervencaoSane(input) {
  const isf = input.isf || {};
  const tc = input.tick_class || {};
  const conf = input.confidence || isf.confidence || "media";
  const crit = isf.praca_critica && isf.por_praca ? isf.por_praca[isf.praca_critica] : null;
  const evaluated = [];

  function consider(action, ok, why) {
    evaluated.push({ action, ok: !!ok, why });
    return ok;
  }

  if (isf.insufficient_data || conf === "baixa") {
    return result("observar", {
      reason: "Não tenho leitura suficiente para recomendar.",
      confidence: "baixa",
      evaluated
    });
  }

  // Exceções concretas primeiro
  const critTypes = (tc.critical_items || []).map((x) => x.type);
  if (critTypes.indexOf("comanda_ausente") >= 0) {
    return result("verificar_pedido_ja_saiu", {
      reason: "Exceção: possível comanda/estado a investigar",
      evaluated,
      exceptions: tc.critical_items
    });
  }
  if (critTypes.indexOf("motoboy_na_loja") >= 0 || critTypes.indexOf("pronto_sem_saida_excessivo") >= 0) {
    return result("finalizar_pedidos_motoboy_esperando", {
      reason: "Exceção logística concreta (motoboy na loja ou pronto sem saída excessivo)",
      evaluated,
      exceptions: tc.critical_items
    });
  }
  if (critTypes.indexOf("entregador_alocado_sem_retirada") >= 0) {
    return result("chamar_ou_cobrar_motoboy", {
      reason: "Entregador alocado sem retirada além do limiar",
      evaluated,
      exceptions: tc.critical_items
    });
  }

  if (!crit || crit.estado === "controlavel") {
    if (tc.has_attention) {
      return result("priorizar_pedidos_especificos", {
        reason: "Atenção operacional sem praça acima da capacidade",
        evaluated
      });
    }
    return result("observar", { reason: "Operação controlável / só sinais contínuos", evaluated });
  }

  if (crit.estado === "atencao") {
    consider("observar", false, "há perda de margem");
    return result("priorizar_pedidos_especificos", {
      reason: `Praça ${crit.praca} em atenção`,
      praca: crit.praca,
      evaluated
    });
  }

  if (crit.estado === "proximo_limite") {
    consider("priorizar_pedidos_especificos", true, "avaliada primeiro");
    return result("reorganizar_prioridade_praca", {
      reason: `Praça ${crit.praca} próxima do limite — reorganizar antes de pausar`,
      praca: crit.praca,
      evaluated
    });
  }

  // acima da capacidade — pausa seletiva só com gates
  const gatesSel = {
    trend_up: !!input.trend_up,
    confidence_ok: conf === "alta" || conf === "media",
    localized: !!crit.praca,
    minor_insufficient: true, // já passou de reorganizar conceitualmente
    expected_persist: crit.isf != null && crit.isf > 1.05
  };
  const selOk =
    gatesSel.trend_up && gatesSel.confidence_ok && gatesSel.localized && gatesSel.expected_persist;

  consider("reorganizar_prioridade_praca", false, "ISF acima da capacidade");
  consider("apoio_local", false, "sem evidência de apoio disponível no dado");
  consider("pausa_seletiva", selOk, JSON.stringify(gatesSel));

  if (selOk) {
    return result("pausa_seletiva", {
      reason: "Gates de pausa seletiva satisfeitos (tendência + localização + confiança)",
      praca: crit.praca,
      gates: gatesSel,
      evaluated,
      requires_human_confirmation: true,
      auto_apply: false
    });
  }

  // sem gates → ainda não pausar
  return result("apoio_local", {
    reason: "Acima da capacidade estimada, mas gates de pausa seletiva incompletos — intervenção menor",
    praca: crit.praca,
    gates: gatesSel,
    evaluated,
    requires_human_confirmation: true
  });
}

function result(action, extra) {
  const e = extra || {};
  return stamp({
    action,
    label: action,
    reason: e.reason || "",
    praca: e.praca || null,
    confidence: e.confidence || "media",
    auto_apply: false,
    requires_human_confirmation: e.requires_human_confirmation !== false,
    alternatives_evaluated: e.evaluated || [],
    gates: e.gates || null,
    exceptions: e.exceptions || [],
    principle: "menor_intervencao",
    not_employee_evaluation: true
  });
}

module.exports = { sugerirMenorIntervencaoSane, ORDER };
