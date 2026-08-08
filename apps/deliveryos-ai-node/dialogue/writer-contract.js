'use strict';

const WRITER_INPUT_KEYS = Object.freeze([
  'direct_response', 'authorized_facts', 'selected_knowledge', 'direction',
  'true_action', 'required_question', 'tone', 'gravity', 'social_context',
  'recent_phrases', 'prohibited_claims', 'authorized_links',
  'authorized_numbers', 'maximum_length'
]);

const URL_PATTERN = /https?:\/\/[^\s)\]}>,]+/giu;
const NUMBER_PATTERN = /(?:R\$\s*)?\d+(?:[.,]\d+)?/giu;
const TECHNICAL_PATTERN = /\b(?:intent|subintent|capability_id|policy_id|scenario_id|idempotency|stack trace|event_id|chain of thought|reasoning|racioc[ií]nio|guardrail|limitad[oa] tecnicamente)\b/iu;
const CUSTOMER_INTERNAL_LANGUAGE_PATTERN = /(?:evid[eê]ncia p[uú]blica|filtros? confirmados?|crit[eé]rios? confirmados?|fonte p[uú]blica|\bcandidat[oa]s?\b|\bconfidence\b|\binfer[eê]ncia\b|\bprovenance\b|\bjourney\b|approved envelope|response plan|\bfallback\b|pattern engine|\bwriter\b|mantive (?:os )?crit[eé]rios|processei (?:os )?dados|registrei (?:o|a|sua) prefer[eê]ncia)/iu;
const COMPENSATION_PROMISE_PATTERN = /\b(?:vou|vamos|iremos|posso|ser[aá]|est[aá])\b.{0,45}\b(?:reembolso|cr[eé]dito|cortesia|reposi[cç][aã]o)\b|\b(?:reembolso|cr[eé]dito|cortesia|reposi[cç][aã]o)\b.{0,45}\b(?:confirmad[oa]|liberad[oa]|concedid[oa]|enviad[oa]|garantid[oa])\b/iu;

function arrayOfStrings(value, maximum = 50) {
  return Array.isArray(value) && value.length <= maximum && value.every((item) => typeof item === 'string' && item.length <= 1000);
}

function validateWriterInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { accepted: false, reason: 'WRITER_INPUT_NOT_OBJECT' };
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...WRITER_INPUT_KEYS].sort())) return { accepted: false, reason: 'WRITER_INPUT_KEYS_INVALID' };
  if (!arrayOfStrings(value.direct_response) || !arrayOfStrings(value.selected_knowledge) || !arrayOfStrings(value.direction)) return { accepted: false, reason: 'WRITER_AUTHORIZED_TEXT_INVALID' };
  if (!Array.isArray(value.authorized_facts) || value.authorized_facts.some((fact) => !fact || typeof fact.field !== 'string' || !['string', 'number', 'boolean'].includes(typeof fact.value))) return { accepted: false, reason: 'WRITER_FACTS_INVALID' };
  if (value.true_action !== null && typeof value.true_action !== 'string') return { accepted: false, reason: 'WRITER_ACTION_INVALID' };
  if (value.required_question !== null && typeof value.required_question !== 'string') return { accepted: false, reason: 'WRITER_QUESTION_INVALID' };
  if (typeof value.tone !== 'string' || !['informational', 'operational', 'sensitive', 'critical'].includes(value.gravity)) return { accepted: false, reason: 'WRITER_TONE_INVALID' };
  if (typeof value.social_context !== 'string' || !arrayOfStrings(value.recent_phrases) || !arrayOfStrings(value.prohibited_claims)) return { accepted: false, reason: 'WRITER_CONTEXT_INVALID' };
  if (!arrayOfStrings(value.authorized_links) || !arrayOfStrings(value.authorized_numbers)) return { accepted: false, reason: 'WRITER_SURFACE_INVALID' };
  if (!Number.isInteger(value.maximum_length) || value.maximum_length < 40 || value.maximum_length > 900) return { accepted: false, reason: 'WRITER_LENGTH_INVALID' };
  return { accepted: true, reason: null, input: value };
}

function validateWriterOutput(output, input) {
  if (!output || typeof output !== 'object' || Array.isArray(output) || JSON.stringify(Object.keys(output)) !== JSON.stringify(['text'])) return { accepted: false, reason: 'WRITER_OUTPUT_SHAPE_INVALID' };
  const text = String(output.text || '').trim();
  if (!text) return { accepted: false, reason: 'WRITER_TEXT_EMPTY' };
  if (text.length > input.maximum_length) return { accepted: false, reason: 'WRITER_TEXT_TOO_LONG' };
  if (TECHNICAL_PATTERN.test(text)) return { accepted: false, reason: 'WRITER_TECHNICAL_EXPOSURE' };
  if (CUSTOMER_INTERNAL_LANGUAGE_PATTERN.test(text)) return { accepted: false, reason: 'WRITER_CUSTOMER_INTERNAL_LANGUAGE_LEAK' };
  if (['sensitive', 'critical'].includes(input.gravity) && /\p{Extended_Pictographic}/u.test(text)) return { accepted: false, reason: 'WRITER_SENSITIVE_EMOJI' };
  const links = [...text.matchAll(URL_PATTERN)].map((match) => match[0].replace(/[.!?]+$/u, ''));
  if (links.some((link) => !input.authorized_links.includes(link))) return { accepted: false, reason: 'WRITER_UNAPPROVED_LINK' };
  const numbers = [...text.replace(URL_PATTERN, ' ').matchAll(NUMBER_PATTERN)].map((match) => match[0].replace(/\s+/gu, ' ').trim());
  if (numbers.some((number) => !input.authorized_numbers.includes(number))) return { accepted: false, reason: 'WRITER_UNAPPROVED_NUMBER' };
  if (input.required_question && !text.includes('?')) return { accepted: false, reason: 'WRITER_REQUIRED_QUESTION_MISSING' };
  const normalized = text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  if (COMPENSATION_PROMISE_PATTERN.test(text)) return { accepted: false, reason: 'WRITER_PROHIBITED_CLAIM' };
  if (input.recent_phrases.some((phrase) => phrase && normalized === phrase.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase())) return { accepted: false, reason: 'WRITER_EXACT_REPETITION' };
  return { accepted: true, reason: null, output: { text } };
}

const WRITER_JSON_SCHEMA = Object.freeze({
  name: 'deliveryos_response_writer_v1',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['text'],
    properties: { text: { type: 'string' } }
  }
});

module.exports = { WRITER_INPUT_KEYS, URL_PATTERN, NUMBER_PATTERN, TECHNICAL_PATTERN, CUSTOMER_INTERNAL_LANGUAGE_PATTERN, COMPENSATION_PROMISE_PATTERN, WRITER_JSON_SCHEMA, validateWriterInput, validateWriterOutput };
