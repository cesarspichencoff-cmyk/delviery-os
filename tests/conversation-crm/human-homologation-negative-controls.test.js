'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('doze controles negativos do painel produzem falha real', () => {
  const script = path.resolve(__dirname, '..', '..', 'scripts', 'verifiers', 'chatbot', 'homologation-negative-controls.js');
  const run = spawnSync(process.execPath, [script], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.controls, 12);
  assert.equal(report.red, 12);
  assert.equal(report.false_green, 0);
  assert.equal(report.results.every((item) => item.actual_exit === 1 && item.evidence.passed === false), true);
});
