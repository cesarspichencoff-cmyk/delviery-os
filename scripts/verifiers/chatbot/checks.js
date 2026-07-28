'use strict';

const fs = require('node:fs');
const path = require('node:path');

const BUREAUCRATIC = [
  'setor responsável',
  'da forma correta',
  'com a devida atenção',
  'para que possamos',
  'seguimos à disposição'
];
const TECHNICAL = [
  /\bTATA-SC-\d+\b/iu,
  /\b(?:intent|subintent|capability_id|policy_id|scenario_id)\s*[:=]/iu,
  /\b(?:occurrence|reservation|waitlist|conversation)\.[a-z_]+\b/iu,
  /\b(?:E[0-9]|A[0-9])\b/u
];
const PROMISES = [
  /\b(?:reserva|fila|pedido|reembolso|crédito|cortesia|reposição|transferência)\b.{0,45}\b(?:confirmad[ao]|concluíd[ao]|liberad[ao]|enviad[ao]|realizad[ao])\b/iu,
  /\b(?:garanto|garantimos|vai chegar|chega em)\b/iu
];
const COMPENSATION = /\b(?:reembolso|crédito|cortesia|reposição)\b.{0,35}\b(?:confirmad[ao]|liberad[ao]|concedid[ao]|enviad[ao]|automátic[ao])\b/iu;

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function publicAllowlist(projectRoot) {
  const file = path.join(projectRoot, 'src', 'conversation-crm', 'native', 'catalogs', 'TATA_OPERATIONAL_PUBLIC_INFO_V1.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const links = new Set();
  const values = new Set();
  function visit(value, key = '') {
    if (typeof value === 'string') {
      if (/^https?:\/\//iu.test(value)) links.add(value);
      if (/^R\$\s*\d/iu.test(value)) values.add(normalize(value));
      return;
    }
    if (typeof value === 'number' && /(?:fee|price|value)_brl$/iu.test(key)) {
      values.add(normalize(`R$ ${value}`));
      return;
    }
    if (Array.isArray(value)) return value.forEach((item) => visit(item, key));
    if (value && typeof value === 'object') Object.entries(value).forEach(([childKey, item]) => visit(item, childKey));
  }
  visit(raw);
  return { links, values };
}

function result(status, check, caseId, expected, actual, evidence) {
  return { status, check, case_id: caseId, expected, actual, evidence };
}

function questions(text) {
  return String(text || '').split(/(?<=[.!?])\s+/u).filter((part) => part.includes('?')).map(normalize);
}

function verifyConversation(conversation, options = {}) {
  const projectRoot = options.projectRoot || path.resolve(__dirname, '..', '..', '..');
  const allow = options.allowlist || publicAllowlist(projectRoot);
  const contract = conversation.expected_contract || {};
  const turns = conversation.results || conversation.turns || [];
  const checks = [];
  const seenQuestions = new Set();
  const caseId = conversation.case_id || 'UNKNOWN';

  for (const [index, turn] of turns.entries()) {
    const text = String(turn.response_text ?? turn.response ?? '');
    const normalized = normalize(text);
    const turnId = `${caseId}#${index + 1}`;

    checks.push(result(text.trim() ? 'passed' : 'failed', 'non_empty_response', caseId, 'non-empty', text.trim() ? 'non-empty' : 'empty', turnId));

    const bureaucracy = BUREAUCRATIC.filter((phrase) => normalized.includes(normalize(phrase)));
    checks.push(result(bureaucracy.length ? 'failed' : 'passed', 'bureaucratic_language', caseId, 'no listed bureaucratic phrase', bureaucracy.join(', ') || 'none', turnId));

    const textWithoutUrls = text.replace(/https?:\/\/\S+/giu, '');
    const technical = TECHNICAL.filter((pattern) => pattern.test(textWithoutUrls)).map(String);
    checks.push(result(technical.length ? 'failed' : 'passed', 'technical_leakage', caseId, 'no internal identifier', technical.join(', ') || 'none', turnId));

    const urls = [...text.matchAll(/https?:\/\/[^\s)\]}>,]+/giu)].map((match) => match[0].replace(/[.!?]+$/u, ''));
    const unknownUrls = urls.filter((url) => !allow.links.has(url));
    checks.push(result(unknownUrls.length ? 'failed' : 'passed', 'unknown_links', caseId, 'only canonical public links', unknownUrls.join(', ') || 'none', turnId));

    const monetary = [...text.matchAll(/R\$\s*\d+(?:[.,]\d{1,2})?/giu)].map((match) => normalize(match[0]));
    const unknownValues = monetary.filter((value) => !allow.values.has(value));
    checks.push(result(unknownValues.length ? 'failed' : 'passed', 'unknown_values', caseId, 'only canonical public monetary values', unknownValues.join(', ') || 'none', turnId));

    const status = turn.result_status || 'unknown';
    const unsafePromises = PROMISES.filter((pattern) => pattern.test(text));
    const promiseFailed = status !== 'confirmed' && unsafePromises.length > 0;
    checks.push(result(promiseFailed ? 'failed' : 'passed', 'forbidden_promises', caseId, 'no conclusive promise without confirmed result', promiseFailed ? status : 'none', turnId));

    checks.push(result(COMPENSATION.test(text) ? 'failed' : 'passed', 'automatic_compensation', caseId, 'no automatic compensation', COMPENSATION.test(text) ? 'detected' : 'none', turnId));

    for (const question of questions(text)) {
      const duplicate = seenQuestions.has(question);
      checks.push(result(duplicate ? 'failed' : 'passed', 'repeated_question', caseId, 'question not repeated in same conversation', duplicate ? question : 'none', turnId));
      seenQuestions.add(question);
    }

    if (Number.isInteger(contract.maximum_length)) {
      checks.push(result(text.length <= contract.maximum_length ? 'passed' : 'failed', 'maximum_length', caseId, `<=${contract.maximum_length}`, String(text.length), turnId));
    }
  }

  const finalText = String(turns.at(-1)?.response_text ?? turns.at(-1)?.response ?? '');
  const finalNormalized = normalize(finalText);
  for (const required of contract.must_include || []) {
    checks.push(result(finalNormalized.includes(normalize(required)) ? 'passed' : 'failed', 'must_include', caseId, required, finalText, 'final response'));
  }
  for (const forbidden of contract.must_not_include || []) {
    checks.push(result(finalNormalized.includes(normalize(forbidden)) ? 'failed' : 'passed', 'must_not_include', caseId, `exclude: ${forbidden}`, finalText, 'final response'));
  }

  const serialized = JSON.stringify(conversation);
  const oracleDetected = /ideal_response|SCENARIO_CATALOG|scenario_oracle|oracle_payload/iu.test(serialized);
  checks.push(result(oracleDetected ? 'failed' : 'passed', 'oracle_presence', caseId, 'no oracle material in captured result', oracleDetected ? 'detected' : 'none', 'serialized output'));
  return checks;
}

function summarize(checks) {
  const failed = checks.filter((item) => item.status === 'failed');
  return { total: checks.length, passed: checks.length - failed.length, failed: failed.length, checks, ok: failed.length === 0 };
}

module.exports = {
  BUREAUCRATIC,
  TECHNICAL,
  PROMISES,
  COMPENSATION,
  normalize,
  publicAllowlist,
  questions,
  verifyConversation,
  summarize
};
