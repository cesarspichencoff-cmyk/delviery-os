'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  composeConversationalResponse,
  validateComposedResponse,
  countEmoji,
  NativeConversationRuntime
} = require('../../src/conversation-crm/native');
const { loadFeatureFlags } = require('../../src/conversation-crm/native/feature-flags');
const { loadRuntimeCatalogs } = require('../../src/conversation-crm/native/catalogs/operational');
const { createTestConversationEngine } = require('./helpers/native-test-engine');

const flags = loadFeatureFlags({ file: 'config/conversation-crm/native-flags.simulator.json' });
const engine = createTestConversationEngine({ flags, operationalCatalog: loadRuntimeCatalogs() });

function expand(prompts, total) {
  return Array.from({ length: total }, (_, index) => prompts[index % prompts.length]);
}

const GROUPS = Object.freeze({
  simple: expand([
    'Qual é a taxa de rolha?',
    'Quanto custa o valet?',
    'Qual é o endereço?',
    'Quais são os horários de domingo?',
    'Vocês aceitam Pix?',
    'Pode mandar o cardápio presencial?',
    'Quero o menu do delivery.',
    'Qual é a tolerância da reserva?',
    'Quando devolvo as tábuas do oke?',
    'Vocês trabalham com rodízio?'
  ], 30),
  interested: expand([
    'Como funciona o Almoço Executivo?',
    'O que vem nos sete cursos do Almoço Executivo?',
    'Como é a Sugestão Tatá?',
    'Quero conhecer melhor o cardápio.',
    'Como funciona a reserva?',
    'Como funciona a fila de espera?',
    'Quero encomendar um oke para retirada.',
    'Posso pedir pelo iFood ou pelo delivery próprio?',
    'Adorei a proposta e quero conhecer o TATÁ.',
    'A Sugestão Tatá é rodízio?'
  ], 30),
  complaints: expand([
    'Faltou meu refrigerante no pedido.',
    'Não veio a bebida.',
    'Esqueceram o shoyu.',
    'Veio outro item.',
    'A quantidade veio errada.',
    'Pedi sem cebola e veio com.',
    'Meu pedido veio revirado.',
    'O pedido está atrasado.',
    'Quero solicitar análise de reembolso no iFood.',
    'Estou frustrado porque o item não veio.'
  ], 30),
  reservations: expand([
    'Quero fazer uma reserva.',
    'Quero reservar para hoje.',
    'Qual é a tolerância da reserva?',
    'Como funciona a fila de espera?',
    'Quanto tempo tenho depois da chamada da mesa?',
    'Quero entrar na fila agora.',
    'Não encontrei horário de reserva.',
    'A reserva está confirmada?',
    'Quero consultar os horários disponíveis.',
    'Como acompanho minha posição na fila?'
  ], 20),
  delivery: expand([
    'Onde faço o pedido?',
    'Quero pedir pelo delivery próprio.',
    'Posso pedir pelo iFood?',
    'Quero o cardápio do delivery.',
    'Meu pedido do iFood veio errado.',
    'O pedido do iFood veio sem bebida.',
    'Meu pedido veio revirado durante a entrega.',
    'A última atualização do pedido é antiga.',
    'Já abri o chamado no iFood.',
    'Quero saber se meu pedido já está pronto.'
  ], 20),
  foodSafety: expand([
    'Encontrei cabelo no prato.',
    'O alimento está com cheiro estranho.',
    'O alimento parece impróprio.',
    'Tive reação alérgica.',
    'Estou com dificuldade para respirar.',
    'Tive vômito e diarreia.',
    'Mais de uma pessoa passou mal.',
    'Encontrei um corpo estranho.',
    'O alimento parece sem frescor.',
    'Duas pessoas tiveram vômito e diarreia.'
  ], 10),
  events: expand([
    'Quero encomendar um oke.',
    'Quero um oke para retirada.',
    'Vocês entregam o oke?',
    'Quando devolvo as tábuas do oke?',
    'Quando vocês retornam sobre o oke?'
  ], 10),
  largeGroup: expand([
    'Estamos em 10 pessoas e chegando.',
    'Somos dez.',
    'Mesa para 9.',
    'Grupo de 12.',
    '11 pessoas chegando.'
  ], 10),
  ambiguous: expand([
    'Preciso de ajuda.',
    'Quero falar sobre uma coisa.',
    'Não sei explicar.',
    'Pode me ajudar?',
    'Tenho uma dúvida.'
  ], 10)
});

function humanize(content, index, context = {}) {
  const classification = engine.analyze({ content, context });
  return composeConversationalResponse({
    classification,
    result: { status: classification.expected_result?.status || 'unknown' },
    handoff: classification.escalation === 'E0' ? null : { status: 'confirmed' },
    seed: 'TATA-SIM-V1',
    conversation: {
      conversation_id: `SIM-HUMAN-${String(index).padStart(4, '0')}`,
      turn_order: 1,
      source_text: content,
      previous_responses: [],
      context
    }
  });
}

function assertQuality(response, options = {}) {
  assert.equal(response.humanized, true);
  assert.equal(response.validation.passed, true, response.validation.findings.join(','));
  assert.equal(response.text.length > 0, true);
  assert.equal(response.text.length <= (options.maxLength || 620), true, response.text);
  assert.doesNotMatch(response.text, /setor responsável|para que possamos|olá, tudo bem/iu);
  assert.doesNotMatch(response.text, /\b(?:vou|vamos)\s+(?:reembolsar|dar crédito|oferecer cortesia)\b/iu);
  assert.equal(countEmoji(response.text) <= (response.plan.response_size === 'careful' ? 0 : 2), true);
}

test('30 informações simples são proporcionais e usam somente fatos permitidos', () => {
  assert.equal(GROUPS.simple.length, 30);
  GROUPS.simple.forEach((prompt, index) => assertQuality(humanize(prompt, index), { maxLength: 420 }));
});

test('30 conversas de interesse recebem contexto sem tom publicitário', () => {
  assert.equal(GROUPS.interested.length, 30);
  GROUPS.interested.forEach((prompt, index) => {
    const response = humanize(prompt, 100 + index);
    assertQuality(response);
    assert.doesNotMatch(response.text, /imperdível|melhor da cidade|promoção/iu);
  });
});

test('30 reclamações usam acolhimento, ação concreta e zero compensação automática', () => {
  assert.equal(GROUPS.complaints.length, 30);
  GROUPS.complaints.forEach((prompt, index) => {
    const response = humanize(prompt, 200 + index);
    assertQuality(response);
    assert.match(response.text, /(?:entend|sinto|poxa|registr|contexto)/iu);
  });
});

test('20 reservas e filas preservam link, limites e ausência de confirmação inventada', () => {
  assert.equal(GROUPS.reservations.length, 20);
  GROUPS.reservations.forEach((prompt, index) => {
    const response = humanize(prompt, 300 + index);
    assertQuality(response);
    if (response.text.includes('reservation.getin.app')) assert.match(response.text, /MP9xnVkL/u);
    if (response.status_reflected !== 'confirmed') assert.doesNotMatch(response.text, /\b(?:está|foi)\s+confirmada\b/iu);
  });
});

test('20 situações de delivery distinguem informação, pedido e ocorrência', () => {
  assert.equal(GROUPS.delivery.length, 20);
  GROUPS.delivery.forEach((prompt, index) => assertQuality(humanize(prompt, 400 + index)));
});

test('20 conversas multiturno preservam continuidade e perguntam somente o próximo campo', (t) => {
  for (let index = 0; index < 20; index += 1) {
    const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), `deliveryos-humanized-multiturn-${index}-`));
    t.after(() => fs.rmSync(runtimeRoot, { recursive: true, force: true }));
    const runtime = new NativeConversationRuntime({ runtimeRoot });
    const base = {
      synthetic: true,
      message_type: 'text',
      channel: 'synthetic',
      subject_id: `SIM-SUBJECT-MULTI-${index}`,
      conversation_id: `SIM-CONV-MULTI-${index}`,
      unit_id: 'SIM-UNIT-001',
      context: { synthetic: true }
    };
    const first = runtime.processMessage({
      ...base,
      content: 'Quero reservar para hoje.',
      message_id: `SIM-MSG-MULTI-${index}-1`,
      correlation_id: `SIM-CORR-MULTI-${index}-1`,
      idempotency_key: `multi:${index}:1`,
      occurred_at: runtime.clock.iso(),
      turn_order: 1
    });
    const second = runtime.processMessage({
      ...base,
      content: 'Somos quatro.',
      message_id: `SIM-MSG-MULTI-${index}-2`,
      correlation_id: `SIM-CORR-MULTI-${index}-2`,
      idempotency_key: `multi:${index}:2`,
      occurred_at: runtime.clock.iso(),
      turn_order: 2
    });
    assertQuality(first.response);
    assertQuality(second.response);
    assert.equal(second.response.plan.conversation_stage, 'continuation');
    assert.match(second.response.text, /para 4 pessoas/u);
    assert.match(second.response.text, /qual horário/u);
    assert.doesNotMatch(second.response.text, /olá|quantas pessoas/iu);
  }
});

test('10 casos sanitários mantêm tom sério, protocolo aberto e zero emoji', () => {
  assert.equal(GROUPS.foodSafety.length, 10);
  GROUPS.foodSafety.forEach((prompt, index) => {
    const response = humanize(prompt, 500 + index);
    assertQuality(response);
    assert.equal(countEmoji(response.text), 0);
    assert.doesNotMatch(response.text, /não é nada|com certeza foi|o diagnóstico é|diagnosticamos/iu);
  });
});

test('10 eventos e Okes preservam retirada, confirmação humana e lacunas', () => {
  assert.equal(GROUPS.events.length, 10);
  GROUPS.events.forEach((prompt, index) => assertQuality(humanize(prompt, 600 + index)));
});

test('10 grupos grandes preservam R05 e nunca confirmam fila ou reserva', () => {
  assert.equal(GROUPS.largeGroup.length, 10);
  GROUPS.largeGroup.forEach((prompt, index) => {
    const response = humanize(prompt, 700 + index);
    assertQuality(response);
    assert.equal(response.plan.intent, 'reservation.large_group');
    assert.doesNotMatch(response.text, /\b(?:fila|reserva)\s+(?:está|foi)\s+confirmada\b/iu);
  });
});

test('10 mensagens ambíguas pedem contexto curto sem inventar intenção', () => {
  assert.equal(GROUPS.ambiguous.length, 10);
  GROUPS.ambiguous.forEach((prompt, index) => {
    const response = humanize(prompt, 800 + index);
    assertQuality(response, { maxLength: 220 });
    assert.equal(response.plan.intent, 'conversation.ambiguous');
  });
});

test('variação é determinística por conversa, intenção, estágio e seed', () => {
  const first = humanize('Faltou meu refrigerante no pedido.', 901);
  const repeated = humanize('Faltou meu refrigerante no pedido.', 901);
  const otherConversation = humanize('Faltou meu refrigerante no pedido.', 902);
  assert.equal(first.text, repeated.text);
  assert.equal(first.variation_key, repeated.variation_key);
  assert.notEqual(first.variation_key, otherConversation.variation_key);
});

test('validador rejeita número, link, promessa e emoji não permitidos', () => {
  const classification = engine.analyze({ content: 'Qual é a taxa de rolha?', context: {} });
  const validation = validateComposedResponse({
    text: 'Confirmamos R$ 999. Veja https://unsafe.example/ 😊😊',
    legacy_text: classification.ideal_response,
    classification,
    result: { status: 'unknown' },
    plan: { response_size: 'short', sentiment: 'interested' }
  });
  assert.equal(validation.passed, false);
  assert.deepEqual(new Set(validation.findings), new Set(['UNAPPROVED_LINK', 'UNAPPROVED_NUMBER', 'UNVERIFIED_CONFIRMATION', 'EMOJI_BUDGET_EXCEEDED']));
});
