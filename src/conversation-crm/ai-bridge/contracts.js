'use strict';

const crypto = require('node:crypto');
const { canonicalJson, sha256 } = require('../native/deterministic');

const JOB_STATES = Object.freeze([
  'queued', 'claimed', 'processing', 'completed', 'rejected', 'expired',
  'failed', 'fallback_used'
]);
const NODE_STATES = Object.freeze(['pending', 'active', 'maintenance', 'degraded', 'revoked', 'blocked']);
const REQUEST_TYPES = Object.freeze(['conversation_director', 'response_writer']);

function requireToken(value, code) {
  const token = String(value || '');
  if (!token || token.length > 256 || !/^[A-Za-z0-9._:/-]+$/u.test(token)) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
  return token;
}

function requireIso(value, code) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
  return date.toISOString();
}

function idempotencyKey(input = {}) {
  const identity = [
    requireToken(input.conversation_id, 'AI_CONVERSATION_ID_REQUIRED'),
    requireToken(input.turn_id, 'AI_TURN_ID_REQUIRED'),
    requireToken(input.request_type, 'AI_REQUEST_TYPE_REQUIRED'),
    requireToken(input.model_version, 'AI_MODEL_VERSION_REQUIRED'),
    requireToken(input.prompt_contract_version, 'AI_PROMPT_VERSION_REQUIRED')
  ].join('|');
  return `ai_job:${sha256(identity)}`;
}

function payloadHash(payload) {
  return sha256(canonicalJson(payload));
}

function newOpaqueToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

module.exports = {
  JOB_STATES,
  NODE_STATES,
  REQUEST_TYPES,
  requireToken,
  requireIso,
  idempotencyKey,
  payloadHash,
  newOpaqueToken,
  clone
};

