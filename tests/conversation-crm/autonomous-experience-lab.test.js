'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildExperienceCatalog } = require('../../tools/conversation-crm/experience-lab/catalog');
const { buildWaveCatalog, buildDirectedCatalog, buildConfirmationCatalog, ARCHETYPES } = require('../../tools/conversation-crm/experience-lab/wave-catalog');
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
  assert.ok(failures.some((item) => item.failure_class === 'ALLERGY_CONTEXT_LOST'));
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
  assert.ok(failures.some((item) => item.failure_class === 'ALLERGY_CONTEXT_LOST'));
  assert.ok(!failures.some((item) => item.failure_class === 'DECISION_SUPPORT_FAILURE'));
});

test('Experience Evaluator é explicitamente advisory e não independente', () => {
  const result = evaluateExperience([{ response: 'Vou registrar essa preferência.' }], { synthetic: true });
  assert.equal(result.independence, 'ADVISORY_NOT_INDEPENDENT');
  assert.equal(result.passed, false);
  assert.ok(result.average < 10);
});

test('wave catalog é determinístico, diverso e inclui conversas longas', () => {
  const first = buildWaveCatalog({ count: 100, seed: 'WAVE-A', wave: 1 });
  const replay = buildWaveCatalog({ count: 100, seed: 'WAVE-A', wave: 1 });
  const fresh = buildWaveCatalog({ count: 100, seed: 'WAVE-B', wave: 1 });
  assert.deepEqual(first, replay);
  assert.notDeepEqual(first, fresh);
  assert.equal(first.length, 100);
  assert.ok(new Set(first.map((item) => item.family)).size >= 20);
  assert.ok(first.some((item) => item.actions.length >= 12));
  assert.equal(ARCHETYPES.length, 25);
});

test('bateria dirigida contém 50 safety, 50 compound e 50 mixed com seed reproduzível', () => {
  const first = buildDirectedCatalog({ seed: 'DIRECTED-A', countPerGroup: 50 });
  const replay = buildDirectedCatalog({ seed: 'DIRECTED-A', countPerGroup: 50 });
  const fresh = buildDirectedCatalog({ seed: 'DIRECTED-B', countPerGroup: 50 });
  assert.deepEqual(first, replay);
  assert.notDeepEqual(first, fresh);
  assert.equal(first.length, 150);
  assert.equal(first.filter((item) => item.family === 'directed_safety').length, 50);
  assert.equal(first.filter((item) => item.family === 'directed_compound').length, 50);
  assert.equal(first.filter((item) => item.family === 'directed_mixed').length, 50);
});

test('fresh confirmation contém 200 conversas e peso maior em safety e transições', () => {
  const catalog = buildConfirmationCatalog({ seed: 'CONFIRMATION-A' });
  assert.equal(catalog.length, 200);
  assert.equal(catalog.filter((item) => item.family === 'confirmation_safety').length, 70);
  assert.equal(catalog.filter((item) => item.family === 'confirmation_compound').length, 50);
  assert.equal(catalog.filter((item) => item.family === 'confirmation_mixed').length, 80);
  assert.deepEqual(catalog, buildConfirmationCatalog({ seed: 'CONFIRMATION-A' }));
  assert.notDeepEqual(catalog, buildConfirmationCatalog({ seed: 'CONFIRMATION-B' }));
});

test('hard evaluator bloqueia candidato com alergênico confirmado', () => {
  const turn = {
    index: 3, action: { type: 'allergy_interrupt', expect: { allergy: 'crustacean' } }, input: 'alergia a camarão',
    response: 'Vou considerar a alergia e confirmar com a equipe.',
    diagnostic: { candidates_found: ['ITEM-SHRIMP'], hospitality_context: { allergies: ['crustacean'], confirmed_facts: [] } }
  };
  const menu = new Map([['ITEM-SHRIMP', { name: 'Item sintético', allergens: [{ allergen: 'crustacean', assertion: 'contains' }] }]]);
  const failures = evaluateTurn(turn, null, menu);
  assert.ok(failures.some((item) => item.failure_class === 'ALLERGY_INCOMPATIBLE_CANDIDATE' && item.severity === 'critical'));
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
