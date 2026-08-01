'use strict';

const {
  normalizedIdentity, resolveIdentity, cloneFrozen
} = require('./customer-intelligence');
const {
  recommend, approvedPairings, menuError
} = require('./menu-intelligence');

const CUSTOMER_MENU_TOOL_NAMES = Object.freeze([
  'find_customer_by_phone',
  'find_customer_candidates',
  'get_customer_summary',
  'get_customer_preferences',
  'get_customer_restrictions',
  'get_recent_orders',
  'get_recent_reservations',
  'get_recent_incidents',
  'record_customer_fact_candidate',
  'request_customer_confirmation',
  'search_menu_items',
  'get_menu_item_details',
  'get_channel_menu',
  'get_item_availability',
  'get_item_allergens',
  'get_item_customizations',
  'get_recommendation_candidates',
  'get_pairing_candidates',
  'compare_menu_variants'
]);

function toolResult(tool, status, data, sources = [], unknowns = []) {
  return cloneFrozen({
    schema_version: 'deliveryos-customer-menu-tool-result-v1',
    tool,
    status,
    data,
    sources: [...new Set(sources.filter(Boolean))],
    unknowns: [...new Set(unknowns)]
  });
}

function safeCustomerSummary(customer, store) {
  const latestByField = new Map();
  customer.facts.forEach((fact) => latestByField.set(fact.field, fact));
  return {
    customer_id: customer.customer_id,
    status: customer.status,
    identity_count: customer.identities.length,
    sources: [...new Set(customer.identities.map((item) => item.source))],
    facts: [...latestByField.values()].map((fact) => ({
      field: fact.field,
      value: fact.value,
      state: fact.state,
      source: fact.source,
      valid_until: fact.valid_until
    })),
    restrictions: customer.restrictions.map((item) => ({
      type: item.type, value: item.value, status: item.status, source: item.source
    })),
    recent_orders: customer.orders.slice(-5),
    recent_reservations: customer.reservations.slice(-5),
    recent_incidents: customer.incidents.slice(-5),
    fact_candidates: customer.fact_candidates.map((item) => ({
      candidate_id: item.candidate_id,
      field: item.field,
      source: item.source,
      status: item.status
    })),
    consent: { all_marketing: store.consentState(customer.customer_id, 'all_marketing') },
    unknowns: customer.identities.length ? [] : ['identity'],
    review_required: customer.fact_candidates.length > 0 || customer.facts.some((fact) => fact.state === 'conflicting')
  };
}

function createCustomerMenuTools(options = {}) {
  const customerStore = options.customerStore;
  const menuCatalog = options.menuCatalog;
  const identitySecret = String(options.identitySecret || '');
  if (!customerStore || !menuCatalog) throw new Error('CUSTOMER_MENU_STORES_REQUIRED');
  const tools = {
    find_customer_by_phone(args = {}) {
      const identity = normalizedIdentity({ type: 'phone', value: args.phone, source: args.source || 'conversation' }, { secret: identitySecret });
      if (!identity) return toolResult('find_customer_by_phone', 'not_found', { identity_status: 'not_found', customer_ids: [] });
      const candidates = customerStore.findByIdentity(identity);
      const resolution = resolveIdentity({ identities: [identity], candidates });
      return toolResult('find_customer_by_phone', resolution.classification === 'exact_match' ? 'ready' : 'ambiguous', {
        identity_status: resolution.classification === 'exact_match' ? 'unique' : (candidates.length ? 'ambiguous' : 'not_found'),
        customer_ids: resolution.candidates.map((candidate) => candidate.customer_id),
        classification: resolution.classification,
        reasons: resolution.reasons
      }, [args.source || 'conversation']);
    },
    find_customer_candidates(args = {}) {
      const candidates = Array.isArray(args.identities) ? args.identities.flatMap((identity) => customerStore.findByIdentity(identity)) : [];
      const resolution = resolveIdentity({ identities: args.identities || [], candidates });
      return toolResult('find_customer_candidates', resolution.classification, resolution);
    },
    get_customer_summary(args = {}) {
      const customer = customerStore.customer(args.customer_id);
      const summary = safeCustomerSummary(customer, customerStore);
      return toolResult('get_customer_summary', 'ready', summary, [customer.provenance, ...summary.sources]);
    },
    get_customer_preferences(args = {}) {
      const customer = customerStore.customer(args.customer_id);
      const facts = customer.facts.filter((fact) => /prefer/iu.test(fact.field));
      return toolResult('get_customer_preferences', facts.length ? 'ready' : 'unknown', {
        confirmed: facts.filter((fact) => fact.state === 'confirmed'),
        inferred: facts.filter((fact) => fact.state === 'inferred'),
        other: facts.filter((fact) => !['confirmed', 'inferred'].includes(fact.state))
      }, facts.map((fact) => fact.source), facts.length ? [] : ['preferences']);
    },
    get_customer_restrictions(args = {}) {
      const customer = customerStore.customer(args.customer_id);
      return toolResult('get_customer_restrictions', customer.restrictions.length ? 'ready' : 'unknown', {
        restrictions: customer.restrictions
      }, customer.restrictions.map((item) => item.source), customer.restrictions.length ? [] : ['restrictions']);
    },
    get_recent_orders(args = {}) {
      const customer = customerStore.customer(args.customer_id);
      return toolResult('get_recent_orders', customer.orders.length ? 'ready' : 'unknown', {
        orders: customer.orders.slice(-Math.min(Number(args.limit || 5), 20))
      }, ['customer_event_store'], customer.orders.length ? [] : ['orders']);
    },
    get_recent_reservations(args = {}) {
      const customer = customerStore.customer(args.customer_id);
      return toolResult('get_recent_reservations', customer.reservations.length ? 'ready' : 'unknown', {
        reservations: customer.reservations.slice(-Math.min(Number(args.limit || 5), 20))
      }, ['customer_event_store'], customer.reservations.length ? [] : ['reservations']);
    },
    get_recent_incidents(args = {}) {
      const customer = customerStore.customer(args.customer_id);
      return toolResult('get_recent_incidents', customer.incidents.length ? 'ready' : 'unknown', {
        incidents: customer.incidents.slice(-Math.min(Number(args.limit || 5), 20))
      }, ['customer_event_store'], customer.incidents.length ? [] : ['incidents']);
    },
    record_customer_fact_candidate(args = {}) {
      const candidate = customerStore.recordFactCandidate(args.customer_id, {
        field: args.field, value: args.value, source: args.source || 'conversation'
      });
      return toolResult('record_customer_fact_candidate', 'pending_confirmation', {
        candidate_id: candidate.candidate_id,
        field: candidate.field,
        status: candidate.status
      }, [candidate.source]);
    },
    request_customer_confirmation(args = {}) {
      return toolResult('request_customer_confirmation', 'requires_human_confirmation', {
        customer_id: args.customer_id || null,
        field: args.field,
        candidate_id: args.candidate_id || null,
        action_executed: false
      });
    },
    search_menu_items(args = {}) {
      const items = menuCatalog.search(args).map((item) => ({
        item_id: item.item_id, name: item.name, channel: item.channel, unit_id: item.unit_id,
        category: item.category, price: item.price, availability: item.availability,
        review_status: item.review_status, source_records: item.source_records
      }));
      return toolResult('search_menu_items', items.length ? 'ready' : 'not_found', { items }, items.flatMap((item) => item.source_records));
    },
    get_menu_item_details(args = {}) {
      const item = menuCatalog.get(args.item_id);
      return toolResult('get_menu_item_details', 'ready', item, item.source_records);
    },
    get_channel_menu(args = {}) {
      if (!args.channel || !args.unit_id) throw menuError('CHANNEL_AND_UNIT_REQUIRED');
      const items = menuCatalog.search({ channel: args.channel, unit_id: args.unit_id });
      return toolResult('get_channel_menu', items.length ? 'ready' : 'not_found', { channel: args.channel, unit_id: args.unit_id, items }, items.flatMap((item) => item.source_records));
    },
    get_item_availability(args = {}) {
      const item = menuCatalog.get(args.item_id);
      return toolResult('get_item_availability', item.availability.state, {
        item_id: item.item_id, channel: item.channel, unit_id: item.unit_id, availability: item.availability
      }, [item.availability.source_id], item.availability.state === 'unknown' ? ['availability'] : []);
    },
    get_item_allergens(args = {}) {
      const item = menuCatalog.get(args.item_id);
      return toolResult('get_item_allergens', item.allergens.length ? 'ready' : 'unknown', {
        item_id: item.item_id, allergens: item.allergens, cross_contact: item.cross_contact
      }, item.allergens.map((entry) => entry.source_id), item.allergens.length ? [] : ['allergens']);
    },
    get_item_customizations(args = {}) {
      const item = menuCatalog.get(args.item_id);
      return toolResult('get_item_customizations', item.customizations.length ? 'ready' : 'unknown', {
        item_id: item.item_id, customizations: item.customizations
      }, item.source_records, item.customizations.length ? [] : ['customizations']);
    },
    get_recommendation_candidates(args = {}) {
      const summary = args.customer_id ? safeCustomerSummary(customerStore.customer(args.customer_id), customerStore) : {};
      const result = recommend(menuCatalog, args.request || {}, {
        confirmed_facts: (summary.facts || []).filter((fact) => fact.state === 'confirmed'),
        inferred_facts: (summary.facts || []).filter((fact) => fact.state === 'inferred')
      });
      return toolResult('get_recommendation_candidates', result.status, result, result.candidates.flatMap((item) => item.source_records), result.unknowns);
    },
    get_pairing_candidates(args = {}) {
      const pairings = approvedPairings(menuCatalog, args.item_id, { channel: args.channel, unit_id: args.unit_id });
      return toolResult('get_pairing_candidates', pairings.length ? 'ready' : 'not_found', { pairings }, pairings.map((item) => item.source_id));
    },
    compare_menu_variants(args = {}) {
      const comparison = menuCatalog.compare(args.commercial_identity);
      return toolResult('compare_menu_variants', comparison.comparable ? 'ready' : 'partial', comparison, comparison.variants.flatMap((item) => item.source_records));
    }
  };
  return Object.freeze(tools);
}

class CustomerMenuToolRouter {
  constructor(tools) { this.tools = tools; }

  async execute(request = {}) {
    if (!CUSTOMER_MENU_TOOL_NAMES.includes(request.tool)) {
      throw Object.assign(new Error('CUSTOMER_MENU_TOOL_FORBIDDEN'), { code: 'CUSTOMER_MENU_TOOL_FORBIDDEN' });
    }
    if (/(?:sql|query|table|credential|password)/iu.test(JSON.stringify(request.arguments || {}))) {
      throw Object.assign(new Error('CUSTOMER_MENU_RAW_ACCESS_FORBIDDEN'), { code: 'CUSTOMER_MENU_RAW_ACCESS_FORBIDDEN' });
    }
    const handler = this.tools[request.tool];
    if (typeof handler !== 'function') {
      throw Object.assign(new Error('CUSTOMER_MENU_TOOL_UNAVAILABLE'), { code: 'CUSTOMER_MENU_TOOL_UNAVAILABLE' });
    }
    return handler(Object.freeze({ ...(request.arguments || {}) }));
  }
}

module.exports = {
  CUSTOMER_MENU_TOOL_NAMES,
  toolResult,
  safeCustomerSummary,
  createCustomerMenuTools,
  CustomerMenuToolRouter
};
