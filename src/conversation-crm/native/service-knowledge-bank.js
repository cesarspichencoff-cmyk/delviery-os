'use strict';

const publicInfo = require('./catalogs/TATA_OPERATIONAL_PUBLIC_INFO_V1.json');
const { deepFreeze } = require('./catalogs/operational');
const { coverageForIntent } = require('./knowledge-coverage-catalog');
const { actionPlaybookFor } = require('./action-playbook-catalog');

const KNOWLEDGE_BANK_VERSION = 'deliveryos-service-knowledge-v1';
const ALL_ORDER_PROBLEMS = [
  'occurrence.missing_item', 'occurrence.wrong_item',
  'occurrence.wrong_quantity', 'occurrence.personalization_ignored',
  'occurrence.leak', 'occurrence.packaging_damage',
  'occurrence.order_disrupted', 'occurrence.temperature',
  'occurrence.preparation_delay', 'occurrence.collection_delay',
  'occurrence.route_delay', 'occurrence.driver', 'occurrence.charge',
  'occurrence.refund_request', 'occurrence.coupon', 'occurrence.address',
  'occurrence.quality', 'occurrence.appearance', 'occurrence.taste',
  'occurrence.freshness', 'occurrence.allergen',
  'occurrence.foreign_body', 'occurrence.health_symptom'
];

function entry(id, playbook, customerMessage, options = {}) {
  return {
    id,
    version: '1.0.0',
    playbook,
    customer_message: customerMessage,
    intents: options.intents || [],
    triggers: options.triggers || [],
    sources: options.sources || [],
    source_classification: options.classification || 'CONFIRMADO',
    purpose: options.purpose || 'direct_answer',
    priority: options.priority || 50,
    requires_ifood: options.requiresIfood === true,
    severe_only: options.severeOnly === true,
    claims_prohibited: options.prohibited || []
  };
}

const SERVICE_KNOWLEDGE = deepFreeze([
  entry('restaurant.children', 'restaurant_information',
    'Sim, crianças podem acompanhar a família no restaurante.',
    {
      triggers: [/\bcrian[cç]a|beb[eê]|filh[oa]\b/iu],
      sources: ['CESAR_HUMAN_FEEDBACK_2026-07-28'],
      priority: 100
    }),
  entry('restaurant.dietary_menu', 'experiences',
    `Para consultar opções que se encaixem na sua alimentação, este é o cardápio presencial completo: ${publicInfo.menus.dining_room_complete} Se houver alergia ou risco de contaminação cruzada, confirme a composição do item com a equipe antes de pedir.`,
    {
      intents: ['information.allergen'],
      triggers: [/\bvegetarian|vegan|sem gl[uú]ten|restri[cç][aã]o|alerg/iu],
      sources: ['TATA_OPERATIONAL_PUBLIC_INFO_V1', 'anvisa:alergenicos:consultado-2026-07-28'],
      priority: 95,
      prohibited: ['garantir_ausencia_de_alergeno']
    }),
  entry('restaurant.experiences', 'experiences',
    `O TATÁ trabalha à la carte. Também há o Almoço Executivo nos almoços de dias úteis e a Sugestão Tatá no jantar, fins de semana e feriados. Você pode ver os pratos e preços em ${publicInfo.menus.institutional_with_prices}`,
    {
      intents: ['information.menu'],
      triggers: [/\brod[ií]zio|experi[eê]ncia do chef|menu degusta|almoco executivo|sugest[aã]o tat[aá]/iu],
      sources: ['TATA_OPERATIONAL_PUBLIC_INFO_V1'],
      priority: 90
    }),
  entry('payment.meal_voucher', 'restaurant_information',
    'Aceitamos Ticket Restaurante, Alelo e Pluxee, além dos cartões confirmados no restaurante.',
    {
      intents: ['information.payment'],
      triggers: [/\bvale[- ]?refei[cç][aã]o|alelo|pluxee|sodexo|ticket/iu],
      sources: ['TATA_OPERATIONAL_PUBLIC_INFO_V1'],
      priority: 100,
      prohibited: ['confirmar_bandeira_nao_catalogada']
    }),
  entry('payment.split_bill', 'restaurant_information',
    'Sim. Cada pessoa pode pagar a própria parte da conta com uma forma de pagamento aceita.',
    {
      triggers: [/\bdividir a conta|conta separada|cada um paga/iu],
      sources: ['CESAR_HUMAN_FEEDBACK_2026-07-28'],
      priority: 100
    }),
  entry('delivery.options', 'own_delivery',
    `Você pode pedir pelo delivery próprio em ${publicInfo.delivery.own_delivery_url} ou procurar por TATÁ Sushi no aplicativo do iFood.`,
    {
      intents: ['information.menu'],
      triggers: [/\bdelivery pr[oó]prio|onde.*ifood|encontro.*ifood|pedir.*ifood/iu],
      sources: ['TATA_OPERATIONAL_PUBLIC_INFO_V1', 'CESAR_HUMAN_FEEDBACK_2026-07-28'],
      priority: 95
    }),
  entry('delivery.fee', 'own_delivery',
    'A taxa de entrega depende do endereço e é calculada no canal no momento do pedido.',
    {
      triggers: [/\btaxa de entrega|valor da entrega|frete/iu],
      sources: ['CESAR_HUMAN_FEEDBACK_2026-07-28'],
      priority: 100,
      prohibited: ['inventar_taxa']
    }),
  entry('delivery.pickup', 'own_delivery',
    'Para retirada, preciso do nome e do que você deseja pedir. O lançamento e a previsão dependem da confirmação da equipe.',
    {
      triggers: [/\bretirar|retirada|buscar no restaurante/iu],
      sources: ['CESAR_HUMAN_FEEDBACK_2026-07-28', 'CONVERSATION_POLICY_V1'],
      priority: 95,
      prohibited: ['confirmar_pedido_sem_resultado', 'inventar_previsao']
    }),
  entry('ifood.problem_path', 'ifood',
    'No iFood, abra o pedido em Pedidos, toque em Ajuda e escolha “Tenho um problema com meu pedido”. Selecione o item afetado, descreva o que aconteceu e envie as evidências solicitadas no aplicativo.',
    {
      intents: ALL_ORDER_PROBLEMS,
      sources: ['ifood:problemas-com-o-pedido:2026-04-06', 'ifood:suporte:2026-04-01'],
      priority: 85,
      requiresIfood: true,
      prohibited: ['culpar_ifood', 'prometer_resultado']
    }),
  entry('ifood.visual_evidence', 'ifood',
    'Para problema visual no iFood, as evidências podem incluir fotos do item, da embalagem e da nota fiscal, conforme solicitado no aplicativo.',
    {
      intents: ['occurrence.wrong_item', 'occurrence.wrong_quantity', 'occurrence.personalization_ignored', 'occurrence.leak', 'occurrence.packaging_damage', 'occurrence.order_disrupted', 'occurrence.appearance', 'occurrence.foreign_body'],
      sources: ['ifood:problemas-com-o-pedido:2026-04-06'],
      purpose: 'explanation',
      priority: 75,
      requiresIfood: true
    }),
  entry('ifood.refund_analysis', 'ifood',
    'Cancelamento ou reembolso passa por análise no aplicativo; quando houver aprovação, o andamento pode ser acompanhado em Pedidos, no pedido, em Ajuda.',
    {
      intents: ['order.cancel', 'occurrence.refund_request'],
      sources: ['ifood:reembolso:2026-04-01'],
      priority: 90,
      requiresIfood: true,
      prohibited: ['prometer_reembolso']
    }),
  entry('ifood.not_delivered', 'delay_and_delivery',
    'Se o pedido aparece como entregue no iFood, mas não chegou, abra o pedido, toque em Ajuda e escolha “Reportar pedido não entregue”. Não compartilhe o código de entrega antes de estar com o pedido em mãos.',
    {
      intents: ['order.status', 'occurrence.route_delay', 'occurrence.driver'],
      triggers: [/\bmarcad[oa].*entreg|consta.*entreg|n[aã]o recebi|n[aã]o chegou/iu],
      sources: ['ifood:problemas-com-o-pedido:2026-04-06'],
      priority: 100,
      requiresIfood: true
    }),
  entry('delay.observable_state', 'delay_and_delivery',
    'Para orientar sem inventar previsão, preciso do canal e do número do pedido. Com isso, o próximo passo é consultar o estado mostrado nesse canal.',
    {
      intents: ['order.status', 'occurrence.preparation_delay', 'occurrence.collection_delay', 'occurrence.route_delay'],
      triggers: [/\batras|demor|andamento|status|onde est[aá]/iu],
      sources: ['CONVERSATION_POLICY_V1'],
      priority: 80,
      prohibited: ['inventar_previsao']
    }),
  entry('occurrence.specific_direction', 'missing_item',
    'Vou conduzir o relato pelo canal do pedido e preservar o item afetado para a análise correta.',
    {
      intents: ['occurrence.missing_item'],
      sources: ['CONVERSATION_POLICY_V1'],
      purpose: 'direction',
      priority: 70,
      prohibited: ['expor_regra_interna_de_compensacao']
    }),
  entry('quality.analysis', 'quality',
    'Vou preservar o item e o sinal relatado para análise, sem antecipar a causa.',
    {
      intents: ['occurrence.leak', 'occurrence.packaging_damage', 'occurrence.temperature', 'occurrence.quality', 'occurrence.appearance', 'occurrence.taste', 'occurrence.dining_room', 'occurrence.valet'],
      sources: ['CONVERSATION_POLICY_V1'],
      purpose: 'direction',
      priority: 70
    }),
  entry('food_safety.health_service', 'food_safety',
    'Por segurança, procure um serviço de saúde o mais rápido possível. A equipe também precisa acompanhar o relato, sem afirmar diagnóstico ou causa.',
    {
      intents: ['occurrence.freshness', 'occurrence.allergen', 'occurrence.health_symptom'],
      sources: ['anvisa:nutrivigilancia:consultado-2026-07-28', 'ministerio-saude:dtha:consultado-2026-07-28'],
      priority: 95,
      prohibited: ['diagnosticar', 'atribuir_causalidade']
    }),
  entry('food_safety.emergency', 'food_safety',
    'Se há dificuldade para respirar, desmaio ou outro sinal de urgência, procure atendimento imediato ou acione o SAMU 192.',
    {
      intents: ['occurrence.allergen', 'occurrence.health_symptom'],
      triggers: [/\bdificuldade para respirar|falta de ar|desmai|urg[eê]ncia|socorro/iu],
      sources: ['ministerio-saude:samu-192:consultado-2026-07-28'],
      priority: 110,
      severeOnly: true,
      prohibited: ['diagnosticar', 'indicar_medicamento']
    }),
  entry('food_safety.multiple_people', 'food_safety',
    'Como mais de uma pessoa foi afetada, o relato exige acompanhamento imediato e deve preservar sintomas, momento de início, item e referência do pedido.',
    {
      intents: ['occurrence.health_symptom'],
      triggers: [/\bduas pessoas|dois afetad|mais de uma pessoa|v[aá]rias pessoas/iu],
      sources: ['ministerio-saude:dtha:consultado-2026-07-28'],
      priority: 100,
      prohibited: ['afirmar_surto', 'atribuir_causalidade']
    }),
  entry('events.general', 'events_oke',
    'Para um evento ou grupo, a equipe precisa avaliar quantidade de pessoas, data, horário e o formato desejado antes de confirmar disponibilidade.',
    {
      triggers: [/\bevento|confraterniza|grupo/iu],
      sources: ['CESAR_HUMAN_FEEDBACK_2026-07-28', 'CONVERSATION_POLICY_V1'],
      priority: 80,
      prohibited: ['prometer_disponibilidade']
    }),
  entry('events.oke', 'events_oke',
    'O Oke é preparado para retirada na loja. A quantidade e as opções dependem do grupo e da confirmação da equipe; o retorno é dado até o dia seguinte e as tábuas devem ser devolvidas em até dois dias.',
    {
      intents: ['event.oke_pickup'],
      triggers: [/\boke|t[aá]bua de sushi/iu],
      sources: ['TATA_OPERATIONAL_PUBLIC_INFO_V1'],
      priority: 100
    }),
  entry('feedback.praise', 'praise_and_suggestion',
    'Que bom saber disso. Obrigado por contar o que tornou sua experiência especial — vou preservar esse reconhecimento para a equipe.',
    {
      intents: ['feedback.praise'],
      triggers: [/\bgostei|adorei|amei|elogio|parab[eé]ns/iu],
      sources: ['CONVERSATION_POLICY_V1'],
      priority: 90
    }),
  entry('privacy.minimum', 'privacy_and_handoff',
    'Você pode tirar dúvidas sem informar dados pessoais. Quando um pedido precisa ser localizado, pedimos somente os dados necessários para acompanhar aquele caso.',
    {
      intents: ['privacy.opt_out', 'privacy.access_request', 'privacy.correction_request'],
      triggers: [/\bprivacidade|dados pessoais|armazenad|n[aã]o quero informar/iu],
      sources: ['CONVERSATION_POLICY_V1'],
      priority: 90,
      prohibited: ['inventar_prazo_de_retencao']
    })
]);

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function contextIsIfood(classification = {}, conversation = {}) {
  const channel = classification.entities?.order_channel?.value
    || conversation.context?.order_channel
    || conversation.context?.origin
    || classification.origin;
  return normalize(channel).includes('ifood') || /\bifood\b/iu.test(String(conversation.source_text || ''));
}

function matches(entryValue, classification, conversation) {
  const text = String(conversation.source_text || '');
  const exactIntent = entryValue.intents.includes(classification.intent);
  const trigger = entryValue.triggers.some((pattern) => pattern.test(text));
  if (!exactIntent && !trigger) return false;
  if (entryValue.requires_ifood && !contextIsIfood(classification, conversation)) return false;
  if (entryValue.severe_only && !trigger) return false;
  return true;
}

function candidateFromEntry(item, selected, reason) {
  return {
    knowledge_id: item.id,
    playbook: item.playbook,
    customer_message: item.customer_message,
    sources: [...item.sources],
    purpose: item.purpose,
    priority: item.priority,
    selected,
    rejection_reason: selected ? null : reason
  };
}

function searchServiceKnowledge(input = {}) {
  const classification = input.classification || {};
  const conversation = input.conversation || {};
  const coverage = coverageForIntent(classification.intent) || coverageForIntent('conversation.ambiguous');
  const basePlaybook = actionPlaybookFor(coverage.action_playbook);
  const matched = SERVICE_KNOWLEDGE.filter((item) => matches(item, classification, conversation))
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
  const authorized = String(input.authorized_text || '').trim();
  const authorizedUseful = Boolean(authorized)
    && (classification.information_source || !/^(?:Vou registrar somente|Quero entender bem|Ainda não tenho)/u.test(authorized));
  const candidates = [];
  if (authorized) {
    candidates.push({
      knowledge_id: 'engine.authorized_surface',
      playbook: coverage.action_playbook,
      customer_message: authorized,
      sources: classification.information_source
        ? [`${classification.information_source.catalog_version || 'internal'}:${classification.information_source.classification || 'confirmed'}`]
        : ['CONVERSATION_ENGINE_V1'],
      purpose: 'direct_answer',
      priority: 120,
      selected: authorizedUseful,
      rejection_reason: authorizedUseful ? null : 'generic_or_unconfirmed_surface'
    });
  }
  for (const item of matched) candidates.push(candidateFromEntry(item, true, null));
  if (!matched.length && !authorizedUseful) {
    candidates.push({
      knowledge_id: `coverage.${coverage.intent_id}`,
      playbook: coverage.action_playbook,
      customer_message: null,
      sources: [...coverage.internal_sources, ...coverage.external_sources],
      purpose: 'limit',
      priority: 1,
      selected: false,
      rejection_reason: coverage.legitimate_fallback ? 'legitimate_fallback' : 'no_confirmed_customer_fact'
    });
  }
  const selected = candidates.filter((item) => item.selected);
  const selectedPlaybook = selected.find((item) => item.playbook)?.playbook || coverage.action_playbook;
  const playbook = actionPlaybookFor(selectedPlaybook) || basePlaybook;
  return deepFreeze({
    schema_version: KNOWLEDGE_BANK_VERSION,
    customer_need: coverage.probable_need,
    coverage,
    playbook,
    candidates,
    selected,
    rejected: candidates.filter((item) => !item.selected),
    knowledge_sources_used: [...new Set(selected.flatMap((item) => item.sources))],
    direct_answer: selected.filter((item) => item.purpose === 'direct_answer').map((item) => item.customer_message),
    explanations: selected.filter((item) => item.purpose === 'explanation').map((item) => item.customer_message),
    directions: selected.filter((item) => item.purpose === 'direction').map((item) => item.customer_message)
  });
}

function validateServiceKnowledge(bank = SERVICE_KNOWLEDGE) {
  const ids = new Set();
  for (const item of bank) {
    if (ids.has(item.id) || !actionPlaybookFor(item.playbook) || !item.sources.length || !item.customer_message) {
      throw Object.assign(new Error('SERVICE_KNOWLEDGE_INVALID'), { code: 'SERVICE_KNOWLEDGE_INVALID', knowledge_id: item.id });
    }
    ids.add(item.id);
  }
  return bank;
}

module.exports = {
  KNOWLEDGE_BANK_VERSION,
  SERVICE_KNOWLEDGE,
  contextIsIfood,
  searchServiceKnowledge,
  validateServiceKnowledge
};
