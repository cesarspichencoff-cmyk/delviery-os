'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { verifyConversation, summarize } = require('./checks');

const projectRoot = path.resolve(__dirname, '..', '..', '..');
const file = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(projectRoot, 'evals', 'human-review', 'results', 'baseline-responses-v1.json');

try {
  const artifact = JSON.parse(fs.readFileSync(file, 'utf8'));
  const conversations = Array.isArray(artifact) ? artifact : artifact.results;
  const summary = summarize(conversations.flatMap((item) => verifyConversation(item, { projectRoot })));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!summary.ok) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error.code || error.message || 'BASELINE_VERIFY_FAILED'}\n`);
  process.exitCode = 2;
}
