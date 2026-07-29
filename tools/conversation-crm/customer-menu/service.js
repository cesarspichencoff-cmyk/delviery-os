'use strict';

const {
  CustomerIntelligenceStore,
  normalizedIdentity
} = require('../../../src/conversation-crm/customer-intelligence');
const {
  createSyntheticCatalog
} = require('../../../src/conversation-crm/menu-intelligence');
const {
  createCustomerMenuTools
} = require('../../../src/conversation-crm/customer-menu-tools');

const SYNTHETIC_SECRET = 'deliveryos-synthetic-panel-identity-secret-v1';

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
        source: 'synthetic_declaration'
      });
    }
    store.recordConsent(definition.id, {
      purpose: 'all_marketing',
      channel: 'all',
      state: definition.consent,
      source: 'synthetic'
    });
  });
  return store;
}

class CustomerMenuHomologationService {
  constructor() {
    this.customerStore = buildSyntheticCustomerStore();
    this.menuCatalog = createSyntheticCatalog();
    this.tools = createCustomerMenuTools({
      customerStore: this.customerStore,
      menuCatalog: this.menuCatalog,
      identitySecret: SYNTHETIC_SECRET
    });
  }

  bootstrap() {
    const menu = this.menuCatalog.snapshot();
    return {
      ok: true,
      schema_version: 'deliveryos-customer-menu-homologation-v1',
      synthetic: true,
      external_cost_brl: 0,
      real_drivers: false,
      customers: this.customerStore.list(),
      menu: {
        channels: ['dining_room', 'ifood', 'own_delivery'],
        units: ['SIM-UNIT-ITAIM'],
        items: menu.items,
        conflicts: menu.conflicts,
        pairings: menu.pairings,
        sources: menu.sources
      },
      imports: [{
        batch_id: 'SIM-IMPORT-PREVIEW-001',
        source: 'generic',
        state: 'previewed',
        total: 4,
        valid: 3,
        invalid: 1,
        duplicates: 1,
        approved: false
      }],
      consent_states: ['unknown', 'allowed', 'blocked', 'withdrawn', 'expired'],
      audit: {
        event_count: this.customerStore.auditLog().length,
        pii_visible: false,
        append_only: true
      }
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
