'use strict';

const { sanitizeMessageForClassification } = require('./privacy');

const NUMBER_WORDS = Object.freeze({
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16,
  dezassete: 17, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20
});
const NUMBER_TOKEN = `(?:\\d{1,2}|${Object.keys(NUMBER_WORDS).join('|')})`;
const PARTY_PATTERNS = Object.freeze([
  new RegExp(`\\b(?:somos|estamos\\s+em|estaremos\\s+em)\\s+(${NUMBER_TOKEN})\\b`),
  new RegExp(`\\bmesa\\s+(?:para|pra|de)\\s+(${NUMBER_TOKEN})\\b`),
  new RegExp(`\\bgrupo\\s+(?:de|com)\\s+(${NUMBER_TOKEN})\\b`),
  new RegExp(`\\b(${NUMBER_TOKEN})\\s+(?:pessoa|pessoas|lugares)\\b`)
]);
const MISSING_ITEM_VOCABULARY = Object.freeze([
  ['refrigerantes', 'refrigerante', 'do refrigerante'],
  ['refrigerante', 'refrigerante', 'do refrigerante'],
  ['bebidas', 'bebida', 'da bebida'],
  ['bebida', 'bebida', 'da bebida'],
  ['shoyu', 'shoyu', 'do shoyu'],
  ['molhos', 'molho', 'do molho'],
  ['molho', 'molho', 'do molho'],
  ['acompanhamentos', 'acompanhamento', 'do acompanhamento'],
  ['acompanhamento', 'acompanhamento', 'do acompanhamento'],
  ['sobremesas', 'sobremesa', 'da sobremesa'],
  ['sobremesa', 'sobremesa', 'da sobremesa'],
  ['pecas', 'peça', 'da peça'],
  ['peca', 'peça', 'da peça'],
  ['hashi', 'hashi', 'do hashi'],
  ['guardanapos', 'guardanapo', 'do guardanapo'],
  ['guardanapo', 'guardanapo', 'do guardanapo']
]);
const MISSING_ITEM_SIGNAL = /\b(faltou|nao\s+veio|esqueceram|veio\s+sem|nao\s+mandaram|ficou\s+faltando)\b/;

const INTENT_SIGNALS = Object.freeze([
  ['opt_out', ['nao quero receber', 'pare de enviar', 'remover comunicacoes', 'opt out']],
  ['prior_promise', ['promessa anterior', 'ja prometeram', 'prometeram antes', 'ficou combinado']],
  ['valet_occurrence', ['manobrista', 'valet', 'veiculo']],
  ['charge_occurrence', ['cobranca', 'cobrado', 'pagamento duplicado', 'valor incorreto']],
  ['serious_quality', ['risco de saude', 'alergia', 'contaminacao', 'mal estar', 'muito grave']],
  ['wrong_or_missing_item', ['item faltando', 'item errado', 'faltou item', 'faltou um item', 'veio um item errado', 'pedido incompleto']],
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

function parsePartyNumber(token) {
  if (/^\d{1,2}$/.test(token)) return Number(token);
  return NUMBER_WORDS[token] || null;
}

function extractPartySize(message) {
  const text = sanitizeMessageForClassification(message);
  for (const pattern of PARTY_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = parsePartyNumber(match[1]);
    if (Number.isInteger(value) && value > 0 && value <= 99) {
      return Object.freeze({ value, confidence: 0.95, evidence_codes: ['party_size_from_message'] });
    }
  }
  return Object.freeze({ value: null, confidence: 0, evidence_codes: [] });
}

function hasDiningGroupContext(message) {
  const text = sanitizeMessageForClassification(message);
  return /\b(somos|estamos\s+em|estaremos\s+em|mesa|grupo|pessoas?|lugares|chegando|chegada|chegar|chegaremos)\b/.test(text);
}

function detectMissingItem(message) {
  const text = sanitizeMessageForClassification(message);
  if (!MISSING_ITEM_SIGNAL.test(text)) {
    return Object.freeze({ matched: false, item: null, item_reference: 'do item', confidence: 0, evidence_codes: [] });
  }
  const vocabularyMatch = MISSING_ITEM_VOCABULARY.find(([signal]) => new RegExp(`\\b${signal}\\b`).test(text));
  const genericItemSignal = /\b(item|itens|pedido)\b/.test(text);
  if (!vocabularyMatch && !genericItemSignal) {
    return Object.freeze({ matched: false, item: null, item_reference: 'do item', confidence: 0, evidence_codes: [] });
  }
  return Object.freeze({
    matched: true,
    item: vocabularyMatch?.[1] || null,
    item_reference: vocabularyMatch?.[2] || 'do item',
    confidence: vocabularyMatch ? 0.95 : 0.85,
    evidence_codes: [vocabularyMatch ? 'missing_item_named_signal' : 'missing_item_generic_signal']
  });
}

function classifyIntent(message, context = {}) {
  if (context.intent) return { value: context.intent, confidence: 1, evidence_codes: ['intent_context'] };
  const text = sanitizeMessageForClassification(message);
  if (context.item_issue_type === 'missing_item' || detectMissingItem(message).matched) {
    return { value: 'wrong_or_missing_item', confidence: 0.95, evidence_codes: ['intent_missing_item_signal'] };
  }
  if (Number.isInteger(Number(context.party_size)) && hasDiningGroupContext(message)) {
    return { value: 'reservation', confidence: 0.9, evidence_codes: ['intent_group_arrival_signal'] };
  }
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
  if (Number.isInteger(Number(context.party_size)) && hasDiningGroupContext(message)) {
    return { value: 'dining_room', confidence: 0.9, evidence_codes: ['origin_dining_group_signal'] };
  }
  if (text.includes('ifood') || text.includes('marketplace')) return { value: 'marketplace', confidence: 0.9, evidence_codes: ['origin_marketplace_signal'] };
  if (text.includes('salao') || text.includes('mesa') || text.includes('restaurante')) return { value: 'dining_room', confidence: 0.8, evidence_codes: ['origin_dining_signal'] };
  if (text.includes('manobrista') || text.includes('valet')) return { value: 'valet', confidence: 0.9, evidence_codes: ['origin_valet_signal'] };
  if (text.includes('app') || text.includes('delivery proprio')) return { value: 'own_delivery', confidence: 0.8, evidence_codes: ['origin_own_delivery_signal'] };
  return { value: 'unknown', confidence: 0.2, evidence_codes: ['origin_unknown'] };
}

function classifySeverity(message, intent, context = {}) {
  if (context.severity) return { value: context.severity, confidence: 1, evidence_codes: ['severity_context'] };
  if (intent === 'reservation' && Number(context.party_size) > 8) {
    return { value: 'medium', confidence: 0.9, evidence_codes: ['severity_operational_large_group'] };
  }
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

module.exports = {
  NUMBER_WORDS,
  PARTY_PATTERNS,
  MISSING_ITEM_VOCABULARY,
  MISSING_ITEM_SIGNAL,
  INTENT_SIGNALS,
  extractPartySize,
  hasDiningGroupContext,
  detectMissingItem,
  classifyIntent,
  classifyOrigin,
  classifySeverity
};

