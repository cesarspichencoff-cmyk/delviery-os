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
  assert.match(turn.response, /^Boa noite! Tudo bem por aqui\. Como posso ajudar\?/u);
  assert.equal(turn.diagnostic.response_path, 'deterministic_composer');
  assert.equal(turn.diagnostic.writer_status, 'unavailable_no_local_runtime');
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

test('cliente sintético e cardápio público oficial chegam ao envelope aprovado', (t) => {
  const { homologation } = localServices(t);
  const turn = homologation.chat({
    message: 'Pode recomendar um prato?',
    customer_id: 'SIM-CUSTOMER-002',
    channel: 'dining_room'
  }).turn;
  assert.equal(turn.diagnostic.customer_context_source, 'customer_intelligence_synthetic');
  assert.equal(turn.diagnostic.menu_context_source, 'menu_intelligence_verified_official_public_source');
  assert.equal(turn.diagnostic.envelope_contract, 'deliveryos-approved-response-envelope-v1');
  assert.equal(turn.diagnostic.pattern, 'clarification');
  assert.equal(turn.diagnostic.fallback_used, false);
  assert.match(turn.response, /restrição confirmada no contexto do cliente/iu);
  assert.match(turn.response, /contaminação cruzada/iu);
});

test('bootstrap declara com honestidade o que está conectado e o que não está', (t) => {
  const { customerMenu } = localServices(t);
  const integration = customerMenu.bootstrap().integration;
  assert.equal(integration.pattern_engine, 'active');
  assert.equal(integration.journey_state, 'event_sourced');
  assert.equal(integration.response_plan, 'active');
  assert.equal(integration.deterministic_composer, 'active');
  assert.equal(integration.response_writer, 'deterministic_fallback');
  assert.equal(integration.response_writer_reason, 'LOCAL_WRITER_NOT_CONFIGURED');
  assert.equal(integration.real_data, true);
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
    'chat-customer', 'chat-menu-channel', 'chat-menu-unit', 'chat-diagnostic',
    'Verificando Writer local e catálogo ativo',
    'Curadoria humana'
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
  assert.equal(body.turn.diagnostic.fallback_used, true);
  assert.equal(body.turn.diagnostic.writer_status, 'deterministic_fallback');
  assert.equal(body.turn.diagnostic.fallback_reason, 'LOCAL_WRITER_DISABLED_FOR_PROCESS');
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

test('sequência humana completa usa conhecimento e contexto automático sem seletor técnico', (t) => {
  const { homologation } = localServices(t);
  const messages = [
    'Boa noite, tudo bem?',
    'Quero conhecer melhor o restaurante.',
    'Pode me mostrar o cardápio?',
    'É para o salão.',
    'Tem opção sem fritura?',
    'Prefiro alguma coisa com salmão e sem cream cheese.',
    'Antes, vocês têm valet?',
    'Na verdade, somos cinco pessoas.',
    'Qual bebida combina com a opção que você sugeriu?',
    'Tenho alergia a camarão.'
  ];
  const turns = messages.map((message) => homologation.chat({ message }).turn);
  assert.match(turns[1].response, /TATÁ Sushi trabalha à la carte/iu);
  assert.equal(turns[1].diagnostic.fallback_used, false);
  assert.match(turns[2].response, /salão.*iFood.*delivery próprio/iu);
  assert.match(turns[3].response, /cardápio do salão/iu);
  assert.match(turns[4].response, /fritura|preparo/iu);
  assert.match(turns[5].response, /Salmão/iu);
  assert.match(turns[6].response, /valet custa R\$ 45/iu);
  assert.doesNotMatch(turns[6].response, /salão.*iFood.*delivery próprio/iu);
  assert.match(turns[7].response, /agora são 5 pessoas|considerar 5 pessoas/iu);
  assert.match(turns[7].response, /não.*suficientes|quantidade/iu);
  assert.match(turns[8].response, /ainda não há uma bebida revisada/iu);
  assert.match(turns[9].response, /restrição preventiva/iu);
  assert.doesNotMatch(turns[9].response, /serviço de saúde|número do pedido|reação clínica/iu);
  assert.equal(turns[9].diagnostic.customer_context_source, 'anonymous_synthetic_session');
  assert.equal(turns.every((turn) => !/pergunta lateral|Ainda não tenho uma confirmação segura/iu.test(turn.response)), true);
});

test('contexto selecionado recomenda catálogo oficial, preserva filtros e não inventa harmonização', (t) => {
  const { homologation } = localServices(t);
  const first = homologation.chat({ message: 'Tem opção sem fritura?', channel: 'dining_room' }).turn;
  const recommendation = homologation.chat({ message: 'Prefiro alguma coisa com salmão e sem cream cheese.' }).turn;
  const pairing = homologation.chat({ message: 'Qual bebida combina com a opção que você sugeriu?' }).turn;
  assert.match(first.response, /cardápio do salão/iu);
  assert.match(recommendation.response, /cardápio do salão/iu);
  assert.ok(recommendation.diagnostic.candidates_found.length > 0);
  assert.match(pairing.response, /ainda não há uma bebida revisada.*Salmão/iu);
  assert.equal(pairing.diagnostic.knowledge_sources.includes('menu-source-live-menu-v1'), true);
});

test('alergia preventiva, incidente após consumo e urgência médica permanecem distintos', (t) => {
  const preventiveServices = localServices(t);
  const preventive = preventiveServices.homologation.chat({ message: 'Tenho alergia a camarão.' }).turn;
  assert.match(preventive.response, /restrição preventiva/iu);
  assert.doesNotMatch(preventive.response, /serviço de saúde|número do pedido/iu);
  assert.notEqual(preventive.diagnostic.journey, 'food_safety');

  const incidentServices = localServices(t);
  const incident = incidentServices.homologation.chat({ message: 'Comi e tive uma reação.' }).turn;
  assert.equal(incident.diagnostic.journey, 'food_safety');
  assert.match(incident.response, /qualidade|gestão|acompanhamento/iu);

  const urgentServices = localServices(t);
  const urgent = urgentServices.homologation.chat({ message: 'Estou com falta de ar agora.' }).turn;
  assert.equal(urgent.diagnostic.journey, 'food_safety');
  assert.match(urgent.response, /emergência|urgência|serviço de saúde|SAMU/iu);
  assert.equal([preventive, incident, urgent].every((turn) => !/Entendi\.\s*Entendi/iu.test(turn.response)), true);
});

test('diagnóstico expõe estado, canal, unidade, fonte, candidatos e limitação real do Writer', (t) => {
  const { homologation } = localServices(t);
  const turn = homologation.chat({ message: 'Prefiro salmão sem cream cheese.', channel: 'dining_room' }).turn;
  assert.ok(turn.diagnostic.journey_state);
  assert.equal(turn.diagnostic.channel, 'dining_room');
  assert.equal(turn.diagnostic.unit_id, 'tata-sushi-itaim-bibi');
  assert.equal(turn.diagnostic.knowledge_sources.includes('menu-source-live-menu-v1'), true);
  assert.ok(turn.diagnostic.candidates_found.length > 0);
  assert.equal(turn.diagnostic.writer_status, 'unavailable_no_local_runtime');
});

test('reset remove canal e recomendação automáticos da conversa anterior', (t) => {
  const { homologation } = localServices(t);
  const selected = homologation.chat({ message: 'Prefiro salmão sem cream cheese.', channel: 'dining_room' }).turn;
  assert.match(selected.response, /cardápio do salão/iu);
  homologation.resetChat();
  const afterReset = homologation.chat({ message: 'Tem opção sem fritura?' }).turn;
  assert.equal(afterReset.diagnostic.channel, 'unknown');
  assert.equal(afterReset.diagnostic.context_reason, 'menu_channel_missing');
});
