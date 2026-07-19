/**
 * Catálogo completo de intenções de voz — contrato para NLU e respostas.
 */
"use strict";

const INTENTS = [
  // Estado
  {
    intent_id: "state.overview",
    category: "estado",
    examples: ["Como está o Delivery?", "Como estamos agora?", "Tudo bem na operação?"],
    entities: [],
    context_required: ["areas_snapshot", "focus"],
    response_shape: "conclusion+evidence+confidence",
    confirmation: false,
    error: "Sem leitura atual da operação.",
    ambiguity: null,
    fallback: "state.biggest_problem",
    permission: "operator_read",
    executable: false
  },
  {
    intent_id: "state.biggest_problem",
    category: "estado",
    examples: ["Qual é o maior problema agora?", "O que precisa de atenção?", "Onde está o Foco?"],
    entities: [],
    context_required: ["focus"],
    response_shape: "focus_contract",
    confirmation: false,
    error: "Não há Foco ativo.",
    ambiguity: null,
    fallback: "state.overview",
    permission: "operator_read",
    executable: false
  },
  {
    intent_id: "state.anomaly",
    category: "estado",
    examples: ["Tem alguma coisa estranha?", "Algo fora do normal?", "Tem anomalia?"],
    entities: [],
    context_required: ["anomalies"],
    response_shape: "anomaly_list_short",
    confirmation: false,
    error: "Nenhuma anomalia com confiança suficiente.",
    ambiguity: null,
    fallback: "state.overview",
    permission: "operator_read",
    executable: false
  },
  // Área
  {
    intent_id: "area.status",
    category: "area",
    examples: ["Como está a Conferência?", "E o Sushi?", "Quentes está ok?"],
    entities: [{ name: "area", type: "area_id", required: true }],
    context_required: ["areas_snapshot"],
    response_shape: "area_status",
    confirmation: false,
    error: "Área desconhecida ou sem dados.",
    ambiguity: "Se a área não for dita, perguntar qual.",
    fallback: "state.overview",
    permission: "operator_read",
    executable: false
  },
  {
    intent_id: "area.why_attention",
    category: "area",
    examples: ["Por que Quentes está em atenção?", "Por que a Conferência acendeu?"],
    entities: [{ name: "area", type: "area_id", required: true }],
    context_required: ["areas_snapshot", "evidence"],
    response_shape: "why_attention",
    confirmation: false,
    error: "Área não está em atenção.",
    ambiguity: null,
    fallback: "area.status",
    permission: "operator_read",
    executable: false
  },
  {
    intent_id: "area.improving",
    category: "area",
    examples: ["O Sushi está melhorando?", "A Conferência aliviou?"],
    entities: [{ name: "area", type: "area_id", required: true }],
    context_required: ["areas_snapshot", "trend"],
    response_shape: "trend",
    confirmation: false,
    error: "Sem histórico curto para tendência.",
    ambiguity: null,
    fallback: "area.status",
    permission: "operator_read",
    executable: false
  },
  // Pedidos
  {
    intent_id: "orders.at_risk",
    category: "pedidos",
    examples: ["Quais pedidos estão em risco?", "Quem pode atrasar?"],
    entities: [],
    context_required: ["orders_at_risk"],
    response_shape: "order_list_short",
    confirmation: false,
    error: "Nenhum pedido em risco com confiança suficiente.",
    ambiguity: null,
    fallback: "state.biggest_problem",
    permission: "operator_read",
    executable: false
  },
  {
    intent_id: "orders.what_happened",
    category: "pedidos",
    examples: ["O que aconteceu com o pedido 184?", "Status do pedido 191"],
    entities: [{ name: "order_id", type: "order_ref", required: true }],
    context_required: ["order_timeline"],
    response_shape: "order_story",
    confirmation: false,
    error: "Pedido não encontrado ou dado incompleto.",
    ambiguity: "ID curto ambíguo → pedir confirmação de horário.",
    fallback: "orders.at_risk",
    permission: "operator_read",
    executable: false
  },
  {
    intent_id: "orders.first_look",
    category: "pedidos",
    examples: ["Qual pedido devo olhar primeiro?", "Por onde começo?"],
    entities: [],
    context_required: ["focus", "recommended_action"],
    response_shape: "first_look",
    confirmation: false,
    error: "Sem recomendação segura.",
    ambiguity: null,
    fallback: "state.biggest_problem",
    permission: "operator_read",
    executable: false
  },
  // Previsão
  {
    intent_id: "forecast.horizon",
    category: "previsao",
    examples: ["Como estaremos em quinze minutos?", "E em meia hora?"],
    entities: [{ name: "horizon_min", type: "number", required: false, default: 15 }],
    context_required: ["forecast"],
    response_shape: "forecast",
    confirmation: false,
    error: "Previsão indisponível.",
    ambiguity: "Se horizonte não dito, usar 15.",
    fallback: "state.overview",
    permission: "operator_read",
    executable: false
  },
  {
    intent_id: "forecast.area_buildup",
    category: "previsao",
    examples: ["A Conferência vai acumular?", "Quentes vai piorar?"],
    entities: [{ name: "area", type: "area_id", required: true }],
    context_required: ["forecast"],
    response_shape: "forecast_area",
    confirmation: false,
    error: "Sem previsão para a área.",
    ambiguity: null,
    fallback: "area.status",
    permission: "operator_read",
    executable: false
  },
  {
    intent_id: "forecast.couriers",
    category: "previsao",
    examples: ["Tem motoboy suficiente?", "Vai faltar entregador?"],
    entities: [],
    context_required: ["motoboy_state", "forecast"],
    response_shape: "courier_forecast",
    confirmation: false,
    error: "Sem sinal confiável de motoboy.",
    ambiguity: null,
    fallback: "area.status",
    permission: "operator_read",
    executable: false
  },
  // Comparação
  {
    intent_id: "compare.weekdays",
    category: "comparacao",
    examples: ["Estamos pior que as últimas sextas?", "Isso é normal pra sexta?"],
    entities: [{ name: "dow", type: "weekday", required: false }],
    context_required: ["baselines", "current_metrics"],
    response_shape: "comparison",
    confirmation: false,
    error: "Baseline insuficiente para o dia.",
    ambiguity: null,
    fallback: "state.overview",
    permission: "operator_read",
    executable: false
  },
  {
    intent_id: "compare.usual_hour",
    category: "comparacao",
    examples: ["Isso costuma acontecer nesse horário?", "É normal agora?"],
    entities: [],
    context_required: ["baselines", "current_metrics"],
    response_shape: "comparison",
    confirmation: false,
    error: "Sem baseline horária.",
    ambiguity: null,
    fallback: "state.overview",
    permission: "operator_read",
    executable: false
  },
  // Ação
  {
    intent_id: "action.recommend",
    category: "acao",
    examples: ["O que você recomenda?", "O que fazer agora?"],
    entities: [],
    context_required: ["focus", "recommended_action"],
    response_shape: "recommendation",
    confirmation: false,
    error: "Sem ação segura (foco puro).",
    ambiguity: null,
    fallback: "state.biggest_problem",
    permission: "operator_read",
    executable: false
  },
  {
    intent_id: "action.what_worked",
    category: "acao",
    examples: ["O que funcionou da última vez?", "Já vimos isso?"],
    entities: [],
    context_required: ["shift_memory", "playbooks"],
    response_shape: "playbook_hint",
    confirmation: false,
    error: "Sem histórico semelhante validado.",
    ambiguity: null,
    fallback: "action.recommend",
    permission: "operator_read",
    executable: false
  },
  {
    intent_id: "action.register_support",
    category: "acao",
    examples: ["Registrar que a Mariana assumiu o apoio.", "Anotar que o João foi pro Quentes."],
    entities: [
      { name: "person_name", type: "person", required: false },
      { name: "role_or_area", type: "string", required: true }
    ],
    context_required: ["shift_id"],
    response_shape: "ack_register",
    confirmation: true,
    error: "Não foi possível registrar.",
    ambiguity: "Confirmar papel/área se ambíguo.",
    fallback: null,
    permission: "operator_write_memory",
    executable: true,
    notes: "Registra papel/ação — não ranking individual nem vigilância."
  },
  {
    intent_id: "action.confirm_normalized",
    category: "acao",
    examples: ["Confirmar que a fila normalizou.", "Pode baixar o Foco."],
    entities: [{ name: "area", type: "area_id", required: false }],
    context_required: ["focus"],
    response_shape: "ack_resolve",
    confirmation: true,
    error: "Nada ativo para confirmar.",
    ambiguity: null,
    fallback: null,
    permission: "operator_write_memory",
    executable: true
  },
  // Aprendizado
  {
    intent_id: "learn.why_delay",
    category: "aprendizado",
    examples: ["Por que esse atraso aconteceu?", "O que causou a pressão?"],
    entities: [{ name: "order_id", type: "order_ref", required: false }],
    context_required: ["shift_memory", "evidence"],
    response_shape: "causal_hypothesis",
    confirmation: false,
    error: "Sem evidência suficiente — não inventar causa.",
    ambiguity: null,
    fallback: "shift.closing_prompt",
    permission: "operator_read",
    executable: false
  },
  {
    intent_id: "learn.action_helped",
    category: "aprendizado",
    examples: ["Essa ação ajudou?", "Resolveu?"],
    entities: [],
    context_required: ["follow_up"],
    response_shape: "outcome",
    confirmation: false,
    error: "Ainda sem resultado medido.",
    ambiguity: null,
    fallback: null,
    permission: "operator_read",
    executable: false
  },
  {
    intent_id: "learn.register_equipment",
    category: "aprendizado",
    examples: ["Registrar que a fritadeira parou.", "Anotá que o forno falhou."],
    entities: [{ name: "equipment", type: "string", required: true }],
    context_required: ["shift_id"],
    response_shape: "ack_register",
    confirmation: true,
    error: "Falha ao registrar.",
    ambiguity: null,
    fallback: null,
    permission: "operator_write_memory",
    executable: true
  },
  // Fechamento / briefing
  {
    intent_id: "shift.closing_prompt",
    category: "fechamento",
    examples: ["Fechar o turno", "Fazer o fechamento", "Resumo do turno"],
    entities: [],
    context_required: ["shift_memory"],
    response_shape: "closing",
    confirmation: false,
    error: "Sem dados de turno.",
    ambiguity: null,
    fallback: null,
    permission: "leader_close_shift",
    executable: true
  },
  {
    intent_id: "shift.briefing",
    category: "briefing",
    examples: ["Briefing", "Como deve ser o turno?", "O que esperar hoje?"],
    entities: [],
    context_required: ["baselines", "external_signals"],
    response_shape: "briefing",
    confirmation: false,
    error: "Briefing indisponível.",
    ambiguity: null,
    fallback: null,
    permission: "operator_read",
    executable: false
  }
];

function listIntents() {
  return INTENTS.slice();
}

function getIntent(id) {
  return INTENTS.find((i) => i.intent_id === id) || null;
}

function matchIntentByExample(utterance) {
  const u = String(utterance || "").toLowerCase();
  for (const intent of INTENTS) {
    for (const ex of intent.examples) {
      if (u.includes(ex.toLowerCase().slice(0, 12)) || similar(u, ex.toLowerCase())) {
        return { intent_id: intent.intent_id, confidence: "media", match: "example_heuristic" };
      }
    }
  }
  // keywords
  if (/confer[eê]ncia/.test(u)) return { intent_id: "area.status", entities: { area: "conferencia" }, confidence: "baixa" };
  if (/motoboy|entregador/.test(u)) return { intent_id: "forecast.couriers", confidence: "baixa" };
  if (/quinze|15 min|meia hora|30/.test(u)) return { intent_id: "forecast.horizon", confidence: "baixa" };
  if (/recomenda|fazer agora/.test(u)) return { intent_id: "action.recommend", confidence: "baixa" };
  return { intent_id: null, confidence: "baixa", fallback: "state.overview" };
}

function similar(a, b) {
  return a.length > 8 && b.includes(a.slice(0, 10));
}

module.exports = {
  INTENTS,
  listIntents,
  getIntent,
  matchIntentByExample
};
