'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildExperienceCatalog } = require('../../tools/conversation-crm/experience-lab/catalog');
const { SyntheticCustomer } = require('../../tools/conversation-crm/experience-lab/synthetic-customer');
const { similarity, evaluateTurn } = require('../../tools/conversation-crm/experience-lab/hard-evaluator');
const { evaluateExperience } = require('../../tools/conversation-crm/experience-lab/experience-evaluator');
const { sha256 } = require('../../tools/conversation-crm/experience-lab/runner');

test('catálogo contém 40 conversas estruturadas e 40 mutadas com 4–12 turnos', () => {
  const catalog = buildExperienceCatalog();
  assert.equal(catalog.structured.length, 40);
  assert.equal(catalog.mutated.length, 40);
  for (const scenario of [...catalog.structured, ...catalog.mutated]) assert.ok(scenario.actions.length >= 4 && scenario.actions.length <= 12);
});

test('mesma seed produz o mesmo cliente e seed nova muda a superfície', () => {
  const scenario = buildExperienceCatalog().mutated[0];
  const render = (seed) => {
    const customer = new SyntheticCustomer(scenario, seed);
    const messages = [];
    for (let turn = customer.nextTurn(); turn; turn = customer.nextTurn({ response: 'iFood e salão' })) messages.push(turn.message);
    return messages;
  };
  assert.deepEqual(render('SEED-A'), render('SEED-A'));
  assert.notDeepEqual(render('SEED-A'), render('SEED-B'));
});

test('cliente sintético adapta o próximo turno à resposta recebida', () => {
  const scenario = buildExperienceCatalog().structured.find((item) => item.family === 'first_visit');
  const customer = new SyntheticCustomer(scenario, 'ADAPTIVE');
  customer.nextTurn();
  const next = customer.nextTurn({ response: 'Você prefere iFood, salão ou delivery próprio?' });
  assert.match(next.message, /iFood|salão|restaurante|presencial/iu);
});

test('oráculo de similaridade reprova loop material e aceita resposta diferente', () => {
  assert.ok(similarity('Encontrei A, B e C no cardápio.', 'Encontrei A, B e C no cardápio.') > 0.88);
  assert.ok(similarity('Encontrei A, B e C no cardápio.', 'O preço de B é R$ 42,00.') < 0.6);
});

test('hard evaluator detecta canal, segurança, referência e apoio à decisão', () => {
  const turn = {
    index: 2, action: { type: 'allergy' }, input: 'minha irmã tem alergia a camarão', response: 'Encontrei três opções.',
    diagnostic: { channel: 'ifood', candidates_found: [], hospitality_context: { allergies: [] }, turn_analysis: {} }
  };
  const failures = evaluateTurn(turn, { response: 'Encontrei três opções.' }, new Map());
  assert.ok(failures.some((item) => item.failure_class === 'SAFETY_CONTEXT_LOST'));
  assert.ok(failures.some((item) => item.failure_class === 'RESPONSE_LOOP'));
});

test('hard evaluator mantém alergia soberana no apoio à decisão posterior', () => {
  const turn = {
    index: 5, action: { type: 'decision' }, input: 'o que você escolheria entre esses?',
    response: 'Eu escolheria o Hot Roll com Shimeji por ter o menor preço.',
    diagnostic: {
      candidates_found: ['SIM-ITEM-1'],
      hospitality_context: { allergies: ['crustacean'] },
      turn_analysis: {}
    }
  };
  const failures = evaluateTurn(turn, { response: 'Alergia registrada.' }, new Map());
  assert.ok(failures.some((item) => item.failure_class === 'SAFETY_CONTEXT_LOST'));
  assert.ok(!failures.some((item) => item.failure_class === 'DECISION_SUPPORT_FAILURE'));
});

test('Experience Evaluator é explicitamente advisory e não independente', () => {
  const result = evaluateExperience([{ response: 'Vou registrar essa preferência.' }], { synthetic: true });
  assert.equal(result.independence, 'ADVISORY_NOT_INDEPENDENT');
  assert.equal(result.passed, false);
});

test('golden failures preservam as 12 reprovações humanas sem PII', () => {
  const file = path.join(__dirname, '..', '..', 'tools', 'conversation-crm', 'experience-lab', 'golden-failures.v2.json');
  const golden = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(golden.failures.length, 12);
  const raw = JSON.stringify(golden);
  assert.doesNotMatch(raw, /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|@(?:gmail|hotmail|outlook)\./iu);
});

test('hash canônico independe da ordem das chaves', () => {
  assert.equal(sha256({ a: 1, b: { c: 2 } }), sha256({ b: { c: 2 }, a: 1 }));
});
