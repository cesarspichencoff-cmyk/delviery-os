'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadFeatureFlags } = require('../../src/conversation-crm/native/feature-flags');
const { loadRuntimeCatalogs } = require('../../src/conversation-crm/native/catalogs/operational');
const { createTestConversationEngine } = require('./helpers/native-test-engine');
const { composeResponse } = require('../../src/conversation-crm/native/response-composer');
const { NativeConversationRuntime } = require('../../src/conversation-crm/native/runtime');

const flags = loadFeatureFlags({ file: 'config/conversation-crm/native-flags.simulator.json' });
const catalogs = loadRuntimeCatalogs();
const engine = createTestConversationEngine({ flags, operationalCatalog: catalogs });

function analyze(content, context = {}) {
  return engine.analyze({ content, context });
}

function responseText(content, context = {}) {
  const classification = analyze(content, context);
  return composeResponse({
    classification,
    result: { status: classification.expected_result.status },
    handoff: classification.escalation === 'E0' ? null : { status: 'confirmed' }
  }).text;
}

function runtimeResult(t, content, context = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-real-content-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runtime = new NativeConversationRuntime({ runtimeRoot: root });
  return runtime.processMessage({
    synthetic: true,
    message_type: 'text',
    content,
    channel: 'synthetic',
    subject_id: 'SIM-SUBJECT-REAL-CONTENT',
    conversation_id: 'SIM-CONV-REAL-CONTENT',
    message_id: 'SIM-MSG-REAL-CONTENT',
    correlation_id: 'SIM-CORR-REAL-CONTENT',
    idempotency_key: 'real-content:test:v1',
    occurred_at: runtime.clock.iso(),
    turn_order: 1,
    unit_id: 'SIM-UNIT-001',
    context: { synthetic: true, ...context }
  });
}

test('1. endereço público confirmado usa o unit_id canônico do Itaim', () => {
  const result = analyze('Qual é o endereço do restaurante?');
  assert.equal(result.intent, 'information.address');
  assert.equal(result.entities.unit.value, 'unidade-tata-53069');
  assert.match(result.ideal_response, /João Cachoeira, 278/u);
  assert.equal(result.information_source.classification, 'CONFIRMADO_POR_CESAR');
});

for (const [day, expected] of [
  ['segunda-feira', '12h às 15h e 19h às 23h'],
  ['terça-feira', '12h às 15h e 19h às 23h'],
  ['quarta-feira', '12h às 15h e 19h às 23h'],
  ['quinta-feira', '12h às 15h e 19h às 23h'],
  ['sexta-feira', '12h às 15h e 19h às 23h30'],
  ['sábado', '12h às 16h30 e 19h às 23h30'],
  ['domingo', '11h às 16h30 e 18h às 22h']
]) {
  test(`2. horário regular de ${day}`, () => {
    assert.match(responseText(`Qual é o horário de ${day}?`), new RegExp(expected));
  });
}

test('3. consulta fora do horário declara o limite regular', () => {
  assert.match(responseText('O restaurante abre domingo às 23h?'), /fora do funcionamento regular/u);
});

test('4. feriado sem configuração não recebe horário inventado', () => {
  const text = responseText('Qual é o horário no feriado?');
  assert.match(text, /ainda não está configurado/u);
  assert.match(text, /precisa de validação/u);
});

test('5. reserva apresenta apenas o link oficial e não afirma criação', () => {
  const text = responseText('Quero fazer uma reserva.');
  assert.match(text, /https:\/\/reservation\.getin\.app\/MP9xnVkL/u);
  assert.doesNotMatch(text, /reserva (?:está|foi) confirmada/iu);
});

test('6. tolerância da reserva permanece em 15 minutos', () => {
  assert.match(responseText('Qual é a tolerância da reserva?'), /15 minutos/u);
});

test('7. fila usa o link oficial quando não houver reserva', () => {
  const text = responseText('Como funciona a fila de espera?');
  assert.match(text, /não houver reserva disponível/u);
  assert.match(text, /https:\/\/reservation\.getin\.app\/MP9xnVkL/u);
});

test('8. prazo depois da chamada da fila é cinco minutos', () => {
  assert.match(responseText('Quanto tempo tenho depois que a mesa chamar na fila?'), /5 minutos/u);
});

test('9. tolerância de reserva e prazo de fila permanecem distintos', () => {
  assert.equal(catalogs.publicInfo.reservation.tolerance_minutes, 15);
  assert.equal(catalogs.publicInfo.waitlist.arrival_after_call_minutes, 5);
});

test('10. pedido de cardápio presencial recebe somente o link presencial', () => {
  const text = responseText('Pode mandar o cardápio presencial completo?');
  assert.match(text, /livemenu\.app/u);
  assert.doesNotMatch(text, /neemo\.com\.br|abre\.ai/u);
});

test('11. pedido de cardápio de delivery recebe somente o link de delivery', () => {
  const text = responseText('Quero o menu do delivery.');
  assert.match(text, /deliveryapp\.neemo\.com\.br/u);
  assert.doesNotMatch(text, /livemenu\.app|abre\.ai/u);
});

test('12. Almoço Executivo usa preço, sete cursos e disponibilidade confirmados', () => {
  const text = responseText('Como funciona o Almoço Executivo?');
  assert.match(text, /almoço durante a semana/iu);
  assert.match(text, /sete cursos/u);
  assert.match(text, /R\$ 136 por pessoa/u);
});

test('13. Sugestão Tatá usa preço, cinco cursos e disponibilidade confirmados', () => {
  const text = responseText('Como funciona a Sugestão Tatá?');
  assert.match(text, /jantar, fim de semana e feriado/u);
  assert.match(text, /cinco cursos/u);
  assert.match(text, /R\$ 180 por pessoa/u);
});

test('14. pergunta sobre rodízio recebe modelo à la carte sem distorção', () => {
  const text = responseText('A Sugestão Tatá é rodízio?');
  assert.match(text, /à la carte/u);
  assert.match(text, /não rodízio/u);
});

test('15. repetição do almoço não inventa quais itens podem repetir', () => {
  const text = responseText('Posso repetir no Almoço Executivo?');
  assert.match(text, /direito a uma repetição/u);
  assert.match(text, /ainda precisam de confirmação/u);
});

test('16. formas de pagamento exibem somente as oito opções confirmadas', () => {
  const text = responseText('Quais pagamentos vocês aceitam?');
  for (const method of ['Visa débito', 'Visa crédito', 'Mastercard débito', 'Mastercard crédito', 'American Express', 'Ticket Restaurante', 'Alelo', 'Pluxee']) {
    assert.match(text, new RegExp(method));
  }
});

test('17. forma de pagamento não confirmada permanece desconhecida', () => {
  const text = responseText('Vocês aceitam Pix?');
  assert.match(text, /ainda não consta entre as opções validadas/u);
  assert.doesNotMatch(text, /\b(?:sim|não aceitamos)\b/iu);
});

test('18. taxa de rolha não inventa unidade de cobrança', () => {
  const text = responseText('Qual é a taxa de rolha?');
  assert.equal(text, 'A taxa de rolha é de R$ 70.');
  assert.doesNotMatch(text, /garrafa|mesa/u);
});

test('19. valet informa somente valor e localização confirmados', () => {
  const text = responseText('Quanto custa o valet e onde fica?');
  assert.equal(text, 'O valet custa R$ 45 e fica em frente ao restaurante.');
});

test('20. delivery próprio apresenta o link correto', () => {
  assert.match(responseText('Onde faço pedido pelo delivery próprio?'), /deliveryapp\.neemo\.com\.br\/delivery\/5936\/menu/u);
});

test('21. iFood e delivery próprio são apresentados sem preferência automática', () => {
  const text = responseText('Posso pedir pelo iFood ou pelo delivery próprio?');
  assert.match(text, /delivery próprio/u);
  assert.match(text, /iFood/u);
  assert.match(text, /Não há preferência automática/u);
});

test('22. Oke possui intenção própria e coleta somente os três campos necessários', () => {
  const result = analyze('Quero encomendar um oke.');
  assert.equal(result.intent, 'event.oke_pickup');
  assert.equal(result.subintent, 'evento_oke_retirada');
  assert.deepEqual(result.fields_missing, ['party_size', 'pickup_time', 'requested_items']);
  assert.equal(result.escalation, 'E1');
});

test('23. Oke permanece retirada na loja e depende da equipe', () => {
  const text = responseText('Quero um oke para retirada.');
  assert.match(text, /retirada na loja/u);
  assert.match(text, /dependem de confirmação da equipe/u);
});

test('24. devolução das tábuas permanece em até dois dias', () => {
  assert.match(responseText('Quando devolvo as tábuas do oke?'), /em até dois dias/u);
});

test('25. prazo de retorno do Oke permanece até o dia seguinte', () => {
  assert.match(responseText('Quando vocês retornam sobre o oke?'), /até o dia seguinte/u);
});

test('26. pedido de entrega do Oke é recusado sem inventar alternativa', () => {
  const text = responseText('Vocês entregam o oke?');
  assert.match(text, /não inclui entrega/u);
  assert.doesNotMatch(text, /podemos entregar|taxa de entrega/iu);
});

test('27. solicitação de reembolso no iFood orienta o aplicativo e não promete reembolso', (t) => {
  const result = runtimeResult(t, 'Quero reembolso do pedido no iFood.');
  assert.equal(result.classification.intent, 'occurrence.refund_request');
  assert.match(result.response.text, /Ajuda ou Reportar problema/u);
  assert.match(result.response.text, /sem prometer reembolso/u);
  assert.equal(result.closure.expected_state, 'open');
});

test('28. problema de produto no iFood registra ocorrência e preserva contexto', (t) => {
  const result = runtimeResult(t, 'Pedido 1234 no iFood, faltou o refrigerante.');
  assert.equal(result.classification.intent, 'occurrence.missing_item');
  assert.match(result.response.text, /Registre a solicitação pelo pedido no iFood/u);
  assert.equal(result.real_driver_used, false);
  assert.equal(result.external_system_accessed, false);
});

test('29. problema de transporte não culpa automaticamente loja ou iFood', () => {
  const result = analyze('Meu pedido do iFood veio revirado durante a entrega.');
  assert.equal(result.intent, 'occurrence.order_disrupted');
  assert.match(result.ideal_response, /pode depender da análise da entrega ou da plataforma/u);
  assert.doesNotMatch(result.ideal_response, /culpa|responsabilidade|negar/iu);
});

test('30. cliente que já abriu chamado não recebe o passo a passo novamente', () => {
  const result = analyze('Já abri o chamado no iFood por item faltando.');
  assert.equal(result.intent, 'occurrence.missing_item');
  assert.match(result.ideal_response, /chamado já foi aberto/u);
  assert.doesNotMatch(result.ideal_response, /Ajuda ou Reportar problema/u);
});

test('conteúdo público não ativa drivers reais nem remove o bloqueio de produção', (t) => {
  const result = runtimeResult(t, 'Qual é o endereço?');
  assert.equal(result.real_driver_used, false);
  assert.equal(result.external_system_accessed, false);
  assert.equal(result.production_blocked, true);
  assert.equal(result.handoff, null);
});
