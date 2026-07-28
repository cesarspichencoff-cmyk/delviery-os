'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createNativeServer } = require('../../tools/conversation-crm/native-server');
const { blindOrder, loadHomologationData } = require('../../tools/conversation-crm/homologation/data');
const { FeedbackStore } = require('../../tools/conversation-crm/homologation/feedback-store');
const { HomologationService } = require('../../tools/conversation-crm/homologation/service');

const projectRoot = path.resolve(__dirname, '..', '..');

function temporary(t, prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function setupService(t, options = {}) {
  const root = temporary(t, 'deliveryos-homologation-');
  return {
    root,
    service: new HomologationService({
      projectRoot,
      feedbackRoot: path.join(root, 'feedback'),
      chatRuntimeRoot: path.join(root, 'runtime'),
      exportRoot: path.join(root, 'exports'),
      now: options.now || (() => '2026-07-28T12:00:00.000Z')
    })
  };
}

function validRating(reviewId = 'REV-001') {
  return {
    mode: 'refined',
    review_id: reviewId,
    rating: 4,
    criteria: {
      naturalidade: 4,
      acolhimento: 5,
      clareza: 4,
      utilidade: 4,
      tamanho: 4,
      confianca: 5
    },
    tags: ['muito_bom'],
    comment: 'Resposta clara e acolhedora.'
  };
}

function allFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? allFiles(file) : [file];
  });
}

test('fontes aprovadas alimentam a re-homologação refinada e preservam o banco anterior', () => {
  const data = loadHomologationData(projectRoot);
  assert.equal(data.cases.length, 50);
  assert.equal(data.cases.reduce((sum, item) => sum + item.turns.length, 0), 56);
  assert.equal(data.rehomologation_cases.length, 51);
  assert.equal(data.rehomologation_cases.filter((item) => item.review_id.startsWith('NEW-')).length, 8);
  assert.equal(data.bank.length, 32);
  assert.equal(data.hashes.humanized, 'cfe462fe00147c6b0642fbd9e9fe15f19c8120781d5829d62f3dda663814dc04');
  assert.match(data.hashes.refined, /^[a-f0-9]{64}$/);
});

test('ordem A/B é determinística e não revela versão no payload público', (t) => {
  const { service } = setupService(t);
  const first = service.bootstrap().blind_cases;
  const second = service.bootstrap().blind_cases;
  assert.deepEqual(first, second);
  assert.deepEqual(blindOrder('REV-001'), blindOrder('REV-001'));
  assert.equal(JSON.stringify(first).includes('"humanized"'), false);
  assert.equal(JSON.stringify(first).includes('"baseline"'), false);
  assert.equal(JSON.stringify(first).includes('HREV-'), false);
});

test('detalhes técnicos ficam bloqueados até existir voto do caso correto', (t) => {
  const { service } = setupService(t);
  assert.throws(() => service.technical('refined', 'REV-001'), { code: 'VOTE_REQUIRED' });
  service.feedback(validRating());
  const result = service.technical('refined', 'REV-001');
  assert.equal(result.ok, true);
  assert.equal(result.decision.review_id, 'REV-001');
  assert.equal(result.decision.turns.length, 1);
  assert.throws(() => service.technical('refined', 'REV-004'), { code: 'VOTE_REQUIRED' });
});

test('feedback humano persiste em JSONL e reaparece após reinício do store', (t) => {
  const root = temporary(t, 'deliveryos-feedback-reload-');
  const options = { root, now: () => '2026-07-28T12:00:00.000Z' };
  const first = new FeedbackStore(options);
  first.record(validRating(), {
    corpusVersion: '1.0.0',
    composerVersion: 'humanized-v1',
    responseHash: 'a'.repeat(64)
  });
  const second = new FeedbackStore(options);
  assert.equal(second.latest('refined').size, 1);
  assert.equal(second.hasVote('refined', 'REV-001'), true);
  assert.equal(fs.readFileSync(path.join(root, 'refined-ratings-v2.jsonl'), 'utf8').trim().split(/\r?\n/).length, 1);
});

test('revisão é append-only e o dashboard conta somente o voto mais recente', (t) => {
  const { service, root } = setupService(t);
  service.feedback(validRating());
  service.feedback({ ...validRating(), rating: 2, tags: ['seco'], revision_reason: 'Reavaliação após leitura completa.' });
  const rows = service.store.rows('refined');
  const summary = service.summary().summary.cesar_review;
  assert.equal(rows.length, 2);
  assert.equal(rows[1].supersedes_review_event_id, rows[0].review_event_id);
  assert.equal(summary.evaluated, 1);
  assert.equal(summary.overall_average, 2);
  assert.equal(allFiles(root).some((file) => fs.readFileSync(file, 'utf8').includes('Reavaliação após leitura completa.')), true);
});

test('telefone, e-mail, token, pedido, endereço e cookie são recusados antes do append', (t) => {
  const { service, root } = setupService(t);
  const markers = [
    'marcador-unico-privacy@example.test',
    '11 99999-1111',
    'token=SEGREDO-SINTETICO-UNICO',
    'pedido 982731',
    'Rua Exemplo Sintético, 123',
    'cookie=COOKIE-SINTETICO-UNICO'
  ];
  markers.forEach((marker) => {
    assert.throws(() => service.feedback({ ...validRating(), comment: `Controle ${marker}` }), { code: 'FEEDBACK_CONTAINS_PERSONAL_DATA' });
  });
  const disk = allFiles(root).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  markers.forEach((marker) => assert.equal(disk.includes(marker), false));
  assert.equal(service.store.rows('refined').length, 0);
});

test('Atendimento Livre retorna somente experiência pública e reset separa contextos', (t) => {
  const { service } = setupService(t);
  const first = service.chat('Estamos em dez pessoas e chegando.');
  assert.equal(first.ok, true);
  assert.match(first.turn.review_id, /^CHAT-0001-/);
  assert.equal(typeof first.turn.response, 'string');
  assert.equal('classification' in first.turn, false);
  assert.equal('scenario_id' in first.turn, false);
  service.resetChat();
  const second = service.chat('Quais são os horários?');
  assert.match(second.turn.review_id, /^CHAT-0002-/);
});

test('voto cego registra vencedor real apenas no armazenamento pós-voto', (t) => {
  const { service } = setupService(t);
  const item = service.findCase('REV-003');
  service.feedback({
    mode: 'blind',
    review_id: 'REV-003',
    response_hash: '0'.repeat(64),
    choice: 'A',
    tags: [],
    comment: 'Mais direta.'
  });
  const saved = [...service.store.latest('blind').values()][0];
  assert.equal(saved.winner, item.order.A);
  assert.deepEqual(service.technical('blind', 'REV-003').reveal, item.order);
});

test('exportação contém manifesto, HEAD, hashes e zero mensagem bruta de chat', (t) => {
  const { service, root } = setupService(t);
  service.feedback(validRating());
  const chat = service.chat('Quero entender o horário de funcionamento.');
  service.feedback({
    mode: 'free',
    review_id: chat.turn.review_id,
    response_hash: chat.turn.response_hash,
    tags: ['gostei'],
    comment: 'Resposta útil.'
  });
  const result = service.export();
  const packageRoot = path.join(root, 'exports', result.package_name);
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'MANIFEST.json'), 'utf8'));
  assert.equal(manifest.privacy_scan.passed, true);
  assert.match(manifest.head, /^[a-f0-9]{40}$/);
  assert.equal(manifest.hashes.refined, service.data.hashes.refined);
  const disk = allFiles(packageRoot).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.equal(disk.includes('Quero entender o horário de funcionamento.'), false);
  assert.equal(fs.existsSync(path.join(packageRoot, 'APPROVED_CASES.md')), true);
  assert.equal(fs.existsSync(path.join(packageRoot, 'PREVIOUS_HUMANIZED_RATINGS.json')), true);
  assert.equal(fs.existsSync(path.join(packageRoot, 'REFINED_RATINGS_V2.json')), true);
});

test('votos anteriores permanecem separados da nova rodada e comparação só abre após novo voto', (t) => {
  const { service } = setupService(t);
  service.feedback({ ...validRating(), mode: 'humanized' });
  assert.equal(service.store.latest('humanized').size, 1);
  assert.equal(service.store.latest('refined').size, 0);
  assert.equal(service.bootstrap().summary.previous_review.evaluated, 1);
  assert.throws(() => service.technical('refined', 'REV-001'), { code: 'VOTE_REQUIRED' });
  service.feedback(validRating());
  const details = service.technical('refined', 'REV-001');
  assert.equal(details.comparison.turns.length, 1);
  assert.equal(typeof details.comparison.turns[0].previous, 'string');
  assert.equal(typeof details.comparison.turns[0].refined, 'string');
});

test('servidor expõe fluxo de homologação sem remover as rotas históricas', async (t) => {
  const root = temporary(t, 'deliveryos-homologation-server-');
  const server = createNativeServer({
    runtimeRoot: path.join(root, 'native'),
    feedbackRoot: path.join(root, 'feedback'),
    chatRuntimeRoot: path.join(root, 'chat'),
    exportRoot: path.join(root, 'exports'),
    now: () => '2026-07-28T12:00:00.000Z'
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.close(); await once(server, 'close'); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const bootstrap = await (await fetch(`${base}/api/homologation/bootstrap`)).json();
  assert.equal(bootstrap.review_cases.length, 51);
  assert.equal(bootstrap.bank.length, 32);
  const historical = await (await fetch(`${base}/api/cases`)).json();
  assert.equal(historical.cases.length, 200);
  const technical = await fetch(`${base}/api/homologation/technical?mode=refined&review_id=REV-001`);
  assert.equal(technical.status, 400);
  assert.equal((await technical.json()).error_code, 'VOTE_REQUIRED');
});
