'use strict';

const { PATTERNS, FORBIDDEN_KEY } = require('../native/privacy');
const { payloadHash } = require('./contracts');

const MODEL_FORBIDDEN_KEYS = /(?:^|_)(?:phone|telefone|email|mail|cpf|document|documento|address|endereco|delivery_code|codigo_entrega|password|senha|token|cookie|credential|credencial|authorization|secret|gps|latitude|longitude|employee|funcionario|stack|log|raw_message|full_order)(?:$|_)/iu;
const ALLOWED_TOP_LEVEL = new Set([
  'message', 'recent_history', 'structured_summary', 'authorized_facts',
  'active_task', 'active_journey', 'suspended_journeys', 'pending_questions',
  'playbook', 'prohibited_claims', 'allowed_actions', 'social_context',
  'knowledge', 'tone', 'gravity', 'recent_phrases', 'direct_response',
  'selected_knowledge', 'direction', 'true_action', 'required_question',
  'authorized_links', 'authorized_numbers', 'maximum_length'
]);

function redactSensitiveText(value, findings) {
  let output = String(value ?? '');
  for (const [type, sourcePattern] of PATTERNS) {
    const pattern = new RegExp(sourcePattern.source, sourcePattern.flags);
    if (pattern.test(output)) {
      findings.add(type);
      output = output.replace(new RegExp(sourcePattern.source, sourcePattern.flags), `[REDACTED_${type.toUpperCase()}]`);
    }
  }
  return output;
}

function sanitizeAiContext(input = {}) {
  const findings = new Set();
  const removed = new Set();

  function visit(value, path = '$', depth = 0) {
    if (depth > 16) {
      findings.add('depth_exceeded');
      removed.add(path);
      return null;
    }
    if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') return redactSensitiveText(value, findings);
    if (Array.isArray(value)) return value.slice(0, 50).map((item, index) => visit(item, `${path}[${index}]`, depth + 1));
    if (typeof value !== 'object') {
      removed.add(path);
      return null;
    }
    const output = {};
    for (const [key, nested] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (MODEL_FORBIDDEN_KEYS.test(key) || (FORBIDDEN_KEY.test(key) && !['item_name', 'capability_name', 'policy_name'].includes(key))) {
        findings.add('forbidden_field');
        removed.add(childPath);
        continue;
      }
      output[key] = visit(nested, childPath, depth + 1);
    }
    return output;
  }

  const allowed = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!ALLOWED_TOP_LEVEL.has(key)) {
      findings.add('top_level_not_allowed');
      removed.add(`$.${key}`);
      continue;
    }
    allowed[key] = visit(value, `$.${key}`, 1);
  }
  return Object.freeze({
    payload: Object.freeze(allowed),
    payload_hash: payloadHash(allowed),
    findings: Object.freeze([...findings].sort()),
    removed_fields: Object.freeze([...removed].sort())
  });
}

function containsSensitiveValue(value, markers = []) {
  const text = JSON.stringify(value);
  return markers.some((marker) => marker && text.includes(marker));
}

module.exports = { MODEL_FORBIDDEN_KEYS, ALLOWED_TOP_LEVEL, redactSensitiveText, sanitizeAiContext, containsSensitiveValue };
