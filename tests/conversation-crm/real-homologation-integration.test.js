'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { createNativeServer } = require('../../tools/conversation-crm/native-server');
const { HomologationService } = require('../../tools/conversation-crm/homologation/service');
const { CustomerMenuHomologationService } = require('../../tools/conversation-crm/customer-menu/service');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function request(port, method, route, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body === null ? null : JSON.stringify(body);
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: route,
      method,
      headers: payload
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        : {}
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function localServices(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-real-homologation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const customerMenu = new CustomerMenuHomologationService();
  const homologation = new HomologationService({
    projectRoot: PROJECT_ROOT,
    feedbackRoot: path.join(root, 'feedback'),
    chatRuntimeRoot: path.join(root, 'chat-runtime'),
    customerMenu
  });
  return { root, customerMenu, homologation };
}

async function withServer(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-real-panel-'));
  const server = createNativeServer({
    projectRoot: PROJECT_ROOT,
    runtimeRoot: path.join(root, 'runtime'),
    feedbackRoot: path.join(root, 'feedback'),
    chatRuntimeRoot: path.join(root, 'chat-runtime')
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return server.address().port;
}

test('painel real reconhece oii como saudação sem fallback ou ação operacional', (t) => {
  const { homologation } = localServices(t);
  const turn = homologation.chat({ message: 'oii' }).turn;
  assert.equal(turn.response, 'Olá! Como posso ajudar?');
  assert.equal(turn.diagnostic.pattern, 'greeting');
  assert.equal(turn.diagnostic.fallback_used, false);
  assert.equal(turn.diagnostic.capability, 'conversation.no_action');
  assert.equal(turn.diagnostic.route_reason, 'social_pattern_no_action');
});

test('saudação composta preserva o tom e usa o compositor determinístico', (t) => {
  const { homologation } = localServices(t);
  const turn = homologation.chat({ message: 'Boa noite, tudo bem?' }).turn;
  assert.match(turn.response, /^Boa noite! Tudo bem, e com você\?/u);
  assert.equal(turn.diagnostic.response_path, 'deterministic_composer');
  assert.equal(turn.diagnostic.writer_status, 'not_connected_in_local_panel');
  assert.equal(turn.diagnostic.fallback_used, false);
});

test('saudação com tarefa inicia a jornada correta sem perder a tarefa', (t) => {
  const { homologation } = localServices(t);
  const turn = homologation.chat({ message: 'Oi, quero reservar uma mesa para quatro.' }).turn;
  assert.equal(turn.diagnostic.pattern, 'continue');
  assert.equal(turn.diagnostic.journey, 'reservation');
  assert.equal(turn.diagnostic.journey_action, 'start');
  assert.match(turn.response, /reserva/iu);
});

test('pergunta lateral e retomada preservam a jornada sem executar nova ação', (t) => {
  const { homologation } = localServices(t);
  homologation.chat({ message: 'Quero reservar uma mesa para quatro.' });
  const side = homologation.chat({ message: 'Antes, vocês têm valet?' }).turn;
  const resume = homologation.chat({ message: 'Voltando à reserva.' }).turn;
  assert.equal(side.diagnostic.pattern, 'side_question');
  assert.equal(side.diagnostic.journey, 'reservation');
  assert.equal(side.diagnostic.capability, 'conversation.no_action');
  assert.equal(side.diagnostic.fallback_used, false);
  assert.equal(resume.diagnostic.pattern, 'resume');
  assert.equal(resume.diagnostic.journey, 'reservation');
  assert.equal(resume.diagnostic.capability, 'conversation.no_action');
  assert.equal(resume.diagnostic.fallback_used, false);
  assert.match(resume.response, /retomar de onde paramos/iu);
});

test('diagnóstico sanitizado identifica contratos e fonte do texto final', (t) => {
  const { homologation } = localServices(t);
  const diagnostic = homologation.chat({ message: 'oii' }).turn.diagnostic;
  assert.equal(diagnostic.endpoint, '/api/homologation/chat');
  assert.equal(diagnostic.response_contract, 'conversation-response-v2');
  assert.equal(diagnostic.envelope_contract, 'deliveryos-approved-response-envelope-v1');
  assert.equal(diagnostic.source_of_final_text, 'controlled_response_composer');
  assert.equal(JSON.stringify(diagnostic).includes('oii'), false);
});

test('contextos sintéticos de cliente e cardápio chegam ao envelope aprovado', (t) => {
  const { homologation } = localServices(t);
  const turn = homologation.chat({
    message: 'Pode recomendar um prato?',
    customer_id: 'SIM-CUSTOMER-002',
    channel: 'dining_room'
  }).turn;
  assert.equal(turn.diagnostic.customer_context_source, 'customer_intelligence_synthetic');
  assert.equal(turn.diagnostic.menu_context_source, 'menu_intelligence_synthetic');
  assert.equal(turn.diagnostic.envelope_contract, 'deliveryos-approved-response-envelope-v1');
  assert.equal(turn.diagnostic.pattern, 'clarification');
  assert.equal(turn.diagnostic.fallback_used, false);
  assert.match(turn.response, /confirmar a restrição e o item/iu);
});

test('bootstrap declara com honestidade o que está conectado e o que não está', (t) => {
  const { customerMenu } = localServices(t);
  const integration = customerMenu.bootstrap().integration;
  assert.equal(integration.pattern_engine, 'active');
  assert.equal(integration.journey_state, 'event_sourced');
  assert.equal(integration.response_plan, 'active');
  assert.equal(integration.deterministic_composer, 'active');
  assert.equal(integration.response_writer, 'not_connected_in_local_panel');
  assert.equal(integration.real_data, false);
});

test('ficha sintética expõe relações operacionais sem identidade bruta', (t) => {
  const { customerMenu } = localServices(t);
  const response = customerMenu.customer('SIM-CUSTOMER-002');
  assert.ok(response.result.data.recent_orders.length > 0);
  assert.ok(response.result.data.recent_reservations.length > 0);
  assert.ok(response.result.data.recent_incidents.length > 0);
  assert.equal(JSON.stringify(response).includes('11990000102'), false);
});

test('importação exibida pelo painel usa pipeline real com dedupe, aplicação e rollback', (t) => {
  const { customerMenu } = localServices(t);
  const preview = customerMenu.bootstrap().imports[0];
  const duplicate = customerMenu.importAction({ action: 'duplicate_probe' }).batch;
  const applied = customerMenu.importAction({ action: 'approve_and_apply' }).batch;
  const rolledBack = customerMenu.importAction({ action: 'rollback' }).batch;
  assert.equal(preview.state, 'previewed');
  assert.equal(preview.valid, 2);
  assert.equal(preview.invalid, 1);
  assert.equal(duplicate.duplicate_upload, true);
  assert.equal(applied.state, 'imported');
  assert.equal(rolledBack.state, 'rolled_back');
  assert.equal(rolledBack.rollback.preserves_prior_data, true);
});

test('interface mostra diagnóstico e campos reais do catálogo sintético', () => {
  const html = fs.readFileSync(path.join(PROJECT_ROOT, 'tools', 'conversation-crm', 'simulator', 'app', 'index.html'), 'utf8');
  const script = fs.readFileSync(path.join(PROJECT_ROOT, 'tools', 'conversation-crm', 'simulator', 'app', 'app.js'), 'utf8');
  for (const expected of [
    'chat-customer', 'chat-menu-channel', 'chat-diagnostic',
    'Pattern Engine e Journey State ativos',
    'Gemma e Qwen não estão conectados a esta tela'
  ]) assert.ok(html.includes(expected), expected);
  for (const expected of [
    'ingredients', 'allergens', 'pairings',
    'duplicate_probe', 'approve_and_apply', 'rollback',
    'recent_orders', 'recent_reservations', 'incidents'
  ]) assert.ok(script.includes(expected), expected);
  const initializeStart = script.indexOf('async function initialize()');
  const resetAt = script.indexOf("api('/api/homologation/chat/reset'", initializeStart);
  const bootstrapAt = script.indexOf("api('/api/homologation/bootstrap'", initializeStart);
  assert.ok(resetAt > initializeStart, 'a inicialização deve limpar a sessão de chat oculta');
  assert.ok(bootstrapAt > resetAt, 'o reset deve ocorrer antes de apresentar a tela vazia');
});

test('endpoint real do painel devolve saudação e diagnóstico aprovados', async (t) => {
  const port = await withServer(t);
  const response = await request(port, 'POST', '/api/homologation/chat', { message: 'oii' });
  const body = JSON.parse(response.body);
  assert.equal(response.status, 200);
  assert.equal(body.turn.response, 'Olá! Como posso ajudar?');
  assert.equal(body.turn.diagnostic.pattern, 'greeting');
  assert.equal(body.turn.diagnostic.fallback_used, false);
});

test('replay da rota manual preserva contador e não devolve resposta antiga', async (t) => {
  const port = await withServer(t);
  const first = JSON.parse((await request(port, 'POST', '/api/triage', { message: 'oii' })).body);
  await request(port, 'POST', '/api/native/replay');
  const second = JSON.parse((await request(port, 'POST', '/api/triage', { message: 'Quero reservar uma mesa.' })).body);
  assert.equal(first.result.message_id, 'SIM-MANUAL-0001');
  assert.equal(second.result.message_id, 'SIM-MANUAL-0002');
  assert.equal(second.result.duplicate, false);
  assert.notEqual(second.result.input_content_hash, first.result.input_content_hash);
});
