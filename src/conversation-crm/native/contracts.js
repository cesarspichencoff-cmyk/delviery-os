'use strict';

const { nativeError } = require('./errors');
const { canonicalJson, sha256 } = require('./deterministic');
const { deepFreeze } = require('./catalogs');

const RESULT_STATES = Object.freeze(['confirmed','processing','unavailable','degraded','conflict','unknown','failed','requires_human','prohibited']);
const CAPABILITY_STATES = Object.freeze(['available','unavailable','degraded','unknown','requires_human','prohibited']);
const DRIVER_MODES = Object.freeze(['disabled','simulated','authorized','authorized_with_confirmation']);
const QUEUE_STATES = Object.freeze(['waiting_customer','waiting_operation','waiting_manager','waiting_quality','waiting_platform','waiting_approval','in_progress','resolved','closed']);
const DATA_STATES = Object.freeze(['provided','inferred','confirmed','missing','conflict','superseded']);
const AUTHORITIES = Object.freeze(['A0','A1','A2','A3','A4']);

function requireObject(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw nativeError(code);
  return value;
}
function requireString(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw nativeError(code);
  return value.trim();
}
function requireEnum(value, values, code) {
  if (!values.includes(value)) throw nativeError(code);
  return value;
}
function requireIso(value, code) {
  const parsed = new Date(value);
  if (typeof value !== 'string' || Number.isNaN(parsed.getTime())) throw nativeError(code);
  return parsed.toISOString();
}

function validateGatewayInput(input) {
  requireObject(input, 'GATEWAY_INPUT_INVALID');
  const type = requireEnum(input.message_type || 'text', ['text','transcribed_audio','synthetic_attachment_reference'], 'MESSAGE_TYPE_INVALID');
  const content = requireString(input.content, 'MESSAGE_CONTENT_REQUIRED');
  const output = {
    schema_version: 'conversation-gateway-input-v1', synthetic: input.synthetic === true,
    message_type: type, content, channel: requireString(input.channel || 'synthetic', 'CHANNEL_REQUIRED'),
    subject_id: requireString(input.subject_id, 'SUBJECT_ID_REQUIRED'), conversation_id: requireString(input.conversation_id, 'CONVERSATION_ID_REQUIRED'),
    message_id: requireString(input.message_id, 'MESSAGE_ID_REQUIRED'), correlation_id: requireString(input.correlation_id, 'CORRELATION_ID_REQUIRED'),
    idempotency_key: requireString(input.idempotency_key, 'IDEMPOTENCY_KEY_REQUIRED'), occurred_at: requireIso(input.occurred_at, 'OCCURRED_AT_INVALID'),
    turn_order: Number(input.turn_order), unit_id: input.unit_id == null ? null : requireString(input.unit_id, 'UNIT_ID_INVALID'),
    context: input.context && typeof input.context === 'object' ? structuredClone(input.context) : {}
  };
  if (!Number.isInteger(output.turn_order) || output.turn_order < 1) throw nativeError('TURN_ORDER_INVALID');
  if (!output.synthetic) throw nativeError('REAL_DATA_NOT_ALLOWED');
  return deepFreeze(output);
}

function validateCapabilityRequest(input) {
  requireObject(input, 'CAPABILITY_REQUEST_INVALID');
  const request = {
    schema_version: 'deliveryos-capability-request-v1', synthetic: input.synthetic === true,
    request_id: requireString(input.request_id, 'REQUEST_ID_REQUIRED'), capability_id: requireString(input.capability_id, 'CAPABILITY_ID_REQUIRED'),
    capability_version: requireString(input.capability_version || '1.0.0', 'CAPABILITY_VERSION_REQUIRED'), conversation_id: requireString(input.conversation_id, 'CONVERSATION_ID_REQUIRED'),
    case_id: requireString(input.case_id, 'CASE_ID_REQUIRED'), unit_id: requireString(input.unit_id, 'UNIT_ID_REQUIRED'), subject_id: requireString(input.subject_id, 'SUBJECT_ID_REQUIRED'),
    payload: input.payload && typeof input.payload === 'object' ? structuredClone(input.payload) : {}, authority: requireEnum(input.authority, AUTHORITIES, 'AUTHORITY_INVALID'),
    policy_id: requireString(input.policy_id, 'POLICY_ID_REQUIRED'), evidence_requirements: Array.isArray(input.evidence_requirements) ? [...input.evidence_requirements].map(String) : [],
    idempotency_key: requireString(input.idempotency_key, 'IDEMPOTENCY_KEY_REQUIRED'), correlation_id: requireString(input.correlation_id, 'CORRELATION_ID_REQUIRED'),
    deadline: requireIso(input.deadline, 'DEADLINE_INVALID')
  };
  if (!request.synthetic) throw nativeError('REAL_DATA_NOT_ALLOWED');
  return deepFreeze(request);
}

function validateCapabilityResult(input) {
  requireObject(input, 'CAPABILITY_RESULT_INVALID');
  return deepFreeze({
    schema_version: 'deliveryos-capability-result-v1', synthetic: input.synthetic === true,
    request_id: requireString(input.request_id, 'REQUEST_ID_REQUIRED'), capability: requireString(input.capability, 'CAPABILITY_ID_REQUIRED'),
    status: requireEnum(input.status, RESULT_STATES, 'RESULT_STATUS_INVALID'), source: requireString(input.source, 'RESULT_SOURCE_REQUIRED'),
    performed_at: requireIso(input.performed_at, 'RESULT_TIME_INVALID'), confidence: Math.max(0, Math.min(1, Number(input.confidence))),
    freshness: requireObject(input.freshness, 'RESULT_FRESHNESS_REQUIRED'), evidence_id: input.evidence_id == null ? null : requireString(input.evidence_id, 'EVIDENCE_ID_INVALID'),
    retryable: input.retryable === true, payload: input.payload && typeof input.payload === 'object' ? structuredClone(input.payload) : {},
    confirmation: input.confirmation || 'not_confirmed'
  });
}

function validateDriverManifest(input) {
  requireObject(input, 'DRIVER_MANIFEST_INVALID');
  const manifest = {
    schema_version: 'deliveryos-driver-manifest-v1', synthetic: input.synthetic === true,
    id: requireString(input.id, 'DRIVER_ID_REQUIRED'), version: requireString(input.version, 'DRIVER_VERSION_REQUIRED'), type: requireString(input.type, 'DRIVER_TYPE_REQUIRED'),
    capabilities: Array.isArray(input.capabilities) ? [...new Set(input.capabilities.map(String))] : [], read_mode: requireEnum(input.read_mode, DRIVER_MODES, 'DRIVER_READ_MODE_INVALID'),
    write_mode: requireEnum(input.write_mode, DRIVER_MODES, 'DRIVER_WRITE_MODE_INVALID'), availability: requireEnum(input.availability, CAPABILITY_STATES, 'DRIVER_AVAILABILITY_INVALID'),
    health: requireEnum(input.health, ['healthy','degraded','unavailable','unknown'], 'DRIVER_HEALTH_INVALID'), reversible: input.reversible === true,
    confirmation_mechanism: requireString(input.confirmation_mechanism, 'DRIVER_CONFIRMATION_REQUIRED'), timeout_ms: Number(input.timeout_ms),
    retryable_operations: Array.isArray(input.retryable_operations) ? [...input.retryable_operations].map(String) : [], risk_class: requireString(input.risk_class, 'DRIVER_RISK_REQUIRED'),
    input_schema: requireString(input.input_schema, 'DRIVER_INPUT_SCHEMA_REQUIRED'), output_schema: requireString(input.output_schema, 'DRIVER_OUTPUT_SCHEMA_REQUIRED')
  };
  if (!manifest.synthetic || manifest.capabilities.length === 0 || !Number.isInteger(manifest.timeout_ms) || manifest.timeout_ms < 1) throw nativeError('DRIVER_MANIFEST_INVALID');
  if ([manifest.read_mode,manifest.write_mode].some((mode) => mode === 'authorized' || mode === 'authorized_with_confirmation')) throw nativeError('REAL_DRIVER_MODE_PROHIBITED');
  return deepFreeze(manifest);
}

function operationalIdentity(value) { return sha256(canonicalJson(value)); }

module.exports = { RESULT_STATES, CAPABILITY_STATES, DRIVER_MODES, QUEUE_STATES, DATA_STATES, AUTHORITIES, requireObject, requireString, requireEnum, requireIso, validateGatewayInput, validateCapabilityRequest, validateCapabilityResult, validateDriverManifest, operationalIdentity };
