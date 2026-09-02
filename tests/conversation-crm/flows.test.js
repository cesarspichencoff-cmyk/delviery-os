'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadFlowBundle, REQUIRED_BLOCK_FIELDS } = require('../../src/conversation-crm/flows');
const { ConversationEngine } = require('../../src/conversation-crm/engine');
const { deterministicOptions, tempDirectory, removeDirectory } = require('./helpers');

test('carrega os 35 blocos canônicos', () => {
  const bundle = loadFlowBundle();
  assert.equal(bundle.validation.block_count, 35);
  for (const id of ['B00', 'B01', 'B02', 'B03', 'B04', 'R01', 'R05', 'I01', 'I02', 'D01', 'D05', 'O00', 'O08', 'H01', 'H03', 'F01', 'F03', 'C01', 'C03']) {
    assert.equal(bundle.byId.has(id), true);
  }
});

test('carrega exatamente as 12 regras canônicas', () => {
  const bundle = loadFlowBundle();
  assert.equal(bundle.validation.rule_count, 12);
  assert.deepEqual(bundle.validation.rule_ids, Array.from({ length: 12 }, (_, index) => `NR${String(index + 1).padStart(2, '0')}`));
});

test('todo bloco contém o contrato configurável completo', () => {
  const bundle = loadFlowBundle();
  for (const block of bundle.flows.blocks) {
    for (const field of REQUIRED_BLOCK_FIELDS) assert.equal(field in block, true, `${block.id}:${field}`);
  }
});

test('casos graves não permitem fechamento automático', () => {
  const bundle = loadFlowBundle();
  for (const id of ['O03', 'O04', 'O06', 'O08', 'H03']) {
    const block = bundle.byId.get(id);
    assert.ok(block.forbidden_actions.includes('close_automatically') || block.forbidden_actions.includes('close_severe_case'));
  }
});

test('fluxos financeiros permanecem proibidos', () => {
  const bundle = loadFlowBundle();
  const serialized = JSON.stringify(bundle.flows);
  assert.equal(serialized.includes('offer_credit'), true);
  assert.equal(serialized.includes('offer_refund'), true);
  assert.equal(bundle.rules.rules[0].enforcement, 'block');
});

test('alterar JSON muda resposta sem recompilar motor', (t) => {
  const directory = tempDirectory();
  t.after(() => removeDirectory(directory));
  const root = path.resolve(__dirname, '..', '..', 'src', 'conversation-crm', 'flows');
  for (const file of ['flows.v0.json', 'rules.v0.json', 'policies.v0.json']) fs.copyFileSync(path.join(root, file), path.join(directory, file));
  const flowsPath = path.join(directory, 'flows.v0.json');
  const config = JSON.parse(fs.readFileSync(flowsPath, 'utf8'));
  config.blocks.find((block) => block.id === 'I01').message = 'synthetic_config_override';
  fs.writeFileSync(flowsPath, JSON.stringify(config));
  const bundle = loadFlowBundle({ root: directory });
  const engine = new ConversationEngine({ bundle, ...deterministicOptions() });
  const result = engine.triage({ message: 'Consulta sintética.', context: { data_mode: 'synthetic', intent: 'menu_information' } });
  assert.equal(result.suggested_response, 'synthetic_config_override');
});

