'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..', '..');
const resultsRoot = path.join(projectRoot, 'evals', 'human-review', 'results');

test('corpus humanizado cobre as mesmas 50 conversas e 56 turnos', () => {
  const artifact = JSON.parse(fs.readFileSync(path.join(resultsRoot, 'humanized-responses-v1.json'), 'utf8'));
  assert.equal(artifact.corpus_size, 50);
  assert.equal(artifact.results.reduce((total, item) => total + item.results.length, 0), 56);
  assert.equal(artifact.oracle_injected, false);
  assert.equal(artifact.scenario_id_injected, false);
  assert.equal(artifact.results.every((item) => item.results.every((turn) => (
    turn.human_review.rating === null
    && Array.isArray(turn.human_review.tags)
    && turn.human_review.tags.length === 0
    && turn.human_review.comment === null
  ))), true);
});

test('metas estruturais, cinco lacunas e segurança permanecem verdes', () => {
  const metrics = JSON.parse(fs.readFileSync(path.join(resultsRoot, 'humanized-metrics-v1.json'), 'utf8'));
  assert.equal(metrics.objective.turns, 56);
  assert.equal(metrics.objective.dominant_opening_count <= 11, true);
  assert.equal(metrics.objective.generic_fallback_count <= 7, true);
  assert.equal(metrics.objective.five_contract_gaps.length, 5);
  assert.equal(metrics.objective.five_contract_gaps.every((item) => item.status === 'passed'), true);
  assert.equal(metrics.objective.continuation_greeting_failures.length, 0);
  assert.equal(metrics.objective.repeated_question_failures.length, 0);
  assert.equal(metrics.objective.verifier.failed, 0);
  assert.equal(Object.values(metrics.gates).every(Boolean), true);
});

test('mesmo corpus e seed produzem hash humanizado idêntico', () => {
  const runner = path.join(projectRoot, 'scripts', 'verifiers', 'chatbot', 'run-humanized.js');
  const outputRoot = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'deliveryos-humanized-test-'));
  try {
    const run = (name) => spawnSync(process.execPath, [runner], {
      cwd: projectRoot,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, DELIVERYOS_HUMANIZED_OUTPUT_FILE: path.join(outputRoot, name) }
    });
    const first = run('first.json');
    const second = run('second.json');
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(JSON.parse(first.stdout).hash, JSON.parse(second.stdout).hash);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(outputRoot, 'first.json'), 'utf8')).canonical_hash,
      JSON.parse(fs.readFileSync(path.join(outputRoot, 'second.json'), 'utf8')).canonical_hash
    );
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test('doze mutações independentes ficam vermelhas', () => {
  const runner = path.join(projectRoot, 'scripts', 'verifiers', 'chatbot', 'humanized-mutations.js');
  const run = spawnSync(process.execPath, [runner], { cwd: projectRoot, encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.mutations, 12);
  assert.equal(report.red, 12);
  assert.equal(report.false_green, 0);
  assert.equal(report.results.every((item) => item.actual_exit === 1), true);
});
