'use strict';

const { deepFreeze } = require('./catalogs/operational');
const { buildApprovedResponseEnvelope } = require('./approved-response-plan');

function customerContextFromSummary(toolResult) {
  if (!toolResult || toolResult.status === 'not_found') {
    return deepFreeze({
      schema_version: 'deliveryos-customer-context-v1',
      status: 'unknown',
      identity_status: 'not_found',
      customer_id: null,
      consent_status: 'unknown',
      confirmed_facts: [],
      inferred_facts: [],
      declared_restrictions: [],
      unknowns: ['customer_identity'],
      provenance: []
    });
  }
  const summary = toolResult.data;
  return deepFreeze({
    schema_version: 'deliveryos-customer-context-v1',
    status: summary.review_required ? 'partial' : 'ready',
    identity_status: 'unique',
    customer_id: summary.customer_id,
    consent_status: summary.consent?.all_marketing === 'allowed'
      ? 'granted'
      : (['blocked', 'withdrawn'].includes(summary.consent?.all_marketing) ? 'revoked' : 'unknown'),
    confirmed_facts: (summary.facts || []).filter((fact) => fact.state === 'confirmed')
      .map((fact) => ({ field: fact.field, value: fact.value, source: fact.source })),
    inferred_facts: (summary.facts || []).filter((fact) => fact.state === 'inferred')
      .map((fact) => ({ field: fact.field, value: fact.value, source: fact.source })),
    declared_restrictions: summary.restrictions || [],
    unknowns: summary.unknowns || [],
    provenance: summary.sources || []
  });
}

function menuContextFromRecommendation(toolResult, request = {}) {
  const recommendation = toolResult?.data || { candidates: [], unknowns: ['menu_context'] };
  const allergenUnknowns = Array.isArray(request.allergies)
    && request.allergies.length
    && !(recommendation.candidates || []).length
    ? ['allergen_information_incomplete']
    : [];
  return deepFreeze({
    schema_version: 'deliveryos-menu-context-v1',
    status: recommendation.candidates?.length ? 'ready' : 'partial',
    channel: request.channel || 'unknown',
    unit_id: request.unit_id || null,
    items: (recommendation.candidates || []).map((item) => ({
      item_id: item.item_id,
      name: item.name,
      category: item.category || null,
      channel: item.channel,
      unit_id: item.unit_id,
      price: item.price,
      availability: item.availability,
      reasons: item.reasons || [],
      warnings: item.warnings || [],
      source_records: item.source_records
    })),
    unknowns: [...new Set([...(recommendation.unknowns || []), ...allergenUnknowns])],
    divergences: [],
    provenance: toolResult?.sources || []
  });
}

function recommendationContextFromResult(toolResult) {
  const hospitalityContext = arguments[1] || null;
  const turnAnalysis = arguments[2] || null;
  const result = toolResult?.data || { candidates: [], unknowns: ['recommendation'] };
  const activePreferences = [
    ...(hospitalityContext?.preferred_ingredients || []),
    ...(hospitalityContext?.flavor_preferences || []),
    ...(hospitalityContext?.texture_preferences || []),
    ...(hospitalityContext?.preparation_preferences || [])
  ];
  const questions = turnAnalysis?.questions || [];
  const questionsAnswerableNow = questions.filter((question) => {
    if (question === 'recommendation') return (result.candidates || []).length > 0;
    if (question === 'price') return (result.candidates || []).some((item) => item.price != null);
    if (question === 'drink_pairing') return true;
    if (question === 'raw_preparation') return Boolean(turnAnalysis?.resolved_reference);
    return false;
  });
  return deepFreeze({
    schema_version: 'deliveryos-recommendation-context-v1',
    status: result.candidates?.length ? 'ready' : 'partial',
    objectives: ['safe_relevant_menu_guidance'],
    constraints: result.constraints_applied || [],
    candidate_item_ids: (result.candidates || []).map((item) => item.item_id),
    unknowns: result.unknowns || [],
    candidate_options: (result.candidates || []).map((item) => ({
      item_id: item.item_id,
      name: item.name,
      category: item.category || null,
      price: item.price ?? null
    })),
    candidate_reasons: (result.candidates || []).map((item) => ({
      item_id: item.item_id,
      reasons: item.reasons || []
    })),
    candidate_tradeoffs: (result.candidates || []).map((item) => ({
      item_id: item.item_id,
      tradeoffs: item.warnings || []
    })),
    active_preferences: [...new Set(activePreferences)],
    active_restrictions: [
      ...(hospitalityContext?.excluded_ingredients || []),
      ...(hospitalityContext?.dietary_restrictions || []),
      ...(hospitalityContext?.allergies || [])
    ],
    customer_goal: turnAnalysis?.goal || null,
    requested_category: turnAnalysis?.requested_category || null,
    questions_answerable_now: questionsAnswerableNow,
    unresolved_reference: turnAnalysis?.unresolved_reference || null,
    hospitality_context: hospitalityContext
  });
}

function buildCustomerMenuApprovedEnvelope(input = {}) {
  return buildApprovedResponseEnvelope({
    ...input,
    customer_context: input.customer_context,
    menu_context: input.menu_context,
    recommendation_context: input.recommendation_context
  });
}

module.exports = {
  customerContextFromSummary,
  menuContextFromRecommendation,
  recommendationContextFromResult,
  buildCustomerMenuApprovedEnvelope
};
