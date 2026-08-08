'use strict';

const { deepFreeze } = require('./catalogs/operational');
const { countEmoji, emojiLimit, TATA_WARM_PROFILE } = require('./voice-profile');
const { runServiceQualityGates } = require('./service-quality-gates');

const URL_PATTERN = /https?:\/\/[^\s)\]}>,]+/giu;
const NUMBER_PATTERN = /(?:R\$\s*)?\d+(?:[.,]\d+)?/giu;
const TECHNICAL_PATTERN = /\b(?:intent|subintent|capability_id|policy_id|scenario_id|idempotency|persist[eê]ncia|stack trace|event_id)\b/iu;
const CUSTOMER_INTERNAL_LANGUAGE_PATTERN = /(?:evid[eê]ncia p[uú]blica|filtros? confirmados?|crit[eé]rios? confirmados?|fonte p[uú]blica|\bcandidat[oa]s?\b|\bconfidence\b|\binfer[eê]ncia\b|\bprovenance\b|\bjourney\b|approved envelope|response plan|\bfallback\b|pattern engine|\bwriter\b|mantive (?:os )?crit[eé]rios|processei (?:os )?dados|registrei (?:o|a|sua) prefer[eê]ncia)/iu;
const ORACLE_PATTERN = /\b(?:TATA-SC-\d+|SCENARIO_CATALOG|scenario_oracle|ideal_response|oracle_payload)\b/iu;
const AUTOMATIC_COMPENSATION = /\b(?:reembolso|cr[eé]dito|cortesia|reposi[cç][aã]o)\b.{0,40}\b(?:confirmad[oa]|liberad[oa]|concedid[oa]|enviad[oa]|autom[aá]tic[oa])\b/iu;
const UNVERIFIED_ACTION = /\b(?:reserva|fila|pedido|transfer[eê]ncia|encaminhamento)\b.{0,45}\b(?:confirmad[oa]|conclu[ií]d[oa]|realizad[oa])\b/iu;
const LIABILITY = /(?:\ba culpa [eé]|\b[eé] responsabilidade (?:do|da)|\bn[oó]s causamos|\bcausou com certeza)/iu;
const MEDICAL = /(?:\bo diagn[oó]stico [eé]|\bdiagnosticamos|\bfoi causado por|\bcom certeza foi|\bn[aã]o [eé] nada|\btome (?:um|o) rem[eé]dio)/iu;
const PLATFORM_BLAME = /\b(?:a culpa [eé] do iFood|o iFood [eé] o culpado|responsabilidade do iFood|problema [eé] do iFood)\b/iu;
const QUESTION_SIGNATURES = Object.freeze({
  intent: /(?:\b(?:d[uú]vida|assunto).*(?:restaurante|reserva|pedido)\b|\bo que .*\bconfirmar sobre\b)/iu,
  date: /\b(?:qual|que) (?:dia|data)\b/iu,
  time: /\bqual hor[aá]rio\b/iu,
  party_size: /\bquantas pessoas\b/iu,
  customer_name: /\b(?:seu nome|qual nome)\b/iu,
  arrival_estimate: /\bprevis[aã]o aproximada de chegada\b/iu,
  pickup_time: /\b(?:qual )?hor[aá]rio.*retirada\b/iu,
  requested_items: /\bo que (?:voc[eê] )?(?:gostaria|quer).*(?:pedir|pedido)\b/iu,
  order_reference: /\bn[uú]mero do pedido\b/iu,
  order_channel: /\bdelivery do TAT[AÁ].*iFood\b/iu,
  item_name: /\bqual item\b/iu,
  expected_quantity: /\bquantidade esperada\b/iu,
  received_quantity: /\bquantidade (?:chegou|recebida)\b/iu,
  personalization: /\bqual personaliza[cç][aã]o\b/iu,
  evidence_available: /\b(?:alguma )?foto\b/iu,
  allergen_signal: /\bposs[ií]vel alerg[eê]nico\b/iu,
  symptoms: /\bquais sintomas\b/iu,
  onset: /\bquando os sintomas come[cç]aram\b/iu,
  people_affected: /\bquantas pessoas foram afetadas\b/iu,
  quality_signal: /\bqualidade do item\b/iu
});

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/gu, ' ').trim();
}

function urlsOf(text) {
  return [...String(text || '').matchAll(URL_PATTERN)].map((match) => match[0].replace(/[.!?]+$/u, ''));
}

function numbersOf(text) {
  return [...String(text || '').replace(URL_PATTERN, ' ').matchAll(NUMBER_PATTERN)].map((match) => match[0].replace(/\s+/gu, ' ').trim());
}

function allowedNumbers(plan) {
  const values = new Set(plan.authorized_surface?.numbers || []);
  for (const fact of [...(plan.known_facts || []), ...(plan.new_facts || [])]) {
    if (typeof fact.value === 'number') values.add(String(fact.value));
    if (typeof fact.value === 'string' && /^(?:R\$\s*)?\d+(?:[.,]\d+)?$/u.test(fact.value)) values.add(fact.value);
  }
  return values;
}

function questionSentences(text) {
  return String(text || '')
    .replace(URL_PATTERN, ' ')
    .split(/(?<=[.!?])\s+/u)
    .filter((part) => part.includes('?'));
}

function validatePostComposition(input = {}) {
  const text = String(input.text || '').trim();
  const plan = input.plan || {};
  const findings = [];
  const allowedLinks = new Set(plan.authorized_surface?.links || []);
  const allowedNumberSet = allowedNumbers(plan);
  const previousQuestions = new Set((input.previous_responses || []).flatMap(questionSentences).map(normalize));
  const currentQuestions = questionSentences(text);

  if (!text) findings.push('EMPTY_RESPONSE');
  for (const link of urlsOf(text)) if (!allowedLinks.has(link)) findings.push('UNAPPROVED_LINK');
  for (const number of numbersOf(text)) if (!allowedNumberSet.has(number)) findings.push('UNAPPROVED_NUMBER');
  if (TECHNICAL_PATTERN.test(text)) findings.push('TECHNICAL_INFORMATION_EXPOSED');
  if (CUSTOMER_INTERNAL_LANGUAGE_PATTERN.test(text)) findings.push('CUSTOMER_FACING_INTERNAL_LANGUAGE_LEAK');
  if (ORACLE_PATTERN.test(text)) findings.push('ORACLE_INFORMATION_EXPOSED');
  if (AUTOMATIC_COMPENSATION.test(text)) findings.push('AUTOMATIC_COMPENSATION');
  if (LIABILITY.test(text)) findings.push('LIABILITY_ADMISSION');
  if (MEDICAL.test(text)) findings.push('MEDICAL_OR_CAUSALITY_CLAIM');
  if (PLATFORM_BLAME.test(text)) findings.push('PLATFORM_BLAME');
  if (UNVERIFIED_ACTION.test(text) && !(plan.verified_actions || []).length) findings.push('UNVERIFIED_ACTION_CONFIRMATION');
  if (countEmoji(text) > emojiLimit(plan.emoji_policy)) findings.push('EMOJI_POLICY_VIOLATION');
  if (['sensitive', 'critical'].includes(plan.gravity) && /\p{Extended_Pictographic}/u.test(text)) findings.push('SENSITIVE_EMOJI');
  if (['sensitive', 'critical'].includes(plan.gravity) && /\b(?:imperd[ií]vel|promo[cç][aã]o|aproveite)\b/iu.test(text)) findings.push('SENSITIVE_PROMOTION');
  if (TATA_WARM_PROFILE.prohibited_phrases.some((phrase) => normalize(text).includes(normalize(phrase)))) findings.push('BUREAUCRATIC_PHRASE');
  if (currentQuestions.some((question) => {
    const current = normalize(question);
    return [...previousQuestions].some((previous) => current === previous || current.endsWith(previous) || previous.endsWith(current));
  })) findings.push('REPEATED_QUESTION');

  for (const field of plan.mandatory_questions || []) {
    const signature = QUESTION_SIGNATURES[field];
    if (signature && !signature.test(text)) findings.push(`MANDATORY_QUESTION_MISSING:${field}`);
  }
  const socialQuestionAllowed = ['greeting', 'chitchat', 'repeat', 'resume'].includes(input.pattern_decision?.pattern);
  const contextualQuestion = normalize(plan.contextual_question || '');
  const contextualQuestionAllowed = Boolean(contextualQuestion) && currentQuestions.some((question) => {
    const current = normalize(question);
    return current === contextualQuestion || current.endsWith(contextualQuestion) || contextualQuestion.endsWith(current);
  });
  if (!(plan.mandatory_questions || []).length && currentQuestions.length && plan.response_goal !== 'clarify' && !socialQuestionAllowed && !contextualQuestionAllowed) findings.push('UNAUTHORIZED_QUESTION');

  const facts = [...(plan.known_facts || []), ...(plan.new_facts || [])];
  const requiredConcrete = plan.strategy_contract?.mandatory_components || [];
  if (requiredConcrete.includes('concrete_item_reference')) {
    const item = (plan.new_facts || []).find((fact) => fact.field === 'item_name')?.value
      ?? [...(plan.known_facts || [])].reverse().find((fact) => fact.field === 'item_name')?.value;
    if (item && !normalize(text).includes(normalize(item))) findings.push('KNOWN_ITEM_OMITTED');
  }
  if (requiredConcrete.includes('concrete_group_reference')) {
    const party = facts.find((fact) => fact.field === 'party_size')?.value;
    if (party != null && !numbersOf(text).includes(String(party))) findings.push('KNOWN_PARTY_SIZE_OMITTED');
  }

  const maximum = { short: 500, medium: 700, careful: 900 }[plan.length] || 700;
  if (text.length > maximum) findings.push('RESPONSE_TOO_LONG');
  const serviceQuality = runServiceQualityGates({ text, plan });
  if (!serviceQuality.gates.available_knowledge_unused.passed) findings.push('AVAILABLE_KNOWLEDGE_UNUSED');
  if (!serviceQuality.gates.humanized_but_unhelpful.passed) findings.push('HUMANIZED_BUT_UNHELPFUL');

  return deepFreeze({
    passed: findings.length === 0,
    finding_codes: [...new Set(findings)],
    checks: {
      links: urlsOf(text).length,
      numbers: numbersOf(text).length,
      questions: currentQuestions.length,
      emoji: countEmoji(text),
      maximum_length: maximum,
      service_quality: serviceQuality
    }
  });
}

function independentQuestion(field) {
  const text = {
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
  }[field];
  return text || '';
}

function safeResponseAfterRejection(input = {}) {
  const plan = input.plan || {};
  const facts = [...(plan.new_facts || []), ...(plan.known_facts || [])];
  const item = facts.find((fact) => fact.field === 'item_name')?.value;
  const party = facts.find((fact) => fact.field === 'party_size')?.value;
  const questions = (plan.mandatory_questions || []).map(independentQuestion).filter(Boolean).join(' ');
  let text;

  if (plan.gravity === 'critical') {
    const guidance = [...(plan.direct_answer || []), ...(plan.explanation_needed || [])].slice(0, 2).join(' ');
    text = `Sinto muito pelo que aconteceu. ${guidance || 'Esse relato precisa de acompanhamento da equipe de qualidade e da gestão.'}${questions ? ` ${questions}` : ''}`;
  } else if (plan.strategy_id === 'missing_item') {
    text = `Entendi${item ? ` a falta de ${item}` : ' o item faltante'}. Vou orientar o próximo passo pelo canal do pedido.${questions ? ` ${questions}` : ''}`;
  } else if (plan.strategy_id === 'large_group') {
    text = `${party ? `Como são ${party} pessoas, e` : 'E'}sse atendimento precisa de acompanhamento operacional antes de confirmar fila ou reserva.${questions ? ` ${questions}` : ''}`;
  } else if (plan.authorized_surface?.text && plan.response_goal === 'inform') {
    text = plan.authorized_surface.text;
  } else {
    text = `Ainda não tenho uma confirmação segura para concluir esse ponto.${questions ? ` ${questions}` : ''}`;
  }
  return sentence(text);
}

function sentence(value) {
  const text = String(value || '').trim();
  return /[.!?]$/u.test(text) ? text : `${text}.`;
}

module.exports = {
  URL_PATTERN,
  NUMBER_PATTERN,
  TECHNICAL_PATTERN,
  CUSTOMER_INTERNAL_LANGUAGE_PATTERN,
  ORACLE_PATTERN,
  PLATFORM_BLAME,
  QUESTION_SIGNATURES,
  normalize,
  urlsOf,
  numbersOf,
  allowedNumbers,
  questionSentences,
  validatePostComposition,
  independentQuestion,
  safeResponseAfterRejection
};
