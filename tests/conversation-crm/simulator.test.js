'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { ConversationEngine } = require('../../src/conversation-crm/engine');
const { createServer } = require('../../tools/conversation-crm/simulator/server');
const { deterministicOptions } = require('./helpers');

async function withServer(t) {
  const server = createServer({ engine: new ConversationEngine(deterministicOptions()) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

test('health declara modo sintético local', async (t) => {
  const base = await withServer(t);
  const response = await fetch(`${base}/api/health`);
  assert.deepEqual(await response.json(), { ok: true, mode: 'synthetic_local_only' });
});

test('servidor entrega exatamente 40 casos sintéticos', async (t) => {
  const base = await withServer(t);
  const response = await fetch(`${base}/api/cases`);
  const body = await response.json();
  assert.equal(body.cases.length, 40);
});

test('API percorre mensagem até registro CRM', async (t) => {
  const base = await withServer(t);
  const response = await fetch(`${base}/api/triage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Faltou um item.', context: { intent: 'wrong_or_missing_item', origin: 'own_delivery', order_reference: 'SIM-ORDER', occurrence_detail_code: 'missing_item' } })
  });
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.result.block_id, 'O02');
  assert.equal(body.result.crm_record.entity_type, 'CustomerOccurrence');
});

test('avaliação guarda somente caso e veredito em memória', async (t) => {
  const base = await withServer(t);
  const response = await fetch(`${base}/api/evaluations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ case_id: 'SIMPLE-01', verdict: 'correct', message: 'must_not_be_stored' })
  });
  const body = await response.json();
  assert.deepEqual(body, { ok: true, evaluation_count: 1 });
});

test('avaliação inválida é rejeitada', async (t) => {
  const base = await withServer(t);
  const response = await fetch(`${base}/api/evaluations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ case_id: 'manual', verdict: 'unsupported' })
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error_code, 'INVALID_EVALUATION');
});

test('payload excessivo é bloqueado sem ecoar conteúdo', async (t) => {
  const base = await withServer(t);
  const marker = 'X'.repeat(40 * 1024);
  const response = await fetch(`${base}/api/triage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: marker })
  });
  const text = await response.text();
  assert.equal(response.status, 413);
  assert.equal(text.includes(marker), false);
});

test('interface usa somente recursos locais', async (t) => {
  const base = await withServer(t);
  const html = await (await fetch(base)).text();
  assert.equal(/https?:\/\//.test(html), false);
  assert.equal(html.includes('localStorage'), false);
});

test('entrada manual não injeta referência ou detalhe sintético interno', async (t) => {
  const base = await withServer(t);
  const html = await (await fetch(base)).text();
  const script = await (await fetch(`${base}/app.js`)).text();
  assert.equal(html.includes('value="SIM-ORDER-MANUAL"'), false);
  assert.equal(html.includes('value="synthetic_detail"'), false);
  assert.equal(script.includes("|| 'SIM-ORDER-MANUAL'"), false);
  assert.equal(script.includes("|| 'synthetic_detail'"), false);
});

test('entrada manual de grupo grande atravessa API com contrato funcional corrigido', async (t) => {
  const base = await withServer(t);
  const response = await fetch(`${base}/api/triage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Estamos em dez pessoas e chegando', context: {} })
  });
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.result.block_code, 'R05_GRUPO_GRANDE');
  assert.equal(body.result.escalation_code, 'H01_HUMANO_OPERACIONAL');
  assert.equal(body.result.human_required, true);
  assert.deepEqual(body.result.known_fields, ['party_size']);
  assert.deepEqual(body.result.missing_field_labels, ['nome', 'previsão aproximada de chegada']);
  assert.equal(
    body.result.suggested_response,
    'Perfeito. Como são 10 pessoas, vou sinalizar sua chegada para o responsável. Pode me informar seu nome e a previsão aproximada de chegada?'
  );
});

test('item faltando atravessa API sem cair na entrada genérica de delivery', async (t) => {
  const base = await withServer(t);
  const response = await fetch(`${base}/api/triage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Faltou meu refrigerante no pedido', context: {} })
  });
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.result.block_code, 'O02_ITEM_ERRADO_OU_FALTANDO');
  assert.equal(body.result.item_identified, 'refrigerante');
  assert.equal(body.result.origin, 'unknown');
  assert.equal(body.result.escalation_code, 'H02_HUMANO_COMERCIAL_OPERACIONAL');
  assert.equal(body.result.crm_record.status, 'waiting_human');
});
