'use strict';

const TOP_LEVEL_KEYS = Object.freeze([
  'id', 'version', 'family', 'chat_template', 'system_instruction_format',
  'non_thinking', 'stop', 'sampling', 'limits', 'grammar_mode'
]);
const SAMPLING_KEYS = new Set(['temperature', 'top_p', 'top_k', 'min_p', 'repeat_penalty', 'presence_penalty']);
const PROFILE_KEYS = new Set(['default', 'text', 'deliveryos_conversation_director_v1', 'deliveryos_response_writer_v1']);
const FORBIDDEN_SEMANTIC_KEY = /fact|polic|action|tone|answer|expected|example|gabarito|case/iu;

function fail(code) { throw Object.assign(new Error(code), { code }); }
function plain(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value, keys) { return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()); }

function validateSampling(sampling) {
  if (!plain(sampling) || Object.keys(sampling).some((key) => !PROFILE_KEYS.has(key))) fail('MODEL_ADAPTER_SAMPLING_INVALID');
  for (const profile of Object.values(sampling)) {
    if (!plain(profile) || Object.keys(profile).some((key) => !SAMPLING_KEYS.has(key))) fail('MODEL_ADAPTER_SAMPLING_INVALID');
    for (const value of Object.values(profile)) if (!Number.isFinite(value)) fail('MODEL_ADAPTER_SAMPLING_INVALID');
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function defineModelAdapter(value) {
  if (!plain(value) || !exactKeys(value, TOP_LEVEL_KEYS)) fail('MODEL_ADAPTER_KEYS_INVALID');
  const serializedKeys = [];
  const visit = (current) => {
    if (!plain(current)) return;
    for (const [key, child] of Object.entries(current)) { serializedKeys.push(key); visit(child); }
  };
  visit(value);
  if (serializedKeys.some((key) => FORBIDDEN_SEMANTIC_KEY.test(key))) fail('MODEL_ADAPTER_SEMANTIC_CONTENT_FORBIDDEN');
  if (!/^[a-z0-9-]{1,40}$/u.test(value.id) || !/^\d+\.\d+\.\d+$/u.test(value.version)) fail('MODEL_ADAPTER_IDENTITY_INVALID');
  if (!['gguf_embedded_jinja'].includes(value.chat_template) || value.system_instruction_format !== 'native_system_role') fail('MODEL_ADAPTER_TEMPLATE_INVALID');
  if (!plain(value.non_thinking) || value.non_thinking.server_reasoning !== 'off' || !plain(value.non_thinking.chat_template_kwargs)) fail('MODEL_ADAPTER_REASONING_INVALID');
  if (!Array.isArray(value.stop) || value.stop.some((item) => typeof item !== 'string' || item.length > 80)) fail('MODEL_ADAPTER_STOP_INVALID');
  validateSampling(value.sampling);
  if (!plain(value.limits) || !exactKeys(value.limits, ['default_context_size', 'minimum_context_size', 'maximum_context_size', 'structured_max_tokens', 'text_max_tokens'])) fail('MODEL_ADAPTER_LIMITS_INVALID');
  if (!Object.values(value.limits).every(Number.isInteger) || value.limits.minimum_context_size < 1024 || value.limits.default_context_size < value.limits.minimum_context_size || value.limits.default_context_size > value.limits.maximum_context_size) fail('MODEL_ADAPTER_LIMITS_INVALID');
  if (value.grammar_mode !== 'fixed_gbnf') fail('MODEL_ADAPTER_GRAMMAR_INVALID');
  return deepFreeze(value);
}

function samplingFor(adapter, mode, schemaName = null) {
  return Object.freeze({
    ...(adapter.sampling.default || {}),
    ...(adapter.sampling[mode] || {}),
    ...(schemaName ? adapter.sampling[schemaName] || {} : {})
  });
}

module.exports = { TOP_LEVEL_KEYS, defineModelAdapter, samplingFor };
