'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPatternHomologationBundle, validatePatternHomologationBundle, BlindBakeoffStore } = require('../../apps/deliveryos-ai-node');

function read(relative) { return JSON.parse(fs.readFileSync(path.resolve(__dirname, '../..', relative), 'utf8')); }

function bundle() {
  return buildPatternHomologationBundle({
    base_corpus: read('evals/local-ai/rebakeoff/corpus-v1.json'),
    diagnostic_corpus: read('evals/local-ai/rebakeoff/diagnostic-corpus-v1.json'),
    gemma_result: read('evals/local-ai/rebakeoff/gemma4-e4b-results.json'),
    qwen_result: read('evals/local-ai/rebakeoff/qwen35-4b-results.json')
  });
}

test('painel cego reúne vinte casos com três opções e identidade oculta', () => {
  const result = bundle();
  assert.equal(result.public.total_cases, 20);
  assert.ok(result.public.cases.every((item) => item.options.length === 3));
  assert.equal(validatePatternHomologationBundle(result).passed, true);
});

test('cada trio usa exatamente o mesmo hash de plano e estado', () => {
  const result = bundle();
  assert.ok(result.private.cases.every((item) => typeof item.shared_plan_hash === 'string' && typeof item.shared_state_hash === 'string'));
  assert.ok(result.private.cases.every((item) => new Set(Object.keys(item.candidates)).size === 3));
});

test('identidade só é revelada depois de voto persistido', () => {
  const result = bundle();
  const root = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'deliveryos-pattern-vote-'));
  const store = new BlindBakeoffStore({ root, bundle: result, now: () => '2026-07-29T12:00:00-03:00' });
  const item = result.public.cases[0];
  assert.throws(() => store.reveal(item.case_id), { code: 'BAKEOFF_VOTE_REQUIRED' });
  store.vote({ case_id: item.case_id, choice: 'A', criteria: { naturalidade: 4, saudacao: 4, continuidade: 4, compreensao: 4, retomada: 4, utilidade: 4, confianca: 4, cesar_enviaria: 4 } });
  assert.equal(typeof store.reveal(item.case_id).mapping.A, 'string');
  fs.rmSync(root, { recursive: true, force: true });
});

test('bundle preserva human_winner nulo e proíbe promoção automática', () => {
  const result = bundle();
  assert.equal(result.private.human_winner, null);
  assert.equal(result.private.promotion_authorized, false);
});
