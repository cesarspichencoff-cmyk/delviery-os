'use strict';

const { deepFreeze } = require('./catalogs/operational');
const { sha256 } = require('./deterministic');
const { TATA_WARM_PROFILE } = require('./voice-profile');

const QUESTION_LABELS = Object.freeze({
  intent: 'Você pode me contar se a dúvida é sobre o restaurante, uma reserva ou um pedido?',
  date: 'Para qual dia seria?',
  time: 'Qual horário você prefere?',
  party_size: 'Para quantas pessoas seria?',
  customer_name: 'Qual nome devo usar?',
  arrival_estimate: 'Qual é a previsão aproximada de chegada?',
  pickup_time: 'Qual horário você planeja para a retirada?',
  requested_items: 'O que você gostaria de pedir?',
  order_reference: 'Qual é o número do pedido?',
  order_channel: 'O pedido foi feito pelo delivery do TATÁ ou pelo iFood?',
  item_name: 'Qual item foi afetado?',
  expected_quantity: 'Qual era a quantidade esperada?',
  received_quantity: 'Qual quantidade chegou?',
  personalization: 'Qual personalização foi pedida?',
  evidence_available: 'Você tem alguma foto disponível?',
  allergen_signal: 'Qual foi o possível alergênico?',
  symptoms: 'Quais sintomas apareceram?',
  onset: 'Quando os sintomas começaram?',
  people_affected: 'Quantas pessoas foram afetadas?',
  quality_signal: 'O que chamou sua atenção na qualidade do item?'
});

const SUBJECT_RULES = Object.freeze([
  [/\bacessibilidade\b/iu, 'acessibilidade'],
  [/\bcrian[cç]a\b/iu, 'atendimento para crianças'],
  [/\bvegetarian[ao]\b/iu, 'opções vegetarianas'],
  [/\bsem gl[uú]ten\b/iu, 'opções sem glúten'],
  [/\bchef\b/iu, 'experiência do chef'],
  [/\bvale[- ]?refei[cç][aã]o\b/iu, 'vale-refeição'],
  [/\bdividir a conta\b/iu, 'divisão da conta'],
  [/\btaxa de entrega\b/iu, 'taxa de entrega'],
  [/\b(?:atrasad[oa]|demorando)\b/iu, 'atraso do pedido'],
  [/\bretirar|retirada\b/iu, 'retirada no restaurante'],
  [/\bevento|grupo\b/iu, 'eventos e grupos'],
  [/\bifood\b/iu, 'iFood'],
  [/\bdados|privacidade|armazenad[oa]s\b/iu, 'privacidade dos seus dados'],
  [/\bfalar com (?:uma pessoa|algu[eé]m|humano)\b/iu, 'atendimento humano']
]);

function sentence(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return /[.!?]$/u.test(text) ? text : `${text}.`;
}

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/gu, ' ').trim();
}

function deterministicVariant(values, variationContext, slot) {
  if (!Array.isArray(values) || values.length === 0) return '';
  const key = [
    variationContext.seed,
    variationContext.conversation_id,
    variationContext.turn_order,
    variationContext.intent,
    variationContext.strategy_id,
    variationContext.customer_state,
    slot
  ].join('|');
  const index = Number.parseInt(sha256(key).slice(0, 8), 16) % values.length;
  return values[index];
}

function variationKey(context) {
  return sha256([
    context.seed,
    context.conversation_id,
    context.turn_order,
    context.intent,
    context.strategy_id,
    context.customer_state
  ].join('|')).slice(0, 20);
}

function entityValue(classification, plan, field) {
  const current = classification.entities?.[field];
  if (current && current.value != null && !['missing', 'conflict'].includes(current.state)) return current.value;
  const facts = [...(plan.new_facts || []), ...(plan.known_facts || [])];
  return facts.find((fact) => fact.field === field)?.value ?? null;
}

function subjectFromText(sourceText) {
  const rule = SUBJECT_RULES.find(([pattern]) => pattern.test(String(sourceText || '')));
  return rule?.[1] || null;
}

function questionFor(field) {
  return QUESTION_LABELS[field] || null;
}

function minimalQuestions(fields = [], options = {}) {
  const unique = [...new Set(fields)].filter((field) => QUESTION_LABELS[field]);
  const selected = unique.slice(0, options.limit || unique.length);
  if (!selected.length) return '';
  if (selected.length === 1) return QUESTION_LABELS[selected[0]];
  if (selected.length === 2 && selected.includes('order_reference') && selected.includes('order_channel')) {
    return 'Pode me informar o número do pedido e se ele foi feito pelo delivery do TATÁ ou pelo iFood?';
  }
  if (selected.length === 2 && selected.includes('customer_name') && selected.includes('arrival_estimate')) {
    return 'Pode me informar seu nome e a previsão aproximada de chegada?';
  }
  return selected.map((field) => QUESTION_LABELS[field]).join(' ');
}

function uniqueMessages(values = []) {
  const seen = new Set();
  return values.filter((value) => {
    const key = normalize(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function knowledgeMessages(plan, options = {}) {
  const messages = uniqueMessages([
    ...(plan.direct_answer || []),
    ...(options.includeExplanations === false ? [] : (plan.explanation_needed || [])),
    ...(options.includeDirections === false ? [] : (plan.direction || []))
  ]);
  return messages.slice(0, options.limit || messages.length).map(sentence).join(' ');
}

function warmClosing(plan, conversation, variationContext) {
  if (['sensitive', 'critical'].includes(plan.gravity)) return '';
  const text = normalize(conversation.source_text);
  if (/\b(?:endereco|horario|abre|funcionamento)\b/u.test(text)) {
    return deterministicVariant([
      'Vai ser um prazer receber você.',
      'Esperamos ver você por aqui.'
    ], variationContext, 'visit_closing');
  }
  if (plan.action_playbook === 'experiences') return 'Se quiser, também posso te ajudar a escolher a experiência que combina melhor com o momento.';
  if (plan.action_playbook === 'own_delivery') return 'Se quiser, me diga qual opção você prefere e eu te oriento pelo caminho certo.';
  return '';
}

function acknowledgement(plan, variationContext, kind = 'neutral') {
  const components = TATA_WARM_PROFILE.components;
  if (plan.conversation_stage === 'continuation') return deterministicVariant(components.continuation, variationContext, 'continuation');
  if (kind === 'sensitive') return deterministicVariant(components.sensitive_acknowledgement, variationContext, 'sensitive');
  if (kind === 'problem') return deterministicVariant(components.problem_acknowledgement, variationContext, 'problem');
  if (plan.customer_state === 'interested') return deterministicVariant(components.interested_acknowledgement, variationContext, 'interested');
  return deterministicVariant(components.neutral_acknowledgement, variationContext, 'neutral');
}

function concreteIssue(classification, sourceText) {
  const item = classification.entities?.item_name?.value;
  if (classification.intent === 'occurrence.missing_item') return item ? `a falta de ${item}` : 'a falta de um item';
  if (classification.intent === 'occurrence.wrong_item') return item ? `o item diferente (${item})` : 'o item diferente que chegou';
  if (classification.intent === 'occurrence.wrong_quantity') return 'a diferença entre a quantidade pedida e a recebida';
  if (classification.intent === 'occurrence.personalization_ignored') return 'a personalização que não foi respeitada';
  if (classification.intent === 'occurrence.foreign_body') return /\bcabelo\b/iu.test(sourceText) ? 'o cabelo encontrado na comida' : 'o corpo estranho encontrado';
  if (classification.intent === 'occurrence.allergen') return 'a possível reação a um alergênico';
  if (classification.intent === 'occurrence.health_symptom') return 'os sintomas relatados';
  if (classification.intent === 'occurrence.quality') return /\bcheiro\b/iu.test(sourceText) ? 'o cheiro diferente percebido' : 'o problema de qualidade relatado';
  return subjectFromText(sourceText) || 'o que aconteceu';
}

function fallbackText(input) {
  const { plan, classification, conversation, variationContext } = input;
  const subject = subjectFromText(conversation.source_text);
  const question = minimalQuestions(plan.mandatory_questions, { limit: plan.strategy_id === 'oke_events' ? 2 : 1 });
  switch (plan.fallback_reason) {
    case 'context_conflict':
      return `Recebi informações diferentes sobre ${subject || 'o contexto'} e não vou escolher uma sem confirmação.${question ? ` ${question}` : ''}`;
    case 'public_fact_unconfirmed':
      if (classification.intent === 'information.hours') return `O horário de feriados ainda não está configurado.${question ? ` ${question}` : ''}`;
      return `Ainda não tenho uma informação confirmada sobre ${subject || 'esse ponto'}.${question ? ` ${question}` : ''}`;
    case 'stale_operational_information':
      return `A última informação sobre ${subject || 'esse assunto'} pode estar desatualizada. Vou preservar o último estado conhecido sem apresentá-lo como atual.${question ? ` ${question}` : ''}`;
    case 'action_unavailable':
      return `Não foi possível concluir ${subject || 'essa ação'} agora. O que já está confirmado permanece preservado.${question ? ` ${question}` : ''}`;
    case 'integration_not_observable':
      return `Ainda não recebi uma confirmação observável sobre ${subject || 'essa ação'}. O contexto permanece aberto.${question ? ` ${question}` : ''}`;
    case 'safe_internal_error':
      return `Não consegui concluir a consulta com segurança agora. O contexto foi preservado sem antecipar uma resposta.${question ? ` ${question}` : ''}`;
    case 'human_assistance_needed':
      return `Esse caso precisa de acompanhamento humano antes de qualquer conclusão.${question ? ` ${question}` : ''}`;
    case 'intent_ambiguous': {
      const text = String(conversation.source_text || '');
      if (/\b(?:gostei|adorei|amei)\b/iu.test(text)) {
        const emoji = plan.emoji_policy === 'none' ? '' : ' 😊';
        return `Que bom saber que você gostou da experiência${emoji} Obrigado por contar.`;
      }
      if (subject === 'atendimento humano') return 'Entendi que você quer falar com uma pessoa. Ainda não tenho confirmação de transferência, mas posso preservar o contexto para o atendimento.';
      if (subject === 'privacidade dos seus dados') return 'Entendi sua dúvida sobre privacidade. Ainda não tenho uma política confirmada para detalhar a retenção dos dados, então não vou inventar esse prazo.';
      if (subject) return `${acknowledgement(plan, variationContext)} Sobre ${subject}, ainda não tenho uma informação confirmada para responder isso com segurança. O que você gostaria de confirmar sobre esse assunto?`;
      return `${acknowledgement(plan, variationContext)} Você pode me contar se a dúvida é sobre o restaurante, uma reserva ou um pedido?`;
    }
    default:
      return `Ainda não tenho uma confirmação segura sobre ${subject || 'esse ponto'}.${question ? ` ${question}` : ''}`;
  }
}

function informationText(input) {
  const { plan, authorizedText, variationContext, conversation } = input;
  const informed = knowledgeMessages(plan, { limit: 2 });
  const base = informed || (authorizedText ? sentence(authorizedText) : '');
  if (!base) return fallbackText(input);
  const closing = warmClosing(plan, conversation, variationContext);
  const followUp = plan.product_guidance_mode
    ? (plan.contextual_question || '')
    : (plan.contextual_question || conversation.pattern_decision?.question_to_resume || '');
  if (plan.customer_state === 'interested' && plan.conversation_stage === 'opening') {
    return `${acknowledgement(plan, variationContext)} ${base}${closing ? ` ${closing}` : ''}${followUp ? ` ${followUp}` : ''}`;
  }
  return `${base}${closing ? ` ${closing}` : ''}${followUp ? ` ${followUp}` : ''}`;
}

function reservationText(input) {
  const { classification, plan, authorizedText, conversation, variationContext } = input;
  const source = String(conversation.source_text || '');
  const asksToAct = /\b(?:quero fazer|quero reservar|reservar para|confirmar minha|entrar na fila)\b/iu.test(source);
  const hasSelfServiceLink = (plan.authorized_surface?.links || []).some((link) => /reservation\.getin\.app/iu.test(link));
  const question = (asksToAct || plan.conversation_stage === 'continuation') && !hasSelfServiceLink
    ? minimalQuestions(plan.mandatory_questions, { limit: 1 })
    : '';
  const intro = plan.conversation_stage === 'continuation' ? acknowledgement(plan, variationContext) : 'Claro.';
  const partySize = entityValue(classification, plan, 'party_size');
  if (plan.conversation_stage === 'continuation') {
    const continuity = partySize ? `${intro.replace(/[.]$/u, '')}, para ${partySize} pessoas.` : intro;
    return `${continuity}${question ? ` ${question}` : ''}`;
  }
  const answer = knowledgeMessages(plan, { limit: 2 }) || sentence(authorizedText);
  return `${intro} ${answer}${question ? ` ${question}` : ''} Se precisar, eu sigo com você por aqui.`;
}

function largeGroupText(input) {
  const { classification, plan, variationContext } = input;
  const size = entityValue(classification, plan, 'party_size');
  const intro = plan.conversation_stage === 'continuation' ? acknowledgement(plan, variationContext) : 'Perfeito.';
  const question = minimalQuestions(plan.mandatory_questions, { limit: 2 });
  return `${intro}${size ? ` Como são ${size} pessoas,` : ''} a disponibilidade precisa ser verificada antes de confirmar mesa, fila ou reserva.${question ? ` ${question}` : ''}`;
}

function occurrenceText(input) {
  const { classification, plan, conversation, authorizedText, variationContext } = input;
  const issue = concreteIssue(classification, conversation.source_text);
  const sensitive = plan.strategy_id === 'food_safety' || plan.strategy_id === 'quality';
  const intro = acknowledgement(plan, variationContext, sensitive ? 'sensitive' : 'problem');
  const question = minimalQuestions(plan.mandatory_questions, { limit: sensitive ? 2 : 2 });

  if (plan.strategy_id === 'food_safety') {
    const guidance = knowledgeMessages(plan, { limit: 3 });
    return `${intro} Entendi ${issue}. ${guidance || 'Esse relato é sério e precisa de acompanhamento da equipe de qualidade e da gestão.'}${question ? ` ${question}` : ''}`;
  }
  if (plan.strategy_id === 'quality') {
    const guidance = knowledgeMessages(plan, { limit: 2 });
    return `${intro} Entendi ${issue}. ${guidance || 'Vou preservar o relato para análise da equipe de qualidade e da gestão, sem antecipar a causa.'}${question ? ` ${question}` : ''}`;
  }
  if (classification.intent === 'occurrence.refund_request' && authorizedText) {
    return sentence(authorizedText);
  }
  if (classification.intent === 'occurrence.missing_item') {
    const item = entityValue(classification, plan, 'item_name');
    const concrete = item ? `a falta de ${item}` : 'o item faltante';
    const guidance = knowledgeMessages(plan, { limit: 2 });
    const next = [guidance, question].filter(Boolean).join(' ')
      || 'Vou preservar as informações já fornecidas para o próximo passo correto.';
    return `${intro} Entendi ${concrete}. ${next}`;
  }
  const guidance = knowledgeMessages(plan, { limit: 2 });
  return `${intro} Entendi ${issue}. ${guidance || 'Vou preservar o relato para a análise correta.'}${question ? ` ${question}` : ''}`;
}

function eventText(input) {
  const { plan, conversation, variationContext } = input;
  const answer = knowledgeMessages(plan, { limit: 2 }) || fallbackText(input);
  const question = minimalQuestions(plan.mandatory_questions, { limit: 3 });
  const intro = plan.conversation_stage === 'continuation' ? acknowledgement(plan, variationContext) : 'Claro.';
  return `${intro} ${answer}${question ? ` ${question}` : ''}`;
}

function praiseText(input) {
  const answer = knowledgeMessages(input.plan, { limit: 1 });
  if (answer) return answer;
  return `${acknowledgement(input.plan, input.variationContext)} Obrigado por compartilhar isso com a gente.`;
}

function capabilityLimitText(input) {
  if (input.plan.fallback_reason) return fallbackText(input);
  return informationText(input);
}

function socialGreetingText(input) {
  const source = normalize(input.conversation.source_text);
  const salutation = source.startsWith('bom dia')
    ? 'Bom dia'
    : (source.startsWith('boa tarde')
      ? 'Boa tarde'
      : (source.startsWith('boa noite') ? 'Boa noite' : 'Olá'));
  const social = source.includes('tudo bem')
    ? (source === 'tudo bem?' || source === 'tudo bem' ? 'Tudo bem por aqui.' : `${salutation}! Tudo bem por aqui.`)
    : `${salutation}!`;
  const resume = input.conversation.pattern_decision?.question_to_resume;
  return `${social} ${resume || 'Como posso ajudar?'}`;
}

function patternDirectedText(input) {
  const pattern = input.conversation.pattern_decision;
  if (!pattern) return null;
  if (pattern.pattern === 'greeting') return socialGreetingText(input);
  if (pattern.pattern === 'chitchat') {
    return `${acknowledgement(input.plan, input.variationContext)} ${pattern.question_to_resume || 'Como posso ajudar?'}`;
  }
  if (pattern.pattern === 'repeat') {
    const previous = (input.conversation.previous_responses || []).filter(Boolean).at(-1);
    return previous ? `Claro. ${previous}` : 'Claro. O que você gostaria que eu repetisse?';
  }
  if (pattern.pattern === 'correction') {
    const answer = knowledgeMessages(input.plan, { limit: 1 });
    const question = input.plan.contextual_question || pattern.question_to_resume;
    if (answer) return `${answer}${question ? ` ${question}` : ''}`;
    return `Certo, atualizei essa informação.${question ? ` ${question}` : ''}`;
  }
  if (pattern.pattern === 'resume') {
    const answer = knowledgeMessages(input.plan, { limit: 1 });
    const question = pattern.question_to_resume || minimalQuestions(input.plan.mandatory_questions, { limit: 1 });
    return `Claro, vamos retomar de onde paramos.${answer ? ` ${answer}` : ''}${question ? ` ${question}` : ''}`;
  }
  if (pattern.pattern === 'side_question' && !(input.plan.direct_answer || []).length) {
    const subject = subjectFromText(input.conversation.source_text);
    return `Ainda não tenho uma confirmação segura sobre ${subject || 'essa pergunta lateral'}.${pattern.question_to_resume ? ` ${pattern.question_to_resume}` : ''}`;
  }
  if (pattern.pattern === 'cancel') return 'Tudo bem. Interrompi este fluxo sem apagar o histórico da conversa.';
  if (pattern.pattern === 'close') return 'Tudo bem. Até logo!';
  if (
    pattern.pattern === 'clarification'
    && pattern.clarification_question
    && !(input.plan.direct_answer || []).length
  ) return pattern.clarification_question;
  return null;
}

function composeControlledText(input = {}) {
  const plan = input.plan;
  const classification = input.classification || {};
  const conversation = input.conversation || {};
  const authorizedText = String(input.authorized_text || plan?.authorized_surface?.text || '');
  const variationContext = {
    seed: input.seed || 'TATA-SIM-V1',
    conversation_id: conversation.conversation_id || 'SIM-CONV-UNKNOWN',
    turn_order: Number(conversation.turn_order || 1),
    intent: classification.intent || plan.intent,
    strategy_id: plan.strategy_id,
    customer_state: plan.customer_state
  };
  const shared = { ...input, plan, classification, conversation, authorizedText, variationContext };
  let text = patternDirectedText(shared);
  if (text) {
    // O Pattern Engine escolheu o movimento; esta camada apenas o verbaliza.
  } else if (plan.action_playbook === 'praise_and_suggestion') text = praiseText(shared);
  else if (plan.action_playbook === 'events_oke') text = eventText(shared);
  else if (plan.product_guidance_mode && plan.direct_answer?.length) text = informationText(shared);
  else if (plan.direct_answer?.length && ['ambiguity', 'continuation', 'capability_limit'].includes(plan.strategy_id)) text = informationText(shared);
  else if (plan.strategy_id === 'large_group') text = largeGroupText(shared);
  else if (['missing_item', 'wrong_item', 'wrong_quantity', 'personalization_ignored', 'complaint', 'quality', 'food_safety', 'delay'].includes(plan.strategy_id)) text = occurrenceText(shared);
  else if (['reservation', 'waitlist'].includes(plan.strategy_id)) text = reservationText(shared);
  else if (plan.strategy_id === 'capability_limit' || plan.fallback_reason) text = capabilityLimitText(shared);
  else if (plan.strategy_id === 'ambiguity' || plan.strategy_id === 'continuation') text = fallbackText(shared);
  else text = informationText(shared);

  return deepFreeze({
    schema_version: 'controlled-response-draft-v1',
    text: sentence(text),
    variation_key: variationKey(variationContext),
    strategy_id: plan.strategy_id,
    fallback_reason: plan.fallback_reason,
    tone_profile: plan.tone_profile,
    synthetic: true
  });
}

module.exports = {
  QUESTION_LABELS,
  SUBJECT_RULES,
  sentence,
  normalize,
  deterministicVariant,
  variationKey,
  entityValue,
  subjectFromText,
  questionFor,
  minimalQuestions,
  acknowledgement,
  concreteIssue,
  fallbackText,
  informationText,
  reservationText,
  largeGroupText,
  occurrenceText,
  eventText,
  praiseText,
  knowledgeMessages,
  warmClosing,
  socialGreetingText,
  patternDirectedText,
  composeControlledText
};
