'use strict';

const { sanitizePatternFacts, validatePatternInput, validatePatternDecision } = require('./pattern-contract');
const { INTENT_JOURNEY_RULES, journeyForIntent, nextJourneyStep } = require('./journey-graph-catalog');
const { validateProductContexts, evaluateRecommendationSafety } = require('./product-context-contracts');

const WRITTEN_NUMBERS = Object.freeze({
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4,
  cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, quinze: 15,
  dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20
});
const PRIORITY = Object.freeze([
  'safety_handoff', 'explicit_correction', 'cancel', 'repeat_reformulate',
  'pending_answer', 'context_reference', 'side_question', 'topic_change',
  'resume', 'greeting_with_need', 'greeting', 'chitchat', 'new_journey',
  'fallback'
]);
const JOURNEY_BY_INTENT = INTENT_JOURNEY_RULES;
const JOURNEY_HINTS = Object.freeze([
  [/\b(?:reserv|mesa para)\b/u, 'reservation'],
  [/\b(?:fila|espera)\b/u, 'waitlist'],
  [/\b(?:grupo grande|evento|oke)\b/u, 'oke_event'],
  [/\b(?:delivery do tata|pedir delivery|fazer um pedido)\b/u, 'own_delivery'],
  [/\bifood\b/u, 'ifood_problem'],
  [/\b(?:faltou|nao veio|nao mandaram|esqueceram)\b/u, 'missing_item'],
  [/\b(?:veio outro item|item errado)\b/u, 'wrong_item'],
  [/\b(?:quantidade errada|vieram .* em vez)\b/u, 'wrong_quantity'],
  [/\b(?:sem cebola|personalizacao|veio com)\b/u, 'personalization'],
  [/\b(?:atras|demorando)\b/u, 'delay'],
  [/\b(?:qualidade|cheiro estranho|corpo estranho|cabelo)\b/u, 'quality'],
  [/\b(?:alerg|dificuldade para respirar|vomito|diarreia)\b/u, 'food_safety'],
  [/\b(?:elogio|adorei|parabens)\b/u, 'praise'],
  [/\b(?:humano|atendente|falar com uma pessoa)\b/u, 'handoff']
]);
const SIDE_TOPICS = Object.freeze([
  [/\b(?:valet|manobrista)\b/u, 'valet_information'],
  [/\b(?:que horas|horario|abrem|fecham)\b/u, 'hours_information'],
  [/\b(?:pagamento|cartao|pix|vale refeicao)\b/u, 'payment_information'],
  [/\b(?:retirada|retirar)\b/u, 'pickup_information'],
  [/\b(?:endereco|onde fica)\b/u, 'address_information'],
  [/\b(?:cardapio|prato|sushi|bebida|drink|recomend)\b/u, 'menu_information']
]);

function normalizeConversationText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().replace(/[“”"']/gu, '').replace(/\s+/gu, ' ').trim();
}

function decision(overrides = {}) {
  const value = {
    schema_version: 'deliveryos-conversation-pattern-decision-v1',
    pattern: 'clarification',
    confidence: 0.35,
    journey_action: 'none',
    target_journey: null,
    target_step: null,
    facts_added: {},
    facts_corrected: {},
    reference_resolution: {},
    question_to_answer: null,
    question_to_resume: null,
    requires_clarification: true,
    clarification_question: 'Você pode me dizer se precisa de ajuda com o restaurante, uma reserva ou um pedido?',
    collision_log: [],
    ...overrides
  };
  value.facts_added = sanitizePatternFacts(value.facts_added);
  value.facts_corrected = sanitizePatternFacts(value.facts_corrected);
  const checked = validatePatternDecision(value);
  if (!checked.accepted) throw Object.assign(new Error(checked.reason), { code: checked.reason });
  return checked.output;
}

function numberValue(token) {
  if (/^\d{1,3}$/u.test(token || '')) return Number(token);
  return WRITTEN_NUMBERS[token] ?? null;
}

function contextualNumber(text) {
  const matches = [...text.matchAll(/\b(?:somos|estamos em|mesa para|grupo de|para)\s+(\d{1,3}|[a-z]+)(?:\s+pessoas?)?\b/gu)];
  if (!matches.length) return null;
  const value = numberValue(matches.at(-1)[1]);
  return Number.isInteger(value) && value >= 1 && value <= 100 ? value : null;
}

function correctionPartySize(text) {
  const afterMarker = text.match(/\b(?:agora somos|na verdade(?:,)? somos|corrigindo(?:,)? somos|somos)\s+(\d{1,3}|[a-z]+)\b/u);
  if (afterMarker) return numberValue(afterMarker[1]);
  const notPattern = text.match(/\b(?:somos|sao)\s+(\d{1,3}|[a-z]+)\s*,?\s*nao\s+(\d{1,3}|[a-z]+)\b/u);
  return notPattern ? numberValue(notPattern[1]) : null;
}

function intentId(item) {
  return typeof item === 'string' ? item : String(item?.intent || item?.id || '');
}

function hintedJourney(text, intents = []) {
  for (const item of intents) {
    const mapped = journeyForIntent(intentId(item));
    if (mapped) return mapped;
  }
  return JOURNEY_HINTS.find(([pattern]) => pattern.test(text))?.[1] || null;
}

function pendingField(pending) {
  if (typeof pending === 'string') return pending;
  return pending?.field || pending?.fact || null;
}

function pendingPrompt(pending) {
  if (typeof pending === 'object' && pending?.question) return pending.question;
  const field = pendingField(pending);
  return {
    party_size: 'Para quantas pessoas seria?', reservation_day: 'Para qual dia seria?',
    reservation_date: 'Para qual dia seria?', reservation_time: 'Qual horário você prefere?',
    time: 'Qual horário você prefere?', order_channel: 'O pedido foi feito pelo delivery do TATÁ ou pelo iFood?',
    order_reference: 'Qual é o número do pedido?', item_name: 'Qual item foi afetado?',
    arrival_estimate: 'Qual é a previsão aproximada de chegada?'
  }[field] || null;
}

function shortAnswer(text, pending) {
  const field = pendingField(pending);
  if (!field || text.length > 80 || /[?]/u.test(text)) return null;
  if (field === 'party_size') {
    const token = text.match(/^\s*(\d{1,3}|[a-z]+)(?:\s+pessoas?)?[.!]?\s*$/u)?.[1];
    const value = numberValue(token);
    return Number.isInteger(value) && value >= 1 && value <= 100 ? { field, value } : null;
  }
  if (['reservation_day', 'reservation_date', 'date'].includes(field)) {
    const value = text.match(/^(?:hoje|amanha|depois de amanha|segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado|domingo|\d{1,2}\/\d{1,2})(?:[.!])?$/u)?.[0]?.replace(/[.!]$/u, '');
    return value ? { field, value } : null;
  }
  if (['reservation_time', 'time', 'pickup_time'].includes(field)) {
    const raw = text.match(/^(?:as\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:h|horas?)?[.!]?$/u);
    if (!raw) return null;
    const hour = Number(raw[1]);
    const minute = Number(raw[2] || 0);
    return hour <= 23 && minute <= 59 ? { field, value: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` } : null;
  }
  if (field === 'order_channel') {
    if (/^\s*(?:ifood|pelo ifood)[.!]?\s*$/u.test(text)) return { field, value: 'ifood' };
    if (/^\s*(?:delivery|delivery do tata|proprio)[.!]?\s*$/u.test(text)) return { field, value: 'own_delivery' };
  }
  if (/^(?:sim|isso|correto|pode ser)[.!]?$/u.test(text)) return { field, value: true };
  if (/^(?:nao|negativo)[.!]?$/u.test(text)) return { field, value: false };
  return null;
}

function entityPairs(input) {
  return input.candidate_entities.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    if (typeof item.field === 'string' && Object.hasOwn(item, 'value')) return [{ field: item.field, value: item.value, journey: item.journey || null }];
    return Object.entries(item).flatMap(([field, candidate]) => {
      const value = candidate && typeof candidate === 'object' && Object.hasOwn(candidate, 'value') ? candidate.value : candidate;
      return ['string', 'number', 'boolean'].includes(typeof value) ? [{ field, value, journey: null }] : [];
    });
  }).filter(({ field, value }) => !/(?:name|phone|email|cpf|address|token|cookie)/iu.test(field) && ['string', 'number', 'boolean'].includes(typeof value));
}

function referenceCandidates(input) {
  const fromRecent = input.recent_turns.flatMap((turn) => entityPairs({ candidate_entities: Array.isArray(turn?.entities) ? turn.entities : [] }));
  const fromCurrent = entityPairs(input);
  const fromFacts = Object.entries(input.collected_facts).map(([field, value]) => ({ field, value, journey: input.active_journey }));
  const seen = new Set();
  return [...fromCurrent, ...fromRecent, ...fromFacts].filter((item) => {
    const key = `${item.field}:${JSON.stringify(item.value)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function correctionFacts(text, input) {
  const candidates = {};
  const size = correctionPartySize(text);
  if (Number.isInteger(size) && size > 0 && size <= 100) candidates.party_size = size;
  if (/\b(?:foi|era|e)\s+(?:pelo\s+)?ifood\b/u.test(text)) candidates.order_channel = 'ifood';
  if (/\b(?:foi|era|e)\s+(?:no\s+)?delivery(?: do tata)?\b/u.test(text)) candidates.order_channel = 'own_delivery';
  const item = text.match(/\bnao (?:foi|era)\s+([a-z ]{2,40}?),?\s+(?:foi|era)\s+([a-z ]{2,40})(?:[.!]|$)/u);
  if (item) candidates.item_name = item[2].trim();
  const date = text.match(/\b(?:na verdade|corrigindo|e)\s+(?:para\s+)?(hoje|amanha|depois de amanha)\b/u);
  if (date) candidates.reservation_day = date[1];
  const time = text.match(/\b(?:melhor|na verdade|corrigindo)(?:\s+e|,)?\s+(?:as\s+)?(\d{1,2})(?::(\d{2}))?\b/u);
  if (time && Number(time[1]) <= 23 && Number(time[2] || 0) <= 59) candidates.reservation_time = `${String(Number(time[1])).padStart(2, '0')}:${String(Number(time[2] || 0)).padStart(2, '0')}`;
  const safe = sanitizePatternFacts(candidates);
  const plausible = Object.keys(safe).filter((field) => Object.hasOwn(input.collected_facts, field) || field === pendingField(input.pending_question));
  if (plausible.length === 1) return { facts: { [plausible[0]]: safe[plausible[0]] }, ambiguous: false };
  if (Object.keys(safe).length === 1) return { facts: safe, ambiguous: false };
  return { facts: safe, ambiguous: Object.keys(safe).length !== 1 };
}

function sideTopic(text) {
  return SIDE_TOPICS.find(([pattern]) => pattern.test(text))?.[1] || null;
}

function detectedSignals(text, input) {
  const target = hintedJourney(text, input.candidate_intents);
  const greeting = /^(?:oi|ola|bom dia|boa tarde|boa noite|e ai|tudo bem)(?:[!,.? ]|$)/u.test(text);
  const safety = /\b(?:dificuldade para respirar|desmaio|alerg|vomito|diarreia|intoxic|corpo estranho|cabelo)\b/u.test(text);
  const handoff = /\b(?:falar com (?:uma pessoa|alguem|humano)|atendente|chamar responsavel)\b/u.test(text);
  const correction = /\b(?:na verdade|quis dizer|corrigindo|corrigi|agora somos|nao (?:foi|era)|melhor as|melhor às)\b/u.test(text)
    || /\b(?:somos|sao)\s+(?:\d{1,3}|[a-z]+)\s*,?\s*nao\s+(?:\d{1,3}|[a-z]+)\b/u.test(text);
  const cancel = /\b(?:cancela|cancelar|deixa pra la|nao quero mais|pode encerrar essa)\b/u.test(text);
  const close = /\b(?:tchau|ate mais|ate logo|obrigad[oa],? tchau|por hoje e so)\b/u.test(text);
  const reformulate = /\b(?:nao entendi|explica melhor|fala de outro jeito|o que isso quer dizer|como assim)\b/u.test(text);
  const repeat = /\b(?:pode repetir|repete|nao ouvi)\b/u.test(text) || /^como\?$/u.test(text);
  const reference = /\b(?:esse|essa|isso|aquele|aquela|o segundo|a segunda|o primeiro|a primeira|o de amanha|pedido do ifood|o link|como falei|ja te passei)\b/u.test(text);
  const side = input.active_journey ? sideTopic(text) : null;
  const resume = /\b(?:voltando|retomando|podemos continuar|quero retomar|e a reserva|sobre o pedido)\b/u.test(text) || (/^(?:voltei|retornei)[.!]?$/u.test(text));
  const chitchat = /^(?:tudo bem\??|como voce esta\??|legal|que bom|obrigad[oa]|valeu)[.!? ]*$/u.test(text);
  const short = shortAnswer(text, input.pending_question);
  return { target, greeting, safety, handoff, correction, cancel, close, reformulate, repeat, reference, side, resume, chitchat, short };
}

function collisionLog(signals, winner) {
  const names = Object.entries(signals).filter(([key, value]) => !['target', 'short', 'side'].includes(key) && Boolean(value)).map(([key]) => key);
  if (signals.target) names.push(`journey:${signals.target}`);
  if (signals.short) names.push(`pending:${signals.short.field}`);
  if (signals.side) names.push(`side:${signals.side}`);
  return names.length > 1 ? [{ winner, candidates: names, reason: `priority:${PRIORITY.indexOf(winner) + 1}` }] : [];
}

function resolveReference(text, input) {
  const candidates = referenceCandidates(input);
  let selected = [];
  if (/\b(?:o segundo|a segunda)\b/u.test(text)) selected = candidates[1] ? [candidates[1]] : [];
  else if (/\b(?:o primeiro|a primeira)\b/u.test(text)) selected = candidates[0] ? [candidates[0]] : [];
  else if (/\bo de amanha\b/u.test(text)) selected = candidates.filter((item) => /date|day|dia/u.test(item.field) && normalizeConversationText(item.value) === 'amanha');
  else if (/\bpedido do ifood\b/u.test(text)) selected = candidates.filter((item) => item.field === 'order_reference' && item.journey === 'ifood_problem');
  else if (/\b(?:o link)\b/u.test(text)) selected = candidates.filter((item) => item.field.includes('link'));
  else if (/\b(?:ja te passei|como falei)\b/u.test(text) && pendingField(input.pending_question)) selected = candidates.filter((item) => item.field === pendingField(input.pending_question));
  else selected = candidates.length === 1 ? candidates : [];
  if (selected.length === 1) return { resolved: true, value: selected[0], candidates: candidates.length };
  return { resolved: false, value: null, candidates: candidates.length };
}

function resolveConversationPattern(raw = {}) {
  const checked = validatePatternInput(raw);
  if (!checked.accepted) throw Object.assign(new Error(checked.reason), { code: checked.reason, missing: checked.missing || [] });
  const input = checked.input;
  const productContexts = validateProductContexts(input);
  if (!productContexts.accepted) throw Object.assign(new Error(productContexts.reason), { code: productContexts.reason });
  const text = normalizeConversationText(input.normalized_message || input.current_message);
  const signals = detectedSignals(text, input);
  const recommendationSafety = evaluateRecommendationSafety(productContexts.contexts);
  const active = input.active_journey;
  const nextStep = pendingField(input.pending_question) || input.active_step || null;
  const stateFacts = input.collected_facts;
  const targetStep = (journey, newFacts = {}) => nextJourneyStep(journey, { ...stateFacts, ...newFacts }) || nextStep;

  if (signals.safety || signals.handoff) {
    const target = signals.safety ? 'food_safety' : 'handoff';
    return decision({ pattern: 'handoff', confidence: 0.99, journey_action: active && active !== target ? 'suspend' : (active === target ? 'advance' : 'start'), target_journey: target, target_step: targetStep(target), requires_clarification: false, clarification_question: null, collision_log: collisionLog(signals, 'safety_handoff') });
  }
  if (productContexts.contexts.customer_context?.identity_status === 'ambiguous') {
    return decision({ pattern: 'clarification', confidence: 0.99, target_journey: active, target_step: nextStep, requires_clarification: true, clarification_question: 'Pode confirmar qual cadastro deve ser usado antes de continuarmos?', collision_log: collisionLog(signals, 'context_reference') });
  }
  if (recommendationSafety.requires_allergen_guidance && /\b(?:cardapio|prato|sushi|bebida|drink|comer|recomend)\b/u.test(text)) {
    return decision({ pattern: 'clarification', confidence: 0.99, target_journey: active, target_step: nextStep, question_to_answer: 'allergen_guidance', requires_clarification: true, clarification_question: 'Antes de recomendar, pode confirmar a restrição e o item que deseja avaliar?', collision_log: collisionLog(signals, 'safety_handoff') });
  }
  if (signals.correction) {
    const correction = correctionFacts(text, input);
    if (correction.ambiguous) return decision({ pattern: 'clarification', confidence: 0.48, target_journey: active, target_step: nextStep, requires_clarification: true, clarification_question: 'Qual informação você quer corrigir: quantidade, data, horário, canal ou item?', collision_log: collisionLog(signals, 'explicit_correction') });
    return decision({ pattern: 'correction', confidence: 0.96, journey_action: 'backtrack', target_journey: active || signals.target, target_step: targetStep(active || signals.target, correction.facts), facts_corrected: correction.facts, question_to_resume: pendingPrompt(input.pending_question), requires_clarification: false, clarification_question: null, collision_log: collisionLog(signals, 'explicit_correction') });
  }
  if (signals.cancel) return decision({ pattern: 'cancel', confidence: 0.98, journey_action: 'cancel', target_journey: active, target_step: null, requires_clarification: false, clarification_question: null, collision_log: collisionLog(signals, 'cancel') });
  if (signals.close) return decision({ pattern: 'close', confidence: 0.96, journey_action: active ? 'complete' : 'none', target_journey: active, target_step: null, requires_clarification: false, clarification_question: null, collision_log: collisionLog(signals, 'cancel') });
  if (signals.repeat || signals.reformulate) return decision({ pattern: 'repeat', confidence: 0.97, journey_action: 'none', target_journey: active, target_step: nextStep, reference_resolution: { mode: signals.reformulate ? 'reformulate' : 'repeat', last_assistant_act: input.last_assistant_act || null }, question_to_resume: pendingPrompt(input.pending_question), requires_clarification: false, clarification_question: null, collision_log: collisionLog(signals, 'repeat_reformulate') });
  if (input.pending_question && signals.short) return decision({ pattern: 'continue', confidence: 0.99, journey_action: 'advance', target_journey: active, target_step: targetStep(active, { [signals.short.field]: signals.short.value }), facts_added: { [signals.short.field]: signals.short.value }, requires_clarification: false, clarification_question: null, collision_log: collisionLog(signals, 'pending_answer') });
  if (signals.reference) {
    const reference = resolveReference(text, input);
    if (!reference.resolved) return decision({ pattern: 'clarification', confidence: 0.42, target_journey: active, target_step: nextStep, reference_resolution: { status: 'ambiguous', candidates: reference.candidates }, requires_clarification: true, clarification_question: 'A qual item, pedido ou opção você está se referindo?', collision_log: collisionLog(signals, 'context_reference') });
    return decision({ pattern: 'continue', confidence: 0.94, journey_action: 'advance', target_journey: active, target_step: nextStep, reference_resolution: { status: 'resolved', ...reference.value }, facts_added: { [reference.value.field]: reference.value.value }, requires_clarification: false, clarification_question: null, collision_log: collisionLog(signals, 'context_reference') });
  }
  if (signals.side) return decision({ pattern: 'side_question', confidence: 0.97, journey_action: 'none', target_journey: active, target_step: input.active_step, question_to_answer: signals.side, question_to_resume: pendingPrompt(input.pending_question), requires_clarification: false, clarification_question: null, collision_log: collisionLog(signals, 'side_question') });
  if (active && signals.target && signals.target !== active) {
    const facts = contextualNumber(text) ? { party_size: contextualNumber(text) } : {};
    return decision({ pattern: 'switch_topic', confidence: 0.92, journey_action: 'suspend', target_journey: signals.target, target_step: targetStep(signals.target, facts), facts_added: facts, requires_clarification: false, clarification_question: null, collision_log: collisionLog(signals, 'topic_change') });
  }
  if (signals.resume && input.suspended_journeys.length) {
    const suspended = input.suspended_journeys.at(-1);
    return decision({ pattern: 'resume', confidence: 0.96, journey_action: 'resume', target_journey: suspended.journey_id, target_step: suspended.active_step || null, question_to_resume: pendingPrompt(suspended.pending_question), requires_clarification: false, clarification_question: null, collision_log: collisionLog(signals, 'resume') });
  }
  if (signals.greeting && signals.target) {
    const facts = contextualNumber(text) ? { party_size: contextualNumber(text) } : {};
    return decision({ pattern: 'continue', confidence: 0.97, journey_action: active === signals.target ? 'advance' : (active ? 'suspend' : 'start'), target_journey: signals.target, target_step: targetStep(signals.target, facts), facts_added: facts, requires_clarification: false, clarification_question: null, collision_log: collisionLog(signals, 'greeting_with_need') });
  }
  if (signals.greeting) return decision({ pattern: 'greeting', confidence: 0.99, journey_action: 'none', target_journey: active, target_step: input.active_step, question_to_resume: active ? pendingPrompt(input.pending_question) : null, requires_clarification: false, clarification_question: null, collision_log: collisionLog(signals, 'greeting') });
  if (signals.chitchat) return decision({ pattern: 'chitchat', confidence: 0.93, journey_action: 'none', target_journey: active, target_step: input.active_step, question_to_resume: active ? pendingPrompt(input.pending_question) : null, requires_clarification: false, clarification_question: null, collision_log: collisionLog(signals, 'chitchat') });
  if (signals.target) {
    const facts = contextualNumber(text) ? { party_size: contextualNumber(text) } : {};
    return decision({ pattern: 'continue', confidence: 0.9, journey_action: active === signals.target ? 'advance' : (active ? 'suspend' : 'start'), target_journey: signals.target, target_step: targetStep(signals.target, facts), facts_added: facts, requires_clarification: false, clarification_question: null, collision_log: collisionLog(signals, 'new_journey') });
  }
  return decision({ target_journey: active, target_step: nextStep, question_to_resume: pendingPrompt(input.pending_question), collision_log: collisionLog(signals, 'fallback') });
}

class ConversationPatternEngine {
  resolve(input) { return resolveConversationPattern(input); }
}

module.exports = {
  WRITTEN_NUMBERS,
  PRIORITY,
  JOURNEY_BY_INTENT,
  JOURNEY_HINTS,
  SIDE_TOPICS,
  normalizeConversationText,
  numberValue,
  contextualNumber,
  journeyForIntent,
  hintedJourney,
  pendingField,
  pendingPrompt,
  shortAnswer,
  resolveReference,
  resolveConversationPattern,
  ConversationPatternEngine
};
