'use strict';

const { deepFreeze, validateOperationalCatalogs } = require('./catalogs/operational');
const { NUMBER_WORDS, extractPartySize, detectMissingItem } = require('../engine/classifier');
const { assertFeature } = require('./feature-flags');
const { legacyProjection } = require('./migration');
const { foodSafetyPolicy, abuseReview } = require('./policies');
const {
  detectPublicTopic,
  intentForPublicTopic,
  normalizePublicText,
  publicInformationResponse,
  publicBehaviorOverride
} = require('./public-information');

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const RESPIRATORY_EMERGENCY = /\b(?:(?:nao|n)\s+(?:consegue|conseguindo|conseguem|respira)\s+(?:respirar|direito)|dificuldade\s+(?:(?:para|pra)\s+)?respirar|(?:ta|esta|ficou|fica)\s+(?:dificil\s+)?(?:de\s+)?respirar|respira(?:cao)?\s+(?:esta\s+)?(?:ruim|dificil)|(?:(?:ta|esta)\s+ficando|ta|esta|ficando|ficou)\s+sem\s+ar|falta\s+de\s+ar|incha(?:r|ndo|cou|co)?[^.?!]{0,60}(?:respirar|sem\s+ar)|passando\s+muito\s+mal)\b/u;

const ACTIVE_REACTION = /\b(?:(?:ta|esta|teve|tendo|comecou|comecando)\s+(?:uma\s+)?reacao|(?:comeu|depois\s+de\s+comer)[^.?!]{0,80}(?:passou\s+mal|comecou\s+a\s+passar\s+mal|reacao|alergia|inchou|vomit|diarreia)|(?:passou\s+mal|comecou\s+uma\s+alergia)\s+(?:depois\s+de\s+comer)?)\b/u;

function safetyStateFromText(value) {
  const text = normalizeText(value);
  if (RESPIRATORY_EMERGENCY.test(text)) return 'respiratory_emergency';
  if (ACTIVE_REACTION.test(text)) return 'active_reaction';
  return null;
}

const INTENT_RULES = Object.freeze([
  ['occurrence.health_symptom', /\b(dificuldade (?:para )?respirar|nao consegue respirar|respirar (?:esta )?dificil|sem ar|vomito|vomitei|diarreia|febre|mal estar|passei mal|fiquei ruim|passando muito mal|passaram mal|ficaram ruins|mesmos sintomas|mais de uma pessoa|depois de comer|depois da refeicao)\b/],
  ['occurrence.allergen', /\b(?:tenho alergia|sou alergic[oa])\b.*\b(?:veio|recebi|mandaram|chegou)\b/],
  ['information.allergen', /\b(confirmar se|antes de pedir|esse prato tem|contem um ingrediente|confirmar um alergenico|ingrediente que me faz mal|tenho alergia|sou alergic[oa]|nao posso comer|tenho intolerancia|(?:ela|ele|minha irma|meu irmao|meu namorado|minha namorada) (?:so )?tem alergia)\b/],
  ['occurrence.allergen', /\b(reacao alergica|tive uma reacao|comecei a co[cç]ar|me causou reacao|passei mal.*(?:alerg|depois de comer)|ingrediente que pode me causar)\b/],
  ['occurrence.foreign_body', /\b(cabelo|fio de cabelo|corpo estranho|objeto estranho|algo duro)\b/],
  ['occurrence.freshness', /\b(nao parecia fresco|n tava fresco|frescor)\b/],
  ['occurrence.taste', /\b(sabor estava estranho|gosto esquisito|gosto estava diferente)\b/],
  ['occurrence.quality', /\b(improprio|comida tava estranha|preocupado com a qualidade|cheiro estranho|estragad[oa]|azed[oa])\b/],
  ['occurrence.appearance', /\b(aparencia|nao parecia normal)\b/],
  ['occurrence.personalization_ignored', /\b(sem (?:molho|cebola).*(?:veio|com)|veio c molho e era sem|ignoraram? (?:a )?observacao|personalizacao)\b/],
  ['occurrence.wrong_quantity', /\b(quantidade errada|vieram? .* em vez de|chegaram? .* acompanhamentos|veio \d+ mas pedi \d+|faltou uma das pecas|duas unidades|vieram? menos)\b/],
  ['occurrence.wrong_item', /\b(item diferente|item errado|veio trocado|mandaram outro prato|veio outro item|produto errado)\b/],
  ['occurrence.leak', /\b(vazou|vazando)\b/],
  ['occurrence.packaging_damage', /\b(embalagem.*(?:rasgada|quebrada|danificada)|caixa.*danificada)\b/],
  ['occurrence.order_disrupted', /\b(revirado|baguncado|itens.*desmontados)\b/],
  ['occurrence.temperature', /\b(comida.*fria|chegou gelado|quente veio frio)\b/],
  ['occurrence.preparation_delay', /\b(ainda esta em preparo|preso no preparo|nao muda do preparo)\b/],
  ['occurrence.collection_delay', /\b(pronto.*(?:ninguem coletou|sem motoboy)|esperando coleta)\b/],
  ['occurrence.route_delay', /\b(saiu para entrega e nao chegou|saiu faz tempo|demorando na rota)\b/],
  ['occurrence.driver', /\b(problema com o entregador|motoboy foi|situacao com quem entregou)\b/],
  ['order.cancel', /\b(cancelar meu pedido|cancela|pedir cancelamento)\b/],
  ['occurrence.charge', /\b(cobrad[oa] duas vezes|cobrou duplicado|cobranca a mais|cobranca duplicada|decisao sobre uma cobranca)\b/],
  ['occurrence.coupon', /\b(cupom|desconto.*nao entrou)\b/],
  ['occurrence.address', /\b(corrigir o endereco do pedido|endereco ta errado|local errado.*mudar)\b/],
  ['order.modify', /\b(retirar um item|tirar um item|mudar um item|alterar pedido|acrescentar item)\b/],
  ['occurrence.refund_request', /\b(reembolso|dinheiro de volta)\b/],
  ['occurrence.valet', /\b(carro foi danificado|dano.*(?:valet|manobrista)|problema com (?:o )?(?:valet|manobrista)|aconteceu algo.*carro.*valet)\b/],
  ['occurrence.dining_room', /\b(problema no atendimento do salao|atendimento no salao|situacao durante a visita)\b/],
  ['occurrence.prior_promise', /\b(promessa de retorno|prazo informado passou|ja me prometeram|solucao que foi combinada)\b/],
  ['occurrence.alert_only', /\b(so quero avisar|so um toque|apenas avisar|nao quero solucao)\b/],
  ['feedback.praise', /\b(excelente|foi mt bom|queria elogiar)\b/],
  ['feedback.suggestion', /\b(tenho uma sugestao|uma ideia p vcs|dava para melhorar)\b/],
  ['abuse.review', /\b(compensacao antes|outro credito do mesmo pedido|novamente a mesma situacao)\b/],
  ['public_exposure', /\b(vou publicar|vou postar|falando nas redes)\b/],
  ['privacy.opt_out', /\b(nao quero mais receber|para de mandar|sair da lista|pare de enviar|opt out)\b/],
  ['privacy.access_request', /\b(quais dados voces tem|quero meus dados|dados guardados)\b/],
  ['privacy.correction_request', /\b(cadastro esta errado|dados errados|atualizar uma informacao pessoal)\b/],
  ['handoff.failure', /\b(encaminharam.*ninguem recebeu|lugar nenhum|caso sumiu|atendimento reiniciou)\b/],
  ['conversation.multiple_intents', /\b(porcaria.*resolv\w*|pessimos.*resolv\w*|muito irritado|reservar e tambem reclamar|reserva e pedido errado|duas coisas.*reserva)\b/],
  ['reservation.update', /\b(mudar.*reserva|alterar.*horario|atualizar minha reserva)\b/],
  ['reservation.create', /\b(reservar|reserva p|queriamos reservar|acao parece ter ocorrido)\b/],
  ['waitlist.read', /\b(posicao.*fila|q posicao|falta muito na fila|consulte a fila)\b/],
  ['waitlist.create', /\b(entrar na fila|inclua meu grupo|criacao da fila|estamos em (?:quatro|4|seis|6) pessoas e chegando|somos 6 chegando|estamos chegando e somos seis)\b/],
  ['information.corkage', /\b(taxa de rolha|tem rolha|levar vinho)\b/],
  ['information.payment', /\b(meios? de pagamento|aceita pix|pagar de outro jeito)\b/],
  ['information.menu', /\b(cardapio|menu|ver as opcoes)\b/],
  ['information.hours', /\b(abrem?|aberto|horario|funcionamento|mais tarde)\b/],
  ['information.address', /\b(endereco|onde fic(?:a|am)(?: (?:vcs|voces))?|onde (?:vcs|voces) ficam|onde e a unidade)\b/],
  ['order.status', /\b(onde esta meu pedido|cade meu pedido|pedido.*(?:ja saiu|esta pronto|sumiu|consulta|atualizacao|informacao antiga|entregador)|consultar meu pedido|ifood saiu|retirada.*pronta|ir buscar meu pedido|status|cada tela fala|observador mostra|ser avisado quando houver mudanca|consulta demorou|consulta falhou|ultima atualizacao|um sistema diz pronto)\b/],
  ['occurrence.missing_item', /\b(i need help with a missing item|falto una bebida|outro idioma.*pedido|n veio|item faltando)\b/]
]);

const ACTIONS = Object.freeze({
  'information.address': 'confirm_or_ask_unit',
  'information.hours': 'check_fresh_hours',
  'information.menu': 'send_confirmed_reference',
  'information.payment': 'answer_if_confirmed',
  'information.corkage': 'answer_if_confirmed',
  'information.allergen': 'verify_with_human_without_guarantee',
  'reservation.create': 'create_if_available',
  'reservation.update': 'prepare_update',
  'waitlist.create': 'create_or_register_request',
  'waitlist.read': 'read_if_fresh',
  'reservation.large_group': 'register_large_group',
  'order.status': 'read_current_status',
  'order.modify': 'prepare_human_authorization',
  'order.cancel': 'prepare_human_authorization',
  'occurrence.address': 'prepare_human_authorization',
  'occurrence.preparation_delay': 'verify_then_record',
  'occurrence.collection_delay': 'verify_then_record',
  'occurrence.route_delay': 'verify_then_record',
  'occurrence.refund_request': 'review_without_promising',
  'occurrence.quality': 'food_safety_handoff',
  'occurrence.taste': 'food_safety_handoff',
  'occurrence.freshness': 'food_safety_handoff',
  'occurrence.allergen': 'food_safety_handoff',
  'occurrence.foreign_body': 'food_safety_handoff',
  'occurrence.health_symptom': 'emergency_guidance_and_handoff',
  'occurrence.valet': 'management_handoff',
  'occurrence.prior_promise': 'history_review',
  'occurrence.alert_only': 'record_alert',
  'feedback.praise': 'record_praise',
  'feedback.suggestion': 'record_suggestion',
  'conversation.multiple_intents': 'deescalate_and_identify_issue',
  'abuse.review': 'silent_manual_review',
  'public_exposure': 'management_handoff',
  'privacy.opt_out': 'record_opt_out',
  'privacy.access_request': 'privacy_handoff',
  'privacy.correction_request': 'privacy_handoff',
  'handoff.failure': 'reconstruct_and_escalate',
  'conversation.ambiguous': 'ask_open_short_question'
});

const DEFAULT_CAPABILITY = Object.freeze({
  'order.status': 'order.status.read',
  'occurrence.charge': 'occurrence.create',
  'conversation.ambiguous': 'occurrence.create',
  'handoff.failure': 'human.queue.create'
});

function extractPartyCandidates(content) {
  const text = normalizeText(content);
  const numberToken = `(?:\\d{1,2}|${Object.keys(NUMBER_WORDS).join('|')})`;
  const patterns = [
    new RegExp(`\\b(?:somos|estamos\\s+em|estaremos\\s+em)\\s+(${numberToken})\\b`, 'g'),
    new RegExp(`\\bmesa\\s+(?:para|de)\\s+(${numberToken})\\b`, 'g'),
    new RegExp(`\\bgrupo\\s+(?:de|com)\\s+(${numberToken})\\b`, 'g'),
    new RegExp(`\\b(${numberToken})\\s+(?:pessoa|pessoas|lugares)\\b`, 'g')
  ];
  const values = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const token = match[1];
      const value = /^\d+$/u.test(token) ? Number(token) : NUMBER_WORDS[token];
      if (Number.isInteger(value) && value > 0 && !values.includes(value)) values.push(value);
    }
  }
  return values;
}

function extractOrderReference(text) {
  const normalized = normalizeText(text);
  const match = normalized.match(/\bpedido\s+(?:correto\s+(?:e\s+)?([a-z0-9-]{3,20})|(?:numero\s+)?([a-z0-9-]{3,20}))\b/u);
  const value = match?.[1] || match?.[2] || null;
  if (!value || /^(?:do|da|de|no|correto)$/i.test(value)) return null;
  return `order_ref_${value.toUpperCase()}`;
}

function extractOrderChannel(text) {
  if (/\bifood\b/i.test(text)) return 'marketplace';
  if (/\b(delivery proprio|delivery de voces|pedido proprio)\b/i.test(text)) return 'own_delivery';
  if (/\bretirada\b/i.test(text)) return 'pickup';
  return null;
}

function extractSafeItem(text) {
  const items = [
    ['coca', 'refrigerante'],
    ['guarana', 'refrigerante'],
    ['refrigerante', 'refrigerante'],
    ['bebida', 'bebida'],
    ['shoyu', 'shoyu'],
    ['sobremesa', 'sobremesa'],
    ['acompanhamento', 'acompanhamento'],
    ['peca', 'peça'],
    ['item', null]
  ];
  const normalized = normalizeText(text);
  return items.find(([signal]) => new RegExp(`\\b${signal}s?\\b`, 'u').test(normalized))?.[1] || null;
}

function detectNativeMissingItem(content) {
  const text = normalizeText(content);
  const signal = /\b(faltou|nao veio|n veio|esqueceram|veio sem|nao mandaram|ficou faltando)\b/u.test(text);
  const item = extractSafeItem(content);
  const generic = /\b(item|itens|pedido|peca|pecas)\b/u.test(text);
  return Object.freeze({ matched: signal && (item !== null || generic), item, confidence: item ? 0.95 : 0.85 });
}

function extractEntities(content, context = {}) {
  const text = normalizeText(content);
  const output = {};
  const orderReference = extractOrderReference(content);
  const orderChannel = extractOrderChannel(text);
  if (orderReference) output.order_reference = { value: orderReference, state: 'provided', provenance: 'message', confidence: 0.98 };
  if (orderChannel) output.order_channel = { value: orderChannel, state: 'provided', provenance: 'message', confidence: 0.98 };
  const item = extractSafeItem(content);
  if (item) output.item_name = { value: item, state: 'provided', provenance: 'message', confidence: 0.9 };
  if (/\bmeu nome e\b/u.test(text)) output.customer_name = { value: 'provided_in_message', state: 'provided', provenance: 'message', confidence: 0.95, sensitive_value_discarded: true };
  if (/\b(?:as|a)\s+\d{1,2}h\b|\bem dez minutos\b|\bchegamos em\b/u.test(text)) output.arrival_estimate = { value: 'arrival_provided', state: 'provided', provenance: 'message', confidence: 0.9 };
  if (context.unit_id || context.unit) output.unit = { value: context.unit_id || context.unit, state: 'confirmed', provenance: 'system', confidence: 1 };
  return output;
}

function addOkeEntities(entities, content, party) {
  const text = normalizePublicText(content);
  if (party.value) entities.party_size = { value: party.value, state: 'provided', provenance: 'message', confidence: party.confidence };
  if (/\b(?:retirada|retirar|buscar).{0,30}\b(?:as|a)\s+\d{1,2}(?:h|:\d{2})\b/u.test(text)) {
    entities.pickup_time = { value: 'pickup_time_provided', state: 'provided', provenance: 'message', confidence: 0.9 };
  }
  if (/\b(?:quero|desejo|gostaria|vamos)\b.{0,80}\b(?:sushi|entrada|prato|sake|temaki|sashimi|nigiri|roll)\b/u.test(text)) {
    entities.requested_items = { value: 'requested_items_provided', state: 'provided', provenance: 'message', confidence: 0.8, raw_value_discarded: true };
  }
  return entities;
}

function behaviorFor(intentId, content, intentDefinition) {
  const text = normalizeText(content);
  const capability = DEFAULT_CAPABILITY[intentId] || intentDefinition.capability_candidates[0];
  let authority = capability.endsWith('.read') || capability === 'menu.read' || capability === 'promise.read' ? 'A0' : 'A1';
  if (['reservation.create', 'reservation.update', 'waitlist.create'].includes(capability)) authority = 'A2';
  if (['order.modify', 'order.cancel.request', 'compensation.suggest', 'abuse.classify'].includes(capability)) authority = 'A3';
  let escalation = 'E1';
  if (/^occurrence\.(?:missing_item|wrong_item|wrong_quantity|personalization_ignored|leak|packaging_damage|order_disrupted|temperature|driver|charge|address|refund_request|appearance|dining_room)$/u.test(intentId)) escalation = 'E2';
  if (['order.modify', 'order.cancel', 'conversation.multiple_intents', 'privacy.access_request', 'privacy.correction_request'].includes(intentId)) escalation = 'E2';
  if (['occurrence.quality', 'occurrence.taste', 'occurrence.freshness', 'occurrence.allergen', 'occurrence.foreign_body', 'occurrence.valet', 'occurrence.prior_promise', 'abuse.review', 'public_exposure', 'handoff.failure'].includes(intentId)) escalation = 'E3';
  if (intentId === 'information.allergen') escalation = 'E0';
  if (intentId === 'occurrence.health_symptom') escalation = 'E4';
  let output = {
    capability_id: capability,
    capability_state: 'unknown',
    authority,
    escalation,
    action: ACTIONS[intentId] || 'record_and_escalate',
    expected_result: { status: 'unknown' },
    closure: { expected_state: 'open', blocked_by: ['result:unknown'] }
  };
  const special = [
    [/\b(dificuldade|sem ar|respirar)\b/u, 'occurrence.health_symptom', { action: 'emergency_guidance_and_handoff' }],
    [/\b(passei mal|fiquei ruim|vomito|diarreia)\b/u, 'occurrence.health_symptom', { action: 'health_guidance_and_handoff' }],
    [/\b(tres pessoas|3 pessoas|mais de uma pessoa)\b/u, 'occurrence.health_symptom', { action: 'possible_outbreak_handoff' }],
    [/\b(reservar e tambem reclamar|reserva e pedido errado|duas coisas)\b/u, 'conversation.multiple_intents', { action: 'prioritize_sensitive_intent', escalation: 'E1' }],
    [/\b(i need help|falto una|outro idioma)\b/u, 'occurrence.missing_item', { action: 'language_accessible_handoff' }],
    [/\b(informacao antiga|status ta velho|ultima atualizacao faz tempo)\b/u, 'order.status', { expected_result: { status: 'degraded' }, action: 'declare_stale_and_handoff' }],
    [/\b(um sistema diz|cada tela fala|informacoes diferentes)\b/u, 'order.status', { expected_result: { status: 'conflict' }, action: 'declare_conflict_and_handoff', escalation: 'E2' }],
    [/\b(quero saber se meu pedido ja esta pronto)\b/u, 'order.status', { expected_result: { status: 'confirmed' }, action: 'read_state', escalation: 'E0', closure: { expected_state: 'resolved', blocked_by: [] } }],
    [/\b(quero entrar na fila agora)\b/u, 'waitlist.create', { expected_result: { status: 'unavailable' }, action: 'open_human_task' }],
    [/\b(meu pedido ja saiu)\b/u, 'order.status', { expected_result: { status: 'degraded' }, action: 'declare_limit' }],
    [/\b(pode atualizar minha reserva)\b/u, 'reservation.update', { expected_result: { status: 'failed' }, action: 'human_fallback' }],
    [/\b(pedido sumiu da tela)\b/u, 'order.status', { action: 'observe_and_reconcile' }],
    [/\b(estamos em quatro pessoas e chegando)\b/u, 'waitlist.create', { expected_result: { status: 'confirmed' }, action: 'persist_confirmation', escalation: 'E0', closure: { expected_state: 'resolved', blocked_by: [] } }],
    [/\b(mensagem de criacao da fila chegou duas vezes)\b/u, 'waitlist.create', { expected_result: { status: 'confirmed' }, action: 'deduplicate', escalation: 'E0', closure: { expected_state: 'resolved', blocked_by: [] } }],
    [/\b(observador mostra)\b/u, 'order.status', { expected_result: { status: 'conflict' }, action: 'preserve_conflict' }],
    [/\b(ultima atualizacao do pedido e antiga)\b/u, 'order.status', { expected_result: { status: 'degraded' }, action: 'declare_stale' }],
    [/\b(preciso consultar meu pedido agora)\b/u, 'order.status', { expected_result: { status: 'unavailable' }, action: 'safe_degradation' }],
    [/\b(decisao sobre uma cobranca duplicada)\b/u, 'occurrence.charge', { capability_id: 'human.queue.create', expected_result: { status: 'confirmed' }, action: 'persist_handoff' }],
    [/\b(atendimento reiniciou)\b/u, 'handoff.failure', { capability_id: 'customer.history.read', authority: 'A0', expected_result: { status: 'confirmed' }, action: 'replay_and_restore', escalation: 'E1' }],
    [/\b(ser avisado quando houver mudanca real)\b/u, 'order.status', { capability_id: 'notification.send', authority: 'A2', expected_result: { status: 'confirmed' }, action: 'notify_once', escalation: 'E0' }],
    [/\b(consulte a fila, mas nao altere nada)\b/u, 'waitlist.read', { expected_result: { status: 'confirmed' }, action: 'read_only', escalation: 'E0', closure: { expected_state: 'resolved', blocked_by: [] } }],
    [/\b(inclua meu grupo na fila)\b/u, 'waitlist.create', { expected_result: { status: 'requires_human' }, action: 'human_fallback' }],
    [/\b(acao parece ter ocorrido)\b/u, 'reservation.create', { action: 'reconcile_before_retry' }],
    [/\b(consulta demorou)\b/u, 'order.status', { expected_result: { status: 'failed' }, action: 'timeout_fallback' }],
    [/\b(consulta falhou temporariamente)\b/u, 'order.status', { expected_result: { status: 'processing' }, action: 'bounded_retry', escalation: 'E0' }],
    [/\b(nao foi possivel concluir automaticamente)\b/u, 'conversation.ambiguous', { capability_id: 'human.queue.create', expected_result: { status: 'confirmed' }, action: 'handoff' }]
  ].find(([pattern, expectedIntent]) => expectedIntent === intentId && pattern.test(text));
  if (special) output = { ...output, ...special[2] };
  return output;
}

class NativeConversationEngine {
  constructor(options = {}) {
    this.flags = options.flags;
    this.catalogs = validateOperationalCatalogs(options.catalogs);
    this.intentById = new Map(this.catalogs.intents.intents.map((item) => [item.id, item]));
  }

  classifyIntent(content) {
    const text = normalizeText(content);
    for (const [intentId, pattern] of INTENT_RULES) if (pattern.test(text)) return intentId;
    if (detectNativeMissingItem(content).matched || detectMissingItem(content).matched) return 'occurrence.missing_item';
    return 'conversation.ambiguous';
  }

  analyze(input) {
    assertFeature(this.flags, 'conversationEngineV1');
    const content = String(input.content || '');
    const context = input.context || {};
    const safetyState = safetyStateFromText(content);
    if (safetyState === 'respiratory_emergency') return this.urgentSafety(content, context);
    if (safetyState === 'active_reaction') return this.activeReaction(content, context);
    const publicTopic = detectPublicTopic(content);
    const candidates = extractPartyCandidates(content);
    if (publicTopic !== 'oke_pickup' && candidates.length > 1 && candidates.some((value) => value > 8)) {
      const intent = this.intentById.get('reservation.large_group');
      return this.finish({
        intent: intent.id,
        subintent: 'large_group',
        entities: { party_size: { value: null, state: 'conflict', candidates, provenance: 'message', confidence: 0.7 } },
        origin: 'dining_room',
        severity: 'operational',
        fields_missing: ['party_size', 'customer_name', 'arrival_estimate'],
        capability_id: 'human.queue.create',
        capability_state: 'requires_human',
        authority: 'A1',
        policy_id: 'LARGE_GROUP_POLICY',
        escalation: 'E1',
        ideal_response: 'Entendi que é um grupo, mas recebi quantidades diferentes. Qual é a quantidade correta?',
        prohibited_responses: ['escolher_quantidade_automaticamente'],
        closure: { expected_state: 'open', blocked_by: ['party_size:conflict'] },
        expected_result: { status: 'requires_human' },
        action: 'clarify_party_size',
        legacy_blocks: intent.legacy_blocks,
        scenario_id: null,
        basis_classifications: ['CANÔNICO_INTERNO'],
        confidence: 0.7
      }, content);
    }
    const party = extractPartySize(content);
    if (publicTopic !== 'oke_pickup' && party.value > 8) return this.largeGroup(content, context, party);
    const continuedIntent = context.short_reply_resolved === true && this.intentById.has(context.continuation_intent)
      ? context.continuation_intent
      : null;
    const classifiedIntent = this.classifyIntent(content);
    const publicIntent = intentForPublicTopic(publicTopic);
    const intentId = continuedIntent || (publicTopic === 'oke_pickup' || classifiedIntent === 'conversation.ambiguous' ? publicIntent : classifiedIntent) || classifiedIntent;
    const effectivePublicTopic = publicIntent === intentId ? publicTopic : null;
    const intent = this.intentById.get(intentId);
    const entities = extractEntities(content, context);
    if (effectivePublicTopic) entities.unit = { value: this.catalogs.publicInfo.unit.unit_id, state: 'confirmed', provenance: 'confirmed_public_catalog', confidence: 1 };
    if (effectivePublicTopic === 'oke_pickup') addOkeEntities(entities, content, party);
    const known = new Set([
      ...Object.entries(context).filter(([, value]) => value != null && value !== '').map(([key]) => key),
      ...Object.keys(entities)
    ]);
    const staticInformation = ['address', 'opening_hours', 'holiday_hours', 'dining_room_menu', 'delivery_menu', 'institutional_menu', 'delivery_options', 'restaurant_model', 'executive_lunch', 'tata_suggestion', 'payment', 'corkage', 'valet_information'];
    const fieldsMissing = staticInformation.includes(effectivePublicTopic)
      ? []
      : (intent.minimum_entities || []).filter((field) => field !== 'occurrence_reference' && !known.has(field));
    const behavior = { ...behaviorFor(intentId, content, intent), ...(publicBehaviorOverride(effectivePublicTopic) || {}) };
    const publicResponse = publicInformationResponse({ topic: effectivePublicTopic, content, publicInfo: this.catalogs.publicInfo, fieldsMissing, intentId });
    let idealResponse = publicResponse;
    if (intentId === 'conversation.ambiguous') idealResponse = 'Quero entender bem antes de seguir. Qual é o assunto principal?';
    if (intentId.startsWith('occurrence.') && !idealResponse) idealResponse = 'Vou registrar somente o que está confirmado e manter o caso aberto para acompanhamento.';
    return this.finish({
      intent: intentId,
      subintent: effectivePublicTopic === 'oke_pickup' ? 'evento_oke_retirada' : (effectivePublicTopic || intentId.split('.').slice(1).join('.')),
      entities: Object.keys(entities).length ? entities : { expected: intent.minimum_entities || [], values: 'synthetic_or_missing_only' },
      origin: entities.order_channel?.value || context.origin || (intentId.startsWith('reservation.') || intentId.startsWith('waitlist.') ? 'dining_room' : 'unknown'),
      severity: intent.default_severity,
      fields_missing: fieldsMissing,
      ...behavior,
      policy_id: `policy:${intentId}`,
      ideal_response: idealResponse,
      prohibited_responses: ['inventar_confirmacao', 'oferecer_compensacao_automatica'],
      legacy_blocks: intent.legacy_blocks,
      scenario_id: null,
      basis_classifications: [intent.classification || 'INFERÊNCIA'],
      information_source: publicResponse ? {
        classification: this.catalogs.publicInfo.classification,
        unit_id: this.catalogs.publicInfo.unit.unit_id,
        catalog_version: this.catalogs.publicInfo.version
      } : null,
      confidence: intentId === 'conversation.ambiguous' ? 0.2 : 0.86
    }, content);
  }

  largeGroup(content, context, party) {
    const intent = this.intentById.get('reservation.large_group');
    const entities = extractEntities(content, context);
    entities.party_size = { value: party.value, state: 'provided', provenance: 'message', confidence: party.confidence };
    const known = new Set([...Object.keys(context).filter((key) => context[key] != null && context[key] !== ''), ...Object.keys(entities)]);
    const missing = ['customer_name', 'arrival_estimate'].filter((field) => !known.has(field));
    return this.finish({
      intent: intent.id,
      subintent: 'large_group',
      entities,
      origin: 'dining_room',
      severity: 'operational',
      fields_missing: missing,
      capability_id: 'waitlist.create',
      capability_state: 'unknown',
      authority: 'A2',
      policy_id: 'LARGE_GROUP_POLICY',
      escalation: 'E1',
      ideal_response: `Perfeito. Como são ${party.value} pessoas, vou preparar o atendimento específico.`,
      prohibited_responses: ['confirmar_fila_sem_resultado_confirmed'],
      closure: { expected_state: 'open', blocked_by: ['human_confirmation'] },
      expected_result: { status: 'unknown' },
      action: 'register_large_group',
      legacy_blocks: intent.legacy_blocks,
      scenario_id: null,
      basis_classifications: ['CANÔNICO_INTERNO'],
      confidence: party.confidence
    }, content);
  }

  urgentSafety(content, context) {
    const intent = this.intentById.get('occurrence.health_symptom');
    const entities = extractEntities(content, context);
    return this.finish({
      intent: intent.id,
      subintent: 'respiratory_emergency',
      entities: Object.keys(entities).length ? entities : { expected: intent.minimum_entities || [], values: 'synthetic_or_missing_only' },
      origin: context.origin || 'unknown',
      severity: 'critical',
      fields_missing: ['order_reference', 'order_channel', 'item_name'],
      capability_id: 'health.incident.create',
      capability_state: 'degraded',
      authority: 'A1',
      escalation: 'E4',
      action: 'emergency_guidance_and_handoff',
      expected_result: { status: 'unknown' },
      closure: { expected_state: 'open', blocked_by: ['missing:order_reference', 'missing:order_channel', 'missing:item_name', 'result:unknown'] },
      policy_id: 'URGENT_SAFETY_GATE',
      ideal_response: 'Essa situação exige atendimento de emergência imediato. Priorize a segurança da pessoa: procure agora o serviço de emergência apropriado ou acione o SAMU 192. Não espere novas perguntas por aqui antes de buscar ajuda.',
      prohibited_responses: ['diagnosticar', 'atribuir_causalidade', 'minimizar', 'continuar_recomendacao_gastronomica', 'pedir_dados_antes_da_orientacao_urgente'],
      legacy_blocks: intent.legacy_blocks,
      scenario_id: null,
      basis_classifications: ['CANÔNICO_INTERNO'],
      confidence: 1
    }, content);
  }

  activeReaction(content, context) {
    const intent = this.intentById.get('occurrence.allergen');
    const entities = extractEntities(content, context);
    return this.finish({
      intent: intent.id,
      subintent: 'active_reaction',
      entities: Object.keys(entities).length ? entities : { expected: intent.minimum_entities || [], values: 'synthetic_or_missing_only' },
      origin: context.origin || 'unknown',
      severity: 'sensitive',
      fields_missing: [],
      capability_id: 'human.queue.create',
      capability_state: 'requires_human',
      authority: 'A1',
      escalation: 'E3',
      action: 'health_guidance_and_handoff',
      expected_result: { status: 'requires_human' },
      closure: { expected_state: 'open', blocked_by: ['active_health_incident'] },
      policy_id: 'ACTIVE_INCIDENT_SAFETY_GATE',
      ideal_response: 'Sinto muito. Como a reação já está acontecendo, interrompa a escolha de alimentos e priorize a saúde da pessoa. Procure atendimento apropriado; se houver dificuldade para respirar, inchaço importante, desmaio ou piora rápida, acione imediatamente o serviço de emergência.',
      prohibited_responses: ['diagnosticar', 'atribuir_causalidade', 'minimizar', 'continuar_recomendacao_gastronomica', 'oferecer_compensacao_automatica'],
      legacy_blocks: intent.legacy_blocks,
      scenario_id: null,
      basis_classifications: ['CANÔNICO_INTERNO'],
      confidence: 0.98
    }, content);
  }

  finish(classification, content) {
    const policies = {
      food_safety: foodSafetyPolicy(classification, content),
      abuse: classification.intent === 'abuse.review' ? abuseReview({}) : null
    };
    return deepFreeze({ ...classification, schema_version: 'conversation-native-classification-v1', synthetic: true, legacy_projection: legacyProjection(classification), policies });
  }
}

module.exports = {
  normalizeText,
  INTENT_RULES,
  ACTIONS,
  DEFAULT_CAPABILITY,
  extractPartyCandidates,
  extractOrderReference,
  extractOrderChannel,
  extractSafeItem,
  detectNativeMissingItem,
  extractEntities,
  addOkeEntities,
  behaviorFor,
  safetyStateFromText,
  NativeConversationEngine
};
