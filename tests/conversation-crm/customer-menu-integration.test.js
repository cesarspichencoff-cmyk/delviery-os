'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CustomerIntelligenceStore,
  normalizedIdentity
} = require('../../src/conversation-crm/customer-intelligence');
const { createSyntheticCatalog } = require('../../src/conversation-crm/menu-intelligence');
const {
  createCustomerMenuTools,
  CustomerMenuToolRouter,
  CUSTOMER_MENU_TOOL_NAMES
} = require('../../src/conversation-crm/customer-menu-tools');
const {
  customerContextFromSummary,
  menuContextFromRecommendation,
  recommendationContextFromResult
} = require('../../src/conversation-crm/native/customer-menu-integration');
const {
  validateCustomerContext,
  validateMenuContext,
  validateRecommendationContext
} = require('../../apps/deliveryos-ai-node');

const SECRET = 'synthetic-customer-menu-tool-secret-v1';

function setup() {
  const customerStore = new CustomerIntelligenceStore({ clock: () => new Date('2026-07-01T15:00:00.000Z') });
  customerStore.createCustomer({ customer_id: 'SIM-CUSTOMER-TOOL', provenance: 'synthetic' });
  const identity = normalizedIdentity({ type: 'phone', value: '11990000021', source: 'conversation' }, { secret: SECRET });
  customerStore.addIdentity('SIM-CUSTOMER-TOOL', identity);
  customerStore.recordFact('SIM-CUSTOMER-TOOL', {
    field: 'preferred_item', value: 'SIM-SALMON-LIGHT', state: 'confirmed', source: 'customer_confirmation'
  });
  const tools = createCustomerMenuTools({ customerStore, menuCatalog: createSyntheticCatalog(), identitySecret: SECRET });
  return { customerStore, tools, router: new CustomerMenuToolRouter(tools) };
}

test('allowlist contém todas as fronteiras de CRM e menu', () => {
  assert.equal(CUSTOMER_MENU_TOOL_NAMES.length, 19);
  assert.ok(CUSTOMER_MENU_TOOL_NAMES.includes('find_customer_candidates'));
  assert.ok(CUSTOMER_MENU_TOOL_NAMES.includes('compare_menu_variants'));
});

test('modelo não pode executar SQL nem escolher tabela', async () => {
  const { router } = setup();
  await assert.rejects(() => router.execute({
    tool: 'get_customer_summary',
    arguments: { customer_id: 'SIM-CUSTOMER-TOOL', sql: 'SELECT * FROM customers' }
  }), { code: 'CUSTOMER_MENU_RAW_ACCESS_FORBIDDEN' });
  await assert.rejects(() => router.execute({ tool: 'raw_sql', arguments: {} }), { code: 'CUSTOMER_MENU_TOOL_FORBIDDEN' });
});

test('busca por telefone retorna somente identificador canônico', async () => {
  const { router } = setup();
  const result = await router.execute({
    tool: 'find_customer_by_phone',
    arguments: { phone: '11990000021', source: 'conversation' }
  });
  assert.equal(result.data.identity_status, 'unique');
  assert.deepEqual(result.data.customer_ids, ['SIM-CUSTOMER-TOOL']);
  assert.equal(JSON.stringify(result).includes('11990000021'), false);
});

test('fato conversacional entra como candidato e não confirmado', async () => {
  const { router, customerStore } = setup();
  const result = await router.execute({
    tool: 'record_customer_fact_candidate',
    arguments: { customer_id: 'SIM-CUSTOMER-TOOL', field: 'preferred_texture', value: 'crunchy' }
  });
  assert.equal(result.status, 'pending_confirmation');
  assert.equal(customerStore.customer('SIM-CUSTOMER-TOOL').facts.some((fact) => fact.field === 'preferred_texture'), false);
});

test('contexto do cliente preserva certeza separada', async () => {
  const { router } = setup();
  const summary = await router.execute({
    tool: 'get_customer_summary',
    arguments: { customer_id: 'SIM-CUSTOMER-TOOL' }
  });
  const context = customerContextFromSummary(summary);
  assert.equal(validateCustomerContext(context).accepted, true);
  assert.equal(context.confirmed_facts[0].field, 'preferred_item');
});

test('contextos de menu e recomendação validam no contrato do Pattern Engine', async () => {
  const { router } = setup();
  const request = {
    channel: 'dining_room',
    unit_id: 'SIM-UNIT-ITAIM',
    cream_cheese: 'without',
    preferred_ingredients: ['salmon']
  };
  const result = await router.execute({
    tool: 'get_recommendation_candidates',
    arguments: { customer_id: 'SIM-CUSTOMER-TOOL', request }
  });
  const menuContext = menuContextFromRecommendation(result, request);
  const recommendationContext = recommendationContextFromResult(result);
  assert.equal(validateMenuContext(menuContext).accepted, true);
  assert.equal(validateRecommendationContext(recommendationContext).accepted, true);
  assert.equal(recommendationContext.candidate_item_ids[0], 'SIM-MENU-SALMON-LIGHT-DINING');
});

test('Writer recebe IDs autorizados e não arquivos brutos', async () => {
  const { router } = setup();
  const result = await router.execute({
    tool: 'get_recommendation_candidates',
    arguments: { request: { channel: 'dining_room', unit_id: 'SIM-UNIT-ITAIM' } }
  });
  const context = recommendationContextFromResult(result);
  assert.equal('raw_files' in context, false);
  assert.equal('scores' in context, false);
  assert.equal('ranking' in context, false);
});

test('comparação entre canais mantém origem e preços separados', async () => {
  const { router } = setup();
  const result = await router.execute({
    tool: 'compare_menu_variants',
    arguments: { commercial_identity: 'SIM-SALMON-LIGHT' }
  });
  assert.equal(result.data.variants.length, 3);
  assert.equal(result.data.variants[0].source_records[0], 'SIM-SOURCE-MENU-V1');
});
