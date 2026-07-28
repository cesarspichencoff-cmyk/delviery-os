'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { NativeConversationRuntime } = require('../../src/conversation-crm/native');

function run(t, content, context = {}, turn = 1, runtime = null) {
  const root = runtime ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-service-intelligence-'));
  const current = runtime || new NativeConversationRuntime({ runtimeRoot: root });
  if (root) t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = current.processMessage({
    synthetic: true,
    message_type: 'text',
    content,
    channel: 'synthetic',
    subject_id: 'SIM-SUBJECT-SERVICE',
    conversation_id: 'SIM-CONV-SERVICE',
    message_id: `SIM-MSG-SERVICE-${turn}`,
    correlation_id: `SIM-CORR-SERVICE-${turn}`,
    idempotency_key: `service:${turn}`,
    occurred_at: current.clock.iso(),
    turn_order: turn,
    unit_id: 'SIM-UNIT-001',
    context: { synthetic: true, ...context }
  });
  return { result, runtime: current };
}

test('vale-refeição usa as opções confirmadas em vez de fallback', (t) => {
  const { result } = run(t, 'Aceita vale-refeição?');
  assert.match(result.response.text, /Ticket Restaurante.*Alelo.*Pluxee/iu);
  assert.doesNotMatch(result.response.text, /não tenho uma informação/iu);
  assert.equal(result.response.plan.knowledge_selected.includes('payment.meal_voucher'), true);
});

test('criança recebe resposta direta e acolhedora', (t) => {
  const { result } = run(t, 'Posso levar criança?');
  assert.match(result.response.text, /Sim, crianças podem acompanhar/iu);
  assert.doesNotMatch(result.response.text, /o que você gostaria de confirmar/iu);
});

test('rodízio explica alternativas confirmadas', (t) => {
  const { result } = run(t, 'Vocês têm rodízio?');
  assert.match(result.response.text, /à la carte/iu);
  assert.match(result.response.text, /Almoço Executivo/iu);
  assert.match(result.response.text, /Sugestão Tatá/iu);
});

test('restrição alimentar oferece cardápio e preserva limite de alergênico', (t) => {
  const { result } = run(t, 'Tem opção vegetariana?');
  assert.match(result.response.text, /cardápio presencial completo/iu);
  assert.match(result.response.text, /restrição|alimentação|alergia/iu);
  assert.doesNotMatch(result.response.text, /garantimos|sem risco/iu);
});

test('delivery próprio e taxa recebem direção prática', (t) => {
  const own = run(t, 'Vocês fazem delivery próprio?').result;
  assert.match(own.response.text, /delivery próprio/iu);
  assert.match(own.response.text, /deliveryapp\.neemo/iu);
  const fee = run(t, 'Qual é a taxa de entrega?').result;
  assert.match(fee.response.text, /depende do endereço/iu);
  assert.match(fee.response.text, /calculada no canal/iu);
});

test('item faltante não expõe regra interna de compensação', (t) => {
  const { result } = run(t, 'Faltou meu refrigerante no pedido.');
  assert.match(result.response.text, /falta de refrigerante/iu);
  assert.match(result.response.text, /canal|número do pedido|delivery do TATÁ|iFood/iu);
  assert.doesNotMatch(result.response.text, /não vou presumir|não vou antecipar.*compensação/iu);
});

test('item faltante no iFood orienta fluxo oficial e evidência aplicável', (t) => {
  const { result } = run(t, 'Pedido 1234 no iFood, faltou a bebida.');
  assert.match(result.response.text, /Pedidos.*Ajuda/iu);
  assert.match(result.response.text, /item afetado/iu);
  assert.doesNotMatch(result.response.text, /reembolso (?:confirmado|garantido)/iu);
  assert.equal(result.response.plan.knowledge_sources_used.some((source) => source.startsWith('ifood:')), true);
});

test('dificuldade para respirar recebe urgência e zero diagnóstico', (t) => {
  const { result } = run(t, 'Estou com dificuldade para respirar depois de comer.');
  assert.match(result.response.text, /atendimento imediato|SAMU 192/iu);
  assert.doesNotMatch(result.response.text, /diagnóstico|foi causado|com certeza/iu);
  assert.doesNotMatch(result.response.text, /\p{Extended_Pictographic}/u);
});

test('mais de uma pessoa afetada recebe acompanhamento imediato sem afirmar surto', (t) => {
  const { result } = run(t, 'Duas pessoas passaram mal depois da refeição.');
  assert.match(result.response.text, /mais de uma pessoa|acompanhamento imediato/iu);
  assert.doesNotMatch(result.response.text, /é um surto|o TATÁ causou/iu);
});

test('Oke usa fatos existentes e pergunta somente o necessário', (t) => {
  const { result } = run(t, 'Como funciona o Oke?');
  assert.match(result.response.text, /retirada na loja/iu);
  assert.match(result.response.text, /até o dia seguinte/iu);
  assert.match(result.response.text, /tábuas.*dois dias/iu);
});

test('elogio reconhece experiência sem resposta vazia', (t) => {
  const { result } = run(t, 'Gostei muito do atendimento e da comida.');
  assert.match(result.response.text, /experiência|atendimento|comida/iu);
  assert.match(result.response.text, /Obrigado/iu);
});
