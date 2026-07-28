'use strict';

const intentCatalog = require('./catalogs/INTENT_ENTITY_CATALOG_V1.json');
const { deepFreeze } = require('./catalogs/operational');
const { ACTION_PLAYBOOKS, actionPlaybookFor } = require('./action-playbook-catalog');

const COVERAGE_VERSION = 'deliveryos-knowledge-coverage-v1';

const INTENT_PLAYBOOK = Object.freeze({
  'information.address': 'restaurant_information',
  'information.hours': 'restaurant_information',
  'information.menu': 'experiences',
  'information.payment': 'restaurant_information',
  'information.corkage': 'restaurant_information',
  'information.allergen': 'food_safety',
  'reservation.create': 'reservation',
  'reservation.update': 'reservation',
  'waitlist.create': 'waitlist',
  'waitlist.read': 'waitlist',
  'reservation.large_group': 'large_group',
  'order.status': 'delay_and_delivery',
  'order.modify': 'own_delivery',
  'order.cancel': 'own_delivery',
  'occurrence.missing_item': 'missing_item',
  'occurrence.wrong_item': 'wrong_item',
  'occurrence.wrong_quantity': 'quantity_personalization',
  'occurrence.personalization_ignored': 'quantity_personalization',
  'occurrence.leak': 'quality',
  'occurrence.packaging_damage': 'quality',
  'occurrence.order_disrupted': 'delay_and_delivery',
  'occurrence.temperature': 'quality',
  'occurrence.preparation_delay': 'delay_and_delivery',
  'occurrence.collection_delay': 'delay_and_delivery',
  'occurrence.route_delay': 'delay_and_delivery',
  'occurrence.driver': 'delay_and_delivery',
  'occurrence.charge': 'ifood',
  'occurrence.refund_request': 'ifood',
  'occurrence.coupon': 'ifood',
  'occurrence.address': 'delay_and_delivery',
  'occurrence.quality': 'quality',
  'occurrence.appearance': 'quality',
  'occurrence.taste': 'quality',
  'occurrence.freshness': 'food_safety',
  'occurrence.allergen': 'food_safety',
  'occurrence.foreign_body': 'food_safety',
  'occurrence.health_symptom': 'food_safety',
  'occurrence.dining_room': 'quality',
  'occurrence.valet': 'quality',
  'occurrence.prior_promise': 'privacy_and_handoff',
  'occurrence.alert_only': 'privacy_and_handoff',
  'feedback.praise': 'praise_and_suggestion',
  'feedback.suggestion': 'praise_and_suggestion',
  'privacy.opt_out': 'privacy_and_handoff',
  'privacy.access_request': 'privacy_and_handoff',
  'privacy.correction_request': 'privacy_and_handoff',
  'abuse.review': 'privacy_and_handoff',
  public_exposure: 'privacy_and_handoff',
  'conversation.multiple_intents': 'privacy_and_handoff',
  'conversation.ambiguous': 'privacy_and_handoff',
  'handoff.failure': 'privacy_and_handoff',
  'event.oke_pickup': 'events_oke'
});

const INTENT_NEEDS = Object.freeze({
  'information.address': 'localizar o restaurante',
  'information.hours': 'saber quando o restaurante funciona',
  'information.menu': 'conhecer cardápio ou experiências',
  'information.payment': 'confirmar forma de pagamento',
  'information.corkage': 'entender a taxa de rolha',
  'information.allergen': 'avaliar uma restrição ou risco de alergênico',
  'reservation.create': 'consultar ou iniciar uma reserva',
  'reservation.update': 'alterar ou confirmar dados de reserva',
  'waitlist.create': 'entrar na fila de espera',
  'waitlist.read': 'acompanhar a fila',
  'reservation.large_group': 'receber orientação para grupo acima de oito',
  'order.status': 'entender o andamento do pedido',
  'order.modify': 'pedir uma alteração ainda não confirmada',
  'order.cancel': 'solicitar análise de cancelamento',
  'occurrence.missing_item': 'resolver item que não chegou',
  'occurrence.wrong_item': 'resolver item diferente do pedido',
  'occurrence.wrong_quantity': 'resolver diferença de quantidade',
  'occurrence.personalization_ignored': 'resolver personalização não respeitada',
  'occurrence.leak': 'registrar vazamento',
  'occurrence.packaging_damage': 'registrar embalagem danificada',
  'occurrence.order_disrupted': 'resolver pedido revirado ou avariado',
  'occurrence.temperature': 'registrar temperatura fora do esperado',
  'occurrence.preparation_delay': 'entender atraso de preparação',
  'occurrence.collection_delay': 'entender atraso de coleta',
  'occurrence.route_delay': 'entender atraso em rota',
  'occurrence.driver': 'resolver problema com a entrega',
  'occurrence.charge': 'resolver cobrança',
  'occurrence.refund_request': 'solicitar ou acompanhar análise de reembolso',
  'occurrence.coupon': 'resolver cupom ou benefício de plataforma',
  'occurrence.address': 'resolver problema de endereço de entrega',
  'occurrence.quality': 'registrar qualidade fora do esperado',
  'occurrence.appearance': 'registrar aparência fora do esperado',
  'occurrence.taste': 'registrar sabor fora do esperado',
  'occurrence.freshness': 'registrar possível alimento impróprio',
  'occurrence.allergen': 'proteger diante de possível alergênico',
  'occurrence.foreign_body': 'registrar corpo estranho',
  'occurrence.health_symptom': 'proteger diante de sintomas após consumo',
  'occurrence.dining_room': 'registrar problema no salão',
  'occurrence.valet': 'registrar problema de valet',
  'occurrence.prior_promise': 'preservar promessa anterior para revisão humana',
  'occurrence.alert_only': 'registrar alerta sem inventar solução',
  'feedback.praise': 'agradecer elogio específico',
  'feedback.suggestion': 'preservar sugestão',
  'privacy.opt_out': 'registrar recusa de uso de dados',
  'privacy.access_request': 'orientar acesso a dados',
  'privacy.correction_request': 'orientar correção de dados',
  'abuse.review': 'revisar risco de abuso sem bloqueio automático',
  public_exposure: 'tratar exposição pública com cuidado',
  'conversation.multiple_intents': 'separar necessidades simultâneas',
  'conversation.ambiguous': 'esclarecer a necessidade principal',
  'handoff.failure': 'preservar continuidade quando o handoff falha',
  'event.oke_pickup': 'entender Oke para retirada'
});

const LEGITIMATE_FALLBACKS = Object.freeze({
  'information.hours': 'horário especial não configurado',
  'information.allergen': 'composição ou alergênico sem confirmação',
  'reservation.create': 'disponibilidade sem resultado do sistema',
  'reservation.update': 'reserva sem referência ou integração observável',
  'waitlist.create': 'entrada sem resultado do sistema',
  'waitlist.read': 'posição ou espera sem resultado do sistema',
  'reservation.large_group': 'disponibilidade sem avaliação humana',
  'order.status': 'pedido sem referência, canal ou estado observável',
  'order.modify': 'alteração sem capacidade confirmada',
  'order.cancel': 'cancelamento sem capacidade confirmada',
  'conversation.ambiguous': 'necessidade ainda ambígua após usar contexto',
  'handoff.failure': 'fila humana indisponível ou não confirmada',
  'event.oke_pickup': 'preço, quantidade ou disponibilidade sem avaliação'
});

function domainOf(intent) {
  if (intent.id === 'event.oke_pickup') return 'event';
  return intent.id.includes('.') ? intent.id.split('.')[0] : intent.id;
}

function buildCoverage(intent) {
  const playbookId = INTENT_PLAYBOOK[intent.id];
  const playbook = actionPlaybookFor(playbookId);
  if (!playbook) throw Object.assign(new Error('KNOWLEDGE_COVERAGE_PLAYBOOK_MISSING'), { code: 'KNOWLEDGE_COVERAGE_PLAYBOOK_MISSING', intent: intent.id });
  const required = intent.minimum_entities || [];
  return {
    intent_id: intent.id,
    domain: domainOf(intent),
    probable_need: INTENT_NEEDS[intent.id],
    available_facts: [...playbook.useful_information],
    related_facts: playbookId === 'experiences'
      ? ['restaurant_model', 'executive_lunch', 'tata_suggestion', 'menus']
      : [...playbook.channel_guidance],
    available_procedures: [...playbook.direct_answer],
    action_available: [...playbook.possible_actions],
    mandatory_question: required[0] || null,
    optional_question: required[1] || null,
    expected_direct_answer: playbook.direct_answer[0],
    possible_enrichment: playbook.useful_information[0] || null,
    limit: playbook.limit,
    legitimate_fallback: LEGITIMATE_FALLBACKS[intent.id] || null,
    prohibited_claims: [...playbook.prohibited_claims],
    internal_sources: playbook.sources.filter((source) => !source.includes(':2026-') && !source.includes(':consultado-')),
    external_sources: playbook.sources.filter((source) => source.includes(':2026-') || source.includes(':consultado-')),
    knowledge_status: playbook.useful_information.length ? 'available' : (playbook.possible_actions.length ? 'procedure_only' : 'strategy_only'),
    action_playbook: playbookId,
    reviewed_at: '2026-07-28'
  };
}

const KNOWLEDGE_COVERAGE = deepFreeze({
  schema_version: COVERAGE_VERSION,
  version: '1.0.0',
  reviewed_at: '2026-07-28',
  intent_count: intentCatalog.intents.length,
  entries: intentCatalog.intents.map(buildCoverage)
});

function coverageForIntent(intentId) {
  return KNOWLEDGE_COVERAGE.entries.find((entry) => entry.intent_id === intentId) || null;
}

function validateKnowledgeCoverage(catalog = KNOWLEDGE_COVERAGE) {
  const expected = new Set(intentCatalog.intents.map((intent) => intent.id));
  const found = new Set(catalog.entries.map((entry) => entry.intent_id));
  const required = [
    'intent_id', 'domain', 'probable_need', 'available_facts', 'related_facts',
    'available_procedures', 'action_available', 'mandatory_question',
    'optional_question', 'expected_direct_answer', 'possible_enrichment',
    'limit', 'legitimate_fallback', 'prohibited_claims', 'internal_sources',
    'external_sources', 'knowledge_status', 'action_playbook', 'reviewed_at'
  ];
  if (catalog.schema_version !== COVERAGE_VERSION || catalog.intent_count !== 52 || found.size !== 52) {
    throw Object.assign(new Error('KNOWLEDGE_COVERAGE_COUNT_INVALID'), { code: 'KNOWLEDGE_COVERAGE_COUNT_INVALID' });
  }
  for (const id of expected) if (!found.has(id)) throw Object.assign(new Error('KNOWLEDGE_COVERAGE_INTENT_MISSING'), { code: 'KNOWLEDGE_COVERAGE_INTENT_MISSING', intent: id });
  for (const entry of catalog.entries) {
    if (required.some((field) => !Object.hasOwn(entry, field))) {
      throw Object.assign(new Error('KNOWLEDGE_COVERAGE_ENTRY_INVALID'), { code: 'KNOWLEDGE_COVERAGE_ENTRY_INVALID', intent: entry.intent_id });
    }
    if (!ACTION_PLAYBOOKS[entry.action_playbook]) {
      throw Object.assign(new Error('KNOWLEDGE_COVERAGE_PLAYBOOK_MISSING'), { code: 'KNOWLEDGE_COVERAGE_PLAYBOOK_MISSING', intent: entry.intent_id });
    }
  }
  return catalog;
}

module.exports = {
  COVERAGE_VERSION,
  INTENT_PLAYBOOK,
  INTENT_NEEDS,
  KNOWLEDGE_COVERAGE,
  coverageForIntent,
  validateKnowledgeCoverage
};
