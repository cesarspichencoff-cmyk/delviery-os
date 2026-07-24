'use strict';

const {
  ENTITY_TYPES,
  CONSENT_STATUS,
  SEVERITY,
  OCCURRENCE_STATUS,
  PROMISE_STATUS,
  BENEFIT_STATUS,
  domainError,
  requireString,
  requireEnum,
  optionalIso,
  cloneFrozen,
  sanitizeTimelinePayload
} = require('./contracts');

function makeEntity(type, fields) {
  return cloneFrozen({ schema_version: 'crm-v0', entity_type: type, ...fields });
}

function createCustomerProfile(input) {
  return makeEntity(ENTITY_TYPES.PROFILE, {
    profile_id: requireString(input.profile_id, 'PROFILE_ID_OBRIGATORIO'),
    tenant_id: requireString(input.tenant_id, 'TENANT_ID_OBRIGATORIO'),
    status: input.status || 'active',
    provenance: requireString(input.provenance || 'synthetic', 'PROVENIENCIA_OBRIGATORIA'),
    created_at: optionalIso(input.created_at, 'DATA_INVALIDA')
  });
}

function createCustomerIdentity(input) {
  const type = requireEnum(input.identity_type, ['phone_token', 'email_token', 'external_token'], 'TIPO_IDENTIDADE_INVALIDO');
  return makeEntity(ENTITY_TYPES.IDENTITY, {
    identity_id: requireString(input.identity_id, 'IDENTITY_ID_OBRIGATORIO'),
    tenant_id: requireString(input.tenant_id, 'TENANT_ID_OBRIGATORIO'),
    profile_id: requireString(input.profile_id, 'PROFILE_ID_OBRIGATORIO'),
    identity_type: type,
    value_token: requireString(input.value_token, 'IDENTITY_TOKEN_OBRIGATORIO'),
    source: requireString(input.source, 'FONTE_OBRIGATORIA'),
    verification_state: input.verification_state || 'unverified',
    created_at: optionalIso(input.created_at, 'DATA_INVALIDA')
  });
}

function createCustomerOrderReference(input) {
  return makeEntity(ENTITY_TYPES.ORDER_REFERENCE, {
    reference_id: requireString(input.reference_id, 'REFERENCE_ID_OBRIGATORIO'),
    tenant_id: requireString(input.tenant_id, 'TENANT_ID_OBRIGATORIO'),
    profile_id: requireString(input.profile_id, 'PROFILE_ID_OBRIGATORIO'),
    order_token: requireString(input.order_token, 'ORDER_TOKEN_OBRIGATORIO'),
    source: requireString(input.source, 'FONTE_OBRIGATORIA'),
    observed_at: optionalIso(input.observed_at, 'DATA_INVALIDA'),
    status: input.status || 'unknown'
  });
}

function createCustomerOccurrence(input) {
  return makeEntity(ENTITY_TYPES.OCCURRENCE, {
    occurrence_id: requireString(input.occurrence_id, 'OCCURRENCE_ID_OBRIGATORIO'),
    tenant_id: requireString(input.tenant_id, 'TENANT_ID_OBRIGATORIO'),
    profile_id: requireString(input.profile_id, 'PROFILE_ID_OBRIGATORIO'),
    intent: requireString(input.intent, 'INTENCAO_OBRIGATORIA'),
    origin: requireString(input.origin, 'ORIGEM_OBRIGATORIA'),
    severity: requireEnum(input.severity, SEVERITY, 'GRAVIDADE_INVALIDA'),
    status: requireEnum(input.status || 'open', OCCURRENCE_STATUS, 'STATUS_OCORRENCIA_INVALIDO'),
    summary_code: requireString(input.summary_code, 'RESUMO_CODIFICADO_OBRIGATORIO'),
    evidence_codes: Array.isArray(input.evidence_codes) ? [...new Set(input.evidence_codes.map(String))] : [],
    created_at: optionalIso(input.created_at, 'DATA_INVALIDA')
  });
}

function createCustomerPromise(input) {
  const human = requireString(input.authorized_by_human_id, 'PROMESSA_EXIGE_AUTORIZACAO_HUMANA');
  return makeEntity(ENTITY_TYPES.PROMISE, {
    promise_id: requireString(input.promise_id, 'PROMISE_ID_OBRIGATORIO'),
    tenant_id: requireString(input.tenant_id, 'TENANT_ID_OBRIGATORIO'),
    profile_id: requireString(input.profile_id, 'PROFILE_ID_OBRIGATORIO'),
    occurrence_id: requireString(input.occurrence_id, 'OCCURRENCE_ID_OBRIGATORIO'),
    promise_type: requireString(input.promise_type, 'TIPO_PROMESSA_OBRIGATORIO'),
    status: requireEnum(input.status || 'registered', PROMISE_STATUS, 'STATUS_PROMESSA_INVALIDO'),
    authorized_by_human_id: human,
    authorized_at: optionalIso(input.authorized_at, 'DATA_INVALIDA'),
    due_at: optionalIso(input.due_at, 'DATA_INVALIDA'),
    created_at: optionalIso(input.created_at, 'DATA_INVALIDA')
  });
}

function createCustomerBenefit(input) {
  const status = requireEnum(input.status || 'pending_human', BENEFIT_STATUS, 'STATUS_BENEFICIO_INVALIDO');
  const human = input.authorized_by_human_id ? requireString(input.authorized_by_human_id, 'AUTORIZADOR_INVALIDO') : null;
  if (status !== 'pending_human' && !human) throw domainError('BENEFICIO_EXIGE_AUTORIZACAO_HUMANA');
  return makeEntity(ENTITY_TYPES.BENEFIT, {
    benefit_id: requireString(input.benefit_id, 'BENEFIT_ID_OBRIGATORIO'),
    tenant_id: requireString(input.tenant_id, 'TENANT_ID_OBRIGATORIO'),
    profile_id: requireString(input.profile_id, 'PROFILE_ID_OBRIGATORIO'),
    occurrence_id: input.occurrence_id ? requireString(input.occurrence_id, 'OCCURRENCE_ID_INVALIDO') : null,
    benefit_type: requireString(input.benefit_type, 'TIPO_BENEFICIO_OBRIGATORIO'),
    status,
    authorized_by_human_id: human,
    authorized_at: human ? optionalIso(input.authorized_at, 'DATA_INVALIDA') : null,
    created_at: optionalIso(input.created_at, 'DATA_INVALIDA')
  });
}

function createCustomerConsent(input) {
  return makeEntity(ENTITY_TYPES.CONSENT, {
    consent_id: requireString(input.consent_id, 'CONSENT_ID_OBRIGATORIO'),
    tenant_id: requireString(input.tenant_id, 'TENANT_ID_OBRIGATORIO'),
    profile_id: requireString(input.profile_id, 'PROFILE_ID_OBRIGATORIO'),
    channel: requireString(input.channel, 'CANAL_OBRIGATORIO'),
    status: requireEnum(input.status, CONSENT_STATUS, 'STATUS_CONSENTIMENTO_INVALIDO'),
    source: requireString(input.source, 'FONTE_OBRIGATORIA'),
    observed_at: optionalIso(input.observed_at, 'DATA_INVALIDA'),
    created_at: optionalIso(input.created_at, 'DATA_INVALIDA')
  });
}

function createCustomerTimelineEvent(input) {
  const payload = sanitizeTimelinePayload(input.payload && typeof input.payload === 'object' ? input.payload : {});
  return makeEntity(ENTITY_TYPES.TIMELINE_EVENT, {
    event_id: requireString(input.event_id, 'EVENT_ID_OBRIGATORIO'),
    tenant_id: requireString(input.tenant_id, 'TENANT_ID_OBRIGATORIO'),
    profile_id: requireString(input.profile_id, 'PROFILE_ID_OBRIGATORIO'),
    event_type: requireString(input.event_type, 'EVENT_TYPE_OBRIGATORIO'),
    source: requireString(input.source, 'FONTE_OBRIGATORIA'),
    occurred_at: optionalIso(input.occurred_at, 'DATA_INVALIDA'),
    payload
  });
}

module.exports = {
  createCustomerProfile,
  createCustomerIdentity,
  createCustomerOrderReference,
  createCustomerOccurrence,
  createCustomerPromise,
  createCustomerBenefit,
  createCustomerConsent,
  createCustomerTimelineEvent
};
