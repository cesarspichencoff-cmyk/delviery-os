#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  const body = await response.text();
  if (!response.ok) throw new Error(`GET_FAILED:${response.status}:${url}:${body}`);
  return JSON.parse(body);
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

async function main() {
  const output = argument('output');
  const label = argument('label', 'UNLABELED');
  const baseUrl = argument('base-url', 'http://127.0.0.1:4179');
  const ids = String(argument('turns', '')).split(',').map((value) => value.trim()).filter(Boolean);
  if (!output || !ids.length) throw new Error('USAGE: --output PATH --turns B2-TURN-0001,... [--label LABEL]');

  const target = path.resolve(output);
  if (fs.existsSync(target)) throw new Error(`EVIDENCE_ALREADY_FROZEN:${target}`);
  const traces = [];
  for (const turnId of ids) {
    const result = await getJson(`${baseUrl}/api/product/trace/${encodeURIComponent(turnId)}`);
    traces.push(result.trace);
  }
  const health = await getJson(`${baseUrl}/api/health`);
  const document = {
    schema_version: 'deliveryos-human-reality-trace-capture-v1',
    label,
    source: {
      base_url: baseUrl,
      customer_surface: `${baseUrl}/customer`,
      trace_route: `${baseUrl}/trace/<turn_id>`,
      git_branch: git('branch', '--show-current'),
      git_head: git('rev-parse', 'HEAD'),
      working_tree_clean: git('status', '--porcelain') === '',
      health
    },
    turn_count: traces.length,
    turn_ids: traces.map((trace) => trace.turn_id),
    trace_hashes: Object.fromEntries(traces.map((trace) => [trace.turn_id, trace.trace_hash])),
    traces
  };
  const body = `${JSON.stringify(document, null, 2)}\n`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ output: target, sha256: sha256(body), turns: traces.length })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
