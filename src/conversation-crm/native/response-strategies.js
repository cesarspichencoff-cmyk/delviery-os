'use strict';

const { deterministicVariant, TATA_WARM_PROFILE } = require('./voice-profile');

const QUESTION_LABELS = Object.freeze({
  date: 'qual dia você prefere',
  time: 'qual horário você gostaria',
  party_size: 'para quantas pessoas seria',
  customer_name: 'qual nome devo usar',
  arrival_estimate: 'qual é a previsão aproximada de chegada',
  pickup_time: 'qual é o horário planejado para retirada',
  requested_items: 'o que você gostaria de pedir',
  order_reference: 'qual é o número do pedido',
  order_channel: 'se o pedido foi feito pelo delivery do TATÁ ou pelo iFood',
  item_name: 'qual item foi afetado',
  evidence_available: 'se você tem alguma foto disponível',
  allergen_signal: 'qual foi o possível alergênico',
  symptoms: 'quais sintomas apareceram',
  onset: 'quando os sintomas começaram',
  people_affected: 'quantas pessoas foram afetadas'
});

const UNCERTAINTY_VARIANTS = Object.freeze([
  'Vou preservar as informações já fornecidas e manter o caso aberto enquanto os pontos pendentes são verificados.',
  'Ainda falta confirmação para concluir, então o contexto permanece preservado e o acompanhamento continua aberto.',
  'O caso continua aberto com as informações disponíveis, sem antecipar uma conclusão.'
]);

function sentence(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return /[.!?]$/u.test(text) ? text : `${text}.`;
}

function minimalQuestion(fields = [], options = {}) {
  const limit = options.limit || fields.length;
  const labels = fields.filter((field) => QUESTION_LABELS[field]).slice(0, limit).map((field) => QUESTION_LABELS[field]);
  if (!labels.length) return '';
  if (labels.length === 1) return `Você pode me dizer ${labels[0]}?`;
  return `Você pode me dizer ${labels.slice(0, -1).join(', ')} e ${labels.at(-1)}?`;
}

function entityValue(classification, field) {
  const entity = classification.entities?.[field];
  return entity && entity.value != null && !['provided_in_message', 'arrival_provided', 'synthetic_or_missing_only'].includes(entity.value)
    ? entity.value
    : null;
}

function informationStrategy(input) {
  const { classification, plan, legacyText, variationKey } = input;
  const topic = classification.subintent;
  if (topic === 'corkage') return 'A taxa de rolha é de R$ 70 😊';
  if (topic === 'valet_information') return 'O valet custa R$ 45 e fica bem em frente ao restaurante.';
  if (topic === 'reservation') {
    return `Que bom que você quer vir ao TATÁ 😊 ${sentence(legacyText)}`;
  }
  if (topic === 'waitlist') {
    return `Caso os horários de reserva estejam completos, ${legacyText.charAt(0).toLowerCase()}${legacyText.slice(1)}`;
  }
  if (topic === 'executive_lunch') {
    return `É uma experiência bem completa para o almoço 😊 ${sentence(legacyText)}`;
  }
  if (topic === 'tata_suggestion') {
    return `A Sugestão Tatá é uma experiência em cinco etapas. ${sentence(legacyText)}`;
  }
  if (topic === 'restaurant_model') {
    return 'Não trabalhamos com rodízio — o restaurante é à la carte. Temos o Almoço Executivo durante a semana e a Sugestão Tatá no jantar, fim de semana e feriados.';
  }
  if (plan.response_size === 'short') return legacyText;
  const opening = deterministicVariant(TATA_WARM_PROFILE.openings.interested, variationKey, 'information-opening');
  return `${opening} ${sentence(legacyText)}`;
}

function missingItemStrategy(input) {
  const { classification, plan, legacyText } = input;
  const item = entityValue(classification, 'item_name');
  const opening = plan.sentiment === 'frustrated'
    ? deterministicVariant(TATA_WARM_PROFILE.openings.frustrated, input.variationKey, 'problem-opening')
    : deterministicVariant(TATA_WARM_PROFILE.openings.concerned, input.variationKey, 'problem-opening');
  if (classification.information_source && /\biFood\b/u.test(legacyText)) {
    return `${opening} ${sentence(legacyText)}`;
  }
  const itemText = item ? ` a falta do ${item}` : ' o item faltante';
  const question = minimalQuestion(classification.fields_missing, { limit: 2 });
  return `${opening} Vou registrar${itemText} junto ao pedido para que a equipe analise o caso com o contexto completo.${question ? ` ${question}` : ''}`;
}

function foodSafetyStrategy(input) {
  const { classification } = input;
  const question = minimalQuestion(classification.fields_missing, { limit: 2 });
  if (classification.intent === 'occurrence.health_symptom') {
    return `Sinto muito pelo que aconteceu. Vou manter o caso aberto para a equipe de qualidade e a gestão acompanharem, sem presumir diagnóstico ou causa.${question ? ` ${question}` : ''}`;
  }
  return `Sinto muito pelo que aconteceu. Vou registrar o relato para análise da equipe de qualidade e da gestão, preservando as informações confirmadas.${question ? ` ${question}` : ''}`;
}

function largeGroupStrategy(input) {
  const { classification, plan } = input;
  const partySize = entityValue(classification, 'party_size');
  const question = minimalQuestion(classification.fields_missing, { limit: 2 });
  const prefix = plan.conversation_stage === 'continuation'
    ? deterministicVariant(TATA_WARM_PROFILE.continuations, input.variationKey, 'large-group-continuation')
    : 'Perfeito.';
  const size = partySize ? ` Como são ${partySize} pessoas,` : '';
  return `${prefix}${size} vou deixar a chegada sinalizada para o acompanhamento operacional, sem confirmar fila ou reserva antes do retorno.${question ? ` ${question}` : ''}`;
}

function reservationContinuationStrategy(input) {
  const { classification, plan } = input;
  if (plan.conversation_stage !== 'continuation') return null;
  const partySize = entityValue(classification, 'party_size');
  const question = minimalQuestion(classification.fields_missing, { limit: 1 });
  if (partySize) return `Perfeito, para ${partySize} pessoas.${question ? ` ${question}` : ''}`;
  return `${deterministicVariant(TATA_WARM_PROFILE.continuations, input.variationKey, 'reservation-continuation')}${question ? ` ${question}` : ''}`;
}

function occurrenceStrategy(input) {
  const { classification, legacyText, plan, variationKey } = input;
  if (classification.policies?.food_safety) return foodSafetyStrategy(input);
  if (classification.intent === 'occurrence.missing_item') return missingItemStrategy(input);
  const opening = plan.sentiment === 'frustrated'
    ? deterministicVariant(TATA_WARM_PROFILE.openings.frustrated, variationKey, 'occurrence-opening')
    : deterministicVariant(TATA_WARM_PROFILE.openings.concerned, variationKey, 'occurrence-opening');
  const question = minimalQuestion(classification.fields_missing, { limit: 2 });
  const body = /Ainda não tenho confirmação suficiente|Vou preservar o contexto/iu.test(legacyText)
    ? deterministicVariant(UNCERTAINTY_VARIANTS, variationKey, 'occurrence-uncertainty')
    : legacyText;
  return `${opening} ${sentence(body)}${question ? ` ${question}` : ''}`;
}

function chooseResponseStrategy(input) {
  const { classification, plan, legacyText } = input;
  const continuation = reservationContinuationStrategy(input);
  if (continuation && (classification.intent === 'reservation.create' || classification.intent === 'waitlist.create')) return continuation;
  if (classification.intent === 'reservation.large_group') return largeGroupStrategy(input);
  if (classification.intent.startsWith('occurrence.') || classification.intent === 'public_exposure') return occurrenceStrategy(input);
  if (/^(?:information|reservation|waitlist|event)\./u.test(classification.intent)) return informationStrategy(input);
  if (classification.intent === 'conversation.ambiguous') {
    return plan.conversation_stage === 'continuation'
      ? 'Quero acompanhar sem perder o contexto. Qual parte você quer esclarecer agora?'
      : 'Quero entender direitinho antes de seguir. Você pode me contar um pouco mais?';
  }
  if (/Ainda não tenho confirmação suficiente|Vou preservar o contexto/iu.test(legacyText)) {
    return deterministicVariant(UNCERTAINTY_VARIANTS, input.variationKey, 'general-uncertainty');
  }
  return legacyText;
}

module.exports = {
  QUESTION_LABELS,
  sentence,
  minimalQuestion,
  entityValue,
  informationStrategy,
  missingItemStrategy,
  foodSafetyStrategy,
  largeGroupStrategy,
  reservationContinuationStrategy,
  occurrenceStrategy,
  UNCERTAINTY_VARIANTS,
  chooseResponseStrategy
};
