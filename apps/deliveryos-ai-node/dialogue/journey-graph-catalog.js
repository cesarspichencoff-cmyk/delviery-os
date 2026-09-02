'use strict';

const JOURNEY_DEFINITIONS = Object.freeze({
  reservation: { playbook: 'reservation', required: ['party_size', 'date', 'time'], actions: ['reservation.read', 'reservation.create', 'reservation.update'] },
  waitlist: { playbook: 'waitlist', required: ['party_size', 'arrival_estimate'], actions: ['waitlist.read', 'waitlist.create'] },
  large_group: { playbook: 'large_group', required: ['party_size', 'arrival_estimate'], actions: ['human.queue.create'] },
  restaurant_information: { playbook: 'restaurant_information', required: [], actions: ['information.unit.read', 'menu.read'] },
  own_delivery: { playbook: 'own_delivery', required: [], actions: ['menu.read', 'order.read', 'human.queue.create'] },
  ifood_problem: { playbook: 'ifood', required: ['order_reference', 'item_name'], actions: ['occurrence.create', 'human.queue.create'] },
  missing_item: { playbook: 'missing_item', required: ['order_channel', 'order_reference'], actions: ['occurrence.create', 'human.queue.create'] },
  wrong_item: { playbook: 'wrong_item', required: ['order_channel', 'order_reference', 'item_name'], actions: ['occurrence.create', 'human.queue.create'] },
  wrong_quantity: { playbook: 'quantity_personalization', required: ['order_channel', 'order_reference', 'expected_quantity', 'received_quantity'], actions: ['occurrence.create', 'human.queue.create'] },
  personalization: { playbook: 'quantity_personalization', required: ['order_channel', 'order_reference', 'personalization'], actions: ['occurrence.create', 'human.queue.create'] },
  delay: { playbook: 'delay_and_delivery', required: ['order_channel', 'order_reference'], actions: ['order.read', 'occurrence.create'] },
  quality: { playbook: 'quality', required: ['order_reference', 'item_name', 'evidence_available'], actions: ['occurrence.create', 'human.queue.create'] },
  food_safety: { playbook: 'food_safety', required: ['symptoms', 'onset', 'people_affected', 'item_name', 'order_reference'], actions: ['occurrence.create', 'human.queue.create'] },
  oke_event: { playbook: 'events_oke', required: ['party_size', 'pickup_time', 'requested_items'], actions: ['human.queue.create'] },
  praise: { playbook: 'praise_and_suggestion', required: [], actions: ['feedback.create'] },
  handoff: { playbook: 'privacy_and_handoff', required: ['request_scope'], actions: ['privacy.request', 'human.queue.create'] }
});

const INTENT_JOURNEY_RULES = Object.freeze([
  [/^reservation\./u, 'reservation'],
  [/^waitlist\./u, 'waitlist'],
  [/^(?:group\.|large_group)/u, 'large_group'],
  [/^information\./u, 'restaurant_information'],
  [/^(?:delivery\.own|order\.create|pickup\.)/u, 'own_delivery'],
  [/^(?:ifood\.|occurrence\.ifood)/u, 'ifood_problem'],
  [/^occurrence\.missing_item$/u, 'missing_item'],
  [/^occurrence\.wrong_item$/u, 'wrong_item'],
  [/^occurrence\.wrong_quantity$/u, 'wrong_quantity'],
  [/^occurrence\.personalization_ignored$/u, 'personalization'],
  [/^(?:occurrence\.delay|order\.status)/u, 'delay'],
  [/^(?:occurrence\.quality|occurrence\.foreign_body)/u, 'quality'],
  [/^(?:occurrence\.allergen|occurrence\.health_symptom|food_safety)/u, 'food_safety'],
  [/^(?:oke\.|event\.)/u, 'oke_event'],
  [/^(?:feedback\.praise|praise\.|suggestion\.)/u, 'praise'],
  [/^(?:handoff\.|privacy\.|abuse\.)/u, 'handoff']
]);

const SIDE_QUESTIONS = Object.freeze(['valet_information', 'hours_information', 'payment_information', 'pickup_information', 'address_information']);
const MAX_JOURNEY_STACK_DEPTH = 3;

function graphFor(journeyId, definition) {
  const collectionNodes = definition.required.map((field, index) => Object.freeze({
    node_id: `collect_${field}`,
    objective: `collect_required_fact:${field}`,
    required_facts: Object.freeze([field]),
    question_key: field,
    actions: Object.freeze([]),
    transitions: Object.freeze([definition.required[index + 1] ? `collect_${definition.required[index + 1]}` : 'prepare_action']),
    playbook: definition.playbook,
    limits: Object.freeze(['no_unverified_confirmation', 'minimum_missing_information_only']),
    terminal: false
  }));
  const actionNode = Object.freeze({
    node_id: 'prepare_action',
    objective: 'prepare_authorized_action_or_orientation',
    required_facts: Object.freeze([]),
    question_key: null,
    actions: Object.freeze([...definition.actions]),
    transitions: Object.freeze(['complete']),
    playbook: definition.playbook,
    limits: Object.freeze(['action_requires_observable_result']),
    terminal: false
  });
  const completeNode = Object.freeze({
    node_id: 'complete',
    objective: 'journey_complete',
    required_facts: Object.freeze([]),
    question_key: null,
    actions: Object.freeze([]),
    transitions: Object.freeze([]),
    playbook: definition.playbook,
    limits: Object.freeze([]),
    terminal: true
  });
  const nodes = Object.freeze([...collectionNodes, actionNode, completeNode]);
  return Object.freeze({
    journey_id: journeyId,
    version: '1.0.0',
    entry_conditions: Object.freeze([`candidate_journey:${journeyId}`]),
    nodes,
    edges: Object.freeze(nodes.flatMap((node) => node.transitions.map((target) => Object.freeze({ from: node.node_id, to: target })))),
    required_facts: Object.freeze([...definition.required]),
    completion_conditions: Object.freeze([`all_required_facts:${definition.required.join(',') || 'none'}`, 'authorized_action_or_orientation_prepared']),
    cancellation_conditions: Object.freeze(['explicit_customer_cancel', 'safety_override']),
    allowed_side_questions: SIDE_QUESTIONS,
    backtrack_rules: Object.freeze(['corrected_fact_reopens_first_dependent_node', 'never_repeat_completed_node_without_correction']),
    playbook: definition.playbook
  });
}

const JOURNEY_GRAPHS = Object.freeze(Object.fromEntries(Object.entries(JOURNEY_DEFINITIONS).map(([id, definition]) => [id, graphFor(id, definition)])));

function journeyForIntent(intent) {
  return INTENT_JOURNEY_RULES.find(([pattern]) => pattern.test(String(intent || '')))?.[1] || null;
}

function journeyGraph(journeyId) {
  return JOURNEY_GRAPHS[journeyId] || null;
}

function factsPresent(facts, field) {
  return Object.hasOwn(facts || {}, field) && facts[field] !== null && facts[field] !== '';
}

function nextJourneyStep(journeyId, facts = {}) {
  const graph = journeyGraph(journeyId);
  if (!graph) return null;
  const missing = graph.required_facts.find((field) => !factsPresent(facts, field));
  return missing ? `collect_${missing}` : 'prepare_action';
}

function validateJourneyGraphs(graphs = JOURNEY_GRAPHS, playbooks = null) {
  const findings = [];
  if (Object.keys(graphs).length !== 16) findings.push('JOURNEY_GRAPH_COUNT_INVALID');
  for (const [id, graph] of Object.entries(graphs)) {
    if (graph.journey_id !== id || graph.version !== '1.0.0') findings.push(`JOURNEY_GRAPH_ID_INVALID:${id}`);
    if (!Array.isArray(graph.nodes) || !graph.nodes.length || !Array.isArray(graph.edges)) findings.push(`JOURNEY_GRAPH_SHAPE_INVALID:${id}`);
    if (playbooks && !playbooks[graph.playbook]) findings.push(`JOURNEY_GRAPH_PLAYBOOK_MISSING:${id}`);
    const nodeIds = new Set(graph.nodes.map((node) => node.node_id));
    if (nodeIds.size !== graph.nodes.length || !nodeIds.has('complete')) findings.push(`JOURNEY_GRAPH_NODE_INVALID:${id}`);
    if (graph.edges.some((edge) => !nodeIds.has(edge.from) || !nodeIds.has(edge.to))) findings.push(`JOURNEY_GRAPH_EDGE_INVALID:${id}`);
    if (graph.nodes.some((node) => Object.hasOwn(node, 'text') || Object.hasOwn(node, 'response'))) findings.push(`JOURNEY_GRAPH_FINAL_LANGUAGE_FORBIDDEN:${id}`);
  }
  return Object.freeze({ passed: findings.length === 0, findings: Object.freeze(findings), total: Object.keys(graphs).length });
}

module.exports = {
  JOURNEY_DEFINITIONS,
  INTENT_JOURNEY_RULES,
  SIDE_QUESTIONS,
  MAX_JOURNEY_STACK_DEPTH,
  JOURNEY_GRAPHS,
  journeyForIntent,
  journeyGraph,
  nextJourneyStep,
  validateJourneyGraphs
};
