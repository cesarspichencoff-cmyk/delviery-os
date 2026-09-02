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
  const byStage = Object.fromEntries(trace.steps.map((step) => [step.id, step]));
  assert.equal(byStage.USER.detail.history_state.prior_turn_count, 0);
  assert.equal(byStage.UNDERSTANDING.detail.cognitive_planner.contract, 'Contract V2');
  assert.equal(byStage.UNDERSTANDING.detail.cognitive_planner.relation_to_history, 'CONTINUE');
  assert.equal(byStage.UNDERSTANDING.detail.repair_interpretation.required, false);
  assert.equal(byStage.CAPABILITY_FACT_NEED.detail.query_filter.source, 'deliveryos_native_authority');
  assert.equal(byStage.AUTHORITY_RESULT.detail.request_result_bound, true);
  assert.ok(byStage.AUTHORITY_RESULT.detail.evidence_hash);
  assert.deepEqual(byStage.RESPONSE_PLAN.detail.required_response_commitments, trace.steps[2].detail.preserved_in_response_plan);
  assert.equal(byStage.WRITER_FALLBACK.detail.primary_attempt.outcome, 'accepted');
  assert.equal(byStage.WRITER_FALLBACK.detail.fallback_attempt.used, false);
  assert.equal(byStage.VALIDATOR.detail.accepted, true);
  assert.equal(byStage.PUBLISHED_RESPONSE.detail.publication_path, 'local_shadow_preview');
  assert.equal(byStage.PUBLISHED_RESPONSE.detail.response, output.response);
});

test('trace preserva histórico público e aponta causa upstream de bloqueio', async () => {
  const fixture = homologationFixture({ question: null, response: 'Resultado autorizado estável.' });
  const service = new B2ProductService({ homologation: fixture });
  const first = await service.process({ message: 'Primeiro pedido', channel: 'local_simulator' });
  assert.equal(first.ok, true);
  const second = await service.process({ message: 'Segundo pedido', channel: 'local_simulator' });
  assert.equal(second.ok, false);
  const trace = service.trace(second.turn_id).trace;
  const byStage = Object.fromEntries(trace.steps.map((step) => [step.id, step]));
  assert.equal(byStage.USER.detail.history_state.prior_turn_count, 2);
  assert.equal(trace.first_divergence.stage, 'RESPONSE_PLAN');
  assert.equal(trace.first_divergence.detected_at, 'VALIDATOR');
  assert.equal(trace.first_divergence.reason, 'B2_NO_PROGRESS_WITHOUT_STATE_CHANGE');
  assert.equal(trace.first_divergence.upstream_cause.same_progress_state, true);
  assert.equal(byStage.VALIDATOR.detail.same_progress_state, true);
  assert.equal(byStage.PUBLISHED_RESPONSE.detail.publication_path, 'not_published');
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

test('produto usa authority estruturada e não executa o compositor Native legado', async () => {
  let structuredCalls = 0;
  let legacyCalls = 0;
  const homologation = {
    productExecutionStructured() {
      structuredCalls += 1;
      return {
        result: {
          native_response_composer_executed: false,
          structured_authority: {
            status: 'completed', intent: 'information.menu', topic: 'institutional_menu',
            query_filter: { public_topic: 'institutional_menu' },
            facts: [], knowledge: ['Menu oficial: https://example.invalid/menu'],
            authorized_links: ['https://example.invalid/menu'], authorized_numbers: [],
            required_question: null, source_ids: ['PUBLIC_MENU'], result_hash: 'structured-result'
          },
          product_contexts: {}
        },
        publicResult: { turn: { response: null, diagnostic: { intent: 'information.menu', turn_analysis: {} } } }
      };
    },
    chatExecution() { legacyCalls += 1; throw new Error('legacy composer must not run'); },
    resetChat() { return { chat_reset: true }; }
  };
  const service = new B2ProductService({ homologation });
  const output = await service.process({ message: 'Me passa o menu.', channel: 'local_simulator', shadow_mode: true });
  assert.equal(output.ok, true);
  assert.match(output.response, /https:\/\/example\.invalid\/menu/u);
  assert.equal(structuredCalls, 1);
  assert.equal(legacyCalls, 0);
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
  const traceByStage = Object.fromEntries(trace.trace.stages.map((stage) => [stage.id, stage]));
  assert.equal(traceByStage.UNDERSTANDING.detail.runtime_context.structured_authority_used, true);
  assert.equal(traceByStage.UNDERSTANDING.detail.runtime_context.native_response_composer_executed, false);
  assert.equal(traceByStage.CAPABILITY_FACT_NEED.detail.query_filter.source, 'deliveryos_structured_authority');
  assert.ok(traceByStage.CAPABILITY_FACT_NEED.detail.operation_fingerprint);
  assert.equal(traceByStage.AUTHORITY_RESULT.detail.request_result_bound, true);
  assert.equal(traceByStage.VALIDATOR.detail.accepted, true);
  assert.equal(traceByStage.PUBLISHED_RESPONSE.detail.response, turn.response);
  assert.equal(trace.trace.gate.SHADOW_MODE, true);
  assert.equal(trace.trace.gate.EXTERNAL_ACTION_ALLOWED, false);
  assert.equal(trace.trace.gate.CHANNEL_AUTHORIZED, true);
  assert.equal(trace.trace.gate.COST_AUTHORIZED, true);
  assert.equal(trace.trace.gate.EXTERNAL_PUBLICATION_ALLOWED, false);
  assert.equal((await fetch(`${base}/trace/${turn.turn_id}`)).status, 200);
  const traceScript = await (await fetch(`${base}/trace/trace.js`)).text();
  assert.match(traceScript, /^'use strict';/u);
  assert.equal(traceScript.includes('<!doctype html>'), false);
  assert.match(traceScript, /raw\.detail/u);

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
