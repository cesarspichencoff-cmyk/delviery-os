'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  NativeConversationEngine,
  NativeConversationRuntime,
  createRuntimeConversationEngine,
  loadFeatureFlags,
  SeededRandom
} = require('../../src/conversation-crm/native');
const {
  loadRuntimeCatalogs,
  validateOperationalCatalogs
} = require('../../src/conversation-crm/native/catalogs/operational');
const { loadCanonicalCatalogs } = require('../../src/conversation-crm/native/catalogs/oracle');
const { createTestConversationEngine } = require('./helpers/native-test-engine');

const flags = loadFeatureFlags({ file: 'config/conversation-crm/native-flags.simulator.json' });

function temporaryRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-native-oracle-isolation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('Engine sem catálogo operacional falha fechado e não consulta o oráculo', () => {
  assert.throws(
    () => new NativeConversationEngine({ flags }),
    { code: 'OPERATIONAL_CATALOG_REQUIRED' }
  );
});

test('Engine rejeita catálogo incompleto, desconhecido ou contendo cenários', () => {
  assert.throws(
    () => new NativeConversationEngine({ flags, catalogs: {} }),
    { code: 'OPERATIONAL_CATALOG_INVALID' }
  );
  const operational = loadRuntimeCatalogs();
  assert.throws(
    () => validateOperationalCatalogs({ ...operational, unknown_oracle_field: true }),
    { code: 'OPERATIONAL_CATALOG_INVALID' }
  );
  assert.throws(
    () => new NativeConversationEngine({ flags, catalogs: loadCanonicalCatalogs() }),
    { code: 'OPERATIONAL_CATALOG_ORACLE_PROHIBITED' }
  );
});

test('fronteira estática do runtime não importa cenário, testes ou review packets', () => {
  const files = [
    'src/conversation-crm/native/catalogs/operational.js',
    'src/conversation-crm/native/engine.js',
    'src/conversation-crm/native/engine-factory.js',
    'src/conversation-crm/native/runtime.js',
    'src/conversation-crm/native/drivers/registry.js',
    'src/conversation-crm/native/router.js',
    'src/conversation-crm/native/placeholders.js',
    'src/conversation-crm/native/migration.js'
  ];
  const forbidden = /loadCanonicalCatalogs|loadScenarioOracle|SCENARIO_CATALOG_V1|catalogs[\\/]oracle|tests[\\/]|review-packets/;
  for (const file of files) {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    assert.equal(forbidden.test(source), false, file);
  }
});

test('factory de runtime carrega somente catálogo operacional aprovado', () => {
  const engine = createRuntimeConversationEngine({ flags });
  assert.equal(Object.hasOwn(engine.catalogs, 'scenarios'), false);
  assert.deepEqual(Object.keys(engine.catalogs).sort(), ['capabilities', 'escalation', 'hashes', 'intents', 'placeholders', 'policy', 'publicInfo']);
  assert.equal(engine.catalogs.intents.intents.length, 52);
  assert.equal(engine.catalogs.capabilities.capabilities.length, 39);
  assert.equal(engine.catalogs.publicInfo.real_drivers_enabled, false);
});

test('factory de testes recebe somente catálogo operacional e mantém o oráculo externo', () => {
  const operational = loadRuntimeCatalogs();
  const oracle = loadCanonicalCatalogs();
  const engine = createTestConversationEngine({ flags, operationalCatalog: operational });
  const scenario = oracle.scenarios.scenarios[0];
  const result = engine.analyze({ content: scenario.input, context: {} });
  assert.equal(result.intent, scenario.intent);
  assert.equal(Object.hasOwn(engine.catalogs, 'scenarios'), false);
});

test('200 entradas passam sem IDs em ordem original, inversa e pseudoaleatória', () => {
  const operational = loadRuntimeCatalogs();
  const oracle = loadCanonicalCatalogs();
  const engine = createTestConversationEngine({ flags, operationalCatalog: operational });
  const original = [...oracle.scenarios.scenarios];
  const inverse = [...original].reverse();
  const random = new SeededRandom('TATA-ORACLE-ISOLATION-V1');
  const shuffled = [...original];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = random.integer(0, index);
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  for (const scenarios of [original, inverse, shuffled]) {
    for (const scenario of scenarios) {
      const result = engine.analyze({ content: scenario.input, context: {} });
      assert.equal(result.intent, scenario.intent, scenario.scenario_id);
      assert.equal(result.scenario_id, null);
    }
  }
});

test('sentinela impossível permanece somente no oráculo externo', (t) => {
  const sentinel = Object.freeze({
    scenario_id: 'AUDIT-ORACLE-SENTINEL',
    input: 'Mensagem neutra sem intenção operacional.',
    intent: 'oracle.impossible_intent'
  });
  const engine = createTestConversationEngine({ flags, operationalCatalog: loadRuntimeCatalogs() });
  const result = engine.analyze({ content: sentinel.input, context: {} });
  assert.notEqual(result.intent, sentinel.intent);
  assert.equal(JSON.stringify(engine.catalogs).includes(sentinel.intent), false);
  assert.equal(result.intent === sentinel.intent, false);

  const runtime = new NativeConversationRuntime({ runtimeRoot: temporaryRoot(t) });
  assert.equal(JSON.stringify(runtime.engine.catalogs).includes(sentinel.intent), false);
  assert.equal(Object.hasOwn(runtime.engine.catalogs, 'scenarios'), false);
});
