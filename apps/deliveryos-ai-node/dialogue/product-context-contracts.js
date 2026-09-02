'use strict';

const CUSTOMER_TOOL_NAMES = Object.freeze([
  'find_customer_by_phone',
  'find_customer_candidates',
  'get_customer_summary',
  'get_customer_preferences',
  'get_customer_restrictions',
  'get_recent_orders',
  'get_recent_reservations',
  'get_recent_incidents',
  'record_customer_fact_candidate',
  'request_customer_confirmation'
]);

const MENU_TOOL_NAMES = Object.freeze([
  'search_menu_items',
  'get_menu_item_details',
  'get_channel_menu',
  'get_item_availability',
  'get_item_allergens',
  'get_item_customizations',
  'get_recommendation_candidates',
  'get_pairing_candidates',
  'compare_menu_variants'
]);

const FUTURE_MENU_JOURNEYS = Object.freeze([
  'menu_discovery',
  'dish_recommendation',
  'drink_pairing',
  'dietary_filter',
  'allergen_guidance',
  'order_composition',
  'menu_comparison'
]);

const PRODUCT_CONTEXT_KEYS = Object.freeze([
  'customer_context',
  'menu_context',
  'recommendation_context',
  'channel_policy',
  'cost_policy'
]);

const MENU_CHANNELS = Object.freeze(['dining_room', 'ifood', 'own_delivery', 'unknown']);
const CONTEXT_STATUSES = Object.freeze(['absent', 'unknown', 'partial', 'ready', 'ambiguous', 'unavailable', 'blocked']);
const COST_VERIFICATION_STATUSES = Object.freeze(['free_verified', 'unknown', 'potentially_billable', 'billable']);

const ZERO_EXTERNAL_COST_POLICY = Object.freeze({
  schema_version: 'deliveryos-cost-policy-context-v1',
  financial_mode: 'ZERO_EXTERNAL_COST',
  maximum_external_spend: 0,
  verification_status: 'free_verified',
  estimated_external_cost: 0,
  billing_trigger_present: false,
  trial_with_auto_billing: false,
  external_provider_required: false,
  evidence: Object.freeze(['local_or_existing_infrastructure_only']),
  unknowns: Object.freeze([])
});

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value, maximum = 100) {
  return Array.isArray(value) && value.length <= maximum && value.every((item) => typeof item === 'string' && item.length <= 500);
}

function factArray(value) {
  return Array.isArray(value) && value.length <= 100 && value.every((fact) => (
    isPlainObject(fact)
    && typeof fact.field === 'string'
    && ['string', 'number', 'boolean'].includes(typeof fact.value)
    && typeof fact.source === 'string'
  ));
}

function validateCustomerContext(value) {
  if (value == null) return { accepted: true, reason: null, context: null };
  if (!isPlainObject(value) || value.schema_version !== 'deliveryos-customer-context-v1') return { accepted: false, reason: 'CUSTOMER_CONTEXT_VERSION_INVALID' };
  if (!CONTEXT_STATUSES.includes(value.status) || !['unknown', 'unique', 'ambiguous', 'not_found'].includes(value.identity_status)) return { accepted: false, reason: 'CUSTOMER_CONTEXT_STATUS_INVALID' };
  if (!['unknown', 'absent', 'granted', 'revoked'].includes(value.consent_status)) return { accepted: false, reason: 'CUSTOMER_CONTEXT_CONSENT_INVALID' };
  if (!factArray(value.confirmed_facts) || !factArray(value.inferred_facts) || !Array.isArray(value.declared_restrictions) || !stringArray(value.unknowns) || !stringArray(value.provenance)) return { accepted: false, reason: 'CUSTOMER_CONTEXT_SHAPE_INVALID' };
  const confirmed = new Set(value.confirmed_facts.map((fact) => fact.field));
  if (value.inferred_facts.some((fact) => confirmed.has(fact.field))) return { accepted: false, reason: 'CUSTOMER_FACT_CERTAINTY_CONFLICT' };
  if (value.identity_status !== 'unique' && value.customer_id != null) return { accepted: false, reason: 'CUSTOMER_IDENTITY_NOT_UNIQUE' };
  return { accepted: true, reason: null, context: freeze({ ...value }) };
}

function validateMenuContext(value) {
  if (value == null) return { accepted: true, reason: null, context: null };
  if (!isPlainObject(value) || value.schema_version !== 'deliveryos-menu-context-v1') return { accepted: false, reason: 'MENU_CONTEXT_VERSION_INVALID' };
  if (!CONTEXT_STATUSES.includes(value.status) || !MENU_CHANNELS.includes(value.channel)) return { accepted: false, reason: 'MENU_CONTEXT_STATUS_INVALID' };
  if (!Array.isArray(value.items) || !stringArray(value.unknowns) || !Array.isArray(value.divergences) || !stringArray(value.provenance)) return { accepted: false, reason: 'MENU_CONTEXT_SHAPE_INVALID' };
  for (const item of value.items) {
    if (!isPlainObject(item) || typeof item.item_id !== 'string' || typeof item.name !== 'string') return { accepted: false, reason: 'MENU_CONTEXT_ITEM_INVALID' };
    if (item.channel && item.channel !== value.channel) return { accepted: false, reason: 'MENU_CONTEXT_CHANNEL_MIXED' };
    if (item.unit_id && value.unit_id && item.unit_id !== value.unit_id) return { accepted: false, reason: 'MENU_CONTEXT_UNIT_MIXED' };
  }
  return { accepted: true, reason: null, context: freeze({ ...value }) };
}

function validateRecommendationContext(value) {
  if (value == null) return { accepted: true, reason: null, context: null };
  if (!isPlainObject(value) || value.schema_version !== 'deliveryos-recommendation-context-v1') return { accepted: false, reason: 'RECOMMENDATION_CONTEXT_VERSION_INVALID' };
  if (!CONTEXT_STATUSES.includes(value.status) || !stringArray(value.objectives) || !stringArray(value.constraints) || !stringArray(value.candidate_item_ids) || !stringArray(value.unknowns)) return { accepted: false, reason: 'RECOMMENDATION_CONTEXT_SHAPE_INVALID' };
  if (Object.hasOwn(value, 'ranking') || Object.hasOwn(value, 'scores')) return { accepted: false, reason: 'RECOMMENDATION_RANKING_NOT_AUTHORIZED' };
  return { accepted: true, reason: null, context: freeze({ ...value }) };
}

function validateChannelPolicyContext(value) {
  if (value == null) return { accepted: true, reason: null, context: null };
  if (!isPlainObject(value) || value.schema_version !== 'deliveryos-channel-policy-context-v1') return { accepted: false, reason: 'CHANNEL_POLICY_VERSION_INVALID' };
  if (!['whatsapp_official', 'simulator', 'unknown'].includes(value.channel) || typeof value.official_provider !== 'boolean' || typeof value.sending_allowed !== 'boolean') return { accepted: false, reason: 'CHANNEL_POLICY_SHAPE_INVALID' };
  if (!['customer_initiated', 'business_initiated', 'unknown'].includes(value.initiation) || !['present', 'absent', 'unknown'].includes(value.consent_status) || !stringArray(value.blocked_message_classes) || !stringArray(value.unknowns)) return { accepted: false, reason: 'CHANNEL_POLICY_STATE_INVALID' };
  return { accepted: true, reason: null, context: freeze({ ...value }) };
}

function validateCostPolicyContext(value) {
  if (value == null) return { accepted: true, reason: null, context: null };
  if (!isPlainObject(value) || value.schema_version !== 'deliveryos-cost-policy-context-v1') return { accepted: false, reason: 'COST_POLICY_VERSION_INVALID' };
  if (value.financial_mode !== 'ZERO_EXTERNAL_COST' || value.maximum_external_spend !== 0) return { accepted: false, reason: 'COST_POLICY_MODE_INVALID' };
  if (!COST_VERIFICATION_STATUSES.includes(value.verification_status) || !Number.isFinite(value.estimated_external_cost) || value.estimated_external_cost < 0) return { accepted: false, reason: 'COST_POLICY_ESTIMATE_INVALID' };
  if (![value.billing_trigger_present, value.trial_with_auto_billing, value.external_provider_required].every((item) => typeof item === 'boolean') || !stringArray(value.evidence) || !stringArray(value.unknowns)) return { accepted: false, reason: 'COST_POLICY_SHAPE_INVALID' };
  return { accepted: true, reason: null, context: freeze({ ...value }) };
}

function evaluateCostPolicy(value) {
  const checked = validateCostPolicyContext(value);
  if (!checked.accepted) return freeze({ allowed: false, status: 'blocked', reasons: [checked.reason], context: null });
  if (!checked.context) return freeze({ allowed: false, status: 'blocked', reasons: ['COST_POLICY_MISSING'], context: null });
  const context = checked.context;
  const reasons = [];
  if (context.verification_status !== 'free_verified') reasons.push('COST_NOT_VERIFIED_FREE');
  if (context.estimated_external_cost !== 0) reasons.push('EXTERNAL_COST_ABOVE_ZERO');
  if (context.billing_trigger_present) reasons.push('BILLING_TRIGGER_PRESENT');
  if (context.trial_with_auto_billing) reasons.push('AUTO_BILLING_TRIAL_FORBIDDEN');
  if (context.external_provider_required) reasons.push('EXTERNAL_PROVIDER_COST_RISK');
  if (context.unknowns.length) reasons.push('COST_UNKNOWNS_PRESENT');
  return freeze({ allowed: reasons.length === 0, status: reasons.length ? 'blocked' : 'free_verified', reasons, context });
}

function evaluateWhatsAppPolicy(channelPolicy, costPolicy) {
  const channel = validateChannelPolicyContext(channelPolicy);
  const cost = evaluateCostPolicy(costPolicy);
  const reasons = [];
  if (!channel.accepted || !channel.context) reasons.push(channel.reason || 'CHANNEL_POLICY_MISSING');
  else {
    if (channel.context.channel !== 'whatsapp_official') reasons.push('WHATSAPP_OFFICIAL_CHANNEL_REQUIRED');
    if (!channel.context.official_provider) reasons.push('UNOFFICIAL_PROVIDER_FORBIDDEN');
    if (!channel.context.sending_allowed) reasons.push('CHANNEL_SENDING_NOT_ALLOWED');
    if (channel.context.initiation !== 'customer_initiated') reasons.push('BUSINESS_INITIATED_BLOCKED_ZERO_COST');
    if (channel.context.consent_status !== 'present') reasons.push('CHANNEL_CONSENT_REQUIRED');
    if (channel.context.blocked_message_classes.length) reasons.push('MESSAGE_CLASS_BLOCKED');
    if (channel.context.unknowns.length) reasons.push('CHANNEL_UNKNOWNS_PRESENT');
  }
  if (!cost.allowed) reasons.push(...cost.reasons);
  return freeze({ allowed: reasons.length === 0, status: reasons.length ? 'blocked' : 'allowed', reasons: [...new Set(reasons)] });
}

function hasDeclaredAllergy(customerContext) {
  const checked = validateCustomerContext(customerContext);
  if (!checked.accepted || !checked.context) return false;
  return checked.context.declared_restrictions.some((item) => isPlainObject(item) && item.type === 'allergy' && item.status === 'confirmed');
}

function evaluateRecommendationSafety(input = {}) {
  const customer = validateCustomerContext(input.customer_context);
  const menu = validateMenuContext(input.menu_context);
  const recommendation = validateRecommendationContext(input.recommendation_context);
  const reasons = [];
  if (!customer.accepted) reasons.push(customer.reason);
  if (!menu.accepted) reasons.push(menu.reason);
  if (!recommendation.accepted) reasons.push(recommendation.reason);
  if (customer.accepted && customer.context?.identity_status === 'ambiguous') reasons.push('CUSTOMER_IDENTITY_AMBIGUOUS');
  if (hasDeclaredAllergy(customer.context) && (!menu.context || menu.context.unknowns.some((item) => /allergen|cross_contamination/iu.test(item)))) reasons.push('ALLERGY_INFORMATION_INCOMPLETE');
  return freeze({ allowed: reasons.length === 0, requires_clarification: reasons.includes('CUSTOMER_IDENTITY_AMBIGUOUS'), requires_allergen_guidance: reasons.includes('ALLERGY_INFORMATION_INCOMPLETE'), reasons });
}

function validateProductContexts(input = {}) {
  const checks = {
    customer_context: validateCustomerContext(input.customer_context),
    menu_context: validateMenuContext(input.menu_context),
    recommendation_context: validateRecommendationContext(input.recommendation_context),
    channel_policy: validateChannelPolicyContext(input.channel_policy),
    cost_policy: validateCostPolicyContext(input.cost_policy)
  };
  const invalid = Object.entries(checks).find(([, result]) => !result.accepted);
  if (invalid) return { accepted: false, reason: invalid[1].reason, contexts: null };
  return {
    accepted: true,
    reason: null,
    contexts: freeze(Object.fromEntries(Object.entries(checks).map(([key, result]) => [key, result.context])))
  };
}

function deferredToolResult(toolName) {
  return freeze({
    schema_version: 'deliveryos-deferred-product-tool-result-v1',
    tool: toolName,
    status: 'unavailable',
    reason: toolName.startsWith('get_') || toolName.startsWith('search_') ? 'FUTURE_CHANGE_NOT_IMPLEMENTED' : 'WRITE_NOT_AUTHORIZED',
    synthetic: true,
    data: null
  });
}

function createDeferredProductTools() {
  return freeze(Object.fromEntries([...CUSTOMER_TOOL_NAMES, ...MENU_TOOL_NAMES].map((name) => [name, async () => deferredToolResult(name)])));
}

module.exports = {
  CUSTOMER_TOOL_NAMES,
  MENU_TOOL_NAMES,
  FUTURE_MENU_JOURNEYS,
  PRODUCT_CONTEXT_KEYS,
  MENU_CHANNELS,
  CONTEXT_STATUSES,
  COST_VERIFICATION_STATUSES,
  ZERO_EXTERNAL_COST_POLICY,
  validateCustomerContext,
  validateMenuContext,
  validateRecommendationContext,
  validateChannelPolicyContext,
  validateCostPolicyContext,
  evaluateCostPolicy,
  evaluateWhatsAppPolicy,
  hasDeclaredAllergy,
  evaluateRecommendationSafety,
  validateProductContexts,
  createDeferredProductTools
};
