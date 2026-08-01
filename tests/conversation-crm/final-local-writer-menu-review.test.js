'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ResponseWriter } = require('../../apps/deliveryos-ai-node/dialogue/response-writer');
const { LocalHomologationWriter, inspectLocalWriterArtifacts } = require('../../tools/conversation-crm/homologation/local-writer');
const { MenuReviewService } = require('../../tools/conversation-crm/customer-menu/review-service');
const { CustomerMenuHomologationService } = require('../../tools/conversation-crm/customer-menu/service');
const { HomologationService } = require('../../tools/conversation-crm/homologation/service');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function temporary(t, prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function fakeWriter(text) {
  return new LocalHomologationWriter({
    writer: new ResponseWriter({ runtime: { generateStructured: async () => ({ text }) } })
  });
}

function services(t, writer = null) {
  const root = temporary(t, 'deliveryos-final-intelligence-');
  const customerMenu = new CustomerMenuHomologationService({
    projectRoot: PROJECT_ROOT,
    menuReviewRoot: path.join(root, 'menu-review')
  });
  const homologation = new HomologationService({
    projectRoot: PROJECT_ROOT,
    feedbackRoot: path.join(root, 'feedback'),
    chatRuntimeRoot: path.join(root, 'chat'),
    exportRoot: path.join(root, 'export'),
    customerMenu,
    localWriter: writer
  });
  return { root, customerMenu, homologation };
}

test('artefatos locais só são reconhecidos com tamanho e manifesto de hash certificados', (t) => {
  const root = temporary(t, 'deliveryos-writer-artifacts-');
  const runtime = path.join(root, 'runtime', 'llama-b10172');
  const models = path.join(root, 'models');
  fs.mkdirSync(runtime, { recursive: true });
  fs.mkdirSync(models, { recursive: true });
  fs.writeFileSync(path.join(runtime, 'llama-server.exe'), 'synthetic-test-binary');
  const descriptor = fs.openSync(path.join(models, 'gemma-4-E4B_q4_0-it.gguf'), 'w');
  fs.ftruncateSync(descriptor, 5154941280);
  fs.closeSync(descriptor);
  fs.writeFileSync(path.join(root, 'artifact-verification.json'), JSON.stringify({
    runtime_sha256: '9a2c7b98925cc4cea59d9e6de1e4ea3cbb07c26245410d5da653bceef9ee6e62',
    model_sha256: '676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee'
  }));
  const inspected = inspectLocalWriterArtifacts({ root });
  assert.equal(inspected.status, 'gemma_local');
  assert.equal(inspected.available, true);
  assert.equal(inspected.model_id, 'google/gemma-4-E4B-it');
  assert.equal(inspected.runtime_release, 'b10172');
});

test('painel publica Gemma somente depois da validação do envelope aprovado', async (t) => {
  const { homologation } = services(t, fakeWriter('Olá! Como posso ajudar?'));
  const body = await homologation.chatWithWriter({ message: 'oii' });
  assert.equal(body.turn.response, 'Olá! Como posso ajudar?');
  assert.equal(body.turn.diagnostic.writer_status, 'gemma_local');
  assert.equal(body.turn.diagnostic.response_path, 'gemma_local_writer');
  assert.equal(body.turn.diagnostic.fallback_used, false);
  assert.equal(body.turn.writer_comparison.A, 'Olá! Como posso ajudar?');
  assert.equal(body.turn.writer_comparison.B, 'Olá! Como posso ajudar?');
  assert.match(body.turn.writer_comparison.approved_envelope_hash, /^[a-f0-9]{64}$/u);
});

test('saída local que muda pergunta aprovada cai no fallback com motivo específico', async (t) => {
  const { homologation } = services(t, fakeWriter('Posso ajudar com outra coisa?'));
  const body = await homologation.chatWithWriter({ message: 'Quero algo com salmão e sem cream cheese.' });
  assert.equal(body.turn.diagnostic.writer_status, 'deterministic_fallback');
  assert.equal(body.turn.diagnostic.fallback_used, true);
  assert.equal(body.turn.diagnostic.fallback_reason, 'WRITER_QUESTION_CHANGED');
  assert.equal(body.turn.diagnostic.source_of_final_text, 'controlled_response_composer');
});

test('curadoria inventaria 199 itens e 86 harmonizações sem aprovação automática', (t) => {
  const review = new MenuReviewService({ projectRoot: PROJECT_ROOT, root: temporary(t, 'deliveryos-menu-review-') });
  const bootstrap = review.bootstrap();
  assert.deepEqual(bootstrap.summary, {
    total: 285, items: 199, pairings: 86, pending: 285, approved: 0,
    rejected: 0, conflicting: 0, active_real_items: 0,
    original_sources_in_git: false, append_only: true
  });
  assert.equal(bootstrap.proposals.every((item) => item.review_status === 'pending'), true);
  assert.equal(bootstrap.policy.automatic_confirmation, false);
});

test('aprovação de item real exige canal e unidade confirmados', (t) => {
  const review = new MenuReviewService({ projectRoot: PROJECT_ROOT, root: temporary(t, 'deliveryos-menu-scope-') });
  const item = review.list({ kind: 'item' })[0];
  assert.throws(() => review.action({ review_id: item.review_id, action: 'approve' }), { code: 'MENU_REVIEW_SCOPE_REQUIRED' });
  assert.equal(review.summary().approved, 0);
});

test('correção e aprovação humanas substituem as fixtures por catálogo real isolado', (t) => {
  const root = temporary(t, 'deliveryos-menu-activation-');
  const service = new CustomerMenuHomologationService({ projectRoot: PROJECT_ROOT, menuReviewRoot: root });
  const item = service.menuReview.list({ kind: 'item' })[0];
  service.menuReviewAction({
    review_id: item.review_id,
    action: 'correct',
    correction: { channel: 'dining_room', unit_id: 'TATA-UNIT-REVIEWED', availability: 'available' }
  });
  service.menuReviewAction({ review_id: item.review_id, action: 'approve' });
  const bootstrap = service.bootstrap();
  assert.equal(bootstrap.menu.catalog_mode, 'real_human_approved');
  assert.equal(bootstrap.menu.items.length, 1);
  assert.equal(bootstrap.menu.items[0].review_status, 'confirmed');
  assert.equal(bootstrap.menu.items[0].channel, 'dining_room');
  assert.equal(bootstrap.menu.items[0].unit_id, 'TATA-UNIT-REVIEWED');
  assert.equal(bootstrap.menu.items.some((entry) => entry.item_id.startsWith('SIM-')), false);
});

test('revisão é append-only e conserva correção antes da decisão', (t) => {
  const root = temporary(t, 'deliveryos-menu-append-');
  const review = new MenuReviewService({ projectRoot: PROJECT_ROOT, root });
  const item = review.list({ kind: 'item' })[0];
  review.action({ review_id: item.review_id, action: 'correct', correction: { channel: 'ifood', unit_id: 'TATA-UNIT-REVIEWED' } });
  review.action({ review_id: item.review_id, action: 'reject' });
  const lines = fs.readFileSync(review.file, 'utf8').trim().split(/\r?\n/u).map(JSON.parse);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].revision, 1);
  assert.equal(lines[1].revision, 2);
  assert.equal(lines[1].correction.channel, 'ifood');
  assert.equal(review.list().find((entry) => entry.review_id === item.review_id).review_status, 'rejected');
});

test('harmonização não pode ser aprovada sem escopo e vínculos reais', (t) => {
  const review = new MenuReviewService({ projectRoot: PROJECT_ROOT, root: temporary(t, 'deliveryos-pairing-link-') });
  const pairing = review.list({ kind: 'pairing' })[0];
  assert.throws(() => review.action({ review_id: pairing.review_id, action: 'approve' }), { code: 'MENU_REVIEW_SCOPE_REQUIRED' });
  review.action({ review_id: pairing.review_id, action: 'correct', correction: { channel: 'dining_room', unit_id: 'TATA-UNIT-REVIEWED' } });
  assert.throws(() => review.action({ review_id: pairing.review_id, action: 'approve' }), { code: 'MENU_REVIEW_PAIRING_LINK_REQUIRED' });
  assert.equal(review.summary().approved, 0);
});

test('fontes preservam separação de canal sem importar conteúdo público', (t) => {
  const review = new MenuReviewService({ projectRoot: PROJECT_ROOT, root: temporary(t, 'deliveryos-source-registry-') });
  const sources = review.bootstrap().sources;
  assert.equal(sources.find((item) => item.source_id === 'menu-source-live-menu-v1').channel, 'dining_room');
  assert.equal(sources.find((item) => item.source_id === 'menu-source-own-delivery-v1').channel, 'own_delivery');
  assert.equal(sources.find((item) => item.source_id === 'menu-source-ifood-v1').state, 'blocked_not_imported');
  assert.equal(sources.some((item) => /C:\\Users\\/iu.test(item.location)), false);
});

test('fonte derivada não contém credencial nem estado aprovado', () => {
  const file = fs.readFileSync(path.join(PROJECT_ROOT, 'tools', 'conversation-crm', 'customer-menu', 'real-menu-review-source.v1.json'), 'utf8');
  const source = JSON.parse(file);
  assert.equal(source.pairing_count, 86);
  assert.equal(source.pairings.every((item) => item.review_status === 'pending'), true);
  assert.doesNotMatch(file, /(?:token|cookie|password|senha|C:\\Users\\)/iu);
});
