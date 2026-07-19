/* ============================================================================
 * Recuperação líquida — avalia recomendação/operação/contexto, NÃO funcionários.
 * ==========================================================================*/
"use strict";

const OUTCOMES = [
  "recuperacao_liquida",
  "melhora_parcial",
  "sem_resultado",
  "deslocou_problema",
  "dados_insuficientes",
  "acao_nao_executada"
];

/**
 * @param {object} input
 * @param {object} input.before - snapshot ISF/sinais antes
 * @param {object} input.after - depois
 * @param {object} input.config
 * @param {boolean} [input.executed]
 * @param {number} [input.elapsed_min]
 */
function classificarRecuperacao(input) {
  const cfg = ((input && input.config) || {}).recuperacao || {};
  const executed = input.executed !== false;
  if (!executed) {
    return outcome("acao_nao_executada", "Ação não executada", input);
  }
  if (!input.before || !input.after) {
    return outcome("dados_insuficientes", "Sem antes/depois confiáveis", input);
  }
  if (input.after.insufficient_data || input.after.confidence === "baixa") {
    return outcome("dados_insuficientes", "Dados insuficientes após a ação", input);
  }

  const elapsed = Number(input.elapsed_min) || 0;
  const janelaPrincipal = cfg.recuperacao_principal_min || 15;
  const janelaColateral = cfg.efeito_colateral_min || 20;

  const bCrit = input.before.praca_critica;
  const aCrit = input.after.praca_critica;
  const bIsf = bCrit && input.before.por_praca ? input.before.por_praca[bCrit] : null;
  const aIsf = bCrit && input.after.por_praca ? input.after.por_praca[bCrit] : null;
  const aNew = aCrit && input.after.por_praca ? input.after.por_praca[aCrit] : null;

  const signals = {
    fila_parou_crescer: !!(input.after.signals && input.after.signals.fila_parou_crescer),
    pedido_prioritario_avancou: !!(input.after.signals && input.after.signals.pedido_prioritario_avancou),
    motoboy_liberados: !!(input.after.signals && input.after.signals.motoboy_liberados),
    praca_controlavel: aIsf && aIsf.estado === "controlavel",
    nenhuma_critica_nova:
      !aNew || aNew.estado === "controlavel" || aNew.estado === "atencao" && (!bIsf || aNew.isf <= (bIsf.isf || 0)),
    erros_nao_aumentaram: input.after.signals ? input.after.signals.erros_nao_aumentaram !== false : true
  };

  // efeito colateral: outra praça piorou
  if (aCrit && bCrit && aCrit !== bCrit && aNew && aNew.estado === "acima_capacidade") {
    return outcome("deslocou_problema", "Problema deslocou para outra praça", input, signals);
  }
  if (elapsed > janelaColateral && aNew && bIsf && aNew.isf > bIsf.isf + 0.2 && aCrit !== bCrit) {
    return outcome("deslocou_problema", "Efeito colateral detectado em outra praça", input, signals);
  }

  const improved = aIsf && bIsf && aIsf.isf < bIsf.isf - 0.05;
  const recovered =
    signals.praca_controlavel &&
    signals.nenhuma_critica_nova &&
    signals.erros_nao_aumentaram &&
    (signals.fila_parou_crescer || signals.pedido_prioritario_avancou || signals.motoboy_liberados);

  if (recovered && elapsed <= janelaPrincipal + 5) {
    return outcome("recuperacao_liquida", "Recuperação líquida na janela", input, signals);
  }
  if (improved || signals.fila_parou_crescer || signals.pedido_prioritario_avancou) {
    return outcome("melhora_parcial", "Melhora parcial — ainda há resíduo", input, signals);
  }
  return outcome("sem_resultado", "Sem resultado observável na janela", input, signals);
}

function outcome(id, explanation, input, signals) {
  return {
    outcome: id,
    valid: OUTCOMES.indexOf(id) >= 0,
    explanation,
    signals: signals || {},
    elapsed_min: input && input.elapsed_min,
    evaluates: ["recomendacao", "operacao", "contexto", "resultado_sistema"],
    not_employee_evaluation: true,
    windows: (input && input.config && input.config.recuperacao) || null
  };
}

module.exports = { classificarRecuperacao, OUTCOMES };
