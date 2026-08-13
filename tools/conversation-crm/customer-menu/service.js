'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  CustomerIntelligenceStore, CustomerImportPipeline, normalizedIdentity
} = require('../../../src/conversation-crm/customer-intelligence');
const {
  createSyntheticCatalog, MenuCatalog, initialHospitalityContext,
  updateHospitalityContext, hospitalityRequest, avoidsCreamCheese,
  temperaturePreferenceFromText
} = require('../../../src/conversation-crm/menu-intelligence');
const {
  createCustomerMenuTools
} = require('../../../src/conversation-crm/customer-menu-tools');
const {
  customerContextFromSummary,
  menuContextFromRecommendation,
  recommendationContextFromResult
} = require('../../../src/conversation-crm/native/customer-menu-integration');
const { MenuReviewService } = require('./review-service');
const { safetyStateFromText } = require('../../../src/conversation-crm/native/engine');

const SYNTHETIC_SECRET = 'deliveryos-synthetic-panel-identity-secret-v1';
const MENU_CHANNEL_QUESTION = 'Você está escolhendo para o salão, para pedir pelo iFood ou pelo delivery próprio?';
const MENU_CHANNEL_REPEAT_QUESTIONS = Object.freeze([
  'Para eu consultar o cardápio certo: salão, iFood ou delivery próprio?',
  'Você prefere escolher pelo salão, pelo iFood ou pelo delivery próprio?',
  'Só preciso confirmar o canal: salão, iFood ou delivery próprio?'
]);
const OCCURRENCE_SIGNAL = /\b(?:faltou|nao veio|esqueceram|nao mandaram|veio (?:outro|errado|com)|reacao|pass(?:ei|ou|ar|ando) mal|vomito|diarreia|dificuldade (?:para|pra) respirar|(?:nao|n) consegue respirar|(?:nao|n) respira direito|sem ar|cabelo|corpo estranho)\b/u;
const USER_REPAIR_SIGNAL = /\b(?:voce|vc) (?:nao|n) (?:esta|ta) entendendo|\b(?:nao|n) foi (?:isso|o que eu (?:falei|pedi))|\bquem falou em\b|\beu falei\b|\b(?:nao|n) quero isso\b|\bja disse que\b|\b(?:voce|vc) entendeu errado\b|\b(?:entendeu|deu para entender|ficou claro)\??$/u;
const NEGATIVE_FEEDBACK_SIGNAL = /\b(?:ja vi que (?:voce|vc) (?:nao|n) sabe|(?:voce|vc) (?:nao|n) (?:esta|ta) ajudando|isso (?:nao|n) tem nada a ver|(?:voce|vc) (?:esta|ta) perdido)\b/u;
const RESERVATION_INTENT_SIGNAL = /\b(?:quero|queria|gostaria de|como (?:faco|faz)(?: para)?|pode me dizer como (?:faco|faz)(?: para)?)?\s*reserv(?:ar|a)|\btem mesa(?: para| pra)?\b|\b(?:quero|preciso de) uma mesa (?:para|pra)\b|\b(?:vou|quero ir|acho que vou) (?:no|ao) restaurante\b|\bquero ir ai com\b|\b(?:vou|quero|acho que vou) (?:ai )?pessoalmente\b|\besquece (?:o )?delivery,? quero reservar\b/u;
const DINE_OUT_SIGNAL = /\b(?:preciso|quero|queria|to procurando|estou procurando).{0,36}\b(?:lugar (?:para|pra) (?:comer|jantar)|onde (?:comer|jantar)|sair (?:para|pra) comer)\b|\bqueria comer japones hoje\b|\bqueria ir no tata hoje\b|\bcomo faco (?:para|pra) ir ai\b/u;
const FOOD_CHOICE_SIGNAL = /\b(?:(?:estou|to|fiquei)\s+com\s+(?:muita\s+)?fome|(?:quero|queria|preciso)\s+(?:comer|jantar|almocar|pedir)(?:\s+(?:algo|alguma coisa)(?:\s+gostos[oa])?)?|me ajuda\s+(?:a\s+)?(?:escolher|decidir)(?:\s+(?:alguma coisa|o que comer))?|(?:nao|n) sei o que (?:comer|pedir))\b/u;

const REQUESTED_CATEGORY_PATTERNS = Object.freeze([
  ['hot_roll', /\bhot roll\b/u],
  ['sashimi', /\bsashimis?\b/u],
  ['temaki', /\btemakis?\b/u],
  ['combinado', /\bcombinados?\b/u],
  ['entrada', /\bentradas?\b/u],
  ['sobremesa', /\bsobremesas?\b/u],
  ['drink', /\b(?:drinks?|coqueteis?)\b/u],
  ['sushi', /\bsushis?\b/u]
]);

function stableReviewId(value) {
  return String(value || '').replace(/[^A-Z0-9]/giu, '').slice(0, 32).toUpperCase();
}

const WRITTEN_NUMBERS = Object.freeze({
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12
});

function normalizeChatText(value) {
  return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/gu, ' ').trim();
}

function socialActFromText(text) {
  return /^(?:oi+|ola|bom dia|boa tarde|boa noite)\b/u.test(text) ? 'greeting' : null;
}

function requestedCategoryFromText(text) {
  return REQUESTED_CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] || null;
}

function hasRecommendationSelectionSignal(state) {
  const hospitality = state.hospitality_context || initialHospitalityContext();
  const occasion = hospitality.occasion;
  const experience = hospitality.desired_experience;
  return Boolean(
    state.requested_category
    || state.preferred_ingredients?.length
    || state.excluded_ingredients?.length
    || state.fried !== null
    || state.cream_cheese
    || state.number_of_people
    || state.allergies?.length
    || hospitality.budget
    || hospitality.flavor_preferences?.length
    || hospitality.texture_preferences?.length
    || hospitality.preparation_preferences?.length
    || hospitality.dietary_restrictions?.length
    || (occasion && !['delivery_choice', 'menu_discovery'].includes(occasion))
    || (experience && !['delivery_choice', 'menu_discovery'].includes(experience))
  );
}

function foodPreferenceDiscoveryQuestion(state) {
  const questions = [
    'Você está com vontade de algo mais fresco, maçaricado ou quente?',
    'Entre sushi, sashimi e pratos quentes, por onde você quer começar?',
    'Tem algum ingrediente ou tipo de preparo que você quer priorizar ou evitar?'
  ];
  const asked = new Set(state.guidance_questions_asked || []);
  return questions.find((question) => !asked.has(normalizeChatText(question))) || questions.at(-1);
}

function semanticTransitionForTurn(text, state, turnAnalysis) {
  if (USER_REPAIR_SIGNAL.test(text) || NEGATIVE_FEEDBACK_SIGNAL.test(text)) return 'CORRECT';
  const nextGoal = RESERVATION_INTENT_SIGNAL.test(text)
    ? 'reservation'
    : (DINE_OUT_SIGNAL.test(text) ? 'dine_out' : turnAnalysis.goal);
  if (nextGoal && state.active_goal && nextGoal !== state.active_goal) return 'SWITCH';
  if (nextGoal && (state.active_goal === nextGoal || state.active_goal === null)) return state.active_goal ? 'REFINE' : 'CONTINUE';
  if (channelFromText(text) && state.recommendation_active) return 'REFINE';
  return 'CONTINUE';
}

function greetingOnly(text) {
  return /^(?:oi+|ola|bom dia|boa tarde|boa noite)(?:[!,.; ]|tudo bem)*\??$/u.test(text);
}

function greetingLabel(text) {
  if (text.startsWith('bom dia')) return 'Bom dia!';
  if (text.startsWith('boa tarde')) return 'Boa tarde!';
  if (text.startsWith('boa noite')) return 'Boa noite!';
  return 'Olá!';
}

function channelFromText(text) {
  if (/\b(?:vou|quero|prefiro|comer) (?:ai|no|ao) (?:restaurante|salao)|\b(?:restaurante|salao|presencial)\b.*\b(?:em vez|ao inves)\b.*\bifood\b|\b(?:talvez|acho que|acho q) (?:eu )?(?:vou|va) ai(?: entao)?\b|\b(?:e )?se eu for (?:ai|no restaurante)(?: muda alguma coisa)?\b/u.test(text)) return 'dining_room';
  if (/\bifood\b|\b(?:pelo|no) aplicativo\b|\bmelhor pedir pelo aplicativo\b/u.test(text)) return 'ifood';
  if (/\b(?:delivery proprio|delivery do tata|pedir pelo delivery)\b/u.test(text)) return 'own_delivery';
  if (/\b(?:salao|presencial|no restaurante)\b/u.test(text)) return 'dining_room';
  return null;
}

function firstVisitFromText(text) {
  return /\b(?:primeira vez|nunca (?:fui|comi|pedi)|(?:nao|n) conheco|(?:nao|n) entendo (?:nada |muito )?(?:de )?(?:japones|sushi)|quero experimentar mas (?:nao|n) sei o que pedir|(?:nao|n) conheco esses nomes|me ajuda a escolher porque eu (?:nao|n) entendo muito|sou meio perdido com sushi)\b/u.test(text);
}

function customerTurnQuestions(text) {
  const questions = [];
  if (/\b(?:o que (?:voce )?(?:me )?(?:indica|recomenda|sugere|escolheria)|me indica|me recomenda|qual (?:opcao|prato).*(?:indica|recomenda)|ajuda a escolher|quero pedir mas (?:to|estou) (?:meio )?na duvida)\b/u.test(text)) questions.push('recommendation');
  if (/\b(?:qual (?:dessas|desses|delas|deles).*(?:escolheria|melhor)|(?:dessas|desses|delas|deles) (?:opcoes )?qual (?:voce|vc) acha melhor|qual (?:voce|vc) acha melhor|o que (?:voce|vc) escolheria entre|qual faz mais sentido|qual (?:voce|vc) pegaria|qual (?:e|eh) melhor|(?:dessas|desses) qual)\b/u.test(text)) questions.push('decision_support');
  if (/\b(?:cru|crua|crus|cruas)\b/u.test(text) && /\b(?:opcao|segunda|primeira|qual deles|essa|esse)\b/u.test(text)) questions.push('raw_preparation');
  if (/\b(?:frit[oa]|fritura)\b/u.test(text) && /\b(?:opcao|segunda|primeira|qual deles|essa|esse)\b/u.test(text)) questions.push('fried_preparation');
  if (/\b(?:quanto custa|quanto fica|qual (?:e )?o preco|preco|(?:e )?valor)\b/u.test(text)) questions.push('price');
  if (/\b(?:bebida|drink|saque|sake)\b/u.test(text) && /\b(?:combina|harmoniza|indica|tem)\b/u.test(text)) questions.push('drink_pairing');
  if (/\b(?:por que|porque)\s+(?:(?:voce|vc)\s+)?(?:sugeriu|indicou|escolheu|separou)\s+(?:essas|esses|isso|opcoes?)\b|\bqual foi (?:o )?(?:criterio|motivo)\b/u.test(text)) questions.push('recommendation_explanation');
  if (/\b(?:tem|manda|mostra|quero ver)\s+(?:mais|outras?)\s+(?:opcoes?)?\b|\b(?:mais|outras?) opcoes?\b/u.test(text)) questions.push('more_options');
  return [...new Set(questions)];
}

function namesIndependentOperationalPriceTarget(text) {
  return /\b(?:rodizio|almoco executivo|sugestao tata|valet|rolha)\b/u.test(text);
}

function ordinalReferenceFromText(text) {
  const match = text.match(/\b(?:essa|esse|a|o)?\s*(primeir[ao]|segund[ao]|terceir[ao])(?:\s+opcao)?\b/u);
  if (!match) return null;
  const position = match[1].startsWith('primeir') ? 1 : (match[1].startsWith('segund') ? 2 : 3);
  return { kind: 'ordinal_option', position };
}

function analyzeCustomerTurn(text, priorOptions = []) {
  const questions = customerTurnQuestions(text);
  const firstVisit = firstVisitFromText(text);
  const foodChoiceSignal = FOOD_CHOICE_SIGNAL.test(text);
  const ordinal = ordinalReferenceFromText(text);
  const groupReferenceRequested = /\bqual (?:deles|delas)\b/u.test(text);
  const referenced = ordinal ? priorOptions[ordinal.position - 1] || null : null;
  const recommendationSignal = foodChoiceSignal || questions.includes('recommendation')
    || /\b(?:salmao|atum|peixe|sushi|prato|opcao|leve|menos pesada|cream cheese|sem fritura)\b/u.test(text);
  const dineOut = DINE_OUT_SIGNAL.test(text);
  const reservation = RESERVATION_INTENT_SIGNAL.test(text);
  const requestedCategory = requestedCategoryFromText(text);
  return {
    social_act: socialActFromText(text),
    goal: reservation ? 'reservation' : (dineOut ? 'dine_out' : (firstVisit ? 'menu_discovery' : (recommendationSignal ? 'recommendation' : null))),
    requested_category: requestedCategory,
    food_choice_signal: foodChoiceSignal,
    user_repair_signal: USER_REPAIR_SIGNAL.test(text),
    negative_feedback_signal: NEGATIVE_FEEDBACK_SIGNAL.test(text),
    facts: {
      channel: channelFromText(text),
      number_of_people: partySizeFromText(text)
    },
    preferences: {
      light: /\b(?:leve|mais leve|menos pesada|menos pesado)\b/u.test(text),
      avoid_cream_cheese: avoidsCreamCheese(text),
      temperature: temperaturePreferenceFromText(text)
    },
    questions,
    resolved_reference: referenced ? { ...ordinal, item_id: referenced.item_id, name: referenced.name } : null,
    resolved_group_reference: groupReferenceRequested && priorOptions.length
      ? { kind: 'presented_options', item_ids: priorOptions.map((item) => item.item_id) }
      : null,
    unresolved_reference: (ordinal && !referenced) || (groupReferenceRequested && !priorOptions.length)
      ? { ...ordinal, reason: 'no_prior_option_list' }
      : null
  };
}

function formatPrice(value) {
  return Number.isFinite(Number(value)) ? `R$ ${Number(value).toFixed(2).replace('.', ',')}` : null;
}

function partySizeFromText(text) {
  const token = text.match(/\b(?:somos|estamos em|estou em|vamos em|para|pra|e so pra|sou so eu(?:,? estamos em)?)\s+(\d{1,2}|[a-z]+)(?:\s+pessoas?)?\b/u)?.[1]
    || (/\bsou so eu\b/u.test(text) ? 'um' : null);
  if (!token) return null;
  const value = /^\d+$/u.test(token) ? Number(token) : WRITTEN_NUMBERS[token];
  return Number.isInteger(value) && value > 0 ? value : null;
}

function allergyFromText(text) {
  if (!/\b(?:tenho|temos|tem) alergia|\b(?:sou|e|eh) alergic[oa]|\b(?:pessoa|irma|irmao|filh[oa]|amig[oa]).{0,32}\b(?:alergic[oa]|nao pode (?:consumir|comer))|\b(?:nao|n) posso (?:comer|consumir)|\b(?:tenho|temos|tem) intolerancia\b/u.test(text)) return null;
  if (/\b(?:veio|recebi|mandaram|chegou|comi|reacao|passei mal)\b/u.test(text)) return null;
  if (/\b(?:camarao|crustaceo|crustaceos)\b/u.test(text)) return { value: 'crustacean', label: 'camarão' };
  if (/\b(?:lactose|leite)\b/u.test(text)) return { value: 'lactose', label: 'lactose' };
  if (/\bgluten\b/u.test(text)) return { value: 'gluten', label: 'glúten' };
  return { value: 'allergen_unspecified', label: 'a restrição informada' };
}

function peopleFromQuantity(quantity, itemName = '') {
  const labels = Array.isArray(quantity) ? quantity : [];
  const match = [itemName, ...labels].map((label) => String(label).match(/\b(\d+)\s*pessoas?\b/iu)).find(Boolean);
  return match ? Number(match[1]) : null;
}

function initialChatContext(defaultUnitId = 'SIM-UNIT-ITAIM') {
  return {
    channel: null,
    unit_id: defaultUnitId,
    preferred_ingredients: [],
    excluded_ingredients: [],
    cream_cheese: null,
    fried: null,
    number_of_people: null,
    allergies: [],
    allergy_labels: {},
    recommendation_active: false,
    operational_flow_active: false,
    awaiting_channel: false,
    channel_question_asked: false,
    guidance_questions_asked: [],
    selected_item_id: null,
    selected_item_name: null,
    requested_category: null,
    active_goal: null,
    suspended_goals: [],
    presented_options: [],
    turn_analysis: null,
    pending_question: null,
    direct_menu_request_pending: false,
    last_message_normalized: null,
    repetition_detected: false,
    repetition_streak: 0,
    facts_added: [],
    social_act: null,
    hospitality_context: initialHospitalityContext()
  };
}

function buildSyntheticCustomerStore() {
  const store = new CustomerIntelligenceStore({
    clock: () => new Date('2026-07-01T15:00:00.000Z')
  });
  const definitions = [
    {
      id: 'SIM-CUSTOMER-001',
      source: 'neemo',
      phone: '11990000101',
      facts: [
        ['preferred_item', 'SIM-SALMON-LIGHT', 'confirmed', 'customer_confirmation'],
        ['preferred_flavor', 'light', 'inferred', 'synthetic_history']
      ],
      restriction: null,
      consent: 'allowed'
    },
    {
      id: 'SIM-CUSTOMER-002',
      source: 'get_in',
      phone: '11990000102',
      facts: [['preferred_preparation', 'cooked', 'imported', 'get_in']],
      restriction: ['allergy', 'crustacean'],
      consent: 'withdrawn'
    },
    {
      id: 'SIM-CUSTOMER-003',
      source: 'ifood_history',
      phone: '11990000103',
      facts: [],
      restriction: null,
      consent: 'unknown'
    }
  ];
  definitions.forEach((definition) => {
    store.createCustomer({ customer_id: definition.id, provenance: 'synthetic' });
    store.addIdentity(definition.id, normalizedIdentity({
      type: 'phone', value: definition.phone, source: definition.source
    }, { secret: SYNTHETIC_SECRET }));
    definition.facts.forEach(([field, value, state, source]) => {
      store.recordFact(definition.id, { field, value, state, source });
    });
    if (definition.restriction) {
      store.recordRestriction(definition.id, {
        type: definition.restriction[0],
        value: definition.restriction[1],
        status: 'confirmed',
        source: 'synthetic_declaration'
      });
    }
    store.recordConsent(definition.id, {
      purpose: 'all_marketing',
      channel: 'all',
      state: definition.consent,
      source: 'synthetic'
    });
    store.recordRelated(definition.id, 'orders', {
      order_id: `SIM-ORDER-${definition.id.slice(-3)}`,
      channel: definition.source === 'ifood_history' ? 'ifood' : 'own_delivery',
      state: 'synthetic_history'
    });
    store.recordRelated(definition.id, 'reservations', {
      reservation_id: `SIM-RESERVATION-${definition.id.slice(-3)}`,
      unit_id: 'SIM-UNIT-ITAIM',
      state: 'synthetic_history'
    });
    if (definition.id === 'SIM-CUSTOMER-002') {
      store.recordRelated(definition.id, 'incidents', {
        incident_id: 'SIM-INCIDENT-002',
        category: 'synthetic_quality_review',
        state: 'closed'
      });
    }
  });
  return store;
}

class CustomerMenuHomologationService {
  constructor(options = {}) {
    this.customerStore = buildSyntheticCustomerStore();
    this.menuReview = options.menuReview || new MenuReviewService({
      projectRoot: options.projectRoot,
      root: options.menuReviewRoot,
      now: options.now
    });
    this.writerStatus = options.writerStatus || (() => ({ status: 'deterministic_fallback', reason: 'LOCAL_WRITER_NOT_CONFIGURED' }));
    this.menuCatalog = null;
    this.catalogMode = null;
    this.rebuildMenuCatalog();
    this.importPipeline = new CustomerImportPipeline({
      store: this.customerStore,
      secret: SYNTHETIC_SECRET
    });
    this.importFixture = [
      'external_id,unit,orders',
      'SIM-IMPORT-CUSTOMER-001,SIM-UNIT-ITAIM,2',
      'SIM-IMPORT-CUSTOMER-002,SIM-UNIT-ITAIM,1',
      ',SIM-UNIT-ITAIM,0'
    ].join('\n');
    this.importBatchId = this.stageSyntheticImport().batch_id;
    this.chatContexts = new Map();
  }

  rebuildMenuCatalog() {
    const publicApproved = this.menuReview.approvedPublicItems();
    const approved = [...publicApproved, ...this.menuReview.approvedItems()];
    if (!approved.length) {
      this.menuCatalog = createSyntheticCatalog();
      this.catalogMode = 'synthetic_until_human_approval';
    } else {
      const catalog = new MenuCatalog({ clock: () => new Date('2026-07-01T15:00:00.000Z') });
      const sources = [...new Set(approved.map((item) => item.source_id))];
      for (const sourceId of sources) {
        const official = this.menuReview.publicEvidence.sources.find((item) => item.source_id === sourceId);
        catalog.registerSource({
          source_id: sourceId,
          title: official?.title || 'Fonte real aprovada em homologação humana',
          format: sourceId.includes('seed') ? 'json' : 'reviewed_source',
          channel: official?.channel || 'multiple',
          unit_id: official?.unit_id || null,
          authority: official?.authority || 'human_homologation',
          content_hash: this.menuReview.publicEvidence.generated_from?.report_sha256 || null,
          observed_at: this.menuReview.publicEvidence.generated_from?.captured_at || null,
          review_status: 'confirmed'
        });
      }
      for (const proposal of approved) {
        const isPublic = Boolean(proposal.public_record_id);
        const extracted = isPublic
          ? Object.fromEntries(Object.entries(proposal.fields).map(([name, evidence]) => [name, evidence.value]))
          : (proposal.information_extracted || {});
        const price = isPublic ? extracted.price?.current : (Object.hasOwn(extracted, 'price') ? extracted.price : null);
        const characteristics = proposal.recommendation_evidence?.characteristics || [];
        const explicitPeople = peopleFromQuantity(extracted.quantity, extracted.name);
        const ingredients = [
          ...(characteristics.includes('contains_confirmed_salmon') ? ['salmon'] : []),
          ...(characteristics.includes('contains_confirmed_tuna') ? ['tuna'] : []),
          ...(characteristics.includes('contains_confirmed_white_fish') ? ['white_fish'] : [])
        ];
        catalog.addItem({
          item_id: `REAL-${stableReviewId(proposal.public_record_id || proposal.review_id)}`,
          commercial_identity: proposal.internal_links?.[0]?.internal_record_id
            || proposal.public_identity || proposal.source_record_id || proposal.public_record_id || proposal.review_id,
          name: extracted.name || proposal.item,
          description: extracted.description ?? null,
          channel: proposal.channel,
          unit_id: proposal.unit_id,
          category: extracted.category || extracted.operational_category || 'unknown',
          price,
          quantity: explicitPeople ? { people: explicitPeople, labels: extracted.quantity }
            : (characteristics.includes('single_person') ? { people: 1 }
            : (characteristics.includes('two_people') ? { people: 2 }
              : (Array.isArray(extracted.quantity) ? { labels: extracted.quantity } : null))),
          ingredients: [...new Set([...(extracted.ingredients || []), ...ingredients])]
            .map((name) => ({ name, status: isPublic ? 'verified_official_public_source' : 'confirmed', source_id: proposal.source_id })),
          flavor_profile: [
            ...(characteristics.includes('light_profile') ? ['light'] : []),
            ...(characteristics.includes('intense_profile') ? ['intense'] : [])
          ],
          hospitality_tags: [
            ...(proposal.recommendation_evidence?.compatibility_tags || []),
            ...(characteristics.includes('shareable') ? ['sharing'] : []),
            ...(characteristics.includes('single_person') ? ['small_portion'] : []),
            ...(characteristics.includes('group') ? ['substantial_meal'] : [])
          ],
          preparation: {
            raw: characteristics.includes('raw') ? true : null,
            cooked: characteristics.includes('cooked') ? true : null,
            fried: characteristics.includes('fried') ? true : (characteristics.includes('not_fried') ? false : null),
            torched: characteristics.includes('torched') ? true : null,
            cream_cheese: characteristics.includes('cream_cheese_absence_confirmed_internal') ? false : null,
            vegetarian: characteristics.includes('vegetarian') ? true : null
          },
          allergens: [],
          cross_contact: { state: 'unknown', source_id: proposal.source_id },
          availability: {
            state: isPublic ? 'unknown' : (extracted.availability || 'unknown'),
            checked_at: isPublic ? proposal.fields.price?.captured_at || null : null,
            source_id: proposal.source_id
          },
          source_records: [proposal.source_id],
          review_status: isPublic ? proposal.item_status : 'confirmed',
          review_notes: [
            ...(isPublic ? ['verified_official_public_source'] : ['human_review_approved']),
            'unknown_fields_preserved',
            ...(isPublic ? ['public_fields_certified', 'availability_not_confirmed'] : []),
            ...(proposal.recommendation_evidence ? [`recommendation_evidence:${proposal.recommendation_evidence.compatibility_tags.join(',')}`] : [])
          ]
        });
      }
      this.menuCatalog = catalog;
      this.catalogMode = publicApproved.length ? 'real_public_official_source_verified' : 'real_human_approved';
    }
    this.tools = createCustomerMenuTools({
      customerStore: this.customerStore,
      menuCatalog: this.menuCatalog,
      identitySecret: SYNTHETIC_SECRET
    });
  }

  stageSyntheticImport() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-customer-import-'));
    const file = path.join(root, 'synthetic-customers.csv');
    try {
      fs.writeFileSync(file, this.importFixture, 'utf8');
      return this.importPipeline.stage({
        file_path: file,
        source: 'generic',
        adapter_version: 'v1'
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  publicImport(batch = this.importPipeline.get(this.importBatchId)) {
    return {
      batch_id: batch.batch_id,
      source: batch.source,
      adapter_version: batch.adapter_version,
      state: batch.state,
      total: batch.preview.total,
      valid: batch.preview.valid,
      invalid: batch.preview.invalid,
      exact_matches: batch.preview.exact_matches,
      human_review: batch.preview.human_review,
      ignored_fields: batch.preview.ignored_fields,
      duplicate_upload: batch.duplicate_upload === true,
      row_states: batch.rows.map((row) => ({
        row_number: row.row_number,
        state: row.state,
        action: row.action,
        resolution: row.resolution.classification
      })),
      rollback: batch.rollback || null
    };
  }

  importAction(input = {}) {
    const action = String(input.action || '');
    if (action === 'approve_and_apply') {
      this.importPipeline.approve(this.importBatchId, { approved_by_human: 'SIM-HUMAN-HOMOLOGATION' });
      this.importPipeline.apply(this.importBatchId);
    } else if (action === 'rollback') {
      this.importPipeline.rollback(this.importBatchId, { approved_by_human: 'SIM-HUMAN-HOMOLOGATION' });
    } else if (action === 'duplicate_probe') {
      const duplicate = this.stageSyntheticImport();
      return { ok: true, synthetic: true, batch: this.publicImport(duplicate) };
    } else {
      throw Object.assign(new Error('IMPORT_ACTION_INVALID'), { code: 'IMPORT_ACTION_INVALID' });
    }
    return { ok: true, synthetic: true, batch: this.publicImport() };
  }

  currentMenuSourceId(channel = null) {
    return this.menuCatalog.snapshot().sources
      .filter((source) => !channel || source.channel === channel)
      .map((source) => source.source_id).join('+') || 'none';
  }

  currentPublicMenuSource(channel) {
    const source = this.menuReview.publicEvidence?.sources?.find((item) => (
      item.channel === channel
      && item.authority === 'verified_official_public_source'
      && typeof item.url === 'string'
      && /^https:\/\//u.test(item.url)
    ));
    return source ? { source_id: source.source_id, location: source.url } : null;
  }

  currentMenuLabel() {
    return this.catalogMode.startsWith('real_')
      ? 'cardápio oficial deste canal'
      : 'cardápio deste canal';
  }

  defaultUnitForChannel(channel) {
    if (!channel) return null;
    return this.menuCatalog.snapshot().items.find((item) => item.channel === channel)?.unit_id || null;
  }

  contextForChat(input = {}) {
    const conversationId = String(input.conversation_id || 'SIM-CONV-HOMO-UNKNOWN');
    const state = this.chatContexts.get(conversationId) || initialChatContext(this.defaultUnitForChannel(input.channel));
    const text = normalizeChatText(input.message);
    let priorPresentedOptions = [...state.presented_options];
    const turnAnalysis = analyzeCustomerTurn(text, priorPresentedOptions);
    state.turn_analysis = turnAnalysis;
    const semanticTransition = semanticTransitionForTurn(text, state, turnAnalysis);
    const previousGoal = state.active_goal;
    const explicitGoal = turnAnalysis.goal;
    if (explicitGoal && explicitGoal !== state.active_goal) {
      if (state.active_goal) state.suspended_goals = [...state.suspended_goals, state.active_goal].slice(-4);
      state.active_goal = explicitGoal;
    }
    turnAnalysis.semantic_transition = semanticTransition;
    turnAnalysis.previous_goal = previousGoal;
    turnAnalysis.active_goal = state.active_goal;
    const repeated = Boolean(text && state.last_message_normalized === text);
    state.repetition_detected = repeated;
    state.repetition_streak = repeated ? state.repetition_streak + 1 : 0;
    state.social_act = socialActFromText(text);
    const factsAdded = [];
    const addFact = (field, value) => factsAdded.push({ field, value });
    if (OCCURRENCE_SIGNAL.test(text) || safetyStateFromText(text)) state.operational_flow_active = true;
    const explicitChannel = input.channel || channelFromText(text);
    const dineOutChannel = turnAnalysis.goal === 'dine_out' ? 'dining_room' : null;
    if (explicitChannel || dineOutChannel) {
      const selectedChannel = explicitChannel || dineOutChannel;
      if (state.channel !== selectedChannel) {
        addFact('channel', selectedChannel);
        state.presented_options = [];
        state.selected_item_id = null;
        state.selected_item_name = null;
        priorPresentedOptions = [];
      }
      state.channel = selectedChannel;
      state.unit_id = input.unit_id || this.defaultUnitForChannel(selectedChannel);
    } else if (input.unit_id) state.unit_id = input.unit_id;
    if (/\b(?:sem (?:fritura|frito|fritos|frita|fritas)|(?:nao|n) (?:quero|curto) (?:nada )?frit[oa]s?)\b/u.test(text) && state.fried !== false) {
      state.fried = false;
      addFact('fried', false);
    }
    if (turnAnalysis.user_repair_signal && /\bquem falou em (?:fritura|frito)|\b(?:nao|n) falei (?:de )?(?:fritura|frito)\b/u.test(text)) {
      state.fried = null;
      state.hospitality_context = Object.freeze({
        ...state.hospitality_context,
        preparation_preferences: Object.freeze(state.hospitality_context.preparation_preferences.filter((value) => value !== 'not_fried'))
      });
      addFact('rejected_attribute', 'fried_preference');
    }
    const ingredientPatterns = [
      ['salmon', /\bsalmao\b/u],
      ['tuna', /\batum\b/u],
      ['white_fish', /\bpeixe branco\b/u]
    ];
    const ingredientMentions = ingredientPatterns.filter(([, pattern]) => pattern.test(text)).map(([ingredient]) => ingredient);
    const excludedMentions = ingredientPatterns.filter(([ingredient, pattern]) => (
      pattern.test(text)
      && new RegExp(`\\b(?:sem|nao quero|evito|evitar)\\s+(?:o |a |de )?${ingredient === 'salmon' ? 'salmao' : (ingredient === 'tuna' ? 'atum' : 'peixe branco')}\\b`, 'u').test(text)
    )).map(([ingredient]) => ingredient);
    const correctsIngredient = /\b(?:na verdade|corrigindo|melhor)\b/u.test(text) && ingredientMentions.length > 0;
    if (ingredientMentions.length) {
      const previous = state.preferred_ingredients;
      state.preferred_ingredients = correctsIngredient
        ? [...new Set(ingredientMentions.filter((ingredient) => !excludedMentions.includes(ingredient)))]
        : [...new Set([...previous, ...ingredientMentions.filter((ingredient) => !excludedMentions.includes(ingredient))])];
      state.excluded_ingredients = [...new Set([...state.excluded_ingredients, ...excludedMentions])];
      if (JSON.stringify(previous) !== JSON.stringify(state.preferred_ingredients)) {
        addFact(correctsIngredient ? 'preferred_ingredients_corrected' : 'preferred_ingredient', state.preferred_ingredients.join(','));
      }
      if (excludedMentions.length) addFact('excluded_ingredient', excludedMentions.join(','));
      state.recommendation_active = true;
    }
    if (avoidsCreamCheese(text) && state.cream_cheese !== 'without') {
      state.cream_cheese = 'without';
      addFact('cream_cheese', 'without');
      state.recommendation_active = true;
    }
    const partySize = partySizeFromText(text);
    if (partySize) {
      if (state.number_of_people !== partySize) addFact('number_of_people', partySize);
      state.number_of_people = partySize;
      state.operational_flow_active = partySize > 8;
      if (partySize <= 8 && !/\b(?:reserva|fila|mesa|chegando)\b/u.test(text)) state.recommendation_active = true;
    }
    const allergy = allergyFromText(text);
    if (allergy) {
      if (!state.allergies.includes(allergy.value)) addFact('allergy', allergy.value);
      state.allergies = [...new Set([...state.allergies, allergy.value])];
      state.allergy_labels[allergy.value] = allergy.label;
    }

    const asksRecommendation = turnAnalysis.goal === 'recommendation'
      || turnAnalysis.food_choice_signal
      || /\b(?:recomend(?:a(?:r|cao)?|e)?|sugest(?:ao|ao|ion)?|opcao|sem fritura|salmao|atum|cream cheese|macaricad[oa])\b/u.test(text);
    const asksPairing = /\b(?:bebida|drink|harmoniza|combina)\b/u.test(text);
    const directMenuRequest = /\b(?:cardapio|menu)\b/u.test(text) && !asksRecommendation;
    if (directMenuRequest) state.direct_menu_request_pending = true;
    else if (asksRecommendation || turnAnalysis.goal === 'reservation') state.direct_menu_request_pending = false;
    if (turnAnalysis.goal === 'menu_discovery') state.recommendation_active = true;
    if (asksRecommendation || asksPairing) state.recommendation_active = true;
    if (turnAnalysis.requested_category) {
      if (state.requested_category !== turnAnalysis.requested_category) addFact('requested_category', turnAnalysis.requested_category);
      state.requested_category = turnAnalysis.requested_category;
      state.recommendation_active = true;
      state.active_goal = 'recommendation';
      turnAnalysis.active_goal = state.active_goal;
    }
    turnAnalysis.requested_category = turnAnalysis.requested_category || state.requested_category;
    const previousHospitality = state.hospitality_context;
    state.hospitality_context = updateHospitalityContext(state.hospitality_context, {
      normalized_text: text,
      channel: state.channel,
      unit_id: state.unit_id,
      number_of_people: state.number_of_people,
      allergies: state.allergies
    });
    if (!previousHospitality.flavor_preferences.includes('light') && state.hospitality_context.flavor_preferences.includes('light')) {
      addFact('light_preference', true);
    }
    if (previousHospitality.occasion !== state.hospitality_context.occasion && state.hospitality_context.occasion) addFact('occasion', state.hospitality_context.occasion);
    if (previousHospitality.desired_experience !== state.hospitality_context.desired_experience && state.hospitality_context.desired_experience) addFact('desired_experience', state.hospitality_context.desired_experience);
    const priorPrimaryPreparation = previousHospitality.preparation_preferences.find((value) => ['raw', 'cooked'].includes(value)) || null;
    const currentPrimaryPreparation = state.hospitality_context.preparation_preferences.find((value) => ['raw', 'cooked'].includes(value)) || null;
    if (priorPrimaryPreparation && currentPrimaryPreparation && priorPrimaryPreparation !== currentPrimaryPreparation) {
      addFact('preparation_preference_corrected', currentPrimaryPreparation);
    }
    const hadNotHotPreference = previousHospitality.preparation_preferences.includes('not_hot');
    const hasNotHotPreference = state.hospitality_context.preparation_preferences.includes('not_hot');
    if (!hadNotHotPreference && hasNotHotPreference) addFact('temperature_preference', 'not_hot');
    if (previousHospitality.occasion !== 'first_visit' && state.hospitality_context.occasion === 'first_visit') {
      addFact('first_visit', true);
    }
    if (state.hospitality_context.occasion || state.hospitality_context.preferred_ingredients.length
      || state.hospitality_context.preparation_preferences.length || state.hospitality_context.budget) {
      state.recommendation_active = true;
    }

    let customerContext = null;
    let menuContext = null;
    let recommendationContext = null;
    let recommendationResult = null;
    if (input.customer_id) {
      const customerResult = this.tools.get_customer_summary({ customer_id: input.customer_id });
      customerContext = customerContextFromSummary(customerResult);
    } else {
      customerContext = customerContextFromSummary(null);
    }
    const profileAllergies = (customerContext?.declared_restrictions || [])
      .filter((item) => item.type === 'allergy' && item.status === 'confirmed' && typeof item.value === 'string')
      .map((item) => item.value);
    if (profileAllergies.length) {
      state.allergies = [...new Set([...state.allergies, ...profileAllergies])];
      for (const value of profileAllergies) state.allergy_labels[value] ||= 'a restrição confirmada no contexto do cliente';
    }
    if (state.allergies.length) {
      customerContext = Object.freeze({
        ...customerContext,
        status: 'partial',
        declared_restrictions: state.allergies.map((value) => ({
          type: 'allergy', value, status: 'confirmed', source: 'current_conversation'
        })),
        unknowns: [...new Set([...(customerContext.unknowns || []), 'cross_contact_confirmation'])]
      });
    }
    if (state.channel && state.unit_id && (state.recommendation_active || input.channel)) {
      const declaredAllergies = (customerContext?.declared_restrictions || [])
        .filter((item) => item.type === 'allergy' && item.status === 'confirmed' && typeof item.value === 'string')
        .map((item) => item.value);
      const request = {
        ...hospitalityRequest(state.hospitality_context),
        channel: state.channel,
        unit_id: state.unit_id,
        fried: state.fried,
        cream_cheese: state.cream_cheese,
        preferred_ingredients: [...state.preferred_ingredients],
        excluded_ingredients: [...state.excluded_ingredients],
        requested_category: state.requested_category,
        number_of_people: state.number_of_people,
        allergies: [...new Set([...(input.allergies || []), ...declaredAllergies])],
        exclude_item_ids: turnAnalysis.questions.includes('more_options')
          ? priorPresentedOptions.map((item) => item.item_id)
          : []
      };
      recommendationResult = this.tools.get_recommendation_candidates({
        customer_id: input.customer_id || null,
        request
      });
      menuContext = menuContextFromRecommendation(recommendationResult, request);
      recommendationContext = recommendationContextFromResult(recommendationResult, state.hospitality_context, turnAnalysis);
      const priorReference = turnAnalysis.resolved_reference
        ? priorPresentedOptions.find((item) => item.item_id === turnAnalysis.resolved_reference.item_id)
        : null;
      const refersToSuggested = /\b(?:opcao que (?:voce )?sugeriu|opcao sugerida|a sugestao)\b/u.test(text);
      const selected = priorReference
        || (refersToSuggested ? priorPresentedOptions[0] || null : null)
        || (state.selected_item_id ? priorPresentedOptions.find((item) => item.item_id === state.selected_item_id) || null : null);
      state.selected_item_id = selected?.item_id || null;
      state.selected_item_name = selected?.name || null;
      state.awaiting_channel = false;
      state.pending_question = null;
      state.channel_question_asked = false;
    } else if (state.recommendation_active) {
      const discoverPreferenceFirst = asksRecommendation
        && !hasRecommendationSelectionSignal(state)
        && !turnAnalysis.questions.includes('price');
      state.awaiting_channel = !discoverPreferenceFirst;
      state.pending_question = discoverPreferenceFirst ? 'food_preference' : 'menu_channel';
      const missingContext = discoverPreferenceFirst ? 'recommendation_preference_missing' : 'menu_channel_missing';
      menuContext = Object.freeze({
        schema_version: 'deliveryos-menu-context-v1',
        status: 'partial',
        channel: 'unknown',
        unit_id: state.unit_id,
        items: [],
        unknowns: [missingContext],
        divergences: [],
        provenance: [this.currentMenuSourceId()]
      });
      recommendationContext = Object.freeze({
        schema_version: 'deliveryos-recommendation-context-v1',
        status: 'partial',
        objectives: ['safe_relevant_menu_guidance'],
        constraints: [],
        candidate_item_ids: [],
        unknowns: [missingContext],
        customer_goal: turnAnalysis.goal,
        questions_answerable_now: [],
        unresolved_reference: turnAnalysis.unresolved_reference,
        hospitality_context: state.hospitality_context
      });
    }

    let pairing = null;
    if (asksPairing && state.selected_item_id && state.channel && !turnAnalysis.unresolved_reference) {
      const result = this.tools.get_pairing_candidates({
        item_id: state.selected_item_id,
        channel: state.channel,
        unit_id: state.unit_id
      });
      const pair = result.data?.pairings?.[0] || null;
      pairing = pair
        ? {
            status: 'ready',
            menu_item_id: pair.menu_item_id,
            menu_item_name: state.selected_item_name,
            beverage_item_id: pair.beverage_item_id,
            beverage_item_name: this.tools.get_menu_item_details({ item_id: pair.beverage_item_id }).data.name,
            source: pair.source_id
          }
        : { status: 'not_found' };
    }

    state.facts_added = factsAdded;
    let guidance = this.guidanceForChat({
      text,
      input,
      state,
      allergy,
      asksRecommendation,
      asksPairing,
      menuContext,
      recommendationResult,
      pairing,
      turnAnalysis,
      priorPresentedOptions
    });
    const explicitOperationalSwitch = turnAnalysis.goal === 'reservation';
    if (explicitOperationalSwitch) {
      guidance = null;
      menuContext = null;
      recommendationContext = null;
    }
    if (guidance?.question) {
      const questionKey = normalizeChatText(guidance.question);
      const resumableChannelQuestion = ['menu_channel_required', 'journey_greeting_resume'].includes(guidance.mode);
      if (state.guidance_questions_asked.includes(questionKey) && !resumableChannelQuestion) {
        guidance = Object.freeze({ ...guidance, question: null });
      } else if (!state.guidance_questions_asked.includes(questionKey)) {
        state.guidance_questions_asked = [...state.guidance_questions_asked, questionKey];
      }
    }
    if (guidance?.question && state.awaiting_channel) state.channel_question_asked = true;
    if (['menu_candidates', 'compound_recommendation', 'decision_support_current_candidates', 'category_correction', 'more_recommendation_options'].includes(guidance?.mode)) {
      const publishedIds = new Set(guidance.candidates_found || []);
      state.presented_options = (menuContext?.items || []).filter((item) => publishedIds.has(item.item_id)).map((item) => ({
        item_id: item.item_id,
        name: item.name,
        price: item.price ?? null
      }));
    }
    state.last_message_normalized = text;
    this.chatContexts.set(conversationId, state);
    return {
      customer_context: customerContext,
      menu_context: menuContext,
      recommendation_context: recommendationContext,
      hospitality_context: state.hospitality_context,
      conversation_guidance: guidance,
      conversation_state: {
        social_act: state.social_act,
        pending_question: state.pending_question,
        channel: state.channel,
        preferences: {
          preferred_ingredients: [...state.preferred_ingredients],
          excluded_ingredients: [...state.excluded_ingredients],
          fried: state.fried,
          cream_cheese: state.cream_cheese
        },
        requested_category: state.requested_category,
        active_goal: state.active_goal,
        semantic_transition: semanticTransition,
        user_repair_signal: turnAnalysis.user_repair_signal,
        negative_feedback_signal: turnAnalysis.negative_feedback_signal,
        turn_analysis: state.turn_analysis,
        repetition_detected: state.repetition_detected,
        repetition_streak: state.repetition_streak,
        facts_added: [...state.facts_added]
      },
      source_summary: {
        customer: input.customer_id ? 'customer_intelligence_synthetic' : 'anonymous_synthetic_session',
        menu: menuContext
          ? (this.catalogMode.startsWith('real_') ? 'menu_intelligence_verified_official_public_source' : 'menu_intelligence_synthetic')
          : 'none'
      }
    };
  }

  candidateDecisionSupport(candidates, state, options = {}) {
    const seenNames = new Set();
    const detailed = candidates.map((candidate) => ({
      ...candidate,
      details: this.tools.get_menu_item_details({ item_id: candidate.item_id }).data
    })).filter((item) => {
      const key = normalizeChatText(item.name);
      if (seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    }).slice(0, options.limit || candidates.length);
    if (!detailed.length) return [];
    const names = detailed.map((item) => item.name);
    const joinedNames = names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : names[0];
    const preferenceReasons = [];
    if (state.requested_category) preferenceReasons.push(state.requested_category.replace('_', ' '));
    if (state.preferred_ingredients.includes('salmon')) preferenceReasons.push('salmão');
    if (state.hospitality_context.preparation_preferences.includes('not_hot')) preferenceReasons.push('fora da seção de pratos quentes');
    if (state.fried === false) preferenceReasons.push('fritura como restrição');
    if (state.cream_cheese === 'without') preferenceReasons.push('cream cheese como restrição');
    const relation = preferenceReasons.length
      ? `Com base em ${preferenceReasons.join(', ')}, separei ${joinedNames}`
      : `Separei ${joinedNames}`;
    const lines = [`${relation} no cardápio do ${state.channel === 'ifood' ? 'iFood' : (state.channel === 'dining_room' ? 'salão' : 'delivery próprio')}.`];
    const salmonNames = detailed.filter((item) => item.details.ingredients.some((ingredient) => ingredient.name === 'salmon')).map((item) => item.name);
    if (!options.compact && state.preferred_ingredients.includes('salmon') && salmonNames.length) {
      lines.push(salmonNames.length === detailed.length
        ? 'Todas têm salmão confirmado na descrição.'
        : `${salmonNames.join(' e ')} ${salmonNames.length > 1 ? 'têm' : 'tem'} salmão confirmado na descrição.`);
    }
    const fried = detailed.filter((item) => item.details.preparation.fried === true).map((item) => item.name);
    if (state.fried === false) {
      const notFried = detailed.filter((item) => item.details.preparation.fried === false).map((item) => item.name);
      const fryingUnknown = detailed.filter((item) => item.details.preparation.fried === null).map((item) => item.name);
      if (notFried.length) lines.push(`${notFried.join(' e ')} ${notFried.length > 1 ? 'têm' : 'tem'} preparo sem fritura confirmado.`);
      if (fryingUnknown.length) lines.push('Nas demais opções, o cardápio não confirma o método de preparo como sem fritura.');
    }
    if (state.hospitality_context.flavor_preferences.includes('light')) {
      lines.push(options.compact
        ? (fried.length
          ? `Não consigo afirmar leveza; ${fried.join(' e ')} ${fried.length > 1 ? 'têm' : 'tem'} fritura informada, e os demais preparos estão incompletos.`
          : 'O cardápio não confirma qual opção é mais leve.')
        : (fried.length
          ? `Não consigo afirmar qual é realmente mais leve; ${fried.join(' e ')} ${fried.length > 1 ? 'têm' : 'tem'} fritura informada, e os demais detalhes de preparo não estão completos.`
          : 'Não consigo afirmar qual é realmente mais leve porque o cardápio não detalha esse atributo.'));
    }
    if (state.cream_cheese === 'without') {
      const confirmedWithout = detailed.filter((item) => item.details.preparation.cream_cheese === false).map((item) => item.name);
      const unknown = detailed.filter((item) => item.details.preparation.cream_cheese === null).map((item) => item.name);
      if (confirmedWithout.length) lines.push(`${confirmedWithout.join(' e ')} ${confirmedWithout.length > 1 ? 'têm' : 'tem'} ausência de cream cheese confirmada na composição.`);
      if (unknown.length) lines.push('A presença de cream cheese não está confirmada nessas opções.');
    }
    if (state.hospitality_context.preparation_preferences.includes('not_hot')) {
      lines.push('Excluí a seção explicitamente identificada como Pratos Quentes. Nas demais opções, o cardápio não confirma a temperatura; por isso, não vou chamá-las de frias sem confirmação.');
    }
    if (options.includePrices) {
      const prices = detailed.map((item) => {
        const price = formatPrice(item.price);
        return price ? `${item.name}: ${price}` : null;
      }).filter(Boolean);
      if (prices.length) lines.push(`${options.compact ? 'Preços' : 'Os preços informados são'}: ${prices.join('; ')}.`);
    }
    if (options.includeAvailability === true && detailed.some((item) => item.availability?.state === 'unknown')) {
      lines.push('A disponibilidade precisa ser conferida no canal antes de fechar o pedido.');
    }
    return lines;
  }

  recommendationExplanation(options, state) {
    if (!options.length) {
      return {
        answer: 'Ainda não apresentei opções suficientes para explicar uma escolha sem inventar um critério.',
        question: 'Você quer que eu afunile por sushi, sashimi ou tipo de preparo?'
      };
    }
    const names = options.map((item) => item.name);
    const joinedNames = names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : names[0];
    const facts = [];
    if (state.requested_category) facts.push(`você pediu ${state.requested_category.replace('_', ' ')}`);
    if (state.preferred_ingredients.includes('salmon')) facts.push('você disse que prefere salmão');
    if (state.hospitality_context.preparation_preferences.includes('not_hot')) facts.push('você pediu para excluir a seção de pratos quentes');
    if (state.fried === false) facts.push('você pediu para evitar fritura');
    if (state.cream_cheese === 'without') facts.push('você pediu para evitar cream cheese');
    if (!facts.length) {
      return {
        answer: `Eu ainda não tenho uma preferência sua que diferencie ${joinedNames}. Em vez de inventar um motivo, preciso de um critério simples.`,
        question: 'O que pesa mais para você agora: ingrediente, preparo ou tipo de prato?'
      };
    }
    return {
      answer: `Separei ${joinedNames} porque ${facts.join(' e ')}. Usei apenas essas preferências e os dados confirmados deste cardápio.`,
      question: null
    };
  }

  concisePriceAnswer(options = []) {
    const prices = options.slice(0, 3).map((option) => {
      const detail = this.tools.get_menu_item_details({ item_id: option.item_id }).data;
      const price = formatPrice(detail.price);
      return price ? `${detail.name}: ${price}` : `${detail.name}: preço não confirmado`;
    });
    return prices.length ? `Os valores informados são ${prices.join('; ')}.` : 'Ainda não há uma opção anterior com preço para comparar.';
  }

  decisionSupportForOptions(options, state) {
    const detailed = options.slice(0, 3).map((option) => this.tools.get_menu_item_details({ item_id: option.item_id }).data);
    const choose = (item, reason) => {
      state.selected_item_id = item.item_id;
      state.selected_item_name = item.name;
      return { answer: `Pelo que você me contou, eu começaria por ${item.name}, ${reason}`, question: null };
    };
    const torched = detailed.find((item) => item.preparation.torched === true);
    if (state.hospitality_context.preparation_preferences.includes('torched') && torched) return choose(torched, 'porque é a opção com preparo maçaricado confirmado entre estas.');
    const notFried = detailed.find((item) => item.preparation.fried === false);
    if (state.fried === false && notFried) return choose(notFried, 'porque é a opção com preparo sem fritura confirmado entre estas.');
    const withoutCream = detailed.find((item) => item.preparation.cream_cheese === false);
    if (state.cream_cheese === 'without' && withoutCream) return choose(withoutCream, 'porque a composição sem cream cheese está confirmada.');
    if (state.number_of_people >= 4) {
      const enough = detailed.find((item) => Number(item.quantity?.people) >= state.number_of_people);
      if (enough) return choose(enough, `porque a quantidade informada atende ${state.number_of_people} pessoas.`);
      return {
        answer: `Para ${state.number_of_people} pessoas, eu não fecharia a escolha só com ${detailed.map((item) => item.name).join(', ')}: o cardápio não confirma que sejam suficientes. Faz mais sentido procurar por quantidade ou montar mais de uma opção.`,
        question: 'Você quer que eu procure combinados por quantidade ou ajude a montar mais de uma opção?'
      };
    }
    const fried = detailed.filter((item) => item.preparation.fried === true);
    const cheapest = detailed.filter((item) => Number.isFinite(Number(item.price))).sort((a, b) => Number(a.price) - Number(b.price))[0];
    if (state.hospitality_context.flavor_preferences.includes('light')) {
      if (notFried) return choose(notFried, 'porque o preparo sem fritura está confirmado; ainda assim, o cardápio não permite afirmar que seja a mais leve.');
      return {
        answer: `Entre ${detailed.map((item) => item.name).join(', ')}, ${fried.length ? `${fried.map((item) => item.name).join(' e ')} têm fritura informada; ` : ''}o preparo das demais não está detalhado o suficiente para eu chamar alguma de mais leve. Se você quer leveza, eu afunilaria pelo tipo de preparo.`,
        question: 'Você quer que eu afunile por cru, maçaricado ou sem fritura?'
      };
    }
    const parts = [];
    if (fried.length) parts.push(`${fried.map((item) => item.name).join(' e ')} têm fritura confirmada`);
    if (cheapest) parts.push(`${cheapest.name} tem o menor preço informado, ${formatPrice(cheapest.price)}`);
    return {
      answer: `${parts.join('; ')}. Sem saber se você quer priorizar preço ou tipo de preparo, eu não escolheria uma por você.`,
      question: 'Qual desses dois critérios pesa mais?'
    };
  }

  referenceAnswers(turnAnalysis, pairing = null) {
    const reference = turnAnalysis.resolved_reference;
    if (!reference) return [];
    const item = this.tools.get_menu_item_details({ item_id: reference.item_id }).data;
    const label = reference.position === 1 ? 'primeira opção' : (reference.position === 2 ? 'segunda opção' : 'terceira opção');
    const answers = [];
    if (turnAnalysis.questions.includes('raw_preparation')) {
      if (item.preparation.raw === true) answers.push(`A ${label}, ${item.name}, tem preparo cru confirmado.`);
      else if (item.preparation.raw === false) answers.push(`A ${label}, ${item.name}, não tem preparo cru.`);
      else answers.push(`O cardápio não confirma se a ${label}, ${item.name}, é crua.`);
    }
    if (turnAnalysis.questions.includes('price')) {
      const price = formatPrice(item.price);
      answers.push(price ? `O preço informado para ${item.name} é ${price}.` : `O preço de ${item.name} não está confirmado.`);
    }
    if (turnAnalysis.questions.includes('drink_pairing')) {
      answers.push(pairing?.status === 'ready'
        ? `${pairing.beverage_item_name} é a harmonização revisada para ${item.name}.`
        : `Ainda não há uma bebida revisada para harmonizar com ${item.name}.`);
    }
    if (turnAnalysis.questions.includes('fried_preparation')) {
      if (item.preparation.fried === true) answers.push(`A ${label}, ${item.name}, tem fritura confirmada.`);
      else if (item.preparation.fried === false) answers.push(`A ${label}, ${item.name}, não tem fritura.`);
      else answers.push(`O cardápio não confirma se a ${label}, ${item.name}, é frita.`);
    }
    return answers;
  }

  groupReferenceAnswers(turnAnalysis) {
    const ids = turnAnalysis.resolved_group_reference?.item_ids || [];
    if (!ids.length || !turnAnalysis.questions.includes('raw_preparation')) return [];
    const items = ids.map((itemId) => this.tools.get_menu_item_details({ item_id: itemId }).data);
    const raw = items.filter((item) => item.preparation.raw === true).map((item) => item.name);
    const notRaw = items.filter((item) => item.preparation.raw === false).map((item) => item.name);
    const unknown = items.filter((item) => item.preparation.raw === null).map((item) => item.name);
    const answers = [];
    if (raw.length) answers.push(`${raw.join(' e ')} ${raw.length > 1 ? 'têm' : 'tem'} preparo cru confirmado.`);
    if (notRaw.length) answers.push(`${notRaw.join(' e ')} ${notRaw.length > 1 ? 'não são descritas' : 'não é descrita'} como crua.`);
    if (unknown.length) answers.push('Para as demais opções, o cardápio não confirma se o preparo é cru.');
    return answers;
  }

  guidanceForChat({ text, state, allergy, asksRecommendation, asksPairing, menuContext, recommendationResult, pairing, turnAnalysis, priorPresentedOptions }) {
    if (state.operational_flow_active || OCCURRENCE_SIGNAL.test(text)) return null;
    const candidates = menuContext?.items || [];
    const menuLabel = this.currentMenuLabel();
    const menuSource = this.currentMenuSourceId(state.channel);
    const publishesRealItems = this.catalogMode.startsWith('real_');
    const activeAllergyValue = allergy?.value || state.allergies[0] || null;
    const activeAllergy = activeAllergyValue
      ? { value: activeAllergyValue, label: allergy?.label || state.allergy_labels[activeAllergyValue] || 'a restrição informada' }
      : null;
    const channelQuestion = MENU_CHANNEL_QUESTION;
    const isGreetingOnly = greetingOnly(text);
    const repeatedQuestion = MENU_CHANNEL_REPEAT_QUESTIONS[state.repetition_streak % MENU_CHANNEL_REPEAT_QUESTIONS.length];
    const resumeQuestion = state.awaiting_channel
      ? (!state.channel_question_asked ? channelQuestion
        : (isGreetingOnly ? 'Você prefere salão, iFood ou delivery próprio?'
          : (state.repetition_detected ? repeatedQuestion : null)))
      : null;
    if (turnAnalysis.goal === 'reservation') return null;
    if (turnAnalysis.negative_feedback_signal) {
      const category = state.requested_category ? state.requested_category.replace('_', ' ') : null;
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1',
        mode: 'interaction_repair',
        direct_answers: [category
          ? `Você tem razão em apontar isso. Eu saí do que você pediu; vou ficar em ${category}.`
          : 'Você tem razão em apontar isso. Eu saí do que você pediu e vou corrigir o rumo.'],
        question: category ? 'Você prefere uma opção individual ou um combinado?' : 'Qual parte do seu pedido você quer que eu retome agora?',
        context_reason: 'negative_feedback_repair',
        knowledge_source: 'current_conversation',
        candidates_found: []
      });
    }
    if (turnAnalysis.goal === 'dine_out') {
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1',
        mode: 'restaurant_discovery',
        direct_answers: ['Posso ajudar você a planejar uma ida ao TATÁ hoje, seja para escolher a unidade, consultar o endereço ou entender como reservar.'],
        question: 'Você já sabe em qual unidade quer ir?',
        context_reason: 'dine_out_intent',
        knowledge_source: 'current_conversation',
        candidates_found: []
      });
    }
    if (state.direct_menu_request_pending && state.channel) {
      const source = this.currentPublicMenuSource(state.channel);
      const channelLabel = state.channel === 'dining_room' ? 'salão' : (state.channel === 'ifood' ? 'iFood' : 'delivery próprio');
      state.direct_menu_request_pending = false;
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1',
        mode: 'direct_menu_link',
        direct_answers: [source
          ? `Este é o cardápio do ${channelLabel}: ${source.location}`
          : `O link do cardápio do ${channelLabel} ainda não está confirmado nesta fonte.`],
        question: null,
        context_reason: source ? null : 'channel_menu_link_unknown',
        knowledge_source: source?.source_id || menuSource,
        candidates_found: []
      });
    }
    if (state.pending_question === 'food_preference' && !state.channel) {
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1',
        mode: 'food_preference_discovery',
        direct_answers: ['Claro — eu te ajudo a afunilar pelo que você está com vontade.'],
        question: foodPreferenceDiscoveryQuestion(state),
        context_reason: 'recommendation_preference_missing',
        knowledge_source: 'current_conversation',
        candidates_found: []
      });
    }
    if (turnAnalysis.user_repair_signal && state.requested_category) {
      const category = state.requested_category.replace('_', ' ');
      if (candidates.length) {
        const direct = this.candidateDecisionSupport(candidates, state, { includeAvailability: false });
        return Object.freeze({
          schema_version: 'deliveryos-homologation-guidance-v1',
          mode: 'category_correction',
          direct_answers: [`Entendi a correção: você pediu ${category}. ${direct.join(' ')}`],
          question: null,
          context_reason: 'user_repair_applied',
          knowledge_source: menuSource,
          candidates_found: candidates.map((item) => item.item_id)
        });
      }
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1',
        mode: 'category_correction',
        direct_answers: [`Entendi a correção: você pediu ${category}. Não vou ampliar para outras categorias só para preencher opções.`],
        question: state.awaiting_channel ? resumeQuestion : 'Você quer que eu procure outra opção dentro dessa categoria?',
        context_reason: 'category_candidate_not_confirmed',
        knowledge_source: menuSource,
        candidates_found: []
      });
    }
    if (turnAnalysis.user_repair_signal) {
      const dineOutRepair = state.active_goal === 'dine_out';
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1',
        mode: 'interaction_repair',
        direct_answers: [dineOutRepair
          ? 'Entendi a correção: você quer um lugar para comer hoje, e eu posso ajudar a planejar uma ida ao TATÁ.'
          : 'Entendi a correção. Vou deixar de lado a interpretação anterior e retomar o que você pediu.'],
        question: dineOutRepair ? 'Você quer ver a unidade e o endereço ou prefere partir para uma reserva?' : null,
        context_reason: 'user_repair_applied',
        knowledge_source: 'current_conversation',
        candidates_found: []
      });
    }
    if (turnAnalysis.goal === 'menu_discovery' && activeAllergy) {
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1',
        mode: 'first_visit_with_allergy',
        direct_answers: [`Eu te ajudo a escolher sem exigir que você conheça os nomes. Também vou considerar ${activeAllergy.label} como restrição preventiva; a composição e o risco de contaminação cruzada precisam ser confirmados com a equipe antes do pedido.`],
        question: resumeQuestion,
        context_reason: 'first_visit_preventive_allergy',
        knowledge_source: `current_conversation+${menuSource}`,
        candidates_found: []
      });
    }
    if (turnAnalysis.goal === 'menu_discovery') {
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1',
        mode: 'first_visit',
        direct_answers: ['Eu te ajudo a escolher sem precisar conhecer os nomes do cardápio. Podemos começar por algo mais familiar e cozido ou explorar peixe cru, sempre um passo por vez.'],
        question: 'Você prefere começar por algo mais familiar e cozido ou topa experimentar peixe cru?',
        context_reason: 'first_visit_menu_discovery',
        knowledge_source: 'current_conversation',
        candidates_found: []
      });
    }
    if (activeAllergy) {
      const decisionUnderAllergy = turnAnalysis.questions.includes('decision_support');
      const changedChannel = state.facts_added.some((fact) => fact.field === 'channel');
      const asksPrice = turnAnalysis.questions.includes('price');
      const asksDrink = turnAnalysis.questions.includes('drink_pairing');
      const directAnswer = decisionUnderAllergy
        ? `Com ${activeAllergy.label} como restrição ativa, eu não escolheria entre essas opções sem a confirmação da equipe. O ${menuLabel} não confirma ausência de contaminação cruzada nem garante o preparo seguro.`
        : (changedChannel
          ? `Mudei a consulta para ${state.channel === 'dining_room' ? 'o salão' : (state.channel === 'ifood' ? 'o iFood' : 'o delivery próprio')}, mantendo ${activeAllergy.label} como restrição. Antes de indicar algo neste canal, a equipe precisa confirmar composição e risco de contaminação cruzada.`
          : (asksPrice
            ? `Posso consultar preço depois de existir uma opção compatível, mas com ${activeAllergy.label} ativa eu não vou recuperar as opções anteriores como se fossem seguras. A composição e o preparo precisam ser confirmados primeiro.`
            : (asksDrink
              ? `Posso ajudar com bebida depois da confirmação da equipe. Com ${activeAllergy.label} ativa, não vou sugerir harmonização antes de confirmar composição e risco de contaminação cruzada.`
              : `Vou considerar ${activeAllergy.label} como uma restrição preventiva nesta conversa. O ${menuLabel} não confirma ausência de contaminação cruzada; por isso, a composição e o preparo precisam ser confirmados com a equipe antes do pedido.`)));
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1',
        mode: 'preventive_allergy',
        direct_answers: [directAnswer],
        question: resumeQuestion,
        context_reason: 'preventive_allergy_declared',
        knowledge_source: `current_conversation+${menuSource}`,
        candidates_found: []
      });
    }
    if (turnAnalysis.resolved_reference && turnAnalysis.questions.some((question) => ['raw_preparation', 'fried_preparation', 'price', 'drink_pairing'].includes(question))) {
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1',
        mode: 'resolved_option_questions',
        direct_answers: this.referenceAnswers(turnAnalysis, pairing),
        question: null,
        context_reason: null,
        knowledge_source: menuSource,
        candidates_found: [turnAnalysis.resolved_reference.item_id]
      });
    }
    if (turnAnalysis.resolved_reference && !turnAnalysis.questions.length) {
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1', mode: 'resolved_option_identification',
        direct_answers: [`A opção indicada é ${turnAnalysis.resolved_reference.name}.`],
        question: null, context_reason: null, knowledge_source: menuSource,
        candidates_found: [turnAnalysis.resolved_reference.item_id]
      });
    }
    if (turnAnalysis.resolved_group_reference && turnAnalysis.questions.includes('raw_preparation')) {
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1',
        mode: 'resolved_group_questions',
        direct_answers: this.groupReferenceAnswers(turnAnalysis),
        question: null,
        context_reason: null,
        knowledge_source: menuSource,
        candidates_found: [...turnAnalysis.resolved_group_reference.item_ids]
      });
    }
    if (turnAnalysis.unresolved_reference && !turnAnalysis.questions.includes('recommendation')) {
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1',
        mode: 'missing_option_reference',
        direct_answers: ['Ainda não havia uma lista anterior, então não consigo identificar qual seria a segunda opção sem inventar.'],
        question: 'Você quer que eu apresente algumas opções para comparar?',
        context_reason: 'option_reference_missing',
        knowledge_source: 'current_conversation',
        candidates_found: []
      });
    }
    if (turnAnalysis.questions.includes('recommendation_explanation')) {
      const explanation = this.recommendationExplanation(priorPresentedOptions, state);
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1', mode: 'recommendation_explanation',
        direct_answers: [explanation.answer], question: explanation.question,
        context_reason: explanation.question ? 'recommendation_criterion_missing' : null,
        knowledge_source: priorPresentedOptions.length ? menuSource : 'current_conversation',
        candidates_found: priorPresentedOptions.map((item) => item.item_id)
      });
    }
    if (turnAnalysis.questions.includes('more_options')) {
      if (candidates.length) {
        const direct = this.candidateDecisionSupport(candidates, state, { includeAvailability: false });
        return Object.freeze({
          schema_version: 'deliveryos-homologation-guidance-v1', mode: 'more_recommendation_options',
          direct_answers: [direct.join(' ')], question: null,
          context_reason: null, knowledge_source: menuSource,
          candidates_found: candidates.map((item) => item.item_id)
        });
      }
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1', mode: 'more_recommendation_options',
        direct_answers: ['Não encontrei outras opções confirmadas com os mesmos filtros neste cardápio.'],
        question: 'Você quer mudar algum ingrediente, preparo ou tipo de prato?',
        context_reason: 'additional_compatible_candidate_not_found', knowledge_source: menuSource,
        candidates_found: []
      });
    }
    if (turnAnalysis.questions.includes('decision_support') && priorPresentedOptions.length) {
      const support = this.decisionSupportForOptions(priorPresentedOptions, state);
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1', mode: 'decision_support',
        direct_answers: [support.answer], question: support.question,
        context_reason: null, knowledge_source: menuSource,
        candidates_found: priorPresentedOptions.map((item) => item.item_id)
      });
    }
    if (turnAnalysis.questions.includes('decision_support') && candidates.length) {
      const support = this.decisionSupportForOptions(candidates.slice(0, 3), state);
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1', mode: 'decision_support_current_candidates',
        direct_answers: [support.answer], question: support.question,
        context_reason: null, knowledge_source: menuSource,
        candidates_found: candidates.slice(0, 3).map((item) => item.item_id)
      });
    }
    if (turnAnalysis.questions.length === 1
      && turnAnalysis.questions[0] === 'price'
      && priorPresentedOptions.length
      && !namesIndependentOperationalPriceTarget(text)) {
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1', mode: 'concise_price',
        direct_answers: [this.concisePriceAnswer(priorPresentedOptions)], question: null,
        context_reason: null, knowledge_source: menuSource,
        candidates_found: priorPresentedOptions.map((item) => item.item_id)
      });
    }
    if (isGreetingOnly && state.awaiting_channel && state.recommendation_active) {
      const ingredient = state.preferred_ingredients.includes('salmon') ? 'algo com salmão' : 'uma opção do cardápio';
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1', mode: 'journey_greeting_resume',
        direct_answers: [`Seguimos escolhendo ${ingredient}.`], question: resumeQuestion,
        context_reason: 'menu_channel_missing', knowledge_source: menuSource, candidates_found: []
      });
    }
    if (/\b(?:comparar|comparacao).*(?:salao).*(?:ifood)|\bprecos? (?:sao )?iguais\b/u.test(text)) {
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1', mode: 'channel_comparison',
        direct_answers: ['Salão e iFood são catálogos separados, e o preço pode variar entre eles.'],
        question: 'Qual item você quer comparar?', context_reason: 'item_for_channel_comparison_missing',
        knowledge_source: 'menu-public-source-coverage-2026-08-01', candidates_found: []
      });
    }
    if (turnAnalysis.questions.length >= 2 && candidates.length) {
      const direct = this.candidateDecisionSupport(candidates, state, {
        includePrices: turnAnalysis.questions.includes('price'),
        includeAvailability: false,
        limit: 2,
        compact: true
      });
      if (turnAnalysis.unresolved_reference) {
        direct.push('Como ainda não havia uma lista anterior, não consigo afirmar qual seria a segunda opção nem se ela é crua.');
      }
      if (turnAnalysis.questions.includes('drink_pairing')) {
        direct.push('Ainda não há uma harmonização de bebida revisada para essas opções.');
      }
      const question = turnAnalysis.preferences.avoid_cream_cheese
        ? 'Você quer que eu procure uma opção com composição mais detalhada?'
        : (turnAnalysis.preferences.light ? 'Você prefere que eu afunile por cru, maçaricado ou sem fritura?' : null);
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1', mode: 'compound_recommendation',
        direct_answers: [direct.join(' ')], question, context_reason: turnAnalysis.unresolved_reference ? 'option_reference_missing' : null,
        knowledge_source: menuSource, candidates_found: candidates.map((item) => item.item_id)
      });
    }
    if (asksPairing) {
      if (!publishesRealItems) {
        return Object.freeze({
          schema_version: 'deliveryos-homologation-guidance-v1', mode: 'pairing_pending',
          direct_answers: ['Posso preservar sua preferência, mas ainda não há uma harmonização revisada e liberada para eu indicar com segurança.'],
          question: resumeQuestion, context_reason: state.awaiting_channel ? 'menu_channel_missing' : 'pairing_not_approved',
          knowledge_source: menuSource, candidates_found: []
        });
      }
      if (pairing?.status === 'ready') {
        return Object.freeze({
          schema_version: 'deliveryos-homologation-guidance-v1', mode: 'pairing',
          direct_answers: [`No ${menuLabel}, ${pairing.beverage_item_name} é uma harmonização aprovada para ${pairing.menu_item_name}.`],
          question: null, context_reason: null, knowledge_source: pairing.source,
          candidates_found: [pairing.menu_item_id, pairing.beverage_item_id]
        });
      }
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1', mode: 'pairing_pending',
        direct_answers: [state.selected_item_id
          ? `Ainda não há uma bebida revisada para harmonizar com ${state.selected_item_name}.`
          : (priorPresentedOptions.length
            ? 'Ainda não há uma opção escolhida para eu consultar a harmonização.'
            : 'Ainda não existe uma opção sugerida nesta conversa para eu consultar uma harmonização revisada.')],
        question: state.selected_item_id ? resumeQuestion : (priorPresentedOptions.length ? 'Qual das opções você quer harmonizar?' : resumeQuestion),
        context_reason: state.awaiting_channel ? 'menu_channel_missing' : 'pairing_not_approved',
        knowledge_source: menuSource, candidates_found: []
      });
    }
    if (state.recommendation_active && state.facts_added.some((fact) => fact.field === 'number_of_people') && state.number_of_people) {
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1', mode: 'party_size_update',
        direct_answers: [state.recommendation_active && state.number_of_people >= 4
          ? `Certo — agora são ${state.number_of_people} pessoas. As opções anteriores não têm quantidade confirmada para esse grupo, então não vou tratá-las como suficientes.`
          : (state.recommendation_active
            ? `Certo — vou considerar ${state.number_of_people} pessoas ao calcular a sugestão.`
            : `Entendi que são ${state.number_of_people} pessoas.`)],
        question: state.recommendation_active && state.number_of_people >= 4
          ? 'Você quer que eu procure combinados por quantidade ou ajude a montar mais de uma opção?'
          : (state.recommendation_active ? resumeQuestion : `As ${state.number_of_people} pessoas são para uma reserva ou para calcular uma sugestão de pedido?`),
        context_reason: state.recommendation_active ? null : 'party_size_reference_missing',
        knowledge_source: 'current_conversation', candidates_found: candidates.map((item) => item.item_id)
      });
    }
    const preparationChange = state.facts_added.find((fact) => ['preparation_preference_corrected', 'temperature_preference'].includes(fact.field));
    if (preparationChange && state.recommendation_active) {
      const current = state.hospitality_context.preparation_preferences;
      if (preparationChange.value === 'not_hot') {
        return Object.freeze({
          schema_version: 'deliveryos-homologation-guidance-v1', mode: 'temperature_preference_update',
          direct_answers: ['Entendi — retirei da busca a seção explicitamente identificada como Pratos Quentes. Nos demais itens, o cardápio não confirma a temperatura; por isso, não vou chamar nenhum deles de frio sem confirmação.'],
          question: state.requested_category ? null : 'Você prefere que eu afunile por sushi, sashimi ou outra categoria?',
          context_reason: 'temperature_unconfirmed_outside_explicit_hot_section',
          knowledge_source: menuSource, candidates_found: candidates.map((item) => item.item_id)
        });
      }
      const label = current.includes('cooked') ? 'cozido ou quente' : (current.includes('raw') ? 'cru' : 'com o preparo informado');
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1', mode: 'preparation_preference_update',
        direct_answers: [`Certo — ajustei a busca para algo ${label}. ${candidates.length ? 'Vou considerar somente as opções compatíveis neste canal.' : 'Ainda não encontrei uma opção compatível neste canal sem contrariar os outros filtros.'}`],
        question: null, context_reason: candidates.length ? null : 'no_compatible_menu_candidate',
        knowledge_source: menuSource, candidates_found: candidates.map((item) => item.item_id)
      });
    }
    const experienceChange = [...state.facts_added].reverse().find((fact) => ['occasion', 'desired_experience'].includes(fact.field));
    if (experienceChange && state.recommendation_active) {
      const explanations = {
        traditional_preference: 'Entendi que você prefere algo mais tradicional. Como o cardápio não classifica os pratos dessa forma, vou afunilar por composição e preparo confirmados.',
        adventurous_preference: 'Você quer explorar algo diferente. Vou procurar variedade pela composição descrita, sem chamar um prato de ousado sem essa informação.',
        premium_experience: 'Você quer uma experiência mais especial. Vou usar composição, quantidade e preço confirmados para comparar, porque o cardápio não certifica o que é premium.',
        budget_conscious: 'Você quer algo mais em conta. Nesse caso, vou comparar apenas os preços confirmados deste canal, sem misturar salão e delivery.',
        sharing: 'Entendi que é para compartilhar. Vou considerar apenas quantidades descritas no cardápio e não presumir que uma porção seja suficiente.',
        small_portion: 'Você quer uma porção menor. Vou procurar quantidade descrita e avisar quando esse dado não estiver confirmado.',
        substantial_meal: 'Você quer algo mais bem servido. Vou usar somente quantidades confirmadas e não presumir tamanho pela descrição.'
      };
      const explanation = explanations[experienceChange.value];
      if (explanation) {
        return Object.freeze({
          schema_version: 'deliveryos-homologation-guidance-v1', mode: 'experience_preference_update',
          direct_answers: [explanation],
          question: state.awaiting_channel ? resumeQuestion : null,
          context_reason: 'experience_label_requires_verified_criteria', knowledge_source: menuSource,
          candidates_found: candidates.map((item) => item.item_id)
        });
      }
    }
    if (/\bvalet\b/u.test(text) && state.recommendation_active) {
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1', mode: 'side_information',
        direct_answers: [], question: resumeQuestion, context_reason: null,
        knowledge_source: 'TATA_OPERATIONAL_PUBLIC_INFO_V1', candidates_found: candidates.map((item) => item.item_id)
      });
    }
    if (asksRecommendation || state.recommendation_active) {
      if (state.awaiting_channel) {
        const statesSpecificPreference = /\b(?:salmao|cream cheese)\b/u.test(text);
        const greeted = socialActFromText(text) === 'greeting';
        const direct = state.repetition_detected
          ? 'Claro — para consultar o cardápio certo, preciso confirmar o canal.'
          : (greeted ? `${greetingLabel(text)} Claro.`
            : (statesSpecificPreference || state.fried === false
              ? 'Claro.'
              : 'Vamos escolher uma opção adequada.'));
        return Object.freeze({
          schema_version: 'deliveryos-homologation-guidance-v1', mode: 'menu_channel_required',
          direct_answers: [direct],
          question: resumeQuestion, context_reason: 'menu_channel_missing',
          knowledge_source: menuSource, candidates_found: []
        });
      }
      if (recommendationResult?.data?.status === 'needs_preference') {
        return Object.freeze({
          schema_version: 'deliveryos-homologation-guidance-v1', mode: 'food_preference_discovery',
          direct_answers: [`Perfeito — vou considerar somente o ${menuLabel}. Antes de escolher itens ao acaso, quero afunilar pelo que você está com vontade.`],
          question: foodPreferenceDiscoveryQuestion(state),
          context_reason: 'recommendation_preference_missing',
          knowledge_source: menuSource, candidates_found: []
        });
      }
      if (candidates.length) {
        if (!publishesRealItems) {
          return Object.freeze({
            schema_version: 'deliveryos-homologation-guidance-v1', mode: 'menu_approval_pending',
            direct_answers: ['Vou manter essas preferências. As opções deste canal ainda não estão revisadas o bastante para uma indicação segura.'],
            question: null, context_reason: 'real_menu_items_not_human_approved',
            knowledge_source: menuSource, candidates_found: candidates.map((item) => item.item_id)
          });
        }
        const direct = this.candidateDecisionSupport(candidates, state, {
          includePrices: turnAnalysis.questions.includes('price')
        });
        const question = turnAnalysis.preferences.avoid_cream_cheese
          ? 'Você quer que eu procure uma opção com composição mais detalhada?'
          : (turnAnalysis.preferences.light ? 'Você prefere que eu afunile por cru, maçaricado ou sem fritura?' : null);
        return Object.freeze({
          schema_version: 'deliveryos-homologation-guidance-v1', mode: 'menu_candidates',
          direct_answers: [direct.join(' ')],
          question, context_reason: null, knowledge_source: menuSource,
          candidates_found: candidates.map((item) => item.item_id)
        });
      }
      const wantsDecision = turnAnalysis.questions.includes('decision_support');
      const wantsPrice = turnAnalysis.questions.includes('price');
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1', mode: 'no_safe_candidate',
        direct_answers: [wantsDecision
          ? `Eu não escolheria uma opção agora porque nenhuma ficou compatível no ${menuLabel} com os filtros atuais.`
          : (wantsPrice
            ? `Ainda não tenho uma opção compatível neste canal para informar um preço sem misturar cardápios.`
            : `Não encontrei uma opção compatível no ${menuLabel} com os filtros informados. Prefiro não indicar um item sem base suficiente.`)],
        question: wantsDecision ? 'Qual preferência você quer flexibilizar para eu procurar novamente?' : null,
        context_reason: 'no_compatible_menu_candidate',
        knowledge_source: menuSource, candidates_found: []
      });
    }
    return null;
  }

  resetChatContext() {
    this.chatContexts.clear();
    return { context_reset: true };
  }

  bootstrap() {
    const menu = this.menuCatalog.snapshot();
    const review = this.menuReview.bootstrap();
    const writer = this.writerStatus();
    return {
      ok: true,
      schema_version: 'deliveryos-customer-menu-homologation-v1',
      synthetic: true,
      external_cost_brl: 0,
      real_drivers: false,
      customers: this.customerStore.list(),
      menu: {
        catalog_mode: this.catalogMode,
        real_items_active: this.catalogMode.startsWith('real_'),
        channels: ['dining_room', 'ifood', 'own_delivery'],
        units: [...new Set(menu.items.map((item) => item.unit_id))],
        items: menu.items,
        conflicts: menu.conflicts,
        pairings: menu.pairings,
        sources: menu.sources
      },
      menu_review: review,
      imports: [this.publicImport()],
      consent_states: ['unknown', 'allowed', 'blocked', 'withdrawn', 'expired'],
      audit: {
        event_count: this.customerStore.auditLog().length,
        pii_visible: false,
        append_only: true,
        recent_events: this.customerStore.auditLog().slice(-12).map((event) => ({
          event_id: event.event_id,
          sequence: event.sequence,
          type: event.type,
          aggregate_id: event.aggregate_id,
          source: event.source
        }))
      },
      integration: {
        chat_endpoint: '/api/homologation/chat',
        pattern_engine: 'active',
        journey_state: 'event_sourced',
        response_plan: 'active',
        response_writer: writer.status,
        response_writer_reason: writer.reason || null,
        deterministic_composer: 'active',
        customer_context: 'automatic_anonymous_or_selected_synthetic',
        menu_context: 'automatic_from_conversation_or_optional_override',
        real_data: this.catalogMode.startsWith('real_')
      }
    };
  }

  menuReviewAction(input = {}) {
    const reviewed = this.menuReview.action(input);
    this.rebuildMenuCatalog();
    return {
      ok: true,
      reviewed,
      summary: this.menuReview.summary(),
      catalog_mode: this.catalogMode
    };
  }

  publicMenuReviewPreview(input = {}) {
    return { ok: true, preview: this.menuReview.publicBatchPreview(input) };
  }

  publicMenuReviewCommit(input = {}) {
    const reviewed = this.menuReview.publicBatchCommit(input);
    this.rebuildMenuCatalog();
    return {
      ok: true,
      reviewed_count: reviewed.length,
      summary: this.menuReview.summary(),
      catalog_mode: this.catalogMode
    };
  }

  publicMenuFieldAction(input = {}) {
    const reviewed = this.menuReview.publicFieldAction(input);
    this.rebuildMenuCatalog();
    return {
      ok: true,
      reviewed,
      summary: this.menuReview.summary(),
      catalog_mode: this.catalogMode
    };
  }

  customer(customerId) {
    const result = this.tools.get_customer_summary({ customer_id: customerId });
    return { ok: true, synthetic: true, result };
  }

  recommend(request = {}) {
    const result = this.tools.get_recommendation_candidates({
      customer_id: request.customer_id || null,
      request: {
        channel: request.channel,
        unit_id: request.unit_id,
        raw_or_cooked: request.raw_or_cooked || null,
        cream_cheese: request.cream_cheese || null,
        flavor_profile: request.flavor_profile || null,
        preferred_ingredients: request.preferred_ingredients || [],
        excluded_ingredients: request.excluded_ingredients || [],
        allergies: request.allergies || [],
        dietary_restrictions: request.dietary_restrictions || [],
        price_range: request.maximum_price == null ? null : { maximum: Number(request.maximum_price) }
      }
    });
    return { ok: true, synthetic: true, result };
  }
}

module.exports = {
  SYNTHETIC_SECRET,
  buildSyntheticCustomerStore,
  CustomerMenuHomologationService
};
