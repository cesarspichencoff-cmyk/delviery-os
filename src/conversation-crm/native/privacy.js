'use strict';

const { sha256 } = require('./deterministic');

const FORBIDDEN_KEY = /(?:^|_)(?:name|nome|customer_name|phone|telefone|email|mail|cpf|document|documento|address|endereco|delivery_code|codigo_entrega|password|senha|token|cookie|credential|credencial|session|sessao|authorization|secret)(?:$|_)/i;
const OPERATIONAL_ALLOWED_KEYS = new Set(['item_name','driver_name','capability_name','policy_name']);
const PATTERNS = Object.freeze([
  ['email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ['cpf', /\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g],
  ['phone', /(?<![A-Za-z0-9])(?:\+?55[\s.-]*)?(?:\(?\d{2}\)?[\s.-]*)?9?\d{4}[\s.-]?\d{4}(?![A-Za-z0-9])/g],
  ['url_credentials', /https?:\/\/[^\s/@:]+:[^\s/@]+@[^\s]+/gi],
  ['sensitive_query', /([?&](?:token|access_token|auth|authorization|cookie|session|password|senha|secret|key)=)[^&#\s]+/gi],
  ['private_path', /[A-Z]:\\Users\\[^\s"']+/gi],
  ['private_ip', /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g],
  ['secret_assignment', /\b(?:token|cookie|password|senha|secret|authorization)\s*[:=]\s*[^\s,;]+/gi]
]);

function redactString(value, findings) {
  let output = value;
  for (const [type, pattern] of PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(output)) {
      findings.add(type);
      pattern.lastIndex = 0;
      output = output.replace(pattern, `[REDACTED_${type.toUpperCase()}]`);
    }
  }
  if (output.length > 2000) {
    findings.add('long_text_truncated');
    output = `${output.slice(0, 2000)}[TRUNCATED]`;
  }
  return output;
}

function sanitize(value, options = {}) {
  const findings = new Set();
  const removedFields = new Set();
  const maxDepth = Number.isInteger(options.maxDepth) ? options.maxDepth : 12;
  function visit(current, path = '$', depth = 0) {
    if (depth > maxDepth) {
      findings.add('depth_exceeded');
      return '[REDACTED_DEPTH]';
    }
    if (current === null || typeof current === 'boolean' || typeof current === 'number') return current;
    if (typeof current === 'string') return redactString(current, findings);
    if (Array.isArray(current)) return current.map((item, index) => visit(item, `${path}[${index}]`, depth + 1));
    if (!current || typeof current !== 'object') return String(current);
    const output = {};
    for (const [key, nested] of Object.entries(current)) {
      const childPath = `${path}.${key}`;
      if (FORBIDDEN_KEY.test(key) && !OPERATIONAL_ALLOWED_KEYS.has(key.toLowerCase())) {
        findings.add('forbidden_field');
        removedFields.add(childPath);
        output[key] = '[REDACTED_FIELD]';
      } else {
        output[key] = visit(nested, childPath, depth + 1);
      }
    }
    return output;
  }
  const sanitized = visit(value);
  return Object.freeze({
    sanitized,
    detected: findings.size > 0 || removedFields.size > 0,
    finding_types: Object.freeze([...findings].sort()),
    removed_fields: Object.freeze([...removedFields].sort()),
    original_fingerprint: sha256(typeof value === 'string' ? value : JSON.stringify(value))
  });
}

function containsSensitiveMarker(value) { return sanitize(value).detected; }

module.exports = { FORBIDDEN_KEY, OPERATIONAL_ALLOWED_KEYS, PATTERNS, sanitize, containsSensitiveMarker };
