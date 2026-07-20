/**
 * Dados de demonstração — explicitamente simulados, sem PII real.
 */
export const DEMO_SCENARIOS = {
  normal: "Operação normal com pedidos prontos",
  multi: "Viagem com vários pedidos",
  removed: "Pedido removido preservado no histórico",
  pause: "Motoboy em pausa",
  support: "Motoboy em apoio à expedição",
  unconfirmed: "Entrega aguardando confirmação",
  not_found: "Cliente não encontrado",
  return: "Retorno em andamento",
  handoff_ok: "Handoff iFood concluído",
  handoff_ex: "Handoff com exceção",
  offline: "Evento offline pendente",
} as const;

export const DEMO_DISCLAIMER =
  "AMBIENTE DE DEMONSTRAÇÃO — dados simulados, não operacionais.";
