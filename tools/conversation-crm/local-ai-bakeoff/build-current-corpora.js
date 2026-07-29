#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  createBakeoffCorpus,
  validateBakeoffCorpus,
  createDiagnosticCorpus,
  validateDiagnosticCorpus
} = require('../../../apps/deliveryos-ai-node');

function main() {
  const root = path.resolve(__dirname, '../../../evals/local-ai/rebakeoff');
  const corpus = createBakeoffCorpus({ seed: 'TATA-LOCAL-AI-BAKEOFF-V1' });
  const diagnostic = createDiagnosticCorpus();
  const baseValidation = validateBakeoffCorpus(corpus);
  const diagnosticValidation = validateDiagnosticCorpus(diagnostic);
  if (!baseValidation.passed || !diagnosticValidation.passed) throw Object.assign(new Error('CURRENT_CORPUS_INVALID'), { code: 'CURRENT_CORPUS_INVALID' });
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'corpus-v1.json'), JSON.stringify(corpus, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(root, 'diagnostic-corpus-v1.json'), JSON.stringify(diagnostic, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify({ root, base_cases: corpus.cases.length, diagnostic_cases: diagnostic.cases.length, diagnostic_hash: diagnostic.canonical_hash }) + '\n');
}

if (require.main === module) main();

module.exports = { main };
