#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  analyzeWorkbook,
  anonymizeWorkbook,
  assertOutputOutsideRepository,
  safeError
} = require('../../src/conversation-crm/importer');

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];
    if (!current.startsWith('--')) continue;
    const key = current.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    args[key] = rest[index + 1] && !rest[index + 1].startsWith('--') ? rest[++index] : true;
  }
  return args;
}

function required(args, key) {
  if (!args[key] || args[key] === true) {
    const error = new Error('argumento_obrigatorio_ausente');
    error.code = 'ARGUMENTO_OBRIGATORIO_AUSENTE';
    throw error;
  }
  return args[key];
}

async function atomicWrite(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.partial`;
  await fs.writeFile(temporary, content, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporary, filePath);
}

function jsonLines(records) {
  return records.map((record) => JSON.stringify(record)).join('\n') + (records.length ? '\n' : '');
}

async function run(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const input = required(args, 'input');
  const repositoryRoot = path.resolve(__dirname, '..', '..');

  if (args.command === 'analyze') {
    const result = analyzeWorkbook(input);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.validation.compatible ? 0 : 2;
  }

  if (args.command === 'validate') {
    const result = analyzeWorkbook(input);
    const compact = {
      ok: result.validation.compatible,
      validation: result.validation,
      rows_by_sheet: Object.fromEntries(Object.entries(result.sheets).map(([sheet, stats]) => [sheet, stats.rows]))
    };
    process.stdout.write(`${JSON.stringify(compact, null, 2)}\n`);
    return compact.ok ? 0 : 2;
  }

  if (args.command === 'anonymize') {
    const output = required(args, 'output');
    assertOutputOutsideRepository(output, repositoryRoot);
    const result = anonymizeWorkbook(input, { secret: env.DELIVERYOS_CRM_ANON_SECRET });
    await atomicWrite(output, `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ ok: true, command: 'anonymize', stats: result.stats })}\n`);
    return 0;
  }

  if (args.command === 'export') {
    const output = required(args, 'output');
    assertOutputOutsideRepository(output, repositoryRoot);
    const result = anonymizeWorkbook(input, { secret: env.DELIVERYOS_CRM_ANON_SECRET });
    await fs.mkdir(output, { recursive: true });
    await Promise.all([
      atomicWrite(path.join(output, 'crm-records.anonymized.jsonl'), jsonLines(result.records)),
      atomicWrite(path.join(output, 'crm-quarantine.anonymized.jsonl'), jsonLines(result.quarantine)),
      atomicWrite(path.join(output, 'crm-duplicates.anonymized.json'), `${JSON.stringify(result.duplicate_groups, null, 2)}\n`),
      atomicWrite(path.join(output, 'crm-stats.json'), `${JSON.stringify(result.stats, null, 2)}\n`)
    ]);
    process.stdout.write(`${JSON.stringify({ ok: true, command: 'export', stats: result.stats })}\n`);
    return 0;
  }

  const error = new Error('comando_invalido');
  error.code = 'COMANDO_INVALIDO';
  throw error;
}

if (require.main === module) {
  run().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(`${JSON.stringify(safeError(error))}\n`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, atomicWrite, run };

