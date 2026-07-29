'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createBakeoffCorpus, createDiagnosticCorpus, validateDiagnosticCorpus, canonicalHash } = require('../../apps/deliveryos-ai-node');

test('corpus anterior permanece com os mesmos 260 casos e hash reproduzível', () => {
  const first = createBakeoffCorpus({ seed: 'TATA-LOCAL-AI-BAKEOFF-V1' });
  const second = createBakeoffCorpus({ seed: 'TATA-LOCAL-AI-BAKEOFF-V1' });
  assert.equal(first.cases.length, 260);
  assert.equal(canonicalHash(first), canonicalHash(second));
});

test('corpus diagnóstico é congelado antes da inferência e respeita o teto', () => {
  const corpus = createDiagnosticCorpus();
  assert.equal(corpus.total_cases, 32);
  assert.ok(corpus.total_cases <= 40);
  assert.equal(validateDiagnosticCorpus(corpus).passed, true);
  assert.equal(createDiagnosticCorpus().canonical_hash, corpus.canonical_hash);
});

test('diagnósticos cobrem os defeitos conversacionais declarados', () => {
  const corpus = createDiagnosticCorpus();
  const categories = new Set(corpus.cases.map((item) => item.category));
  assert.deepEqual([...categories].sort(), ['continuations', 'corrections', 'greetings', 'reformulations', 'side_questions']);
  const turns = corpus.cases.flatMap((item) => item.turns.map((turn) => turn.text.toLowerCase()));
  for (const phrase of ['oi', 'boa noite', 'tudo bem?', 'sim', 'quatro', 'amanhã', 'isso', 'o segundo', 'como falei', 'já te passei', 'não, é outro pedido', 'não entendi', 'explica melhor', 'como assim?', 'fala de outro jeito']) {
    assert.ok(turns.some((text) => text.includes(phrase)), phrase);
  }
});

test('diagnósticos não contêm PII, caminho local ou resposta esperada no adapter', () => {
  const serialized = JSON.stringify(createDiagnosticCorpus());
  assert.doesNotMatch(serialized, /C:\\Users\\|Desktop\\|Downloads\\/iu);
  assert.doesNotMatch(serialized, /\b\d{3}[. ]?\d{3}[. ]?\d{3}[- ]?\d{2}\b/iu);
  assert.doesNotMatch(serialized, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu);
});
