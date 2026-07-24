'use strict';

const { sanitizeMessageForClassification } = require('./privacy');

const INTENT_SIGNALS = Object.freeze([
  ['opt_out', ['nao quero receber', 'pare de enviar', 'remover comunicacoes', 'opt out']],
  ['prior_promise', ['promessa anterior', 'ja prometeram', 'prometeram antes', 'ficou combinado']],
  ['valet_occurrence', ['manobrista', 'valet', 'veiculo']],
  ['charge_occurrence', ['cobranca', 'cobrado', 'pagamento duplicado', 'valor incorreto']],
  ['serious_quality', ['risco de saude', 'alergia', 'contaminacao', 'mal estar', 'muito grave']],
  ['wrong_or_missing_item', ['item faltando', 'item errado', 'faltou item', 'pedido incompleto']],
  ['delay', ['atraso', 'atrasado', 'demorando', 'nao chegou']],
  ['order_change', ['alterar pedido', 'mudar pedido', 'retirar item', 'acrescentar item']],
  ['tracking', ['acompanhar pedido', 'onde esta o pedido', 'status do pedido', 'rastrear']],
  ['reservation', ['reserva', 'reservar', 'mesa', 'fila de espera']],
  ['menu_information', ['cardapio', 'menu', 'itens disponiveis']],
  ['general_information', ['horario', 'localizacao', 'informacoes da unidade', 'formas de pagamento']],
  ['alert_only', ['apenas avisar', 'somente alertar', 'fica o alerta']],
  ['human_request', ['falar com humano', 'atendente', 'responsavel', 'gerente']],
  ['delivery', ['delivery', 'pedido', 'entrega']]
]);

function signalMatches(text, signals) {
  return signals.filter((signal) => text.includes(signal));
}

function classifyIntent(message, context = {}) {
  if (context.intent) return { value: context.intent, confidence: 1, evidence_codes: ['intent_context'] };
  const text = sanitizeMessageForClassification(message);
  const matches = [];
  for (const [intent, signals] of INTENT_SIGNALS) {
    const evidence = signalMatches(text, signals);
    if (evidence.length) matches.push({ intent, evidence });
  }
  if (matches.length === 0) return { value: 'ambiguous', confidence: 0.2, evidence_codes: ['intent_no_signal'] };
  const selected = matches[0];
  const competing = matches.filter((match) => !['delivery'].includes(match.intent) && match.intent !== selected.intent);
  if (competing.length > 1 && selected.intent !== 'opt_out') {
    return { value: 'ambiguous', confidence: 0.35, evidence_codes: ['intent_multiple_signals'] };
  }
  return { value: selected.intent, confidence: 0.8, evidence_codes: [`intent_signal_${selected.intent}`] };
}

function classifyOrigin(message, context = {}) {
  if (context.origin) return { value: context.origin, confidence: 1, evidence_codes: ['origin_context'] };
  const text = sanitizeMessageForClassification(message);
  if (text.includes('ifood') || text.includes('marketplace')) return { value: 'marketplace', confidence: 0.9, evidence_codes: ['origin_marketplace_signal'] };
  if (text.includes('salao') || text.includes('mesa') || text.includes('restaurante')) return { value: 'dining_room', confidence: 0.8, evidence_codes: ['origin_dining_signal'] };
  if (text.includes('manobrista') || text.includes('valet')) return { value: 'valet', confidence: 0.9, evidence_codes: ['origin_valet_signal'] };
  if (text.includes('app') || text.includes('delivery proprio')) return { value: 'own_delivery', confidence: 0.8, evidence_codes: ['origin_own_delivery_signal'] };
  return { value: 'unknown', confidence: 0.2, evidence_codes: ['origin_unknown'] };
}

function classifySeverity(message, intent, context = {}) {
  if (context.severity) return { value: context.severity, confidence: 1, evidence_codes: ['severity_context'] };
  if (['serious_quality', 'charge_occurrence', 'valet_occurrence', 'prior_promise'].includes(intent)) {
    return { value: 'high', confidence: 0.9, evidence_codes: [`severity_high_${intent}`] };
  }
  if (['wrong_or_missing_item', 'delay', 'order_change', 'tracking'].includes(intent)) {
    return { value: 'medium', confidence: 0.8, evidence_codes: [`severity_medium_${intent}`] };
  }
  if (['reservation', 'menu_information', 'general_information', 'alert_only', 'opt_out'].includes(intent)) {
    return { value: 'low', confidence: 0.8, evidence_codes: [`severity_low_${intent}`] };
  }
  const text = sanitizeMessageForClassification(message);
  if (/grave|risco|urgente/.test(text)) return { value: 'high', confidence: 0.7, evidence_codes: ['severity_high_signal'] };
  return { value: 'unknown', confidence: 0.2, evidence_codes: ['severity_unknown'] };
}

module.exports = { INTENT_SIGNALS, classifyIntent, classifyOrigin, classifySeverity };

