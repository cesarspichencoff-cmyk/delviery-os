'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..', '..');
const resultsRoot = path.join(projectRoot, 'evals', 'human-review', 'results');

test('corpus refinado cobre 50 casos anteriores e oito casos inéditos', () => {
  const artifact = JSON.parse(fs.readFileSync(path.join(resultsRoot, 'refined-responses-v2.json'), 'utf8'));
  assert.equal(artifact.results.length, 50);
  assert.equal(artifact.new_results.length, 8);
  assert.equal(artifact.results.flatMap((item) => item.results).length, 56);
  assert.equal(artifact.new_results.flatMap((item) => item.results).length, 8);
  assert.equal(artifact.oracle_injected, false);
  assert.equal(artifact.scenario_id_injected, false);
});

test('métricas refinadas provam gates, utilidade e isolamento', () => {
  const metrics = JSON.parse(fs.readFileSync(path.join(resultsRoot, 'refined-metrics-v2.json'), 'utf8'));
  assert.equal(metrics.validation.failed, 0);
  assert.equal(metrics.gates.available_knowledge_unused.failed, 0);
  assert.equal(metrics.gates.humanized_but_unhelpful.failed, 0);
  assert.equal(metrics.knowledge.suspect_fallback_turns, 0);
  assert.equal(metrics.safety.external_system_accessed, false);
  assert.equal(metrics.safety.real_driver_used, false);
  assert.equal(metrics.safety.raw_message_persisted, false);
});

test('comparação antes e depois mantém alinhamento sem incorporar feedback privado', () => {
  const artifact = JSON.parse(fs.readFileSync(path.join(resultsRoot, 'human-feedback-before-after-v2.json'), 'utf8'));
  assert.equal(artifact.rows.length, 50);
  assert.equal(artifact.rows.flatMap((item) => item.turns).length, 56);
  assert.ok(artifact.changed_turns > 0);
  const serialized = JSON.stringify(artifact);
  assert.equal(serialized.includes('comment'), false);
  assert.equal(serialized.includes('rating'), false);
});

test('geração refinada é determinística em processo limpo', () => {
  const runner = path.join(projectRoot, 'scripts', 'verifiers', 'chatbot', 'run-refined.js');
  const before = fs.readFileSync(path.join(resultsRoot, 'refined-responses-v2.json'), 'utf8');
  execFileSync(process.execPath, [runner], { cwd: projectRoot, stdio: 'pipe' });
  const after = fs.readFileSync(path.join(resultsRoot, 'refined-responses-v2.json'), 'utf8');
  assert.equal(after, before);
});
