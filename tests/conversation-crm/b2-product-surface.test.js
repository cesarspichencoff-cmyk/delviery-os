'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

const { evaluatePublicationGate } = require('../../tools/conversation-crm/cognitive-authority/b2/publication-gate');
const { B2ProductService } = require('../../tools/conversation-crm/cognitive-authority/b2/product-service');
const { createNativeServer } = require('../../tools/conversation-crm/native-server');

async function withProductServer(t) {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-b2-product-'));
  const server = createNativeServer({ runtimeRoot, enableLocalWriter: false });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.close();
    await once(server, 'close');
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  });
  return { base: `http://127.0.0.1:${server.address().port}`, server };
}

function homologationFixture(options = {}) {
  return {
    chatExecution({ message }) {
      const question = options.question === undefined ? 'Qual canal você prefere?' : options.question;
      return {
        result: {
          approved_response_envelope: {
            customer_goal: 'escolher uma refeição adequada',
            confirmed_facts: [],
            facts: [],
            question_to_ask: question,
            gravity: options.gravity || 'informational',
            prohibited_claims: ['inventar_fato'],
            authorized_links: [],
            authorized_numbers: ['1'],
            recent_phrases_to_avoid: []
          }
        },
        publicResult: {
          turn: {
            response: options.response || `Entendi seu pedido. ${question || ''}`.trim(),
            diagnostic: {
              semantic_transition: options.relation || 'CONTINUE',
              user_repair_signal: options.repair === true,
              negative_feedback_signal: false,
              hospitality_context: { number_of_people: 1, allergies: [], dietary_restrictions: [] },
              turn_analysis: { active_goal: 'recommendation' }
            }
          }
        }
      };
    },
    resetChat() { return { chat_reset: true }; }
  };
}

test('gate combinado falha fechado para ação externa e preserva custo zero', () => {
  const local = evaluatePublicationGate({ channel: 'local_simulator', shadow_mode: true });
  assert.equal(local.LOCAL_PREVIEW_ALLOWED, true);
  assert.equal(local.COST_AUTHORIZED, true);
  assert.equal(local.EXTERNAL_ACTION_ALLOWED, false);
  assert.equal(local.EXTERNAL_PUBLICATION_ALLOWED, false);
  const blocked = evaluatePublicationGate({ channel: 'whatsapp', external_publication: true, shadow_mode: false });
  assert.equal(blocked.LOCAL_PREVIEW_ALLOWED, false);
  assert.ok(blocked.reasons.includes('EXTERNAL_ACTION_BLOCKED'));
});

test('customer turn percorre o B2 corrigido e entrega trace de nove etapas', async () => {
  const service = new B2ProductService({ homologation: homologationFixture() });
  const output = await service.process({
    message: 'Quero algo sem peixe cru para uma pessoa.',
    channel: 'local_simulator',
    shadow_mode: true
  });
  assert.equal(output.ok, true);
  assert.match(output.response, /sem peixe cru/iu);
  assert.match(output.response, /Qual canal você prefere\?/u);
  assert.equal((output.response.match(/Qual canal você prefere\?/gu) || []).length, 1);
  assert.equal(output.external_action_performed, false);
  assert.equal(output.external_spend_brl, 0);
  const trace = service.trace(output.turn_id).trace;
  assert.deepEqual(trace.steps.map((step) => step.id), [
    'USER', 'UNDERSTANDING', 'REQUIRED_COMMITMENTS', 'CAPABILITY_FACT_NEED',
    'AUTHORITY_RESULT', 'RESPONSE_PLAN', 'WRITER_FALLBACK', 'VALIDATOR', 'PUBLISHED_RESPONSE'
  ]);
  assert.equal(trace.gate.SHADOW_MODE, true);
  assert.equal(trace.gate.EXTERNAL_ACTION_ALLOWED, false);
});

test('shadow desligado bloqueia antes do runtime e reset elimina traces', async () => {
  const service = new B2ProductService({ homologation: homologationFixture() });
  await assert.rejects(
    service.process({ message: 'Olá', channel: 'local_simulator', shadow_mode: false }),
    { code: 'PUBLICATION_GATE_BLOCKED' }
  );
  const turn = await service.process({ message: 'Olá', channel: 'local_simulator', shadow_mode: true });
  assert.equal(service.trace(turn.turn_id).ok, true);
  assert.equal(service.reset().chat_reset, true);
  assert.throws(() => service.trace(turn.turn_id), { code: 'TRACE_NOT_FOUND' });
});

test('PII é redigida no trace efêmero', async () => {
  const service = new B2ProductService({ homologation: homologationFixture() });
  const marker = 'cliente@example.test';
  const output = await service.process({ message: `Meu e-mail é ${marker}; quero ajuda.`, channel: 'local_simulator', shadow_mode: true });
  assert.equal(JSON.stringify(service.trace(output.turn_id)).includes(marker), false);
});

test('mesmo servidor canônico entrega customer surface, B2 corrigido e truth trace separado', async (t) => {
  const { base } = await withProductServer(t);
  const customer = await (await fetch(`${base}/customer`)).text();
  const customerScript = await (await fetch(`${base}/customer/app.js`)).text();
  for (const forbidden of ['Pattern Engine', 'Journey', 'Planner', 'Contract', 'expected_result']) {
    assert.equal(customer.includes(forbidden), false);
  }
  assert.equal(/https?:\/\//u.test(customerScript), false);
  assert.equal(customerScript.includes('localStorage'), false);

  const turnResponse = await fetch(`${base}/api/product/turn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'Quero jantar para duas pessoas, até R$ 120, sem peixe cru.' })
  });
  assert.equal(turnResponse.status, 200);
  const turn = await turnResponse.json();
  assert.equal(turn.ok, true);
  assert.match(turn.response, /sem peixe cru/iu);
  assert.match(turn.response, /R\$ 120/u);
  assert.match(turn.response, /2 pessoas/iu);
  assert.equal((turn.response.match(/2 pessoas/giu) || []).length, 1);
  assert.equal(turn.external_action_performed, false);
  assert.equal(turn.external_spend_brl, 0);

  const trace = await (await fetch(`${base}/api/product/trace/${turn.turn_id}`)).json();
  assert.equal(trace.ok, true);
  assert.deepEqual(trace.trace.stages.map((stage) => stage.id), [
    'USER', 'UNDERSTANDING', 'REQUIRED_COMMITMENTS', 'CAPABILITY_FACT_NEED',
    'AUTHORITY_RESULT', 'RESPONSE_PLAN', 'WRITER_FALLBACK', 'VALIDATOR', 'PUBLISHED_RESPONSE'
  ]);
  assert.equal(trace.trace.gate.SHADOW_MODE, true);
  assert.equal(trace.trace.gate.EXTERNAL_ACTION_ALLOWED, false);
  assert.equal(trace.trace.gate.CHANNEL_AUTHORIZED, true);
  assert.equal(trace.trace.gate.COST_AUTHORIZED, true);
  assert.equal(trace.trace.gate.EXTERNAL_PUBLICATION_ALLOWED, false);
  assert.equal((await fetch(`${base}/trace/${turn.turn_id}`)).status, 200);
  const traceScript = await (await fetch(`${base}/trace/trace.js`)).text();
  assert.match(traceScript, /^'use strict';/u);
  assert.equal(traceScript.includes('<!doctype html>'), false);

  const blocked = await fetch(`${base}/api/product/turn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'Publique fora do simulador.', channel: 'whatsapp', external_publication: true })
  });
  assert.equal(blocked.status, 400);
  const reset = await (await fetch(`${base}/api/product/reset`, { method: 'POST' })).json();
  assert.equal(reset.reset, true);
  assert.equal((await fetch(`${base}/api/product/trace/${turn.turn_id}`)).status, 400);
});
