'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

const {
  CATEGORY_REQUIREMENTS,
  createBakeoffCorpus,
  validateBakeoffCorpus,
  canonicalHash,
  blindLabels,
  runBlindBakeoff,
  BlindBakeoffStore,
  CRITERIA
} = require('../../apps/deliveryos-ai-node');
const { createBakeoffServer, loadBundle } = require('../../tools/conversation-crm/local-ai-bakeoff/server');
const { outsideProject } = require('../../tools/conversation-crm/local-ai-bakeoff/run');

function temporary(t, prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function candidate(key = 'primary_local_candidate', options = {}) {
  return {
    key,
    kind: 'local_model',
    model_version: options.model_version || 'synthetic-model-v1',
    provider_version: 'synthetic-runtime-v1',
    start: options.start,
    stop: options.stop,
    metrics: () => ({ total_ms: 10, completion_tokens: 8 }),
    write: options.write || (async (input) => ({
      accepted: true,
      output: { text: input.required_question || input.direct_response[0] || 'Posso ajudar por aqui.' }
    }))
  };
}

async function bundle(options = {}) {
  const corpus = options.corpus || createBakeoffCorpus();
  return runBlindBakeoff({ corpus, seed: corpus.seed, candidates: options.candidates || [candidate()] });
}

function rating(value = 4) {
  return Object.fromEntries(CRITERIA.map((name) => [name, value]));
}

test('corpus canônico possui os 260 casos e todos os mínimos', () => {
  const corpus = createBakeoffCorpus();
  assert.equal(corpus.cases.length, 260);
  for (const [category, minimum] of Object.entries(CATEGORY_REQUIREMENTS)) assert.ok(corpus.counts[category] >= minimum);
  assert.deepEqual(validateBakeoffCorpus(corpus), { passed: true, findings: [], total_cases: 260 });
});

test('casos públicos exibem contexto sintético específico em vez de mensagem genérica', () => {
  const corpus = createBakeoffCorpus({ seed: 'CONTEXT-SEED' });
  for (const item of corpus.cases) {
    assert.ok(item.turns.length >= 1, item.case_id);
    assert.notEqual(item.turns[0].text, 'Mensagem sintética do cenário.', item.case_id);
    assert.ok(item.turns.every((turn) => ['customer', 'assistant'].includes(turn.role) && turn.text.length > 1), item.case_id);
  }
});
test('vinte conversas livres possuem pelo menos oito turnos', () => {
  const items = createBakeoffCorpus().cases.filter((item) => item.category === 'free_conversations');
  assert.equal(items.length, 20);
  assert.equal(items.every((item) => item.turns.length >= 8), true);
});

test('mesma seed produz corpus e hash idênticos', () => {
  const a = createBakeoffCorpus({ seed: 'SYNTHETIC-SEED-A' });
  const b = createBakeoffCorpus({ seed: 'SYNTHETIC-SEED-A' });
  assert.equal(canonicalHash(a), canonicalHash(b));
});

test('seed diferente altera a ordem sem alterar os mínimos', () => {
  const a = createBakeoffCorpus({ seed: 'SYNTHETIC-SEED-A' });
  const b = createBakeoffCorpus({ seed: 'SYNTHETIC-SEED-B' });
  assert.notEqual(canonicalHash(a), canonicalHash(b));
  assert.deepEqual(a.counts, b.counts);
});

test('corpus não contém PII nem caminho privado', () => {
  const serialized = JSON.stringify(createBakeoffCorpus());
  assert.doesNotMatch(serialized, /C:\\Users\\|\b\d{3}[. ]?\d{3}[. ]?\d{3}[- ]?\d{2}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu);
});

test('ordem cega é estável por seed e caso', () => {
  const keys = ['deterministic_change_004', 'primary_local_candidate', 'secondary_local_candidate'];
  assert.deepEqual(blindLabels('LBAKE-001', keys, 'seed'), blindLabels('LBAKE-001', keys, 'seed'));
  assert.deepEqual(blindLabels('LBAKE-001', keys, 'seed').map((item) => item.option), ['A', 'B', 'C']);
});

test('payload público não revela modelo, versão, latência ou natureza do candidato', async () => {
  const result = await bundle();
  const publicText = JSON.stringify(result.public);
  assert.doesNotMatch(publicText, /primary_local_candidate|synthetic-model|local_model|deterministic_change|latency_ms|provider_version/iu);
  assert.equal(result.public.total_cases, 260);
});

test('artefato privado preserva mapeamento e métricas para auditoria', async () => {
  const result = await bundle();
  assert.equal(result.private.candidates.length, 2);
  assert.equal(result.private.cases[0].candidates.primary_local_candidate.model_version, 'synthetic-model-v1');
  assert.equal(typeof result.private.cases[0].mapping.A, 'string');
});

test('candidato inválido cai no texto determinístico sem contaminar opção pública', async () => {
  const corpus = createBakeoffCorpus();
  const result = await bundle({
    corpus,
    candidates: [candidate('unsafe_candidate', { write: async () => ({ accepted: true, output: { text: 'Vou liberar R$ 999.' } }) })]
  });
  const privateCase = result.private.cases[0];
  assert.equal(privateCase.candidates.unsafe_candidate.status, 'fallback');
  const mappedOption = Object.entries(privateCase.mapping).find(([, key]) => key === 'unsafe_candidate')[0];
  assert.equal(result.public.cases[0].options.find((item) => item.option === mappedOption).text, corpus.cases[0].deterministic_response);
});

test('dois candidatos locais são avaliados sequencialmente', async () => {
  const events = [];
  const corpus = { ...createBakeoffCorpus(), cases: createBakeoffCorpus().cases.slice(0, 2) };
  await bundle({
    corpus,
    candidates: [
      candidate('first', { start: async () => events.push('first:start'), stop: async () => events.push('first:stop') }),
      candidate('second', { start: async () => events.push('second:start'), stop: async () => events.push('second:stop') })
    ]
  });
  assert.deepEqual(events, ['first:start', 'first:stop', 'second:start', 'second:stop']);
});

test('painel exige voto antes de revelar identidade', async (t) => {
  const root = temporary(t, 'deliveryos-bakeoff-store-');
  const result = await bundle({ corpus: { ...createBakeoffCorpus(), cases: createBakeoffCorpus().cases.slice(0, 2) } });
  const store = new BlindBakeoffStore({ root, bundle: result, now: () => '2026-07-28T12:00:00.000Z' });
  assert.throws(() => store.reveal(result.public.cases[0].case_id), { code: 'BAKEOFF_VOTE_REQUIRED' });
  const choice = result.public.cases[0].options[0].option;
  store.vote({ case_id: result.public.cases[0].case_id, choice, criteria: rating() });
  assert.equal(store.reveal(result.public.cases[0].case_id).mapping[choice].length > 0, true);
});

test('votos são append-only e revisão aponta para voto anterior', async (t) => {
  const root = temporary(t, 'deliveryos-bakeoff-votes-');
  const result = await bundle({ corpus: { ...createBakeoffCorpus(), cases: createBakeoffCorpus().cases.slice(0, 1) } });
  let tick = 0;
  const store = new BlindBakeoffStore({ root, bundle: result, now: () => `2026-07-28T12:00:0${tick++}.000Z` });
  const item = result.public.cases[0];
  const first = store.vote({ case_id: item.case_id, choice: item.options[0].option, criteria: rating(3) });
  const second = store.vote({ case_id: item.case_id, choice: item.options[1].option, criteria: rating(5) });
  assert.equal(store.rows().length, 2);
  assert.equal(second.supersedes_vote_id, first.vote_id);
  assert.equal(store.latest().get(item.case_id).vote_id, second.vote_id);
});

test('resumo nunca inventa vencedor humano', async (t) => {
  const root = temporary(t, 'deliveryos-bakeoff-summary-');
  const result = await bundle({ corpus: { ...createBakeoffCorpus(), cases: createBakeoffCorpus().cases.slice(0, 1) } });
  const store = new BlindBakeoffStore({ root, bundle: result });
  assert.equal(store.summary().human_winner, null);
  const item = result.public.cases[0];
  store.vote({ case_id: item.case_id, choice: item.options[0].option, criteria: rating() });
  assert.equal(store.summary().human_winner, null);
});

test('critério ausente ou nota inválida falha fechado', async (t) => {
  const root = temporary(t, 'deliveryos-bakeoff-invalid-vote-');
  const result = await bundle({ corpus: { ...createBakeoffCorpus(), cases: createBakeoffCorpus().cases.slice(0, 1) } });
  const store = new BlindBakeoffStore({ root, bundle: result });
  const item = result.public.cases[0];
  assert.throws(() => store.vote({ case_id: item.case_id, choice: item.options[0].option, criteria: {} }), { code: 'BAKEOFF_CRITERIA_INVALID' });
  assert.throws(() => store.vote({ case_id: item.case_id, choice: item.options[0].option, criteria: rating(8) }), { code: 'BAKEOFF_RATING_INVALID' });
});

test('servidor expõe somente opções cegas antes do voto', async (t) => {
  const root = temporary(t, 'deliveryos-bakeoff-server-');
  const result = await bundle({ corpus: { ...createBakeoffCorpus(), cases: createBakeoffCorpus().cases.slice(0, 2) } });
  const server = createBakeoffServer({ bundle: result, votesRoot: root, now: () => '2026-07-28T12:00:00.000Z' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.close(); await once(server, 'close'); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const first = await (await fetch(`${base}/api/bakeoff`)).json();
  assert.doesNotMatch(JSON.stringify(first), /primary_local_candidate|synthetic-model-v1/iu);
  const caseId = first.cases[0].case_id;
  assert.equal((await fetch(`${base}/api/bakeoff/reveal?case_id=${caseId}`)).status, 400);
  const choice = first.cases[0].options[0].option;
  const vote = await fetch(`${base}/api/bakeoff/vote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ case_id: caseId, choice, criteria: rating() })
  });
  assert.equal(vote.status, 200);
  assert.equal((await fetch(`${base}/api/bakeoff/reveal?case_id=${caseId}`)).status, 200);
});

test('bundle adulterado é recusado antes de abrir painel', async (t) => {
  const root = temporary(t, 'deliveryos-bakeoff-bundle-');
  const result = await bundle({ corpus: { ...createBakeoffCorpus(), cases: createBakeoffCorpus().cases.slice(0, 1) } });
  fs.writeFileSync(path.join(root, 'BLIND_BAKEOFF_PUBLIC.json'), JSON.stringify({ ...result.public, total_cases: 999 }), 'utf8');
  fs.writeFileSync(path.join(root, 'BLIND_BAKEOFF_PRIVATE.json'), JSON.stringify(result.private), 'utf8');
  assert.throws(() => loadBundle(root), { code: 'BAKEOFF_BUNDLE_INTEGRITY_INVALID' });
});

test('painel usa textContent e não injeta resposta do modelo via innerHTML', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../tools/conversation-crm/local-ai-bakeoff/app/app.js'), 'utf8');
  assert.doesNotMatch(source, /innerHTML/u);
  assert.match(source, /textContent/u);
  assert.match(source, /createTextNode/u);
});

test('saída do bake-off é obrigatoriamente externa ao repositório', () => {
  assert.throws(() => outsideProject(path.resolve(__dirname, '..', '..', 'private-output')), { code: 'BAKEOFF_OUTPUT_MUST_BE_EXTERNAL' });
  assert.equal(outsideProject(path.join(os.tmpdir(), 'deliveryos-bakeoff-external')).startsWith(path.resolve(os.tmpdir())), true);
});

test('scripts npm expõem execução e painel sem nova dependência', () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
  assert.equal(manifest.scripts['conversation-local-ai:bakeoff'], 'node tools/conversation-crm/local-ai-bakeoff/run.js');
  assert.equal(manifest.scripts['conversation-local-ai:bakeoff-panel'], 'node tools/conversation-crm/local-ai-bakeoff/server.js');
});
