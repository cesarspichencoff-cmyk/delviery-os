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
  return deepFreeze({
    schema_version: 'deliveryos-menu-context-v1',
    status: recommendation.candidates?.length ? 'ready' : 'partial',
    channel: request.channel || 'unknown',
    unit_id: request.unit_id || null,
    items: (recommendation.candidates || []).map((item) => ({
      item_id: item.item_id,
      name: item.name,
      channel: item.channel,
      unit_id: item.unit_id,
      price: item.price,
      source_records: item.source_records
    })),
    unknowns: recommendation.unknowns || [],
    divergences: [],
    provenance: toolResult?.sources || []
  });
}

function recommendationContextFromResult(toolResult) {
  const result = toolResult?.data || { candidates: [], unknowns: ['recommendation'] };
  return deepFreeze({
    schema_version: 'deliveryos-recommendation-context-v1',
    status: result.candidates?.length ? 'ready' : 'partial',
    objectives: ['safe_relevant_menu_guidance'],
    constraints: result.constraints_applied || [],
    candidate_item_ids: (result.candidates || []).map((item) => item.item_id),
    unknowns: result.unknowns || []
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
