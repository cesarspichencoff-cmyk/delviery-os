/**
 * Playbooks operacionais — sistema NÃO altera playbook crítico automaticamente.
 */
"use strict";

function createPlaybook(partial) {
  const p = partial || {};
  return {
    playbook_id: p.playbook_id || null,
    situation: p.situation || "",
    conditions: p.conditions || [],
    action: p.action || "",
    responsible_role: p.responsible_role || "lider_turno",
    limits: p.limits || [],
    exceptions: p.exceptions || [],
    risks: p.risks || [],
    expected_result: p.expected_result || "",
    usage_history: p.usage_history || [],
    success_rate: p.success_rate ?? null,
    side_effects: p.side_effects || [],
    last_reviewed_at: p.last_reviewed_at || null,
    human_approval: p.human_approval || { required: true, approved_by: null, approved_at: null },
    critical: p.critical !== false,
    auto_mutate: false, // SEMPRE false para críticos
    suggest_revision_only: true
  };
}

const SEED_PLAYBOOKS = [
  createPlaybook({
    playbook_id: "pb_conference_buildup",
    situation: "Conferência acumulando com produção estável",
    conditions: ["conference.queue >= 5", "sushi.pressure in (normal,attention)"],
    action: "Priorizar conferência dos pedidos com prazo mais próximo e 2ª sacola; checar motoboy",
    responsible_role: "conferente",
    limits: ["Não pular observação de alergia", "Não inventar pronto"],
    exceptions: ["Pedido com risco de erro explícito tem prioridade absoluta"],
    risks: ["Atraso em saída se só empilhar sem liberar"],
    expected_result: "Fila de conferência abaixo do limiar de pressão em 10 min",
    critical: true
  }),
  createPlaybook({
    playbook_id: "pb_motoboy_surge",
    situation: "Saída lenta / prontos sem sair",
    conditions: ["motoboy.queue >= 4", "ready_orders >= 4"],
    action: "Chamar motoboy e liberar os 2 prontos mais antigos primeiro",
    responsible_role: "lider_entrega",
    limits: ["Não acusar entregador"],
    expected_result: "Queda na fila de saída em 10-15 min",
    critical: true
  }),
  createPlaybook({
    playbook_id: "pb_quentes_pressure",
    situation: "Quentes em pressão",
    conditions: ["quentes.pressure_level in (pressure,critical)"],
    action: "Priorizar bancada de quentes nos pedidos âncora; evitar iniciar itens longos não críticos",
    responsible_role: "lider_producao",
    expected_result: "Tempo mediano de quentes volta ao intervalo normal",
    critical: true
  }),
  createPlaybook({
    playbook_id: "pb_sushi_attention",
    situation: "Sushi em atenção",
    conditions: ["sushi.pressure_level == attention"],
    action: "Redistribuir combos e olhar item dominante da fila",
    responsible_role: "lider_producao",
    expected_result: "Sem escalada para pressão nos próximos 15 min",
    critical: false
  })
];

function suggestRevision(playbook, evidence) {
  return {
    playbook_id: playbook.playbook_id,
    suggestion: "revision",
    auto_applied: false,
    evidence,
    requires_human_approval: true,
    message: "Sugestão de revisão de playbook — não aplicada automaticamente."
  };
}

function matchPlaybooks(snapshot, catalog) {
  const list = catalog || SEED_PLAYBOOKS;
  const hits = [];
  const areas = (snapshot && snapshot.areas) || {};
  for (const pb of list) {
    // matching simplificado por situação/área
    if (pb.playbook_id === "pb_conference_buildup" && areas.conferencia && (areas.conferencia.queue_depth || 0) >= 5) {
      hits.push(pb);
    }
    if (pb.playbook_id === "pb_motoboy_surge" && areas.motoboy && (areas.motoboy.queue_depth || 0) >= 4) {
      hits.push(pb);
    }
    if (pb.playbook_id === "pb_quentes_pressure" && areas.quentes && ["pressure", "critical"].includes(areas.quentes.pressure_level)) {
      hits.push(pb);
    }
    if (pb.playbook_id === "pb_sushi_attention" && areas.sushi && areas.sushi.pressure_level === "attention") {
      hits.push(pb);
    }
  }
  return hits;
}

module.exports = {
  createPlaybook,
  SEED_PLAYBOOKS,
  suggestRevision,
  matchPlaybooks
};
