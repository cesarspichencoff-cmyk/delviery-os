#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { runExperienceLab } = require('./runner');

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

(async () => {
  const report = await runExperienceLab({
    seed: option('--seed', 'TATA-EXPERIENCE-LAB-V1'),
    mode: option('--mode', 'all'),
    limit: Number(option('--limit', 0)),
    wave: Number(option('--wave', 0)),
    waveCount: Number(option('--count', 0)),
    profile: option('--profile', null),
    countPerGroup: Number(option('--count-per-group', 50)),
    enableLocalWriter: process.argv.includes('--writer')
  });
  const output = option('--output');
  if (output) {
    const target = path.resolve(output);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(`${JSON.stringify({
    schema_version: report.schema_version,
    seed: report.seed,
    mode: report.mode,
    metrics: report.metrics,
    failure_classes: report.failure_classes,
    report_hash: report.report_hash,
    experience_evaluator: 'ADVISORY_NOT_INDEPENDENT'
  })}\n`);
  process.exitCode = (report.metrics.critical_failures || report.metrics.high_failures) ? 1 : 0;
})().catch((error) => {
  process.stderr.write(`${JSON.stringify({ error: error.code || error.message })}\n`);
  process.exitCode = 2;
});
