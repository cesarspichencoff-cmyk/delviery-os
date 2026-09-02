'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { HomologationService } = require('../../tools/conversation-crm/homologation/service');

function withTemporaryService(t, contexts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-structured-product-'));
  const feedbackRoot = path.join(root, 'feedback');
  const chatRuntimeRoot = path.join(root, 'native-runtime-must-not-exist');
  const customerMenu = {
    contextForChat(input) {
      return typeof contexts === 'function' ? contexts(input) : contexts;
    },
    defaultUnitForChannel() { return 'unit-for-test'; },
    resetChatContext() { return { context_reset: true }; }
  };
  const service = new HomologationService({ feedbackRoot, chatRuntimeRoot, customerMenu });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { service, chatRuntimeRoot };
}

test('product wiring consulta autoridade pública estruturada sem executar Native composer', (t) => {
  const { service, chatRuntimeRoot } = withTemporaryService(t, {
    conversation_state: {
      semantic_transition: 'SWITCH',
      turn_analysis: { active_goal: 'restaurant_information' },
      facts_added: []
    },
    hospitality_context: {}
  });
  const execution = service.productExecutionStructured({ message: 'Há sistema de rodízio? Qual é o valor?' });
  const result = execution.result;
  assert.equal(result.native_response_composer_executed, false);
  assert.equal(result.structured_authority.topic, 'restaurant_model');
  assert.equal(result.structured_authority.intent, 'information.menu');
  assert.deepEqual(result.structured_authority.source_ids, ['TATA_OPERATIONAL_PUBLIC_INFO_V1']);
  assert.match(result.structured_authority.knowledge[0], /à la carte/iu);
  assert.doesNotMatch(result.structured_authority.knowledge[0], /R\$\s*(?:92|80|46)/u);
  assert.equal(execution.publicResult.turn.response, null);
  assert.equal(service.runtime, null);
  assert.equal(fs.existsSync(chatRuntimeRoot), false);
});

test('reservation permanece vinculada à autoridade operacional canônica', (t) => {
  const { service, chatRuntimeRoot } = withTemporaryService(t);
  const execution = service.productExecutionStructured({ message: 'Como faço para consultar uma reserva?' });
  const authority = execution.result.structured_authority;
  assert.equal(authority.topic, 'reservation');
  assert.equal(authority.intent, 'reservation.create');
  assert.deepEqual(authority.source_ids, ['TATA_OPERATIONAL_PUBLIC_INFO_V1']);
  assert.equal(authority.source_classification, 'CONFIRMADO_POR_CESAR');
  assert.equal(authority.catalog_version, '1.0.0');
  assert.equal(authority.catalog_hash.length, 64);
  assert.equal(authority.authorized_links.length, 1);
  assert.match(authority.authorized_links[0], /^https:\/\/reservation\.getin\.app\//u);
  assert.equal(authority.knowledge.length, 1);
  assert.equal(execution.result.native_response_composer_executed, false);
  assert.equal(fs.existsSync(chatRuntimeRoot), false);
});

test('canal técnico local_simulator não contamina filtro comercial do cardápio', (t) => {
  let observedInput = null;
  const { service } = withTemporaryService(t, (input) => {
    observedInput = input;
    return { conversation_state: {}, hospitality_context: {} };
  });
  service.productExecutionStructured({ message: 'Quero ajuda para escolher.', channel: 'local_simulator' });
  assert.equal(observedInput.channel, null);
  assert.equal(observedInput.unit_id, null);
});

test('menu genérico no contexto iFood usa a superfície vinculada ao canal uma única vez', (t) => {
  const menuUrl = 'https://www.ifood.com.br/delivery/menu-contextual';
  const { service } = withTemporaryService(t, {
    conversation_state: { channel: 'ifood', facts_added: [], turn_analysis: {} },
    hospitality_context: {},
    conversation_guidance: {
      direct_answers: [`Este é o cardápio do iFood: ${menuUrl}`],
      question: null,
      knowledge_source: 'menu-source-ifood-v1',
      candidates_found: []
    }
  });
  const authority = service.productExecutionStructured({ message: 'Pode compartilhar o menu?' }).result.structured_authority;

  assert.equal(authority.topic, 'institutional_menu');
  assert.deepEqual(authority.knowledge, [`Este é o cardápio do iFood: ${menuUrl}`]);
  assert.deepEqual(authority.authorized_links, [menuUrl]);
  assert.deepEqual(authority.source_ids, ['menu-source-ifood-v1']);
});

test('product wiring preserva query, filtros, relação e resultado da menu authority sem texto Native', (t) => {
  const { service } = withTemporaryService(t, (input) => ({
    conversation_state: {
      semantic_transition: 'REFINE',
      channel: input.channel,
      unit_id: input.unit_id,
      user_repair_signal: true,
      negative_feedback_signal: false,
      preferences: { requested_category: 'sushi' },
      facts_added: [{ field: 'requested_category', value: 'sushi' }],
      turn_analysis: { active_goal: 'recommendation', requested_category: 'sushi' }
    },
    hospitality_context: {
      preparation_preferences: ['raw'],
      preferred_ingredients: ['salmon'],
      excluded_ingredients: [],
      dietary_restrictions: [],
      allergies: []
    },
    menu_context: {
      channel: input.channel,
      unit_id: input.unit_id,
      items: [{ item_id: 'PUBLIC-ITEM-A' }],
      unknowns: ['availability_unconfirmed']
    },
    conversation_guidance: {
      direct_answers: ['Opção revisada pela autoridade de cardápio.'],
      question: null,
      knowledge_source: 'menu-source-ifood-v1',
      candidates_found: ['PUBLIC-ITEM-A']
    }
  }));
  const execution = service.productExecutionStructured({
    message: 'Prefiro uma opção crua com salmão.',
    channel: 'ifood',
    unit_id: 'unit-for-test'
  });
  const authority = execution.result.structured_authority;
  assert.equal(authority.query_filter.channel, 'ifood');
  assert.equal(authority.query_filter.requested_category, 'sushi');
  assert.deepEqual(authority.query_filter.preparation_preferences, ['raw']);
  assert.deepEqual(authority.query_filter.candidate_item_ids, ['PUBLIC-ITEM-A']);
  assert.deepEqual(authority.candidates_found, ['PUBLIC-ITEM-A']);
  assert.deepEqual(authority.source_ids, ['menu-source-ifood-v1']);
  assert.equal(execution.publicResult.turn.diagnostic.semantic_transition, 'REFINE');
  assert.equal(execution.publicResult.turn.diagnostic.user_repair_signal, true);
  assert.equal(execution.publicResult.turn.diagnostic.native_response_composer_executed, false);
});
