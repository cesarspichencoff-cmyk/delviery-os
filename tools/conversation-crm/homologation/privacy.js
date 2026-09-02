'use strict';

const SENSITIVE_PATTERNS = Object.freeze([
  ['email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ['cpf', /\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/],
  ['phone', /(?<![A-Za-z0-9])(?:\+?55[\s.-]*)?(?:\(?\d{2}\)?[\s.-]*)?9?\d{4}[\s.-]?\d{4}(?![A-Za-z0-9])/],
  ['credential_url', /https?:\/\/[^\s/@:]+:[^\s/@]+@[^\s]+/i],
  ['secret', /\b(?:token|cookie|password|senha|authorization|secret|credencial)\s*[:=]\s*[^\s,;]+/i],
  ['private_path', /[A-Z]:\\Users\\[^\s"']+/i],
  ['personal_address', /\b(?:rua|avenida|av\.?|alameda|travessa)\s+[\p{L}\s.'-]{2,},?\s*\d{1,6}\b/iu],
  ['order_reference', /\b(?:pedido|comanda|order)\s*(?:n[ºo]\.?\s*)?[#:]?\s*[A-Z0-9-]{4,}\b/i]
]);

function inspectText(value) {
  const text = String(value ?? '').normalize('NFKC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  const detectionText = text.replace(/\b(?:CHAT|REV|HFB|TATA-SC|SIM)-[A-Z0-9-]+\b/gi, '[SYNTHETIC_ID]');
  const findings = SENSITIVE_PATTERNS.filter(([, pattern]) => pattern.test(detectionText)).map(([name]) => name);
  return Object.freeze({
    safe: findings.length === 0,
    findings: Object.freeze(findings),
    text: text.slice(0, 1200)
  });
}

function requireSafeComment(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const inspected = inspectText(value);
  if (!inspected.safe) {
    const error = new Error('feedback_contains_personal_data');
    error.code = 'FEEDBACK_CONTAINS_PERSONAL_DATA';
    error.finding_types = inspected.findings;
    throw error;
  }
  return inspected.text;
}

function scanValue(value, path = '$', findings = [], key = '') {
  if (typeof value === 'string') {
    if (/(?:^|_)(?:id|hash|key|version|timestamp|mode|winner|choice|branch|head)$/.test(key)) return findings;
    const inspected = inspectText(value);
    if (!inspected.safe) findings.push({ path, finding_types: inspected.findings });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => scanValue(item, `${path}[${index}]`, findings, key));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([childKey, item]) => scanValue(item, `${path}.${childKey}`, findings, childKey));
  }
  return findings;
}

module.exports = { SENSITIVE_PATTERNS, inspectText, requireSafeComment, scanValue };

