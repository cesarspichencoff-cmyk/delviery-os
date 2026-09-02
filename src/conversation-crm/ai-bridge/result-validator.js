'use strict';

const { MODEL_FORBIDDEN_KEYS } = require('./privacy');
const { PATTERNS } = require('../native/privacy');

function forbiddenPath(value, path = '$', depth = 0) {
  if (depth > 20) return path;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = forbiddenPath(value[index], `${path}[${index}]`, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  for (const [key, nested] of Object.entries(value)) {
    if (MODEL_FORBIDDEN_KEYS.test(key) || /reasoning|chain_of_thought|cot/iu.test(key)) return `${path}.${key}`;
    const found = forbiddenPath(nested, `${path}.${key}`, depth + 1);
    if (found) return found;
  }
  return null;
}

function sensitiveValuePath(value, path = '$', depth = 0) {
  if (depth > 20) return path;
  if (typeof value === 'string') {
    for (const [, source] of PATTERNS) {
      const pattern = new RegExp(source.source, source.flags);
      if (pattern.test(value)) return path;
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = sensitiveValuePath(value[index], `${path}[${index}]`, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  for (const [key, nested] of Object.entries(value)) {
    const found = sensitiveValuePath(nested, `${path}.${key}`, depth + 1);
    if (found) return found;
  }
  return null;
}

class AiResultValidator {
  constructor(options = {}) { this.validators = options.validators || {}; }

  validate(input = {}) {
    const result = input.result;
    if (!result || typeof result !== 'object' || Array.isArray(result)) return { accepted: false, reason: 'RESULT_NOT_OBJECT' };
    const forbidden = forbiddenPath(result);
    if (forbidden) return { accepted: false, reason: 'RESULT_FORBIDDEN_FIELD', forbidden_path: forbidden };
    const sensitive = sensitiveValuePath(result.output);
    if (sensitive) return { accepted: false, reason: 'RESULT_SENSITIVE_VALUE', sensitive_path: sensitive };
    if (result.schema_version !== `local-ai-${input.job.request_type}-result-v1`) return { accepted: false, reason: 'RESULT_SCHEMA_VERSION_INVALID' };
    if (result.payload_hash !== input.job.payload_hash) return { accepted: false, reason: 'RESULT_PAYLOAD_HASH_MISMATCH' };
    if (result.model_version !== input.job.requested_model || result.provider_version !== input.job.provider_version) return { accepted: false, reason: 'RESULT_PROVIDER_MISMATCH' };
    const specialized = this.validators[input.job.request_type];
    if (specialized) {
      const checked = specialized(result.output, { job: input.job, result, node_id: input.node_id });
      if (!checked?.accepted) return { accepted: false, reason: checked?.reason || 'RESULT_CONTRACT_INVALID' };
    }
    const timing = result.timing_metrics || {};
    const safeTiming = Object.fromEntries(Object.entries(timing).filter(([key, value]) => /_ms$|tokens_per_second/u.test(key) && Number.isFinite(value) && value >= 0));
    return { accepted: true, reason: null, output: result.output, timing_metrics: safeTiming };
  }
}

module.exports = { forbiddenPath, sensitiveValuePath, AiResultValidator };

