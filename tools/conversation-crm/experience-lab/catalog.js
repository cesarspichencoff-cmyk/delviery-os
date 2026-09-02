'use strict';

const BLUEPRINTS = Object.freeze([
  ['greeting', ['greeting', 'recommend_salmon', 'channel_ifood', 'decision']],
  ['recommendation_ifood', ['recommend_salmon', 'channel_ifood', 'decision', 'reference_second', 'price', 'pairing']],
  ['recommendation_salon', ['recommend_salmon', 'channel_salon', 'light', 'decision', 'price']],
  ['first_visit', ['first_visit', 'adaptive_channel', 'recommend_salmon', 'decision']],
  ['nonexpert', ['nonexpert', 'adaptive_channel', 'recommend_salmon', 'decision']],
  ['channel_switch', ['recommend_salmon', 'channel_ifood', 'decision', 'switch_salon', 'price']],
  ['channel_switch_reverse', ['recommend_salmon', 'channel_salon', 'decision', 'switch_ifood', 'price']],
  ['preference_deltas', ['recommend_salmon', 'channel_ifood', 'light', 'no_cream', 'torched', 'decision']],
  ['preparation_delta', ['recommend_salmon', 'channel_ifood', 'not_fried', 'decision']],
  ['quantity_deltas', ['recommend_salmon', 'channel_ifood', 'party_two', 'party_five', 'decision']],
  ['safety', ['recommend_salmon', 'channel_ifood', 'decision', 'allergy', 'decision']],
  ['incident', ['greeting', 'incident', 'incident_detail', 'human_request']],
  ['side_question', ['recommend_salmon', 'channel_salon', 'decision', 'valet', 'resume', 'reference_second']],
  ['side_question_address', ['recommend_salmon', 'channel_salon', 'decision', 'address', 'resume', 'reference_second']],
  ['correction', ['recommend_salmon', 'channel_ifood', 'decision', 'correction_tuna', 'decision', 'price']],
  ['compound_turns', ['multiple_info', 'decision', 'multiple_questions', 'pairing']],
  ['false_reference', ['reference_false', 'recommend_tuna', 'channel_ifood', 'decision']],
  ['unknown_information', ['greeting', 'unknown', 'recommend_salmon', 'channel_salon']],
  ['repetition_reformulation', ['recommend_salmon', 'channel_ifood', 'repetition', 'decision']],
  ['pairing_absent', ['recommend_tuna', 'channel_salon', 'decision', 'pairing']]
]);

function makeScenario(index, mutated) {
  const [family, actions] = BLUEPRINTS[index % BLUEPRINTS.length];
  const variant = Math.floor(index / BLUEPRINTS.length) + 1;
  return Object.freeze({
    scenario_id: `EXP-${mutated ? 'M' : 'S'}-${String(index + 1).padStart(3, '0')}`,
    family,
    variant,
    mutated,
    channel_action: ['first_visit', 'nonexpert'].includes(family) && variant % 2 === 0 ? 'channel_salon' : 'channel_ifood',
    actions: actions.map((type) => Object.freeze({ type }))
  });
}

function buildExperienceCatalog() {
  return Object.freeze({
    schema_version: 'deliveryos-experience-lab-catalog-v1',
    structured: Object.freeze(Array.from({ length: 40 }, (_, index) => makeScenario(index, false))),
    mutated: Object.freeze(Array.from({ length: 40 }, (_, index) => makeScenario(index, true)))
  });
}

module.exports = { BLUEPRINTS, buildExperienceCatalog };

