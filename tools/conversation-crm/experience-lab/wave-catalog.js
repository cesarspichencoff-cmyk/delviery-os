'use strict';

const { SeededRandom } = require('./prng');

const A = (type, expect = {}) => Object.freeze({ type, expect: Object.freeze({ ...expect }) });

const ARCHETYPES = Object.freeze([
  ['first_visit_ifood', [A('first_visit'), A('channel_ifood', { channel: 'ifood' }), A('recommend_salmon'), A('decision'), A('reference_second'), A('price')]],
  ['first_visit_salon', [A('nonexpert'), A('channel_salon', { channel: 'dining_room' }), A('cooked'), A('recommend_general'), A('decision_short'), A('valet'), A('resume')]],
  ['ifood_decision', [A('recommend_salmon'), A('channel_ifood', { channel: 'ifood' }), A('light'), A('decision_short'), A('reference_second'), A('price'), A('pairing')]],
  ['salon_decision', [A('recommend_tuna'), A('channel_salon', { channel: 'dining_room' }), A('traditional'), A('decision'), A('address'), A('resume'), A('price')]],
  ['switch_to_salon', [A('recommend_salmon'), A('channel_ifood', { channel: 'ifood' }), A('decision'), A('switch_salon', { channel: 'dining_room' }), A('light'), A('decision_short'), A('price')]],
  ['switch_to_ifood', [A('recommend_tuna'), A('channel_salon', { channel: 'dining_room' }), A('decision'), A('switch_ifood', { channel: 'ifood' }), A('not_fried'), A('decision'), A('pairing')]],
  ['quantity_growth', [A('recommend_salmon'), A('channel_ifood', { channel: 'ifood' }), A('party_two', { people: 2 }), A('decision'), A('party_five', { people: 5 }), A('decision_short'), A('price')]],
  ['quantity_correction', [A('recommend_tuna'), A('channel_salon', { channel: 'dining_room' }), A('party_one', { people: 1 }), A('decision'), A('party_three', { people: 3 }), A('share'), A('decision_short')]],
  ['preference_stack', [A('recommend_salmon'), A('channel_ifood', { channel: 'ifood' }), A('light'), A('no_cream'), A('not_fried'), A('torched'), A('decision_short'), A('price')]],
  ['raw_to_cooked', [A('recommend_tuna'), A('channel_salon', { channel: 'dining_room' }), A('raw'), A('decision'), A('cooked'), A('decision_short'), A('price')]],
  ['allergy_after_options', [A('recommend_salmon'), A('channel_ifood', { channel: 'ifood' }), A('torched'), A('decision'), A('allergy_interrupt', { allergy: 'crustacean' }), A('decision_short'), A('price')]],
  ['group_allergy', [A('multiple_info', { channel: 'dining_room', people: 5, ingredient: 'salmon' }), A('decision'), A('allergy', { allergy: 'crustacean' }), A('pairing'), A('decision_short')]],
  ['intolerance', [A('recommend_general'), A('channel_salon', { channel: 'dining_room' }), A('intolerance', { allergy_any: true }), A('decision_short'), A('price')]],
  ['incident', [A('greeting'), A('incident'), A('incident_detail'), A('human_request')]],
  ['urgency', [A('greeting'), A('incident'), A('urgency'), A('human_request')]],
  ['side_valet', [A('recommend_salmon'), A('channel_salon', { channel: 'dining_room' }), A('decision'), A('valet'), A('resume'), A('reference_second'), A('price')]],
  ['side_address', [A('recommend_tuna'), A('channel_salon', { channel: 'dining_room' }), A('decision'), A('address'), A('resume'), A('reference_second'), A('pairing')]],
  ['compound', [A('multiple_info', { channel: 'dining_room', people: 5, ingredient: 'salmon' }), A('decision_short'), A('multiple_questions'), A('pairing')]],
  ['false_reference', [A('reference_false'), A('recommend_salmon'), A('channel_ifood', { channel: 'ifood' }), A('decision')]],
  ['unknown_then_recover', [A('greeting'), A('unknown'), A('recommend_general'), A('channel_salon', { channel: 'dining_room' }), A('decision')]],
  ['reformulation', [A('recommend_salmon'), A('channel_ifood', { channel: 'ifood' }), A('repetition'), A('decision_short'), A('hesitation'), A('price')]],
  ['change_ingredient', [A('recommend_salmon'), A('channel_ifood', { channel: 'ifood' }), A('decision'), A('correction_tuna'), A('decision_short'), A('reference_first'), A('price')]],
  ['budget_to_premium', [A('recommend_general'), A('channel_salon', { channel: 'dining_room' }), A('budget_low'), A('decision'), A('premium'), A('decision_short')]],
  ['long_memory', [A('first_visit'), A('channel_salon', { channel: 'dining_room' }), A('recommend_salmon'), A('party_two', { people: 2 }), A('light'), A('decision'), A('valet'), A('resume'), A('reference_second'), A('switch_ifood', { channel: 'ifood' }), A('party_five', { people: 5 }), A('decision_short'), A('price')]],
  ['long_safety', [A('nonexpert'), A('channel_ifood', { channel: 'ifood' }), A('recommend_salmon'), A('no_cream'), A('torched'), A('decision'), A('allergy_interrupt', { allergy: 'crustacean' }), A('hesitation'), A('decision_short'), A('switch_salon_question', { channel: 'dining_room' }), A('decision_short'), A('address'), A('resume')]]
]);

function buildWaveCatalog({ count, seed, wave }) {
  if (!Number.isInteger(count) || count < 1 || count > 400) throw new Error('EXPERIENCE_LAB_WAVE_COUNT_INVALID');
  const random = new SeededRandom(`${seed}:wave:${wave}`);
  return Object.freeze(Array.from({ length: count }, (_, index) => {
    const archetypeIndex = (index + ((wave - 1) * 7)) % ARCHETYPES.length;
    const [family, baseActions] = ARCHETYPES[archetypeIndex];
    const actions = baseActions.map((item) => ({ ...item, expect: { ...item.expect } }));
    if (actions.length < 12 && random.chance(wave >= 3 ? 0.32 : 0.12)) {
      const insertAt = Math.max(2, actions.length - 1);
      actions.splice(insertAt, 0, A('hesitation'), A(random.pick(['valet', 'address'])), A('resume'));
    }
    return Object.freeze({
      scenario_id: `OVERNIGHT-W${wave}-${String(index + 1).padStart(4, '0')}`,
      family,
      variant: index + 1,
      mutated: random.chance(wave === 1 ? 0.55 : 0.8),
      actions: Object.freeze(actions.map((item) => Object.freeze(item)))
    });
  }));
}

function cloneActions(actions) {
  return actions.map((item) => Object.freeze({ ...item, expect: Object.freeze({ ...(item.expect || {}) }) }));
}

function buildDirectedCatalog({ seed, countPerGroup = 50 }) {
  if (!Number.isInteger(countPerGroup) || countPerGroup < 1 || countPerGroup > 100) throw new Error('EXPERIENCE_LAB_DIRECTED_COUNT_INVALID');
  const random = new SeededRandom(`${seed}:directed-blockers`);
  const groups = Object.freeze({
    safety: Object.freeze([
      [A('recommend_salmon'), A('channel_ifood', { channel: 'ifood' }), A('decision'), A('allergy_interrupt', { allergy: 'crustacean' }), A('decision_short')],
      [A('recommend_salmon'), A('channel_salon', { channel: 'dining_room' }), A('incident'), A('human_request')],
      [A('first_visit'), A('channel_salon', { channel: 'dining_room' }), A('urgency'), A('human_request')],
      [A('greeting'), A('incident'), A('urgency'), A('human_request')],
      [A('multiple_info', { channel: 'dining_room', people: 5, ingredient: 'salmon' }), A('decision'), A('urgency')],
      [A('nonexpert'), A('allergy', { allergy: 'crustacean' }), A('channel_ifood', { channel: 'ifood' }), A('decision_short')]
    ]),
    compound: Object.freeze([
      [A('multiple_info', { channel: 'dining_room', people: 5, ingredient: 'salmon' }), A('decision_short'), A('multiple_questions'), A('pairing')],
      [A('recommend_salmon'), A('channel_ifood', { channel: 'ifood' }), A('party_two', { people: 2 }), A('light'), A('no_cream'), A('decision'), A('price')],
      [A('multiple_info', { channel: 'dining_room', people: 5, ingredient: 'salmon' }), A('correction_tuna'), A('party_three', { people: 3 }), A('decision_short')],
      [A('first_visit'), A('channel_salon', { channel: 'dining_room' }), A('recommend_salmon'), A('party_two', { people: 2 }), A('light'), A('reference_second'), A('price')],
      [A('recommend_tuna'), A('channel_ifood', { channel: 'ifood' }), A('not_fried'), A('no_cream'), A('party_five', { people: 5 }), A('decision'), A('multiple_questions')]
    ]),
    mixed: Object.freeze(ARCHETYPES.map(([, actions]) => actions))
  });
  const scenarios = [];
  for (const group of ['safety', 'compound', 'mixed']) {
    const pool = groups[group];
    for (let index = 0; index < countPerGroup; index += 1) {
      const actions = cloneActions(pool[index % pool.length]);
      scenarios.push(Object.freeze({
        scenario_id: `DIRECTED-${group.toUpperCase()}-${String(index + 1).padStart(3, '0')}`,
        family: `directed_${group}`,
        variant: index + 1,
        mutated: random.chance(0.8),
        actions: Object.freeze(actions)
      }));
    }
  }
  return Object.freeze(scenarios);
}

function buildConfirmationCatalog({ seed }) {
  const source = buildDirectedCatalog({ seed: `${seed}:confirmation`, countPerGroup: 80 });
  const selected = [
    ...source.filter((item) => item.family === 'directed_safety').slice(0, 70),
    ...source.filter((item) => item.family === 'directed_compound').slice(0, 50),
    ...source.filter((item) => item.family === 'directed_mixed').slice(0, 80)
  ];
  return Object.freeze(selected.map((scenario, index) => Object.freeze({
    ...scenario,
    scenario_id: `CONFIRMATION-${String(index + 1).padStart(3, '0')}`,
    family: scenario.family.replace('directed_', 'confirmation_')
  })));
}

module.exports = { ARCHETYPES, buildWaveCatalog, buildDirectedCatalog, buildConfirmationCatalog };
