'use strict';

const { SeededRandom } = require('./prng');

const CATEGORIES = Object.freeze(['sushi', 'sashimi', 'temaki', 'hot_roll', 'combinado', 'entrada', 'sobremesa', 'drink']);
const PERSONAS = Object.freeze(['direto', 'curioso', 'apressado', 'cético']);
const MOODS = Object.freeze(['calm', 'impatient', 'skeptical']);
const A = (type, expect = {}) => Object.freeze({ type, expect: Object.freeze({ ...expect }) });

function scenario(id, family, actions, mutated) {
  return Object.freeze({ scenario_id: id, family, mutated, actions: Object.freeze(actions) });
}

function buildTransitionScenarios(random, count) {
  const blueprints = [
    [A('open_dining'), A('category_sushi', { category: 'sushi' }), A('channel_ifood', { channel: 'ifood' }), A('user_repair', { category: 'sushi' }), A('reservation_switch')],
    [A('category_sushi', { category: 'sushi' }), A('channel_ifood', { channel: 'ifood' }), A('negative_feedback'), A('reservation_switch')],
    [A('open_dining'), A('user_repair'), A('category_sushi', { category: 'sushi' }), A('channel_salon', { channel: 'dining_room' }), A('journey_abandonment')],
    [A('category_temaki', { category: 'temaki' }), A('channel_salon', { channel: 'dining_room' }), A('user_repair', { category: 'temaki' }), A('reservation_switch')]
  ];
  return Array.from({ length: count }, (_, index) => scenario(
    `SEM-TRANS-${String(index + 1).padStart(3, '0')}`,
    'semantic_transition',
    blueprints[index % blueprints.length].map((item) => Object.freeze({ ...item, expect: Object.freeze({ ...item.expect }) })),
    random.chance(0.75)
  ));
}

function buildCategoryScenarios(random, count) {
  return Array.from({ length: count }, (_, index) => {
    const category = CATEGORIES[index % CATEGORIES.length];
    const channel = index % 3 === 0 ? 'dining_room' : 'ifood';
    return scenario(
      `SEM-CATEGORY-${String(index + 1).padStart(3, '0')}`,
      'category_semantics',
      [
        A(`category_${category}`, { category }),
        A(channel === 'dining_room' ? 'channel_salon' : 'channel_ifood', { channel, category }),
        A('user_repair', { category })
      ],
      random.chance(0.8)
    );
  });
}

function buildAdversarialScenarios(random, count) {
  const blueprints = [
    [A('open_dining'), A('user_repair'), A('category_sushi', { category: 'sushi' }), A('channel_ifood', { channel: 'ifood', category: 'sushi' }), A('negative_feedback'), A('reservation_switch')],
    [A('category_sashimi', { category: 'sashimi' }), A('channel_salon', { channel: 'dining_room', category: 'sashimi' }), A('user_repair', { category: 'sashimi' }), A('journey_abandonment')],
    [A('category_hot_roll', { category: 'hot_roll' }), A('channel_ifood', { channel: 'ifood', category: 'hot_roll' }), A('negative_feedback'), A('user_repair', { category: 'hot_roll' }), A('reservation_switch')],
    [A('open_dining'), A('negative_feedback'), A('category_combinado', { category: 'combinado' }), A('channel_salon', { channel: 'dining_room', category: 'combinado' }), A('journey_abandonment')]
  ];
  return Array.from({ length: count }, (_, index) => scenario(
    `SEM-ADVERSARIAL-${String(index + 1).padStart(3, '0')}`,
    'adversarial_multiturn',
    blueprints[index % blueprints.length].map((item) => Object.freeze({ ...item, expect: Object.freeze({ ...item.expect }) })),
    random.chance(0.9)
  ));
}

function buildFreeScenarios(random, count) {
  return Array.from({ length: count }, (_, index) => {
    const goal = index % 4 === 0 ? 'dine_out' : CATEGORIES[index % CATEGORIES.length];
    return Object.freeze({
      scenario_id: `SEM-FREE-${String(index + 1).padStart(3, '0')}`,
      family: 'free_conversation',
      mutated: false,
      free_customer: Object.freeze({
        persona: PERSONAS[index % PERSONAS.length],
        goal,
        mood: MOODS[index % MOODS.length],
        constraints: Object.freeze({ channel: random.chance(0.5) ? 'ifood' : 'dining_room', no_personal_data: true }),
        maximum_turns: 5
      })
    });
  });
}

function buildSemanticTransitionCatalog(options = {}) {
  const seed = String(options.seed || 'TATA-SEMANTIC-TRANSITION-V1');
  const count = Number(options.countPerGroup || 100);
  const freeCount = Number(options.freeCount || 100);
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('SEMANTIC_TRANSITION_COUNT_INVALID');
  if (!Number.isInteger(freeCount) || freeCount < 1 || freeCount > 100) throw new Error('SEMANTIC_FREE_COUNT_INVALID');
  const random = new SeededRandom(`${seed}:semantic-transition`);
  const transitions = buildTransitionScenarios(random, count);
  const categories = buildCategoryScenarios(random, count);
  const adversarial = buildAdversarialScenarios(random, count);
  const free = buildFreeScenarios(random, freeCount);
  return Object.freeze({
    schema_version: 'deliveryos-semantic-transition-catalog-v1',
    seed,
    transitions: Object.freeze(transitions),
    categories: Object.freeze(categories),
    adversarial: Object.freeze(adversarial),
    free: Object.freeze(free),
    all: Object.freeze([...transitions, ...categories, ...adversarial, ...free])
  });
}

module.exports = { CATEGORIES, PERSONAS, MOODS, buildSemanticTransitionCatalog };
