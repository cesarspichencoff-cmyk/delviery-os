'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('quatorze mutações de conhecimento, direção e segurança ficam vermelhas', () => {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const runner = path.join(projectRoot, 'scripts', 'verifiers', 'chatbot', 'service-intelligence-mutations.js');
  const run = spawnSync(process.execPath, [runner], {
    cwd: projectRoot,
    encoding: 'utf8',
    windowsHide: true
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.mutations, 14);
  assert.equal(report.red, 14);
  assert.equal(report.false_green, 0);
  assert.equal(report.results.every((item) => item.actual_exit === 1), true);
});
