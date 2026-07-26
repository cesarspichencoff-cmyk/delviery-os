'use strict';

const { deepFreeze } = require('./catalogs/operational');
const { countEmoji, emojiLimit } = require('./voice-profile');

const URL_PATTERN = /https:\/\/[^\s)]+/giu;
const NUMBER_PATTERN = /(?:R\$\s*)?\d+(?:[.,]\d+)?/giu;

function valuesOf(pattern, text) {
  return [...String(text || '').matchAll(pattern)].map((match) => match[0]);
}

function urlsOf(text) {
  return valuesOf(URL_PATTERN, text);
}

function numbersOf(text) {
  const withoutUrls = String(text || '').replace(URL_PATTERN, ' ');
  return valuesOf(NUMBER_PATTERN, withoutUrls).map((value) => value.replace(/\s+/gu, ' ').trim());
}

function operationalEntityValues(classification) {
  return Object.values(classification.entities || {})
    .map((entity) => entity?.value)
    .filter((value) => typeof value === 'number' || (typeof value === 'string' && /^(?:R\$\s*)?\d+(?:[.,]\d+)?$/u.test(value)))
    .map(String);
}

function prohibitedClaimFindings(text, input) {
  const findings = [];
  const resultStatus = input.result?.status || 'unknown';
  if (
    resultStatus !== 'confirmed'
    && /\b(?:est[aá]|foi|ficou|j[aá]\s+est[aá])\s+confirmad[oa]\b|\bconfirmamos\b/iu.test(text)
  ) findings.push('UNVERIFIED_CONFIRMATION');
  if (/\b(?:vou|vamos|iremos)\s+(?:reembolsar|estornar|dar cr[eé]dito|oferecer cortesia)\b/iu.test(text)) {
    findings.push('AUTOMATIC_COMPENSATION_PROMISE');
  }
  if (/\b(?:a culpa [eé]|[eé] responsabilidade (?:do|da)|causou com certeza)\b/iu.test(text)) {
    findings.push('LIABILITY_CLAIM');
  }
  if (
    input.classification.policies?.food_safety
    && /\b(?:o diagn[oó]stico [eé]|diagnosticamos|foi causado por|com certeza foi|n[aã]o [eé] nada)\b/iu.test(text)
  ) findings.push('FOOD_SAFETY_UNSUPPORTED_CLAIM');
  return findings;
}

function validateComposedResponse(input) {
  const text = String(input.text || '').trim();
  const allowedText = [
    input.legacy_text,
    input.classification.ideal_response
  ].join(' ');
  const allowedUrls = new Set(urlsOf(allowedText));
  const allowedNumbers = new Set([
    ...numbersOf(allowedText),
    ...operationalEntityValues(input.classification)
  ]);
  const findings = [];
  for (const url of urlsOf(text)) if (!allowedUrls.has(url)) findings.push('UNAPPROVED_LINK');
  for (const number of numbersOf(text)) if (!allowedNumbers.has(number)) findings.push('UNAPPROVED_NUMBER');
  findings.push(...prohibitedClaimFindings(text, input));
  if (countEmoji(text) > emojiLimit(input.plan)) findings.push('EMOJI_BUDGET_EXCEEDED');
  if (!text) findings.push('EMPTY_RESPONSE');
  return deepFreeze({
    passed: findings.length === 0,
    fallback_used: false,
    findings: [...new Set(findings)],
    allowed_numbers: [...allowedNumbers],
    allowed_links: [...allowedUrls]
  });
}

function safeHumanizedFallback(input) {
  const missing = input.classification.fields_missing || [];
  const followUp = missing.length ? ' Preciso confirmar apenas as informações que ainda faltam antes de avançar.' : '';
  if (input.classification.policies?.food_safety) {
    return `Sinto muito pelo que aconteceu. O relato será mantido aberto para análise da equipe de qualidade e da gestão, sem presumir causa ou diagnóstico.${followUp}`;
  }
  if (input.classification.intent?.startsWith('occurrence.')) {
    return `Entendi o que aconteceu. Vou preservar o contexto confirmado e manter o caso aberto para o acompanhamento adequado.${followUp}`;
  }
  if (input.result?.status !== 'confirmed') {
    return `Ainda não tenho confirmação suficiente para afirmar uma conclusão.${followUp}`;
  }
  return String(input.legacy_text || 'Vou seguir apenas com as informações confirmadas.');
}

function normalizeSentence(value) {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}\s?]/gu, '').replace(/\s+/gu, ' ').trim();
}

function responseSegments(text) {
  const sentences = String(text || '').split(/(?<=[.!?])\s+/u).map((value) => value.trim()).filter(Boolean);
  return {
    opening: sentences[0] || null,
    closing: sentences.at(-1) || null,
    questions: sentences.filter((value) => value.endsWith('?'))
  };
}

function repetitionMetrics(text, previousResponses = []) {
  const current = responseSegments(text);
  const previous = previousResponses.map(responseSegments);
  const opening = normalizeSentence(current.opening);
  const closing = normalizeSentence(current.closing);
  const sameOpeningCount = previous.filter((item) => normalizeSentence(item.opening) === opening).length + 1;
  const previousClosing = normalizeSentence(previous.at(-1)?.closing);
  const repeatedQuestions = current.questions.filter((question) => previous.some((item) => item.questions.some((old) => normalizeSentence(old) === normalizeSentence(question))));
  const warnings = [];
  if (opening && sameOpeningCount >= 3) warnings.push('SAME_OPENING_THREE_TIMES');
  if (closing && closing === previousClosing) warnings.push('CONSECUTIVE_SAME_CLOSING');
  if (repeatedQuestions.length) warnings.push('QUESTION_REPEATED_IN_CONVERSATION');
  if (/^(?:pe[cç]o desculpas|sentimos muito)/iu.test(current.opening || '') && previous.some((item) => /^(?:pe[cç]o desculpas|sentimos muito)/iu.test(item.opening || ''))) {
    warnings.push('REPEATED_FORMAL_APOLOGY');
  }
  return deepFreeze({
    warnings,
    opening: current.opening,
    closing: current.closing,
    same_opening_count: sameOpeningCount,
    repeated_questions: repeatedQuestions.length
  });
}

function compareResponses(previousText, humanizedText, validation, repetition) {
  const previousSentences = new Set(String(previousText).split(/(?<=[.!?])\s+/u).map(normalizeSentence).filter(Boolean));
  const repeatedPhrases = String(humanizedText).split(/(?<=[.!?])\s+/u)
    .map(normalizeSentence)
    .filter((sentence) => sentence && previousSentences.has(sentence));
  return deepFreeze({
    previous_length: String(previousText).length,
    humanized_length: String(humanizedText).length,
    changed: previousText !== humanizedText,
    repeated_phrases: repeatedPhrases,
    risk_of_promise: validation.findings.some((finding) => finding.includes('PROMISE') || finding.includes('CONFIRMATION')),
    unconfirmed_data: validation.findings.filter((finding) => finding === 'UNAPPROVED_NUMBER' || finding === 'UNAPPROVED_LINK'),
    conversation_warnings: repetition.warnings
  });
}

module.exports = {
  URL_PATTERN,
  NUMBER_PATTERN,
  urlsOf,
  numbersOf,
  prohibitedClaimFindings,
  validateComposedResponse,
  safeHumanizedFallback,
  responseSegments,
  repetitionMetrics,
  compareResponses
};
