'use strict';

const { deepFreeze } = require('./catalogs/operational');
const { countEmoji, emojiLimit, TATA_WARM_PROFILE } = require('./voice-profile');

const URL_PATTERN = /https?:\/\/[^\s)\]}>,]+/giu;
const NUMBER_PATTERN = /(?:R\$\s*)?\d+(?:[.,]\d+)?/giu;
const TECHNICAL_PATTERN = /\b(?:intent|subintent|capability_id|policy_id|scenario_id|idempotency|persist[eê]ncia|stack trace|event_id)\b/iu;
const ORACLE_PATTERN = /\b(?:TATA-SC-\d+|SCENARIO_CATALOG|scenario_oracle|ideal_response|oracle_payload)\b/iu;
const AUTOMATIC_COMPENSATION = /\b(?:reembolso|cr[eé]dito|cortesia|reposi[cç][aã]o)\b.{0,40}\b(?:confirmad[oa]|liberad[oa]|concedid[oa]|enviad[oa]|autom[aá]tic[oa])\b/iu;
const UNVERIFIED_ACTION = /\b(?:reserva|fila|pedido|transfer[eê]ncia|encaminhamento)\b.{0,45}\b(?:confirmad[oa]|conclu[ií]d[oa]|realizad[oa])\b/iu;
const LIABILITY = /(?:\ba culpa [eé]|\b[eé] responsabilidade (?:do|da)|\bn[oó]s causamos|\bcausou com certeza)/iu;
const MEDICAL = /(?:\bo diagn[oó]stico [eé]|\bdiagnosticamos|\bfoi causado por|\bcom certeza foi|\bn[aã]o [eé] nada|\btome (?:um|o) rem[eé]dio)/iu;
const QUESTION_SIGNATURES = Object.freeze({
  intent: /\b(?:d[uú]vida|assunto).*(?:restaurante|reserva|pedido)\b/iu,
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
  return String(text || '').split(/(?<=[.!?])\s+/u).filter((part) => part.includes('?'));
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
  if (ORACLE_PATTERN.test(text)) findings.push('ORACLE_INFORMATION_EXPOSED');
  if (AUTOMATIC_COMPENSATION.test(text)) findings.push('AUTOMATIC_COMPENSATION');
  if (LIABILITY.test(text)) findings.push('LIABILITY_ADMISSION');
  if (MEDICAL.test(text)) findings.push('MEDICAL_OR_CAUSALITY_CLAIM');
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
  if (!(plan.mandatory_questions || []).length && currentQuestions.length && plan.response_goal !== 'clarify') findings.push('UNAUTHORIZED_QUESTION');

  const facts = [...(plan.known_facts || []), ...(plan.new_facts || [])];
  const requiredConcrete = plan.strategy_contract?.mandatory_components || [];
  if (requiredConcrete.includes('concrete_item_reference')) {
    const item = facts.find((fact) => fact.field === 'item_name')?.value;
    if (item && !normalize(text).includes(normalize(item))) findings.push('KNOWN_ITEM_OMITTED');
  }
  if (requiredConcrete.includes('concrete_group_reference')) {
    const party = facts.find((fact) => fact.field === 'party_size')?.value;
    if (party != null && !numbersOf(text).includes(String(party))) findings.push('KNOWN_PARTY_SIZE_OMITTED');
  }

  const maximum = { short: 500, medium: 700, careful: 900 }[plan.length] || 700;
  if (text.length > maximum) findings.push('RESPONSE_TOO_LONG');

  return deepFreeze({
    passed: findings.length === 0,
    finding_codes: [...new Set(findings)],
    checks: {
      links: urlsOf(text).length,
      numbers: numbersOf(text).length,
      questions: currentQuestions.length,
      emoji: countEmoji(text),
      maximum_length: maximum
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
    order_reference: 'Qual é o número do pedido?',
    order_channel: 'O pedido foi feito pelo delivery do TATÁ ou pelo iFood?',
    item_name: 'Qual item foi afetado?',
    symptoms: 'Quais sintomas apareceram?',
    onset: 'Quando os sintomas começaram?'
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
    text = `Sinto muito pelo que aconteceu. O caso permanece aberto para acompanhamento da equipe de qualidade e da gestão, sem tirar conclusão médica nem apontar causa.${questions ? ` ${questions}` : ''}`;
  } else if (plan.strategy_id === 'missing_item') {
    text = `Entendi${item ? ` a falta de ${item}` : ' o item faltante'}. Não vou presumir reposição, crédito ou reembolso.${questions ? ` ${questions}` : ''}`;
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
  ORACLE_PATTERN,
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
