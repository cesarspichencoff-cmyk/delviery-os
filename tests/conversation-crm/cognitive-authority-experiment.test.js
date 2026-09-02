'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { CustomerMenuHomologationService } = require('../../tools/conversation-crm/customer-menu/service');
const { HomologationService } = require('../../tools/conversation-crm/homologation/service');
const {
  CONVERSATION_PLAN_SCHEMA,
  validateConversationPlan,
  validatePlannedResponse
} = require('../../tools/conversation-crm/cognitive-authority/conversation-plan');
const {
  CognitiveAuthorityVariantService,
  CognitiveAuthorityExperimentService
} = require('../../tools/conversation-crm/cognitive-authority/service');
const { createNativeServer } = require('../../tools/conversation-crm/native-server');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function completePlan(overrides = {}) {
  return {
    conversation_move: 'answer',
    interpreted_goal: 'receber ajuda útil',
    what_user_is_asking: 'uma resposta direta',
    candidate_scope: 'preserve',
    facts_needed: ['none'],
    tools_needed: ['none'],
    next_best_step: 'responder ao pedido atual',
    response_text: 'Posso ajudar você a decidir o próximo passo.',
    ...overrides
  };
}

function fixture(t, planner) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-cognitive-authority-'));
  const customerMenu = new CustomerMenuHomologationService({
    projectRoot: PROJECT_ROOT,
    menuReviewRoot: path.join(root, 'review')
  });
  const homologation = new HomologationService({
    projectRoot: PROJECT_ROOT,
    feedbackRoot: path.join(root, 'feedback'),
    chatRuntimeRoot: path.join(root, 'chat'),
    customerMenu
  });
  const variant = new CognitiveAuthorityVariantService({ homologation, customerMenu, planner });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { customerMenu, homologation, variant };
}

function request(server, method, route, body = null) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: address.port, path: route, method, headers: { 'content-type': 'application/json' } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test('contrato B é estruturado, fechado e não enumera intents de superfície', () => {
  assert.equal(CONVERSATION_PLAN_SCHEMA.schema.additionalProperties, false);
  assert.equal(CONVERSATION_PLAN_SCHEMA.schema.properties.response_text.type, 'string');
  assert.equal(CONVERSATION_PLAN_SCHEMA.schema.properties.conversation_move.enum.includes('expand_options_intent'), false);
  assert.equal(validateConversationPlan(completePlan()).accepted, true);
  assert.equal(validateConversationPlan({ ...completePlan(), hidden_oracle: true }).accepted, false);
});

test('post-validation bloqueia item, link, número e repetição não autorizados', () => {
  const context = {
    authorized_links: [], authorized_numbers: [], authorized_item_names: ['Sushi Autorizado'],
    additional_item_names: ['Sushi Autorizado'], catalog_item_names: ['Sushi Autorizado', 'Sushi Não Autorizado'],
    previous_response: 'Resposta anterior.'
  };
  assert.equal(validatePlannedResponse(completePlan({ response_text: 'Sushi Não Autorizado parece ideal.' }), context).reason, 'COGNITIVE_RESPONSE_UNAUTHORIZED_ITEM');
  assert.equal(validatePlannedResponse(completePlan({ response_text: 'Veja https://example.invalid/menu.' }), context).reason, 'COGNITIVE_RESPONSE_UNAUTHORIZED_LINK');
  assert.equal(validatePlannedResponse(completePlan({ response_text: 'Custa R$ 99.' }), context).reason, 'COGNITIVE_RESPONSE_UNAUTHORIZED_NUMBER');
  assert.equal(validatePlannedResponse(completePlan({ conversation_move: 'repair', response_text: 'Resposta anterior.' }), context).reason, 'COGNITIVE_RESPONSE_REPEATED_AFTER_CHANGE');
  assert.equal(validatePlannedResponse(completePlan({ response_text: 'Posso mostrar Dyo de Salmão com Vieira Trufada.' }), {
    ...context,
    authorized_item_names: ['Dyo de Salmão com Vieira Trufada'],
    catalog_item_names: ['Dyo de Salmão', 'Dyo de Salmão com Vieira Trufada']
  }).accepted, true);
});

test('variante B recebe histórico e candidatos adicionais autorizados sem alterar A', async (t) => {
  const observed = [];
  const planner = {
    async plan(input) {
      observed.push(input);
      const additional = input.authorized_context.additional_candidates;
      const current = input.authorized_context.current_candidates;
      if (additional.length) {
        return { accepted: true, plan: completePlan({
          conversation_move: 'expand', candidate_scope: 'expand', facts_needed: ['menu_candidates'],
          tools_needed: ['get_recommendation_candidates'],
          response_text: `Também posso considerar ${additional[0].name}.`
        }) };
      }
      return { accepted: true, plan: completePlan({
        response_text: current.length ? `Encontrei ${current[0].name}.` : 'Posso ajudar você a decidir entre pedir ou ir ao restaurante.'
      }) };
    }
  };
  const { variant } = fixture(t, planner);
  await variant.send({ message: 'Quero comer sushi' });
  await variant.send({ message: 'iFood' });
  const expanded = await variant.send({ message: 'Pode ampliar a seleção?' });
  assert.equal(expanded.turn.diagnostic.cognitive_plan_status, 'accepted', expanded.turn.diagnostic.cognitive_plan_reason);
  assert.equal(expanded.turn.diagnostic.cognitive_plan.conversation_move, 'expand');
  assert.ok(observed.at(-1).recent_history.length >= 2);
  assert.ok(observed.at(-1).authorized_context.additional_candidates.length > 0);
  assert.notEqual(expanded.turn.response, observed.at(-1).authorized_context.deterministic_response);
});

test('safety, alergia e gravidade continuam fora da autoridade cognitiva', async (t) => {
  let calls = 0;
  const { variant } = fixture(t, { async plan() { calls += 1; return { accepted: true, plan: completePlan() }; } });
  const output = await variant.send({ message: 'Tenho alergia a camarão e preciso de ajuda.' });
  assert.equal(calls, 0);
  assert.equal(output.turn.diagnostic.cognitive_plan_reason, 'DETERMINISTIC_AUTHORITY_BOUNDARY');
  assert.equal(output.turn.diagnostic.response_path, 'cognitive_authority_safe_fallback');
  assert.match(output.turn.response, /alerg|restri[cç][aã]o|equipe/iu);
});

test('experimento pareado não revela arquitetura antes do primeiro voto', async () => {
  const variantA = { async chatWithWriter(input) { return { turn: { response: `A:${input.message}` } }; }, resetChat() { return { reset: true }; } };
  const variantB = { async send(input) { return { turn: { response: `B:${input.message}` } }; }, reset() { return { reset: true }; } };
  const experiment = new CognitiveAuthorityExperimentService({ variantA, variantB, assignment: { left: 'B', right: 'A' } });
  const turn = await experiment.pairedTurn({ message: 'teste sintético' });
  assert.deepEqual(turn.turn, { input: 'teste sintético', left: 'B:teste sintético', right: 'A:teste sintético' });
  assert.throws(() => experiment.reveal(), /COGNITIVE_VOTE_REQUIRED/);
  assert.throws(() => experiment.diagnostics(), /COGNITIVE_VOTE_REQUIRED/);
  experiment.vote({ preference: 'left' });
  assert.deepEqual(experiment.reveal().assignment, { left: 'B', right: 'A' });
  assert.equal(experiment.diagnostics().left, undefined);
  assert.equal((await experiment.diagnosticB({ message: 'probe' })).turn.response, 'B:probe');
  assert.equal(experiment.resetDiagnosticB().reset, true);
});

test('servidor expõe painel cego mínimo sem diagnóstico técnico', async (t) => {
  const cognitiveExperiment = {
    reset() { return { ok: true }; },
    async pairedTurn(input) { return { ok: true, blind: true, turn: { input: input.message, left: 'Resposta um', right: 'Resposta dois' } }; },
    vote() { return { ok: true, vote_count: 1 }; },
    reveal() { return { ok: true, assignment: { left: 'B', right: 'A' } }; },
    diagnostics() { return { ok: true, assignment: { left: 'B', right: 'A' }, left: {}, right: {} }; },
    async diagnosticB(input) { return { ok: true, turn: { response: input.message } }; },
    resetDiagnosticB() { return { ok: true }; }
  };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-cognitive-server-'));
  const server = createNativeServer({
    projectRoot: PROJECT_ROOT,
    runtimeRoot: path.join(root, 'runtime'),
    feedbackRoot: path.join(root, 'feedback'),
    chatRuntimeRoot: path.join(root, 'chat'),
    menuReviewRoot: path.join(root, 'review'),
    enableLocalWriter: false,
    cognitiveExperiment
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const bootstrap = await request(server, 'GET', '/api/cognitive-authority/bootstrap');
  assert.equal(bootstrap.body.blind, true);
  assert.equal(Object.hasOwn(bootstrap.body, 'assignment'), false);
  assert.equal(bootstrap.body.maximum_external_spend_brl, 0);
  const panel = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${server.address().port}/cognitive-authority`, (res) => {
      const chunks = []; res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
  assert.match(panel, /Conversa A/);
  assert.match(panel, /Conversa B/);
  assert.doesNotMatch(panel, /Pattern Engine|Journey State|Gemma|fallback/iu);
});

test('implementação não contém handlers literais para as paráfrases de homologação', () => {
  const source = [
    'tools/conversation-crm/cognitive-authority/conversation-plan.js',
    'tools/conversation-crm/cognitive-authority/service.js'
  ].map((file) => fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf8').toLowerCase()).join('\n');
  for (const phrase of ['tem mais opcoes', 'qual foi seu criterio', 'nao curti muito essas', 'me surpreende entao']) {
    assert.equal(source.includes(phrase), false, phrase);
  }
});
