'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  CustomerIntelligenceStore, CustomerImportPipeline, normalizedIdentity
} = require('../../../src/conversation-crm/customer-intelligence');
const {
  createSyntheticCatalog, MenuCatalog, initialHospitalityContext,
  updateHospitalityContext, hospitalityRequest
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

const SYNTHETIC_SECRET = 'deliveryos-synthetic-panel-identity-secret-v1';
const MENU_CHANNEL_QUESTION = 'Você está escolhendo para o salão, para pedir pelo iFood ou pelo delivery próprio?';
const MENU_CHANNEL_REPEAT_QUESTIONS = Object.freeze([
  'Para eu consultar o cardápio certo: salão, iFood ou delivery próprio?',
  'Você prefere escolher pelo salão, pelo iFood ou pelo delivery próprio?',
  'Só preciso confirmar o canal: salão, iFood ou delivery próprio?'
]);
const OCCURRENCE_SIGNAL = /\b(?:faltou|nao veio|esqueceram|nao mandaram|veio (?:outro|errado|com)|reacao|passei mal|vomito|diarreia|dificuldade para respirar|cabelo|corpo estranho)\b/u;

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
  if (/\bifood\b/u.test(text)) return 'ifood';
  if (/\b(?:delivery proprio|delivery do tata|pedir pelo delivery)\b/u.test(text)) return 'own_delivery';
  if (/\b(?:salao|presencial|no restaurante)\b/u.test(text)) return 'dining_room';
  return null;
}

function partySizeFromText(text) {
  const token = text.match(/\b(?:somos|estamos em|para)\s+(\d{1,2}|[a-z]+)(?:\s+pessoas?)?\b/u)?.[1];
  if (!token) return null;
  const value = /^\d+$/u.test(token) ? Number(token) : WRITTEN_NUMBERS[token];
  return Number.isInteger(value) && value > 0 ? value : null;
}

function allergyFromText(text) {
  if (!/\b(?:tenho alergia|sou alergic[oa]|nao posso comer|tenho intolerancia)\b/u.test(text)) return null;
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
    pending_question: null,
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
    const repeated = Boolean(text && state.last_message_normalized === text);
    state.repetition_detected = repeated;
    state.repetition_streak = repeated ? state.repetition_streak + 1 : 0;
    state.social_act = socialActFromText(text);
    const factsAdded = [];
    const addFact = (field, value) => factsAdded.push({ field, value });
    if (OCCURRENCE_SIGNAL.test(text)) state.operational_flow_active = true;
    const explicitChannel = input.channel || channelFromText(text);
    if (explicitChannel) {
      if (state.channel !== explicitChannel) addFact('channel', explicitChannel);
      state.channel = explicitChannel;
      state.unit_id = input.unit_id || this.defaultUnitForChannel(explicitChannel);
    } else if (input.unit_id) state.unit_id = input.unit_id;
    if (/\bsem (?:fritura|frito|fritos|frita|fritas)\b/u.test(text) && state.fried !== false) {
      state.fried = false;
      addFact('fried', false);
    }
    const ingredientMentions = [
      ['salmon', /\bsalmao\b/u],
      ['tuna', /\batum\b/u],
      ['white_fish', /\bpeixe branco\b/u]
    ].filter(([, pattern]) => pattern.test(text)).map(([ingredient]) => ingredient);
    const correctsIngredient = /\b(?:na verdade|corrigindo|melhor)\b/u.test(text) && ingredientMentions.length > 0;
    if (ingredientMentions.length) {
      const previous = state.preferred_ingredients;
      state.preferred_ingredients = correctsIngredient
        ? [...new Set(ingredientMentions)]
        : [...new Set([...previous, ...ingredientMentions])];
      if (JSON.stringify(previous) !== JSON.stringify(state.preferred_ingredients)) {
        addFact(correctsIngredient ? 'preferred_ingredients_corrected' : 'preferred_ingredient', state.preferred_ingredients.join(','));
      }
      state.recommendation_active = true;
    }
    if (/\bsem cream cheese\b/u.test(text) && state.cream_cheese !== 'without') {
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

    const asksRecommendation = /\b(?:recomend(?:a(?:r|cao)?|e)?|sugest(?:ao|ao|ion)?|opcao|sem fritura|salmao|atum|cream cheese|macaricad[oa])\b/u.test(text);
    const asksPairing = /\b(?:bebida|drink|harmoniza|combina)\b/u.test(text);
    if (asksRecommendation || asksPairing) state.recommendation_active = true;
    state.hospitality_context = updateHospitalityContext(state.hospitality_context, {
      normalized_text: text,
      channel: state.channel,
      unit_id: state.unit_id,
      number_of_people: state.number_of_people,
      allergies: state.allergies
    });
    if (state.hospitality_context.occasion || state.hospitality_context.preferred_ingredients.length
      || state.hospitality_context.preparation_preferences.length || state.hospitality_context.budget) {
      state.recommendation_active = true;
    }

    let customerContext = null;
    let menuContext = null;
    let recommendationContext = null;
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
        number_of_people: state.number_of_people,
        allergies: [...new Set([...(input.allergies || []), ...declaredAllergies])]
      };
      const recommendationResult = this.tools.get_recommendation_candidates({
        customer_id: input.customer_id || null,
        request
      });
      menuContext = menuContextFromRecommendation(recommendationResult, request);
      recommendationContext = recommendationContextFromResult(recommendationResult, state.hospitality_context);
      const selected = recommendationResult.data?.candidates?.[0] || null;
      state.selected_item_id = selected?.item_id || null;
      state.selected_item_name = selected?.name || null;
      state.awaiting_channel = false;
      state.pending_question = null;
      state.channel_question_asked = false;
    } else if (state.recommendation_active) {
      state.awaiting_channel = true;
      state.pending_question = 'menu_channel';
      menuContext = Object.freeze({
        schema_version: 'deliveryos-menu-context-v1',
        status: 'partial',
        channel: 'unknown',
        unit_id: state.unit_id,
        items: [],
        unknowns: ['menu_channel_missing'],
        divergences: [],
        provenance: [this.currentMenuSourceId()]
      });
      recommendationContext = Object.freeze({
        schema_version: 'deliveryos-recommendation-context-v1',
        status: 'partial',
        objectives: ['safe_relevant_menu_guidance'],
        constraints: [],
        candidate_item_ids: [],
        unknowns: ['menu_channel_missing'],
        hospitality_context: state.hospitality_context
      });
    }

    let pairing = null;
    if (asksPairing && state.selected_item_id && state.channel) {
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
    let guidance = this.guidanceForChat({ text, input, state, allergy, asksRecommendation, asksPairing, menuContext, pairing });
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

  guidanceForChat({ text, state, allergy, asksRecommendation, asksPairing, menuContext, pairing }) {
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
    if (activeAllergy) {
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1',
        mode: 'preventive_allergy',
        direct_answers: [`Vou considerar ${activeAllergy.label} como uma restrição preventiva nesta conversa. O ${menuLabel} não confirma ausência de contaminação cruzada; por isso, a composição e o preparo precisam ser confirmados com a equipe antes do pedido.`],
        question: resumeQuestion,
        context_reason: 'preventive_allergy_declared',
        knowledge_source: `current_conversation+${menuSource}`,
        candidates_found: []
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
          ? 'Ainda não há uma harmonização aprovada para a opção selecionada.'
          : 'Ainda não existe uma opção sugerida nesta conversa para eu consultar uma harmonização aprovada.'],
        question: resumeQuestion, context_reason: state.awaiting_channel ? 'menu_channel_missing' : 'pairing_not_approved',
        knowledge_source: menuSource, candidates_found: []
      });
    }
    if (/\bna verdade\b.*\b(?:somos|pessoas?)\b/u.test(text) && state.number_of_people) {
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1', mode: 'party_size_update',
        direct_answers: [state.recommendation_active
          ? `Certo — vou considerar ${state.number_of_people} pessoas ao calcular a sugestão.`
          : `Entendi que são ${state.number_of_people} pessoas.`],
        question: state.recommendation_active ? resumeQuestion : `As ${state.number_of_people} pessoas são para uma reserva ou para calcular uma sugestão de pedido?`,
        context_reason: state.recommendation_active ? null : 'party_size_reference_missing',
        knowledge_source: 'current_conversation', candidates_found: candidates.map((item) => item.item_id)
      });
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
      if (candidates.length) {
        if (!publishesRealItems) {
          return Object.freeze({
            schema_version: 'deliveryos-homologation-guidance-v1', mode: 'menu_approval_pending',
            direct_answers: ['Vou manter essas preferências. As opções deste canal ainda não estão revisadas o bastante para uma indicação segura.'],
            question: null, context_reason: 'real_menu_items_not_human_approved',
            knowledge_source: menuSource, candidates_found: candidates.map((item) => item.item_id)
          });
        }
        const names = [...new Set(candidates.map((item) => item.name))].slice(0, 3);
        const availabilityUnknown = candidates.some((item) => item.availability?.state === 'unknown');
        const uncertainFrying = state.fried === false && candidates.some((item) => item.warnings?.includes('frying_status_unknown'));
        const uncertainCream = state.cream_cheese === 'without' && candidates.some((item) => item.warnings?.includes('cream_cheese_status_unknown'));
        const uncertainLight = state.hospitality_context.flavor_preferences.includes('light')
          && candidates.some((item) => item.warnings?.includes('flavor_profile_unconfirmed'));
        const joinedNames = names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : names[0];
        return Object.freeze({
          schema_version: 'deliveryos-homologation-guidance-v1', mode: 'menu_candidates',
          direct_answers: [`No ${menuLabel}, ${joinedNames} ${names.length > 1 ? 'são opções' : 'é uma opção'} com evidência pública compatível com os filtros confirmados.${uncertainLight ? ' A fonte pública não classifica essas opções como leves; mantive apenas os demais critérios confirmados.' : ''}${uncertainFrying ? ' A fonte pública não confirma o método de preparo como sem fritura; confirme esse ponto com a equipe.' : ''}${uncertainCream ? ' A ausência de cream cheese não está confirmada; confirme esse ponto com a equipe.' : ''}${availabilityUnknown ? ' A disponibilidade no momento precisa ser confirmada.' : ''}`],
          question: null, context_reason: null, knowledge_source: menuSource,
          candidates_found: candidates.map((item) => item.item_id)
        });
      }
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1', mode: 'no_safe_candidate',
        direct_answers: [`Não encontrei uma opção compatível no ${menuLabel} com os filtros informados. Prefiro não indicar um item sem base suficiente.`],
        question: null, context_reason: 'no_compatible_menu_candidate',
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
