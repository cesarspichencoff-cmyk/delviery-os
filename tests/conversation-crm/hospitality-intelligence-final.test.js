'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { ResponseWriter } = require('../../apps/deliveryos-ai-node/dialogue/response-writer');
const { LocalHomologationWriter } = require('../../tools/conversation-crm/homologation/local-writer');
const { HomologationService } = require('../../tools/conversation-crm/homologation/service');
const { MenuReviewService } = require('../../tools/conversation-crm/customer-menu/review-service');
const { CustomerMenuHomologationService } = require('../../tools/conversation-crm/customer-menu/service');
const { createNativeServer } = require('../../tools/conversation-crm/native-server');
const {
  initialHospitalityContext, updateHospitalityContext, hospitalityRequest
} = require('../../src/conversation-crm/menu-intelligence');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function temporary(t, prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function request(port, route, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body === null ? null : JSON.stringify(body);
    const req = http.request({
      host: '127.0.0.1', port, path: route, method: payload ? 'POST' : 'GET',
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('inventário público certificado preserva contagem, origem e desconhecidos protegidos', (t) => {
  const review = new MenuReviewService({ projectRoot: PROJECT_ROOT, root: temporary(t, 'deliveryos-public-evidence-') });
  const bootstrap = review.bootstrap();
  const publicRecords = review.listPublic();
  assert.equal(publicRecords.length, 426);
  assert.equal(new Set(publicRecords.map((item) => item.public_record_id)).size, 426);
  assert.equal(publicRecords.filter((item) => item.channel === 'dining_room').length, 268);
  assert.equal(publicRecords.filter((item) => item.channel === 'ifood').length, 158);
  assert.equal(bootstrap.public_capture.report_sha256, 'b63812ea7db5b55f1bfb035041e0a6e196b8f3e6fbdd7077859a39f548e3924e');
  assert.equal(publicRecords.every((item) => item.certification.status === 'verified_official_public_source'), true);
  assert.equal(publicRecords.every((item) => item.protected_unknowns.includes('allergens')), true);
  assert.equal(bootstrap.public_records.length, 0);
});

test('lote público exige escopo homogêneo, prévia e confirmação humana', (t) => {
  const review = new MenuReviewService({ projectRoot: PROJECT_ROOT, root: temporary(t, 'deliveryos-public-batch-') });
  const dining = review.listPublic({ channel: 'dining_room' }).filter((item) => item.fields.description.value).slice(0, 2);
  const ifood = review.listPublic({ channel: 'ifood' })[0];
  assert.throws(() => review.publicBatchPreview({
    public_record_ids: [dining[0].public_record_id, ifood.public_record_id],
    fields: ['name', 'category'], item_status: 'approved_for_information'
  }), { code: 'MENU_PUBLIC_BATCH_NOT_HOMOGENEOUS' });
  const input = {
    public_record_ids: dining.map((item) => item.public_record_id),
    fields: ['name', 'category', 'description', 'price'],
    item_status: 'approved_for_information'
  };
  assert.throws(() => review.publicBatchPreview({ ...input, item_status: 'approved_for_recommendation' }), {
    code: 'MENU_PUBLIC_RECOMMENDATION_BATCH_FORBIDDEN'
  });
  const preview = review.publicBatchPreview(input);
  assert.equal(preview.requires_human_confirmation, true);
  assert.throws(() => review.publicBatchCommit(input), { code: 'MENU_PUBLIC_BATCH_CONFIRMATION_REQUIRED' });
  const committed = review.publicBatchCommit({ ...input, confirmation_hash: preview.preview_hash });
  assert.equal(committed.length, 2);
  assert.equal(committed.every((item) => item.item_status === 'approved_for_information'), true);
  assert.equal(committed.every((item) => item.fields.name.curation_state === 'human_approved'), true);
  assert.equal(committed.every((item) => item.fields.quantity.curation_state !== 'human_approved'), true);
});

test('alergênicos, disponibilidade, substituições e harmonizações não entram em lote', (t) => {
  const review = new MenuReviewService({ projectRoot: PROJECT_ROOT, root: temporary(t, 'deliveryos-public-forbidden-') });
  const record = review.listPublic({ channel: 'dining_room' })[0];
  for (const field of ['availability', 'allergens', 'cross_contact', 'adaptations', 'substitutions', 'pairings']) {
    assert.throws(() => review.publicBatchPreview({
      public_record_ids: [record.public_record_id], fields: [field], item_status: 'under_review'
    }), { code: 'MENU_PUBLIC_BATCH_FIELD_INVALID' });
  }
});

test('catálogo oficial ativa campos públicos e mantém disponibilidade desconhecida', (t) => {
  const root = temporary(t, 'deliveryos-public-activation-');
  const service = new CustomerMenuHomologationService({ projectRoot: PROJECT_ROOT, menuReviewRoot: root });
  const records = service.menuReview.listPublic({ channel: 'dining_room' }).filter((item) => item.fields.description.value).slice(0, 3);
  const input = {
    public_record_ids: records.map((item) => item.public_record_id),
    fields: ['name', 'category', 'description', 'price'], item_status: 'approved_for_information'
  };
  const preview = service.publicMenuReviewPreview(input).preview;
  service.publicMenuReviewCommit({ ...input, confirmation_hash: preview.preview_hash });
  const bootstrap = service.bootstrap();
  assert.equal(bootstrap.menu.catalog_mode, 'real_public_official_source_verified');
  assert.equal(bootstrap.menu.items.length, 426);
  assert.equal(bootstrap.menu.items.every((item) => item.availability.state === 'unknown'), true);
  assert.equal(bootstrap.menu.items.some((item) => item.item_id.startsWith('SIM-')), false);
  assert.equal(records.every((record) => record.fields.name.curation_state === 'verified_official_public_source'), true);
});

test('contexto de hospitalidade acumula ocasião, orçamento, preferências e restrições', () => {
  let context = initialHospitalityContext();
  context = updateHospitalityContext(context, {
    normalized_text: 'e minha primeira vez e quero algo leve no salao para duas pessoas',
    channel: 'dining_room', unit_id: 'tata-sushi-itaim-bibi', number_of_people: 2, allergies: []
  });
  context = updateHospitalityContext(context, {
    normalized_text: 'ate r$ 180 sem fritura e com salmao', channel: 'dining_room',
    unit_id: 'tata-sushi-itaim-bibi', number_of_people: 2, allergies: []
  });
  assert.equal(context.occasion, 'first_visit');
  assert.equal(context.number_of_people, 2);
  assert.deepEqual(context.budget, { maximum_brl: 180 });
  assert.ok(context.flavor_preferences.includes('light'));
  assert.ok(context.preparation_preferences.includes('not_fried'));
  assert.ok(context.preferred_ingredients.includes('salmon'));
  assert.equal(hospitalityRequest(context).price_range.maximum_brl, 180);
});

test('Writer não pode introduzir assunto operacional ausente do envelope aprovado', async (t) => {
  const root = temporary(t, 'deliveryos-writer-topic-gate-');
  const writer = new LocalHomologationWriter({
    writer: new ResponseWriter({ runtime: { generateStructured: async () => ({ text: 'Olá! Você gostaria de saber mais sobre a bebida disponível no marketplace?' }) } })
  });
  const customerMenu = new CustomerMenuHomologationService({ projectRoot: PROJECT_ROOT, menuReviewRoot: path.join(root, 'review') });
  const homologation = new HomologationService({
    projectRoot: PROJECT_ROOT, feedbackRoot: path.join(root, 'feedback'),
    chatRuntimeRoot: path.join(root, 'chat'), customerMenu, localWriter: writer
  });
  const body = await homologation.chatWithWriter({ message: 'Boa noite, tudo bem?' });
  assert.equal(body.turn.diagnostic.response_path, 'deterministic_fallback');
  assert.equal(body.turn.diagnostic.fallback_reason, 'WRITER_UNAPPROVED_TOPIC');
  assert.doesNotMatch(body.turn.response, /marketplace|bebida/iu);
});

test('gate de publicação rejeita até Writer injetado que alegue saída aceita', async (t) => {
  const root = temporary(t, 'deliveryos-publication-gate-');
  const customerMenu = new CustomerMenuHomologationService({ projectRoot: PROJECT_ROOT, menuReviewRoot: path.join(root, 'review') });
  const homologation = new HomologationService({
    projectRoot: PROJECT_ROOT, feedbackRoot: path.join(root, 'feedback'),
    chatRuntimeRoot: path.join(root, 'chat'), customerMenu,
    localWriter: {
      writeApproved: async () => ({
        accepted: true, source: 'local_model', reason: null,
        output: { text: 'Olá! Você quer uma bebida no marketplace?' }
      })
    }
  });
  const body = await homologation.chatWithWriter({ message: 'Boa noite, tudo bem?' });
  assert.equal(body.turn.diagnostic.response_path, 'deterministic_fallback');
  assert.equal(body.turn.diagnostic.fallback_reason, 'WRITER_UNAPPROVED_TOPIC');
  assert.doesNotMatch(body.turn.response, /marketplace|bebida/iu);
});

const CONVERSATIONS = Object.freeze([
  ['saudacao', ['Oi, boa noite!', 'Tudo bem?', 'Quero conhecer o cardápio.', 'É para o salão.']],
  ['primeira_visita', ['É minha primeira vez no TATÁ.', 'Quero escolher para o salão.', 'Prefiro algo leve.', 'Até R$ 120.']],
  ['nao_conhece_japonesa', ['Nunca comi comida japonesa.', 'Quero começar com calma.', 'É no salão.', 'Prefiro sabores suaves.']],
  ['jantar_casal', ['É um jantar romântico.', 'No salão.', 'Somos duas pessoas.', 'Queremos compartilhar.']],
  ['aniversario', ['É uma comemoração de aniversário.', 'No salão.', 'Somos seis pessoas.', 'Pode recomendar?']],
  ['grupo_cinco', ['Somos cinco pessoas.', 'É no salão.', 'Queremos compartilhar.', 'O que faz sentido?']],
  ['apressado', ['Tenho pouco tempo.', 'Vou comer no salão.', 'Quero algo rápido.', 'O que você indica?']],
  ['pedido_ifood', ['Quero pedir em casa.', 'Pelo iFood.', 'Somos duas pessoas.', 'Pode sugerir?']],
  ['comparacao_canais', ['Quero comparar salão e iFood.', 'Somos duas pessoas.', 'Prefiro algo tradicional.', 'Os preços são iguais?']],
  ['salmao_sem_cream', ['Quero algo com salmão.', 'É no salão.', 'Sem cream cheese.', 'Prefiro algo leve.']],
  ['sem_fritura', ['Quero algo sem fritura.', 'No salão.', 'Para duas pessoas.', 'O que combina?']],
  ['opcao_leve', ['Quero uma opção mais leve.', 'É no salão.', 'Gosto de salmão.', 'Pode sugerir?']],
  ['opcao_macaricada', ['Prefiro algo maçaricado.', 'No salão.', 'Gosto de atum.', 'Pode sugerir?']],
  ['vegetariana', ['Quero uma opção vegetariana.', 'No salão.', 'É para uma pessoa.', 'Pode orientar?']],
  ['alergia_camarao', ['Tenho alergia a camarão.', 'É no salão.', 'Quero ver o cardápio.', 'O que é seguro confirmar?']],
  ['contaminacao_cruzada', ['Tenho alergia a camarão.', 'É no salão.', 'E sobre contaminação cruzada?', 'Como devo confirmar com a equipe?']],
  ['bebida', ['Quero escolher uma bebida.', 'É no salão.', 'Gosto de salmão.', 'O que harmoniza?']],
  ['orcamento', ['Quero algo mais em conta.', 'No iFood.', 'Até R$ 80.', 'Quais opções combinam?']],
  ['mudanca_ideia', ['Quero algo tradicional.', 'No salão.', 'Na verdade prefiro algo diferente.', 'Pode ajustar?']],
  ['pergunta_lateral_retomada', ['Quero uma sugestão leve.', 'No salão.', 'Tem valet?', 'Voltando ao cardápio, o que sugere?']]
]);

test('vinte conversas completas percorrem a rota real com contexto progressivo', async (t) => {
  assert.equal(CONVERSATIONS.length, 20);
  const root = temporary(t, 'deliveryos-hospitality-route-');
  const server = createNativeServer({
    projectRoot: PROJECT_ROOT, runtimeRoot: path.join(root, 'runtime'),
    feedbackRoot: path.join(root, 'feedback'), menuReviewRoot: path.join(root, 'review'),
    enableLocalWriter: false
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  let totalTurns = 0;
  for (const [id, turns] of CONVERSATIONS) {
    assert.ok(turns.length >= 4 && turns.length <= 10, id);
    await request(port, '/api/homologation/chat/reset', {});
    const previousQuestions = new Set();
    for (const message of turns) {
      const response = await request(port, '/api/homologation/chat', { message });
      assert.equal(response.status, 200, id);
      assert.ok(response.body.turn.response.length > 0, id);
      assert.equal(response.body.turn.diagnostic.hospitality_context.schema_version, 'deliveryos-hospitality-context-v1');
      const customerText = response.body.turn.response;
      const withoutUrls = customerText.replace(/https?:\/\/\S+/giu, ' ');
      const questions = withoutUrls.split(/(?<=[?])\s+/u).filter((part) => part.includes('?'));
      assert.ok(questions.length <= 1, `${id}: mais de uma pergunta`);
      for (const question of questions) {
        const key = question.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
        assert.equal(previousQuestions.has(key), false, `${id}: pergunta repetida`);
        previousQuestions.add(key);
      }
      assert.doesNotMatch(customerText, /(?:intent|capability_id|scenario_id|stack trace|Pattern Engine|Writer|fallback|dado sintético)/iu);
      assert.doesNotMatch(customerText, /(?:Opção Sintética|Bebida Sintética|catálogo sintético)/iu);
      assert.doesNotMatch(customerText, /(?:Ainda não tenho uma confirmação segura para concluir esse ponto|Você pode me contar se a dúvida é sobre)/iu);
      totalTurns += 1;
    }
  }
  assert.equal(totalTurns, 80);
});

test('R05 e O02 permanecem soberanos mesmo depois de contexto de recomendação', async (t) => {
  const root = temporary(t, 'deliveryos-hospitality-operational-boundary-');
  const server = createNativeServer({
    projectRoot: PROJECT_ROOT, runtimeRoot: path.join(root, 'runtime'),
    feedbackRoot: path.join(root, 'feedback'), menuReviewRoot: path.join(root, 'review'),
    enableLocalWriter: false
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;

  await request(port, '/api/homologation/chat', { message: 'Quero conhecer o cardápio.' });
  const largeGroup = (await request(port, '/api/homologation/chat', { message: 'Somos dez pessoas e estamos chegando.' })).body.turn;
  assert.equal(largeGroup.diagnostic.journey, 'reservation');
  assert.notEqual(largeGroup.diagnostic.capability, 'conversation.no_action');
  assert.match(largeGroup.response, /10 pessoas/iu);

  await request(port, '/api/homologation/chat/reset', {});
  await request(port, '/api/homologation/chat', { message: 'Quero uma sugestão de cardápio.' });
  const missingItem = (await request(port, '/api/homologation/chat', { message: 'Faltou meu refrigerante no pedido.' })).body.turn;
  assert.equal(missingItem.diagnostic.journey, 'missing_item');
  assert.notEqual(missingItem.diagnostic.capability, 'conversation.no_action');
  assert.match(missingItem.response, /refrigerante/iu);
});

test('painel oculta diagnóstico até o voto e oferece escala humana de zero a dez', () => {
  const html = fs.readFileSync(path.join(PROJECT_ROOT, 'tools', 'conversation-crm', 'simulator', 'app', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(PROJECT_ROOT, 'tools', 'conversation-crm', 'simulator', 'app', 'app.js'), 'utf8');
  assert.match(html, /id="chat-diagnostic"[^>]+disabled/u);
  assert.match(html, /Experiência geral \(0–10\)/u);
  assert.match(app, /Avalie a experiência antes de abrir o diagnóstico técnico/u);
  assert.match(app, /writerComparisonHtml\(state\.lastChat\.writer_comparison\)/u);
});
