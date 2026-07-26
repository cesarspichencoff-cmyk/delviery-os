'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  NativeConversationRuntime,
  NativeConversationEngine,
  loadFeatureFlags,
  loadRuntimeCatalogs,
  loadCanonicalCatalogs,
  canonicalJsonHash,
  scanTree,
  scenarioInputFor,
  runScenarioOnRuntime
} = require('../../src/conversation-crm/native');

function runtimeRoot(t, prefix = 'deliveryos-native-corrective-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function createInput(runtime, turn, content, extra = {}) {
  return {
    synthetic: true,
    message_type: 'text',
    content,
    channel: 'synthetic',
    subject_id: 'SIM-SUBJECT-CORRECTIVE',
    conversation_id: 'SIM-CONV-CORRECTIVE',
    message_id: `SIM-MSG-CORRECTIVE-${turn}`,
    correlation_id: `SIM-CORR-CORRECTIVE-${turn}`,
    idempotency_key: `corrective:${turn}`,
    occurred_at: runtime.clock.iso(),
    turn_order: turn,
    unit_id: 'SIM-UNIT-001',
    context: { synthetic: true },
    ...extra
  };
}

test('hash JSON canônico independe de LF, CRLF, BOM e newline final', () => {
  const logical = '{"b":[2,1],"a":{"x":true}}';
  const variants = [
    logical,
    `${logical}\n`,
    `${logical}\r\n`,
    `\uFEFF${logical}`,
    `\uFEFF${logical.replace(/,/g, ',\r\n')}\r\n`,
    '{\n  "a": {"x": true},\n  "b": [2, 1]\n}\n'
  ];
  const hashes = new Set(variants.map((value) => canonicalJsonHash(Buffer.from(value, 'utf8'))));
  assert.equal(hashes.size, 1);
  assert.notEqual(canonicalJsonHash('{"a":{"x":false},"b":[2,1]}'), [...hashes][0]);
});

test('runtime não carrega o oráculo de cenários e scenario_id não muda intenção', (t) => {
  const runtime = new NativeConversationRuntime({ runtimeRoot: runtimeRoot(t) });
  assert.equal(Object.hasOwn(runtime.catalogs, 'scenarios'), false);
  const result = runtime.processMessage(createInput(runtime, 1, 'Mensagem neutra sem intenção reconhecível.', {
    report_scenario_id: 'TATA-SC-186',
    context: { synthetic: true, scenario_id: 'TATA-SC-186' }
  }));
  assert.equal(result.scenario_id, 'TATA-SC-186');
  assert.equal(result.classification.scenario_id, null);
  assert.equal(result.classification.intent, 'conversation.ambiguous');
});

test('catálogo classifica textos sem IDs, em ordem inversa, pelo Engine real', () => {
  const flags = loadFeatureFlags({ file: 'config/conversation-crm/native-flags.simulator.json' });
  const engine = new NativeConversationEngine({ flags, catalogs: loadRuntimeCatalogs() });
  const scenarios = [...loadCanonicalCatalogs().scenarios.scenarios].reverse();
  for (const scenario of scenarios) {
    const result = engine.analyze({ content: scenario.input, context: {} });
    assert.equal(result.intent, scenario.intent, scenario.scenario_id);
    assert.equal(result.scenario_id, null);
  }
});

test('mutação descartável do classificador torna o oráculo vermelho', () => {
  const flags = loadFeatureFlags({ file: 'config/conversation-crm/native-flags.simulator.json' });
  const engine = new NativeConversationEngine({ flags, catalogs: loadRuntimeCatalogs() });
  engine.classifyIntent = () => 'feedback.praise';
  const scenario = loadCanonicalCatalogs().scenarios.scenarios.find((item) => item.scenario_id === 'TATA-SC-001');
  assert.notEqual(engine.analyze({ content: scenario.input, context: {} }).intent, scenario.intent);
});

test('30 variações adversariais inéditas atravessam o classificador sem atalho', () => {
  const flags = loadFeatureFlags({ file: 'config/conversation-crm/native-flags.simulator.json' });
  const engine = new NativeConversationEngine({ flags, catalogs: loadRuntimeCatalogs() });
  const cases = [
    ['Estamos em onze e chegando', 'reservation.large_group'],
    ['Mesa para 9 hoje', 'reservation.large_group'],
    ['Grupo com doze pessoas', 'reservation.large_group'],
    ['Somos 10 e chegamos às 20h', 'reservation.large_group'],
    ['10 pessoas chegando agora', 'reservation.large_group'],
    ['Faltou a bebida', 'occurrence.missing_item'],
    ['Não mandaram o shoyu', 'occurrence.missing_item'],
    ['Veio sem sobremesa', 'occurrence.missing_item'],
    ['Ficou faltando uma peça', 'occurrence.missing_item'],
    ['N veio o refrigerante', 'occurrence.missing_item'],
    ['Veio outro item', 'occurrence.wrong_item'],
    ['Vieram duas peças em vez de três', 'occurrence.wrong_quantity'],
    ['Pedi sem cebola e veio com', 'occurrence.personalization_ignored'],
    ['A embalagem chegou rasgada', 'occurrence.packaging_damage'],
    ['O pedido chegou revirado', 'occurrence.order_disrupted'],
    ['Encontrei cabelo no prato', 'occurrence.foreign_body'],
    ['A comida está com cheiro estranho', 'occurrence.quality'],
    ['Tive reação alérgica', 'occurrence.allergen'],
    ['Duas pessoas tiveram vômito', 'occurrence.health_symptom'],
    ['Não parecia fresco', 'occurrence.freshness'],
    ['Qual o horário de funcionamento', 'information.hours'],
    ['Onde fica a unidade', 'information.address'],
    ['Aceita pix', 'information.payment'],
    ['Quero ver o cardápio', 'information.menu'],
    ['Posso levar vinho, tem rolha', 'information.corkage'],
    ['Onde está meu pedido', 'order.status'],
    ['Quero entrar na fila', 'waitlist.create'],
    ['Quero reservar', 'reservation.create'],
    ['Não quero mais receber mensagens', 'privacy.opt_out'],
    ['Quero meus dados guardados', 'privacy.access_request']
  ];
  assert.equal(cases.length, 30);
  for (const [content, expected] of cases) assert.equal(engine.analyze({ content, context: {} }).intent, expected, content);
});

test('PII, erros e campos desconhecidos não chegam a nenhum artefato persistido', (t) => {
  const root = runtimeRoot(t, 'deliveryos-native-privacy-corrective-');
  const runtime = new NativeConversationRuntime({ runtimeRoot: root });
  const markers = [
    'privacy.person@example.test',
    '529.982.247-25',
    '(11) 99999-8877',
    'Rua Marcador Privado 123',
    'TOKEN-PRIVACY-XYZ',
    'COOKIE-PRIVACY-XYZ',
    'DELIVERY-CODE-XYZ',
    'Pessoa Marcador Completa',
    'arquivo-privado-marker.txt',
    'STACK-MARKER-PRIVACY',
    'CAUSE-MARKER-PRIVACY',
    'unicode.marker@example.test'
  ];
  const content = `Faltou a bebida. ${markers.join(' | ')}`;
  runtime.processMessage(createInput(runtime, 1, content, {
    context: {
      synthetic: true,
      customer: { address: markers[3], unknown_payload: markers[7] },
      nested: [{ token: markers[4], cookie: markers[5], delivery_code: markers[6] }],
      error: { message: markers[10], stack: `at synthetic (${markers[9]}:1:1)`, cause: markers[10] },
      unicode: 'u n i c o d e . m a r k e r @ e x a m p l e . t e s t'
    }
  }));
  const persisted = fs.readdirSync(root).map((name) => fs.readFileSync(path.join(root, name), 'utf8')).join('\n');
  for (const marker of markers) assert.equal(persisted.includes(marker), false, marker);
  assert.equal(scanTree(root, { markers }).passed, true);
});

test('scanner independente falha para raiz ausente, zero arquivos, conteúdo e nome contaminados', (t) => {
  const parent = runtimeRoot(t, 'deliveryos-native-scan-control-');
  const missing = path.join(parent, 'missing');
  assert.equal(scanTree(missing).passed, false);
  const empty = path.join(parent, 'empty');
  fs.mkdirSync(empty);
  assert.equal(scanTree(empty).passed, false);
  const marker = 'positive-control@example.test';
  fs.writeFileSync(path.join(parent, 'artifact.txt'), marker, 'utf8');
  assert.equal(scanTree(parent, { markers: [marker] }).passed, false);
  fs.rmSync(path.join(parent, 'artifact.txt'));
  fs.writeFileSync(path.join(parent, marker), 'safe', 'utf8');
  assert.equal(scanTree(parent, { markers: [marker] }).passed, false);
});

test('pedido informado antes da ocorrência é preservado sem quarentena', (t) => {
  const runtime = new NativeConversationRuntime({ runtimeRoot: runtimeRoot(t) });
  const first = runtime.processMessage(createInput(runtime, 1, 'Pedido 1234 no iFood.'));
  const second = runtime.processMessage(createInput(runtime, 2, 'Faltou meu refrigerante.'));
  assert.equal(second.case_id, first.case_id);
  assert.equal(second.order_id, 'order_ref_1234');
  assert.equal(second.classification.intent, 'occurrence.missing_item');
  assert.equal(second.classification.fields_missing.length, 0);
  assert.equal(runtime.store.snapshot().quarantine, 0);
});

test('correção de pedido preserva evento superseded e atualiza a projeção do caso', (t) => {
  const runtime = new NativeConversationRuntime({ runtimeRoot: runtimeRoot(t) });
  const first = runtime.processMessage(createInput(runtime, 1, 'Pedido 1234 no iFood, faltou a bebida.'));
  const corrected = runtime.processMessage(createInput(runtime, 2, 'Na verdade o pedido correto é 5678.'));
  const history = runtime.context.events(first.conversation_id, { case_id: first.case_id })
    .filter((event) => event.payload.field === 'order_reference');
  assert.equal(corrected.case_id, first.case_id);
  assert.equal(corrected.order_id, 'order_ref_5678');
  assert.equal(history.some((event) => event.payload.state === 'superseded'), true);
  assert.equal(runtime.context.project(first.conversation_id, { case_id: first.case_id }).order_reference.value, 'order_ref_5678');
  assert.equal(runtime.crm.projectCase(first.case_id).order_id, 'order_ref_5678');
  assert.equal(runtime.store.snapshot().quarantine, 0);
});

test('dois pedidos e dois assuntos mantêm casos e timelines separados', (t) => {
  const runtime = new NativeConversationRuntime({ runtimeRoot: runtimeRoot(t) });
  const one = runtime.processMessage(createInput(runtime, 1, 'Pedido 1111 no iFood, faltou a bebida.'));
  const two = runtime.processMessage(createInput(runtime, 2, 'Pedido 2222 no iFood, veio outro item.'));
  const info = runtime.processMessage(createInput(runtime, 3, 'Quero saber o horário.'));
  assert.notEqual(one.case_id, two.case_id);
  assert.notEqual(two.case_id, info.case_id);
  assert.equal(runtime.context.project(one.conversation_id, { case_id: one.case_id }).order_reference.value, 'order_ref_1111');
  assert.equal(runtime.context.project(two.conversation_id, { case_id: two.case_id }).order_reference.value, 'order_ref_2222');
  assert.equal(runtime.context.project(info.conversation_id, { case_id: info.case_id }).order_reference, undefined);
  assert.equal(runtime.store.snapshot().quarantine, 0);
});

test('item adicional e mudança de unidade não sobrescrevem silenciosamente o contexto', (t) => {
  const runtime = new NativeConversationRuntime({ runtimeRoot: runtimeRoot(t) });
  const first = runtime.processMessage(createInput(runtime, 1, 'Pedido 3333 no iFood, faltou a bebida.'));
  runtime.processMessage(createInput(runtime, 2, 'Também faltou o shoyu.'));
  runtime.processMessage(createInput(runtime, 3, 'Agora é unidade SIM-UNIT-002.'));
  const projection = runtime.context.project(first.conversation_id, { case_id: first.case_id });
  assert.deepEqual(projection.missing_items.value, ['bebida', 'shoyu']);
  assert.equal(projection.unit.value, 'SIM-UNIT-002');
  assert.equal(runtime.store.snapshot().quarantine, 0);
});

test('respostas curtas válidas usam a pendência correta e nunca vão à quarentena', (t) => {
  const runtime = new NativeConversationRuntime({ runtimeRoot: runtimeRoot(t) });
  const first = runtime.processMessage(createInput(runtime, 1, 'Faltou meu refrigerante.'));
  const channel = runtime.processMessage(createInput(runtime, 2, 'no iFood'));
  const order = runtime.processMessage(createInput(runtime, 3, 'pedido 4455'));
  assert.equal(channel.case_id, first.case_id);
  assert.equal(order.case_id, first.case_id);
  const projection = runtime.context.project(first.conversation_id, { case_id: first.case_id });
  assert.equal(projection.order_channel.value, 'marketplace');
  assert.equal(projection.order_reference.value, 'order_ref_4455');
  assert.equal(runtime.store.snapshot().quarantine, 0);
});

test('caso fechado reabre com nova evidência sem perder a timeline', (t) => {
  const runtime = new NativeConversationRuntime({ runtimeRoot: runtimeRoot(t) });
  const first = runtime.processMessage(createInput(runtime, 1, 'Pedido 7777 no iFood, faltou a bebida.'));
  runtime.crm.closeCase({ case_id: first.case_id, conversation_id: first.conversation_id, revision: 1, reason: 'synthetic_resolution' });
  assert.equal(runtime.crm.projectCase(first.case_id).state, 'closed');
  const reopened = runtime.processMessage(createInput(runtime, 2, 'Pedido 7777 no iFood, também faltou o shoyu.'));
  assert.equal(reopened.case_id, first.case_id);
  assert.equal(runtime.crm.projectCase(first.case_id).state, 'open');
  assert.equal(runtime.store.eventsOfType('crm.case_reopened').length, 1);
  assert.equal(runtime.store.snapshot().quarantine, 0);
});

test('quarentena recebe somente payload técnico inválido e não ecoa a mensagem', (t) => {
  const root = runtimeRoot(t);
  const runtime = new NativeConversationRuntime({ runtimeRoot: root });
  const marker = 'invalid-payload-marker@example.test';
  assert.throws(() => runtime.processMessage(createInput(runtime, 0, marker)), { code: 'TURN_ORDER_INVALID' });
  assert.equal(runtime.store.snapshot().quarantine, 1);
  const quarantine = fs.readFileSync(path.join(root, 'conversation-native-quarantine.runtime.jsonl'), 'utf8');
  assert.equal(quarantine.includes(marker), false);
  runtime.processMessage(createInput(runtime, 1, 'sim'));
  assert.equal(runtime.store.snapshot().quarantine, 1);
});

test('TATA-SC-194 envia exatamente uma notificação após confirmação e replay', (t) => {
  const root = runtimeRoot(t, 'deliveryos-native-notification-');
  let runtime = new NativeConversationRuntime({ runtimeRoot: root });
  const input = scenarioInputFor('TATA-SC-194', runtime.clock);
  const first = runScenarioOnRuntime(runtime, 'TATA-SC-194');
  assert.equal(first.notification.status, 'confirmed');
  assert.equal(runtime.notifications.snapshot().sent, 1);
  assert.equal(runtime.store.eventsOfType('crm.notification_recorded').length, 1);
  assert.equal(runtime.store.eventsOfType('observability.flow').filter((event) => event.payload.checkpoint === 'notification').length, 1);
  runtime.processMessage(input, { scenario_id: 'TATA-SC-194' });
  runtime = new NativeConversationRuntime({ runtimeRoot: root });
  runtime.processMessage(input, { scenario_id: 'TATA-SC-194' });
  assert.equal(runtime.notifications.snapshot().sent, 1);
  assert.equal(runtime.store.eventsOfType('crm.notification_recorded').length, 1);
});

test('notificação é bloqueada por opt-out ou caso fechado', (t) => {
  const runtime = new NativeConversationRuntime({ runtimeRoot: runtimeRoot(t) });
  const optOut = runtime.processMessage(createInput(runtime, 1, 'Quero ser avisado quando houver mudança real.', {
    context: { synthetic: true, opt_out: true }
  }));
  assert.equal(optOut.classification.capability_id, 'notification.send');
  assert.equal(optOut.notification.status, 'prohibited');
  const closed = runtime.notifications.send({
    synthetic: true,
    case_active: false,
    event_confirmed: true,
    policy_allows: true,
    opt_out: false,
    channel: 'synthetic',
    case_id: optOut.case_id,
    event_id: 'SIM-EVENT-CLOSED',
    content_code: 'confirmed_operational_change',
    recipient_id: 'SIM-SUBJECT-CORRECTIVE',
    idempotency_key: 'closed-case-notification'
  });
  assert.equal(closed.status, 'prohibited');
  assert.equal(runtime.notifications.snapshot().sent, 0);
});
