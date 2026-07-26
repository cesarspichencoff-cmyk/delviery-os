'use strict';

const { sha256 } = require('./deterministic');

const FORBIDDEN_KEY = /(?:^|_)(?:name|nome|customer_name|phone|telefone|email|mail|cpf|document|documento|address|endereco|delivery_code|codigo_entrega|password|senha|token|cookie|credential|credencial|session|sessao|authorization|secret|file|filename|path|stack|cause)(?:$|_)/i;
const FREE_TEXT_KEY = /(?:^|_)(?:content|message|text|prompt|note|notes|observacao|observation|detail|description|error|reason_text)(?:$|_)/i;
const OPERATIONAL_ALLOWED_KEYS = new Set(['item_name', 'driver_name', 'capability_name', 'policy_name']);
const SAFE_TOKEN_KEYS = new Set([
  'schema_version', 'event_id', 'idempotency_key', 'type', 'status', 'state', 'intent', 'subintent',
  'capability', 'capability_id', 'driver', 'driver_id', 'authority', 'policy', 'policy_id', 'action',
  'channel', 'origin', 'severity', 'escalation', 'confirmation', 'provenance', 'source', 'reason',
  'stage', 'checkpoint', 'seed', 'scenario_id', 'conversation_id', 'case_id', 'order_id', 'subject_id',
  'message_id', 'correlation_id', 'request_id', 'response_id', 'action_id', 'evidence_id', 'queue_id',
  'occurrence_id', 'notification_id', 'unit_id', 'entity_type', 'entity_id', 'field', 'mode', 'version',
  'content_hash', 'hash', 'original_fingerprint', 'incoming_hash', 'existing_hash', 'idempotency_key_hash',
  'error_code', 'result_status', 'route_status', 'availability', 'health', 'circuit_state', 'clock',
  'simulation_outcome', 'semantic_version', 'conflict_state', 'closure_state', 'expected_state',
  'read_mode', 'write_mode', 'content_type', 'root_label', 'relative_path', 'basis', 'value', 'topic'
]);
const SAFE_ARRAY_KEYS = new Set([
  'finding_types', 'removed_fields', 'fields_missing', 'escalations', 'candidate_driver_ids',
  'evidence_requirements', 'blocked_by', 'prohibited_responses', 'basis_classifications',
  'retryable_operations', 'capabilities', 'types', 'candidates', 'missing_items'
]);
const OPERATIONAL_VALUES = new Set(['refrigerante', 'bebida', 'shoyu', 'sobremesa', 'acompanhamento', 'peça']);
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

function compactForDetection(value) {
  return String(value ?? '').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[\s._-]+/g, '').toLowerCase();
}

function safeToken(value) {
  return typeof value === 'string' && value.length <= 256 && /^[A-Za-z0-9._:/-]+$/.test(value);
}

function allowOperationalString(key, value, parentKey) {
  if (OPERATIONAL_ALLOWED_KEYS.has(String(key).toLowerCase())) return safeToken(value) || OPERATIONAL_VALUES.has(value);
  if (SAFE_ARRAY_KEYS.has(String(parentKey)) && (safeToken(value) || OPERATIONAL_VALUES.has(value))) return true;
  if (SAFE_TOKEN_KEYS.has(String(key)) && safeToken(value)) return true;
  if (/_id$|_hash$|_key$|_code$|_at$|_version$/.test(String(key)) && safeToken(value)) return true;
  return false;
}

function redactString(value, key, parentKey, findings, removedFields, path) {
  const source = String(value);
  let output = source;
  let redacted = false;
  for (const [type, pattern] of PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(output)) {
      findings.add(type);
      pattern.lastIndex = 0;
      output = output.replace(pattern, `[REDACTED_${type.toUpperCase()}]`);
      redacted = true;
    }
  }
  const compact = compactForDetection(source);
  if (/(?:token|cookie|senha|password|authorization|secret)/.test(compact)) {
    findings.add('sensitive_keyword');
    redacted = true;
  }
  if (redacted) {
    removedFields.add(path);
    return '[REDACTED_SENSITIVE_TEXT]';
  }
  if (allowOperationalString(key, source, parentKey)) return source;
  if (FREE_TEXT_KEY.test(String(key)) || (FORBIDDEN_KEY.test(String(key)) && !OPERATIONAL_ALLOWED_KEYS.has(String(key).toLowerCase()))) {
    findings.add('free_text_or_forbidden_field');
    removedFields.add(path);
    return '[REDACTED_FIELD]';
  }
  findings.add('unknown_string');
  removedFields.add(path);
  return '[REDACTED_UNKNOWN_STRING]';
}

function sanitize(value, options = {}) {
  const findings = new Set();
  const removedFields = new Set();
  const maxDepth = Number.isInteger(options.maxDepth) ? options.maxDepth : 12;
  function visit(current, path = '$', depth = 0, key = '', parentKey = '') {
    if (depth > maxDepth) {
      findings.add('depth_exceeded');
      removedFields.add(path);
      return '[REDACTED_DEPTH]';
    }
    if (current === null || typeof current === 'boolean' || typeof current === 'number') return current;
    if (typeof current === 'string') return redactString(current, key, parentKey, findings, removedFields, path);
    if (current instanceof Error) {
      findings.add('error_object');
      return {
        error_name: allowOperationalString('error_name', current.name, '') ? current.name : 'Error',
        error_code: typeof current.code === 'string' && safeToken(current.code) ? current.code : 'SANITIZED_ERROR',
        message: '[REDACTED_ERROR_MESSAGE]',
        stack: '[REDACTED_STACK]',
        cause: current.cause ? visit(current.cause, `${path}.cause`, depth + 1, 'cause', key) : null
      };
    }
    if (Array.isArray(current)) {
      if (key === 'value' && current.every((item) => typeof item === 'string' && OPERATIONAL_VALUES.has(item))) return [...current];
      return current.map((item, index) => visit(item, `${path}[${index}]`, depth + 1, '', key));
    }
    if (!current || typeof current !== 'object') {
      findings.add('unsupported_value');
      removedFields.add(path);
      return '[REDACTED_UNSUPPORTED]';
    }
    const output = {};
    for (const [childKey, nested] of Object.entries(current)) {
      const childPath = `${path}.${childKey}`;
      if (FORBIDDEN_KEY.test(childKey) && !OPERATIONAL_ALLOWED_KEYS.has(childKey.toLowerCase())) {
        findings.add('forbidden_field');
        removedFields.add(childPath);
        output[childKey] = '[REDACTED_FIELD]';
      } else {
        output[childKey] = visit(nested, childPath, depth + 1, childKey, key);
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

function messageProvenance(content) {
  const inspected = sanitize({ content });
  return Object.freeze({
    content_hash: sha256(String(content)),
    content_length: Buffer.byteLength(String(content), 'utf8'),
    content_type: 'text',
    sanitized: true,
    detected_categories: inspected.finding_types
  });
}

function containsSensitiveMarker(value) { return sanitize(value).detected; }

module.exports = { FORBIDDEN_KEY, FREE_TEXT_KEY, OPERATIONAL_ALLOWED_KEYS, SAFE_TOKEN_KEYS, SAFE_ARRAY_KEYS, PATTERNS, compactForDetection, sanitize, messageProvenance, containsSensitiveMarker };
