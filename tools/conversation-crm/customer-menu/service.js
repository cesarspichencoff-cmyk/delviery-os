'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  CustomerIntelligenceStore, CustomerImportPipeline, normalizedIdentity
} = require('../../../src/conversation-crm/customer-intelligence');
const {
  createSyntheticCatalog
} = require('../../../src/conversation-crm/menu-intelligence');
const {
  createCustomerMenuTools
} = require('../../../src/conversation-crm/customer-menu-tools');
const {
  customerContextFromSummary,
  menuContextFromRecommendation,
  recommendationContextFromResult
} = require('../../../src/conversation-crm/native/customer-menu-integration');

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
  constructor() {
    this.customerStore = buildSyntheticCustomerStore();
    this.menuCatalog = createSyntheticCatalog();
    this.tools = createCustomerMenuTools({
      customerStore: this.customerStore,
      menuCatalog: this.menuCatalog,
      identitySecret: SYNTHETIC_SECRET
    });
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

  contextForChat(input = {}) {
    let customerContext = null;
    let menuContext = null;
    let recommendationContext = null;
    if (input.customer_id) {
      const customerResult = this.tools.get_customer_summary({ customer_id: input.customer_id });
      customerContext = customerContextFromSummary(customerResult);
    }
    if (input.channel && input.unit_id) {
      const declaredAllergies = (customerContext?.declared_restrictions || [])
        .filter((item) => item.type === 'allergy' && item.status === 'confirmed' && typeof item.value === 'string')
        .map((item) => item.value);
      const request = {
        channel: input.channel,
        unit_id: input.unit_id,
        allergies: [...new Set([...(input.allergies || []), ...declaredAllergies])]
      };
      const recommendationResult = this.tools.get_recommendation_candidates({
        customer_id: input.customer_id || null,
        request
      });
      menuContext = menuContextFromRecommendation(recommendationResult, request);
      recommendationContext = recommendationContextFromResult(recommendationResult);
    }
    return {
      customer_context: customerContext,
      menu_context: menuContext,
      recommendation_context: recommendationContext,
      source_summary: {
        customer: customerContext ? 'customer_intelligence_synthetic' : 'none',
        menu: menuContext ? 'menu_intelligence_synthetic' : 'none'
      }
    };
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
        response_writer: 'not_connected_in_local_panel',
        deterministic_composer: 'active',
        customer_context: 'available_when_selected',
        menu_context: 'available_when_channel_selected',
        real_data: false
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
