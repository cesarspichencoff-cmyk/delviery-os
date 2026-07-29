'use strict';

function normalized(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().trim();
}

const WRITTEN_NUMBERS = Object.freeze({
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  treze: 13, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17,
  dezoito: 18, dezenove: 19, vinte: 20
});

function partySize(text) {
  const direct = text.match(/\b(?:somos|estamos em|mesa para|grupo de|reserv(?:a|ar)\s+(?:uma mesa\s+)?para)\s+(\d{1,2})\b/u)
    || text.match(/\b(\d{1,2})\s+pessoas?\b/u);
  if (direct) return Number(direct[1]);
  for (const [word, number] of Object.entries(WRITTEN_NUMBERS)) {
    if (new RegExp(`\\b(?:somos|estamos em|mesa para|grupo de|reserv(?:a|ar)\\s+(?:uma mesa\\s+)?para)\\s+${word}\\b`, 'u').test(text)) return number;
  }
  return null;
}

function emptyDirective(overrides = {}) {
  return {
    dialogue_act: 'chitchat',
    social_act: 'none',
    active_journey: null,
    topic_changed: false,
    return_to_previous_topic: false,
    facts_added: {},
    facts_corrected: {},
    references_resolved: {},
    customer_need: '',
    question_to_answer: null,
    next_required_information: null,
    knowledge_queries: [],
    requested_action: null,
    confidence: 0.45,
    ...overrides
  };
}

function deterministicDirector(input = {}) {
  const text = normalized(input.message);
  const state = input.journey_state || {};
  const active = state.active_journey || null;
  const size = partySize(text);
  const greeting = /^(?:oi|ola|bom dia|boa tarde|boa noite|e ai)[!,. ]*$/u.test(text);
  const reservation = /\b(?:reserv(?:a|ar|ando|amos|ei|ou|e)?|mesa para|grupo de|somos|estamos em)\b/u.test(text);
  const valet = /\b(?:valet|manobrista)\b/u.test(text);
  const farewell = /\b(?:tchau|ate mais|ate logo|obrigad[oa],? tchau)\b/u.test(text);

  if (farewell) return emptyDirective({ dialogue_act: 'close', social_act: 'farewell', active_journey: active, customer_need: 'encerrar conversa', confidence: 0.9 });
  if (/\b(?:cancela|deixa pra la|nao quero mais)\b/u.test(text)) return emptyDirective({ dialogue_act: 'cancel', active_journey: active, customer_need: 'cancelar jornada atual', confidence: 0.82 });
  if (greeting) return emptyDirective({ dialogue_act: 'greet', social_act: 'return_greeting', active_journey: active, customer_need: 'saudacao', confidence: 0.96 });

  if (valet && active) {
    return emptyDirective({
      dialogue_act: 'answer_side_question',
      social_act: 'acknowledge',
      active_journey: active,
      return_to_previous_topic: true,
      customer_need: 'informacao sobre valet',
      question_to_answer: 'valet_information',
      next_required_information: state.pending_question || null,
      knowledge_queries: ['valet_information'],
      confidence: 0.94
    });
  }

  if (/\b(?:na verdade|corrigindo|agora somos)\b/u.test(text) && size !== null) {
    return emptyDirective({
      dialogue_act: 'correct_information',
      social_act: 'acknowledge',
      active_journey: active,
      facts_corrected: { party_size: size },
      customer_need: 'corrigir quantidade de pessoas',
      next_required_information: state.pending_question || null,
      confidence: 0.9
    });
  }

  if (reservation) {
    return emptyDirective({
      dialogue_act: active === 'reservation' ? 'continue_journey' : 'start_journey',
      social_act: /^(?:oi|ola|bom dia|boa tarde|boa noite)\b/u.test(text) ? 'return_greeting' : 'acknowledge',
      active_journey: 'reservation',
      topic_changed: Boolean(active && active !== 'reservation'),
      facts_added: size === null ? {} : { party_size: size },
      customer_need: 'reserva de mesa',
      next_required_information: state.collected_facts?.reservation_time ? null : 'reservation_time',
      confidence: size === null ? 0.76 : 0.9
    });
  }

  if (/\b(?:voltando|sobre a reserva|e a reserva)\b/u.test(text) && state.suspended_journeys?.length) {
    const suspended = state.suspended_journeys[state.suspended_journeys.length - 1];
    return emptyDirective({
      dialogue_act: 'resume_journey',
      social_act: 'acknowledge',
      active_journey: suspended.journey_id,
      return_to_previous_topic: true,
      customer_need: 'retomar jornada',
      next_required_information: suspended.pending_question || null,
      confidence: 0.86
    });
  }

  if (/^(?:sim|nao|isso|pode ser|ok)$/u.test(text) && active) {
    return emptyDirective({
      dialogue_act: 'continue_journey',
      social_act: 'acknowledge',
      active_journey: active,
      customer_need: 'responder pergunta pendente',
      next_required_information: state.pending_question || null,
      confidence: 0.62
    });
  }

  if (/\b(?:isso|aquilo|o mesmo|esse)\b/u.test(text)) {
    return emptyDirective({
      dialogue_act: 'clarify_reference',
      active_journey: active,
      customer_need: 'resolver referencia ambigua',
      next_required_information: 'reference_clarification',
      confidence: 0.4
    });
  }

  return emptyDirective({ active_journey: active, customer_need: 'conversa livre', confidence: 0.35 });
}

module.exports = { normalized, partySize, emptyDirective, deterministicDirector };
