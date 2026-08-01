'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  CustomerIntelligenceStore, CustomerImportPipeline, normalizedIdentity
} = require('../../../src/conversation-crm/customer-intelligence');
const {
  createSyntheticCatalog, MenuCatalog
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
    awaiting_channel: false,
    selected_item_id: null,
    selected_item_name: null
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
    const approved = this.menuReview.approvedItems();
    if (!approved.length) {
      this.menuCatalog = createSyntheticCatalog();
      this.catalogMode = 'synthetic_until_human_approval';
    } else {
      const catalog = new MenuCatalog({ clock: () => new Date('2026-07-01T15:00:00.000Z') });
      const sources = [...new Set(approved.map((item) => item.source_id))];
      for (const sourceId of sources) {
        catalog.registerSource({
          source_id: sourceId,
          title: 'Fonte real aprovada em homologação humana',
          format: sourceId.includes('seed') ? 'json' : 'reviewed_source',
          channel: 'multiple',
          authority: 'human_homologation',
          review_status: 'confirmed'
        });
      }
      for (const proposal of approved) {
        const extracted = proposal.information_extracted || {};
        catalog.addItem({
          item_id: `REAL-${stableReviewId(proposal.review_id)}`,
          commercial_identity: proposal.source_record_id || proposal.review_id,
          name: extracted.name || proposal.item,
          description: extracted.description ?? null,
          channel: proposal.channel,
          unit_id: proposal.unit_id,
          category: extracted.operational_category || 'unknown',
          price: Object.hasOwn(extracted, 'price') ? extracted.price : null,
          ingredients: (extracted.ingredients || []).map((name) => ({ name, status: 'confirmed', source_id: proposal.source_id })),
          preparation: {},
          allergens: [],
          cross_contact: { state: 'unknown', source_id: proposal.source_id },
          availability: {
            state: extracted.availability || 'unknown',
            checked_at: null,
            source_id: proposal.source_id
          },
          source_records: [proposal.source_id],
          review_status: 'confirmed',
          review_notes: ['human_review_approved', 'unknown_fields_preserved']
        });
      }
      this.menuCatalog = catalog;
      this.catalogMode = 'real_human_approved';
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

  currentMenuSourceId() {
    return this.menuCatalog.snapshot().sources.map((source) => source.source_id).join('+') || 'none';
  }

  currentMenuLabel() {
    return this.catalogMode === 'real_human_approved'
      ? 'catálogo real aprovado em homologação humana'
      : 'catálogo sintético de homologação';
  }

  defaultUnitForChannel(channel) {
    return this.menuCatalog.snapshot().items.find((item) => !channel || item.channel === channel)?.unit_id || null;
  }

  contextForChat(input = {}) {
    const conversationId = String(input.conversation_id || 'SIM-CONV-HOMO-UNKNOWN');
    const state = this.chatContexts.get(conversationId) || initialChatContext(this.defaultUnitForChannel(input.channel));
    const text = normalizeChatText(input.message);
    const explicitChannel = input.channel || channelFromText(text);
    if (explicitChannel) state.channel = explicitChannel;
    if (input.unit_id) state.unit_id = input.unit_id;
    if (/\bsem (?:fritura|frito|fritos|frita|fritas)\b/u.test(text)) state.fried = false;
    if (/\b(?:salmao|salmão)\b/u.test(String(input.message || '').toLowerCase())) {
      state.preferred_ingredients = [...new Set([...state.preferred_ingredients, 'salmon'])];
      state.recommendation_active = true;
    }
    if (/\bsem cream cheese\b/u.test(text)) {
      state.cream_cheese = 'without';
      state.recommendation_active = true;
    }
    const partySize = partySizeFromText(text);
    if (partySize) state.number_of_people = partySize;
    const allergy = allergyFromText(text);
    if (allergy) {
      state.allergies = [...new Set([...state.allergies, allergy.value])];
      state.allergy_labels[allergy.value] = allergy.label;
    }

    const asksRecommendation = /\b(?:recomend|sugest|op[cç][aã]o|sem fritura|salm[aã]o|cream cheese)\b/iu.test(input.message || '');
    const asksPairing = /\b(?:bebida|drink|harmoniza|combina)\b/u.test(text);
    if (asksRecommendation || asksPairing) state.recommendation_active = true;

    let customerContext = null;
    let menuContext = null;
    let recommendationContext = null;
    if (input.customer_id) {
      const customerResult = this.tools.get_customer_summary({ customer_id: input.customer_id });
      customerContext = customerContextFromSummary(customerResult);
    } else {
      customerContext = customerContextFromSummary(null);
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
      recommendationContext = recommendationContextFromResult(recommendationResult);
      const selected = recommendationResult.data?.candidates?.[0] || null;
      state.selected_item_id = selected?.item_id || null;
      state.selected_item_name = selected?.name || null;
      state.awaiting_channel = false;
    } else if (state.recommendation_active) {
      state.awaiting_channel = true;
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
        unknowns: ['menu_channel_missing']
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

    const guidance = this.guidanceForChat({ text, input, state, allergy, asksRecommendation, asksPairing, menuContext, pairing });
    this.chatContexts.set(conversationId, state);
    return {
      customer_context: customerContext,
      menu_context: menuContext,
      recommendation_context: recommendationContext,
      conversation_guidance: guidance,
      source_summary: {
        customer: input.customer_id ? 'customer_intelligence_synthetic' : 'anonymous_synthetic_session',
        menu: menuContext
          ? (this.catalogMode === 'real_human_approved' ? 'menu_intelligence_real_human_approved' : 'menu_intelligence_synthetic')
          : 'none'
      }
    };
  }

  guidanceForChat({ text, state, allergy, asksRecommendation, asksPairing, menuContext, pairing }) {
    const candidates = menuContext?.items || [];
    const menuLabel = this.currentMenuLabel();
    const menuSource = this.currentMenuSourceId();
    const channelQuestion = 'Você está escolhendo para o salão, para pedir pelo iFood ou pelo delivery próprio?';
    const resumeQuestion = state.awaiting_channel ? channelQuestion : null;
    if (allergy) {
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1',
        mode: 'preventive_allergy',
        direct_answers: [`Certo — vou considerar ${allergy.label} como uma restrição preventiva nesta conversa. Como o ${menuLabel} não confirma ausência de contaminação cruzada, confirme a composição e o preparo com a equipe antes de pedir.`],
        question: resumeQuestion,
        context_reason: 'preventive_allergy_declared',
        knowledge_source: `current_conversation+${menuSource}`,
        candidates_found: []
      });
    }
    if (asksPairing) {
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
          ? 'Ainda não há uma harmonização aprovada para a opção sintética selecionada.'
          : 'Ainda não existe uma opção sugerida nesta conversa para eu consultar uma harmonização aprovada.'],
        question: resumeQuestion, context_reason: state.awaiting_channel ? 'menu_channel_missing' : 'pairing_not_approved',
        knowledge_source: menuSource, candidates_found: []
      });
    }
    if (/\bna verdade\b/u.test(text) && state.number_of_people) {
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
    if (asksRecommendation) {
      if (state.awaiting_channel) {
        const statesSpecificPreference = /\b(?:salmao|cream cheese)\b/u.test(text);
        return Object.freeze({
          schema_version: 'deliveryos-homologation-guidance-v1', mode: 'menu_channel_required',
          direct_answers: [statesSpecificPreference
            ? 'Entendi a preferência e vou mantê-la nesta conversa sem inventar um prato real.'
            : state.fried === false
            ? `O ${menuLabel} possui opções registradas como não fritas.`
            : 'Entendi a preferência e vou mantê-la nesta conversa sem inventar um prato real.'],
          question: channelQuestion, context_reason: 'menu_channel_missing',
          knowledge_source: menuSource, candidates_found: []
        });
      }
      if (candidates.length) {
        return Object.freeze({
          schema_version: 'deliveryos-homologation-guidance-v1', mode: 'menu_candidates',
          direct_answers: [`No ${menuLabel}, encontrei ${candidates[0].name} como opção compatível com os filtros informados.`],
          question: null, context_reason: null, knowledge_source: menuSource,
          candidates_found: candidates.map((item) => item.item_id)
        });
      }
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1', mode: 'no_safe_candidate',
        direct_answers: [`Não encontrei candidato seguro no ${menuLabel} com os filtros informados. Não vou inventar uma opção.`],
        question: null, context_reason: 'no_compatible_menu_candidate',
        knowledge_source: menuSource, candidates_found: []
      });
    }
    if (/\bvalet\b/u.test(text) && state.recommendation_active) {
      return Object.freeze({
        schema_version: 'deliveryos-homologation-guidance-v1', mode: 'side_information',
        direct_answers: [], question: resumeQuestion, context_reason: null,
        knowledge_source: 'TATA_OPERATIONAL_PUBLIC_INFO_V1', candidates_found: candidates.map((item) => item.item_id)
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
        real_items_active: this.catalogMode === 'real_human_approved',
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
        real_data: this.catalogMode === 'real_human_approved'
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
