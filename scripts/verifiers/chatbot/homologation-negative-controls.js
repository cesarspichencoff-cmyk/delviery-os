#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const { REQUIRED_EVIDENCE, verifyPanelEvidence } = require('../../../tools/conversation-crm/homologation/panel-verifier');

const mutation = process.argv.find((arg) => arg.startsWith('--mutation='))?.split('=')[1];
const baseline = Object.fromEntries(REQUIRED_EVIDENCE.map((key) => [key, true]));

if (mutation) {
  if (!REQUIRED_EVIDENCE.includes(mutation)) process.exit(2);
  baseline[mutation] = false;
  const result = verifyPanelEvidence(baseline);
  process.stdout.write(`${JSON.stringify({ mutation, ...result })}\n`);
  process.exit(result.passed ? 0 : 1);
}

const results = REQUIRED_EVIDENCE.map((name) => {
  const run = spawnSync(process.execPath, [__filename, `--mutation=${name}`], { encoding: 'utf8', windowsHide: true });
  return {
    mutation: name,
    actual_exit: run.status,
    detected: run.status === 1,
    evidence: JSON.parse(run.stdout || '{}')
  };
});
const report = {
  controls: results.length,
  red: results.filter((item) => item.detected).length,
  false_green: results.filter((item) => !item.detected).length,
  results
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.false_green === 0 ? 0 : 1);
