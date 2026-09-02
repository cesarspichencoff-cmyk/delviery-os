'use strict';

const { deepFreeze } = require('./catalogs/operational');

function strategy(id, goal, components, options = {}) {
  return {
    id,
    response_goal: goal,
    mandatory_components: components,
    optional_components: options.optional || [],
    preferred_order: options.order || components,
    length: options.length || 'short',
    emoji_policy: options.emoji || 'none',
    question_policy: options.question || 'mandatory_only',
    closing_policy: options.closing || 'none',
    prohibited_claims: options.prohibited || [],
    fallback_conditions: options.fallback || []
  };
}

const STRATEGIES = deepFreeze({
  social_greeting: strategy('social_greeting', 'acknowledge', ['greeting'], { optional: ['journey_resume'], emoji: 'optional_one' }),
  social_chitchat: strategy('social_chitchat', 'acknowledge', ['social_reply'], { optional: ['journey_resume'], emoji: 'optional_one' }),
  social_close: strategy('social_close', 'close', ['farewell'], { length: 'short' }),
  information_direct: strategy('information_direct', 'inform', ['fact'], { optional: ['brief_acknowledgement'], emoji: 'optional_one' }),
  information_enriched: strategy('information_enriched', 'inform', ['acknowledgement', 'fact'], { optional: ['related_confirmed_fact'], length: 'medium', emoji: 'optional_one' }),
  customer_interested: strategy('customer_interested', 'acknowledge', ['acknowledgement', 'fact'], { optional: ['invitation_to_continue'], length: 'medium', emoji: 'optional_one' }),
  recommendation: strategy('recommendation', 'guide', ['acknowledgement', 'verified_options'], { optional: ['clarifying_question'], length: 'medium', emoji: 'optional_one' }),
  reservation: strategy('reservation', 'guide', ['acknowledgement', 'verified_channel', 'operational_limit'], { optional: ['mandatory_question'], length: 'medium', emoji: 'optional_one', prohibited: ['unverified_reservation_confirmation'] }),
  waitlist: strategy('waitlist', 'guide', ['acknowledgement', 'verified_channel', 'operational_limit'], { optional: ['mandatory_question'], length: 'medium', emoji: 'optional_one', prohibited: ['unverified_waitlist_confirmation', 'unverified_wait_estimate'] }),
  large_group: strategy('large_group', 'handoff', ['concrete_group_reference', 'operational_limit', 'mandatory_question'], { length: 'medium', prohibited: ['unverified_reservation_confirmation', 'unverified_waitlist_confirmation'] }),
  menu: strategy('menu', 'inform', ['acknowledgement', 'verified_menu_fact'], { optional: ['verified_link'], emoji: 'optional_one' }),
  executive_lunch: strategy('executive_lunch', 'inform', ['acknowledgement', 'verified_experience_fact'], { length: 'medium', emoji: 'optional_one' }),
  tata_suggestion: strategy('tata_suggestion', 'inform', ['acknowledgement', 'verified_experience_fact'], { length: 'medium', emoji: 'optional_one' }),
  payment: strategy('payment', 'inform', ['verified_payment_fact'], { optional: ['brief_acknowledgement'] }),
  corkage: strategy('corkage', 'inform', ['verified_corkage_fact'], { optional: ['brief_acknowledgement'] }),
  valet: strategy('valet', 'inform', ['verified_valet_fact'], { optional: ['brief_acknowledgement'] }),
  own_delivery: strategy('own_delivery', 'guide', ['acknowledgement', 'verified_channel'], { optional: ['verified_link'], length: 'medium' }),
  ifood: strategy('ifood', 'guide', ['acknowledgement', 'platform_limit'], { optional: ['verified_platform_guidance'], length: 'medium' }),
  missing_item: strategy('missing_item', 'handoff', ['problem_acknowledgement', 'concrete_item_reference', 'operational_limit'], { optional: ['mandatory_question'], length: 'careful', prohibited: ['automatic_compensation', 'unverified_replacement'] }),
  wrong_item: strategy('wrong_item', 'handoff', ['problem_acknowledgement', 'concrete_issue_reference', 'operational_limit'], { optional: ['mandatory_question'], length: 'careful', prohibited: ['automatic_compensation'] }),
  wrong_quantity: strategy('wrong_quantity', 'handoff', ['problem_acknowledgement', 'concrete_issue_reference', 'operational_limit'], { optional: ['mandatory_question'], length: 'careful', prohibited: ['automatic_compensation'] }),
  personalization_ignored: strategy('personalization_ignored', 'handoff', ['problem_acknowledgement', 'concrete_issue_reference', 'operational_limit'], { optional: ['mandatory_question'], length: 'careful', prohibited: ['automatic_compensation'] }),
  delay: strategy('delay', 'protect', ['problem_acknowledgement', 'freshness_limit'], { optional: ['mandatory_question'], length: 'careful', prohibited: ['unverified_eta'] }),
  delivery: strategy('delivery', 'guide', ['acknowledgement', 'verified_delivery_fact'], { optional: ['mandatory_question'], length: 'medium' }),
  quality: strategy('quality', 'handoff', ['sensitive_acknowledgement', 'concrete_issue_reference', 'human_followup'], { optional: ['mandatory_question'], length: 'careful', prohibited: ['automatic_compensation', 'liability_admission'] }),
  food_safety: strategy('food_safety', 'protect', ['sensitive_acknowledgement', 'safety_limit', 'human_followup'], { optional: ['mandatory_question'], length: 'careful', prohibited: ['medical_diagnosis', 'medical_causality', 'minimization', 'automatic_compensation'] }),
  oke_events: strategy('oke_events', 'guide', ['acknowledgement', 'verified_event_fact', 'operational_limit'], { optional: ['mandatory_question'], length: 'medium', emoji: 'optional_one' }),
  praise: strategy('praise', 'acknowledge', ['warm_thanks', 'concrete_reference'], { optional: ['brief_closing'], emoji: 'celebratory_two' }),
  complaint: strategy('complaint', 'handoff', ['problem_acknowledgement', 'concrete_issue_reference', 'operational_limit'], { optional: ['mandatory_question'], length: 'careful' }),
  privacy: strategy('privacy', 'protect', ['acknowledgement', 'privacy_limit'], { optional: ['mandatory_question'], length: 'careful', prohibited: ['unverified_retention_claim'] }),
  ambiguity: strategy('ambiguity', 'clarify', ['specific_uncertainty', 'minimal_question'], { length: 'short' }),
  handoff: strategy('handoff', 'handoff', ['acknowledgement', 'handoff_state'], { optional: ['operational_limit'], length: 'medium', prohibited: ['unverified_handoff_confirmation'] }),
  continuation: strategy('continuation', 'acknowledge', ['continuity_reference', 'next_needed_step'], { length: 'short', emoji: 'optional_one', prohibited: ['repeated_greeting', 'repeated_question'] }),
  reopening: strategy('reopening', 'acknowledge', ['reopening_reference', 'new_evidence'], { optional: ['mandatory_question'], length: 'medium' }),
  capability_limit: strategy('capability_limit', 'protect', ['concrete_subject_reference', 'specific_limit'], { optional: ['mandatory_question', 'human_followup'], length: 'medium', prohibited: ['unverified_action_confirmation'] }),
  safe_internal_error: strategy('safe_internal_error', 'protect', ['specific_limit'], { optional: ['human_followup'], length: 'short', prohibited: ['technical_error_detail'] })
});

const SUBINTENT_STRATEGY = Object.freeze({
  address: 'information_direct',
  opening_hours: 'information_direct',
  holiday_hours: 'capability_limit',
  institutional_menu: 'menu',
  dining_room_menu: 'menu',
  delivery_menu: 'menu',
  delivery_options: 'own_delivery',
  restaurant_model: 'information_enriched',
  executive_lunch: 'executive_lunch',
  tata_suggestion: 'tata_suggestion',
  payment: 'payment',
  corkage: 'corkage',
  valet_information: 'valet',
  reservation: 'reservation',
  waitlist: 'waitlist',
  large_group: 'large_group',
  missing_item: 'missing_item',
  wrong_item: 'wrong_item',
  wrong_quantity: 'wrong_quantity',
  personalization_ignored: 'personalization_ignored',
  evento_oke_retirada: 'oke_events'
});

function selectStrategyId(input = {}) {
  const classification = input.classification || {};
  const stage = input.conversation_stage || 'opening';
  const intent = classification.intent || '';
  const status = input.result_status || 'unknown';

  if (stage === 'reopening') return 'reopening';
  if (classification.policies?.food_safety) return 'food_safety';
  if (['degraded', 'unavailable', 'failed', 'conflict'].includes(status)) return 'capability_limit';
  if (SUBINTENT_STRATEGY[classification.subintent]) return SUBINTENT_STRATEGY[classification.subintent];
  if (intent === 'conversation.ambiguous') return stage === 'continuation' ? 'continuation' : 'ambiguity';
  if (intent === 'feedback.praise') return 'praise';
  if (intent.startsWith('privacy.')) return 'privacy';
  if (intent === 'handoff.failure') return 'handoff';
  if (intent.startsWith('occurrence.')) {
    if (/(?:delay|route|collection|preparation)/u.test(intent)) return 'delay';
    if (/(?:quality|appearance|taste|freshness|temperature|foreign_body|allergen)/u.test(intent)) return 'quality';
    return 'complaint';
  }
  if (intent.startsWith('order.') || intent.startsWith('delivery.')) return 'delivery';
  if (intent.startsWith('reservation.')) return 'reservation';
  if (intent.startsWith('waitlist.')) return 'waitlist';
  if (intent.startsWith('information.')) return 'information_direct';
  if (stage === 'continuation') return 'continuation';
  return 'capability_limit';
}

function strategyFor(id) {
  const selected = STRATEGIES[id];
  if (!selected) {
    const error = new Error('RESPONSE_STRATEGY_UNKNOWN');
    error.code = 'RESPONSE_STRATEGY_UNKNOWN';
    error.strategy_id = id;
    throw error;
  }
  return selected;
}

function validateStrategyCatalog(catalog = STRATEGIES) {
  const required = ['id', 'response_goal', 'mandatory_components', 'optional_components', 'preferred_order', 'length', 'emoji_policy', 'question_policy', 'closing_policy', 'prohibited_claims', 'fallback_conditions'];
  for (const [id, item] of Object.entries(catalog)) {
    if (item.id !== id || required.some((field) => item[field] == null)) {
      const error = new Error('RESPONSE_STRATEGY_INVALID');
      error.code = 'RESPONSE_STRATEGY_INVALID';
      error.strategy_id = id;
      throw error;
    }
  }
  return catalog;
}

module.exports = {
  STRATEGIES,
  SUBINTENT_STRATEGY,
  selectStrategyId,
  strategyFor,
  validateStrategyCatalog
};

