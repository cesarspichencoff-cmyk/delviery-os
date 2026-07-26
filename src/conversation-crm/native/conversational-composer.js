'use strict';

const { deepFreeze } = require('./catalogs/operational');
const { sha256 } = require('./deterministic');
const { composeResponse } = require('./response-composer');
const { chooseResponseStrategy } = require('./response-strategies');
const {
  validateComposedResponse,
  safeHumanizedFallback,
  repetitionMetrics,
  compareResponses
} = require('./response-validator');

function conversationStage(input = {}) {
  if (Number(input.turn_order) > 1 || input.previous_responses?.length) return 'continuation';
  return 'first_contact';
}

function responseSize(classification) {
  const intent = classification.intent || '';
  if (
    classification.policies?.food_safety
    || classification.severity === 'critical'
    || classification.escalation === 'E3'
    || classification.escalation === 'E4'
    || intent.startsWith('occurrence.')
    || intent === 'public_exposure'
  ) return 'careful';
  if (
    intent.startsWith('reservation.')
    || intent.startsWith('waitlist.')
    || intent === 'event.oke_pickup'
    || classification.subintent === 'executive_lunch'
    || classification.subintent === 'tata_suggestion'
    || classification.subintent === 'delivery_options'
  ) return 'medium';
  return 'short';
}

function sentimentFor(classification, sourceText = '') {
  const text = String(sourceText).normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase();
  if (classification.policies?.food_safety || classification.severity === 'critical') return 'sensitive';
  if (/\b(absurdo|chatead|frustrad|irritad|decepcionad|poxa|infelizmente)\b/u.test(text)) return 'frustrated';
  if (/\b(adorei|amei|legal|otimo|animad|quero conhecer)\b/u.test(text)) return 'enthusiastic';
  if (classification.intent?.startsWith('occurrence.')) return 'concerned';
  if (/^(?:information|reservation|waitlist|event)\./u.test(classification.intent || '')) return 'interested';
  return 'neutral';
}

function createConversationPlan(input) {
  const classification = input.classification;
  const conversation = input.conversation || {};
  const confirmedFacts = Object.entries(classification.entities || {})
    .filter(([, entity]) => entity?.state === 'confirmed')
    .map(([field]) => field);
  const knownFacts = Object.entries(classification.entities || {})
    .filter(([, entity]) => entity?.state !== 'missing' && entity?.state !== 'conflict')
    .map(([field]) => field);
  return deepFreeze({
    schema_version: 'conversation-composition-plan-v1',
    intent: classification.intent,
    conversation_stage: conversationStage(conversation),
    sentiment: sentimentFor(classification, conversation.source_text),
    gravity: classification.severity,
    known_facts: knownFacts,
    confirmed_facts: confirmedFacts,
    missing_facts: [...(classification.fields_missing || [])],
    verified_actions: input.result?.status === 'confirmed' ? [classification.action] : [],
    pending_actions: input.result?.status === 'confirmed' ? [] : [classification.action].filter(Boolean),
    allowed_information: classification.information_source ? ['confirmed_public_catalog'] : [],
    mandatory_questions: [...(classification.fields_missing || [])],
    prohibited_claims: [...(classification.prohibited_responses || [])],
    tone_profile: 'tata_warm',
    response_size: responseSize(classification),
    escalation: classification.escalation,
    handoff_confirmed: input.handoff?.status === 'confirmed'
  });
}

function composeConversationalResponse(input) {
  const legacy = composeResponse(input);
  const plan = createConversationPlan(input);
  const conversation = input.conversation || {};
  const variationKey = sha256([
    input.seed || 'TATA-SIM-V1',
    conversation.conversation_id || 'SIM-CONV-UNKNOWN',
    input.classification.intent,
    plan.conversation_stage
  ].join('|')).slice(0, 16);
  const proposedText = chooseResponseStrategy({
    classification: input.classification,
    result: input.result,
    handoff: input.handoff,
    plan,
    legacyText: legacy.text,
    variationKey
  });
  const firstValidation = validateComposedResponse({
    text: proposedText,
    legacy_text: legacy.text,
    classification: input.classification,
    result: input.result,
    plan
  });
  const fallbackText = firstValidation.passed ? null : safeHumanizedFallback({
    legacy_text: legacy.text,
    classification: input.classification,
    result: input.result,
    plan
  });
  const text = fallbackText || proposedText;
  const validation = firstValidation.passed
    ? firstValidation
    : {
        ...validateComposedResponse({
          text,
          legacy_text: legacy.text,
          classification: input.classification,
          result: input.result,
          plan
        }),
        fallback_used: true,
        rejected_findings: firstValidation.findings
      };
  const repetition = repetitionMetrics(text, conversation.previous_responses || []);
  const comparison = compareResponses(legacy.text, text, validation, repetition);
  return deepFreeze({
    ...legacy,
    schema_version: 'conversation-response-v1.3',
    text,
    previous_text: legacy.text,
    plan,
    variation_key: variationKey,
    humanized: true,
    validation,
    repetition,
    comparison
  });
}

module.exports = {
  conversationStage,
  responseSize,
  sentimentFor,
  createConversationPlan,
  composeConversationalResponse
};
