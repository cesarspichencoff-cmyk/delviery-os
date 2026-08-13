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

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store' });
  const body = await response.text();
  if (!response.ok) throw new Error(`GET_FAILED:${response.status}:${url}:${body}`);
  return JSON.parse(body);
}

function step(trace, id) {
  return (trace.steps || trace.stages || []).find((item) => item.id === id) || null;
}

function publicTranscript(traces) {
  const turns = [];
  for (const trace of traces) {
    const message = step(trace, 'USER')?.detail?.current_message;
    const response = step(trace, 'PUBLISHED_RESPONSE')?.detail?.response;
    if (typeof message !== 'string' || !message.trim()) throw new Error(`TRACE_USER_MISSING:${trace.turn_id}`);
    turns.push({ sequence: turns.length + 1, role: 'CUSTOMER', text: message.trim(), turn_id: trace.turn_id });
    if (typeof response === 'string' && response.trim()) {
      turns.push({ sequence: turns.length + 1, role: 'TATA', text: response.trim(), turn_id: trace.turn_id });
    }
  }
  return turns;
}

function source(baseUrl, health) {
  return {
    base_url: baseUrl,
    customer_surface: `${baseUrl}/customer`,
    trace_route: `${baseUrl}/trace/<turn_id>`,
    git_branch: git('branch', '--show-current'),
    git_head: git('rev-parse', 'HEAD'),
    working_tree_clean: git('status', '--porcelain') === '',
    health
  };
}

function writeFrozen(target, document) {
  const body = `${JSON.stringify(document, null, 2)}\n`;
  fs.writeFileSync(target, body, { encoding: 'utf8', flag: 'wx' });
  return sha256(body);
}

async function main() {
  const mode = argument('mode');
  const evidenceDir = path.resolve(argument('evidence-dir', ''));
  const baseUrl = argument('base-url', 'http://127.0.0.1:4179');
  const ids = String(argument('turns', '')).split(',').map((value) => value.trim()).filter(Boolean);
  if (!['replay', 'paraphrase'].includes(mode) || !argument('evidence-dir') || !ids.length) {
    throw new Error('USAGE: --mode replay|paraphrase --evidence-dir PATH --turns B2-TURN-0001,...');
  }
  const outputNames = mode === 'replay'
    ? ['REPLAY_TRANSCRIPT.json', 'TRACE_EVIDENCE.json']
    : ['PARAPHRASE_PROOF.json'];
  const targets = outputNames.map((name) => path.join(evidenceDir, name));
  for (const target of targets) {
    if (fs.existsSync(target)) throw new Error(`EVIDENCE_ALREADY_FROZEN:${target}`);
  }

  const traces = [];
  for (const turnId of ids) {
    const result = await getJson(`${baseUrl}/api/product/trace/${encodeURIComponent(turnId)}`);
    traces.push(result.trace);
  }
  const health = await getJson(`${baseUrl}/api/health`);
  const transcript = publicTranscript(traces);
  const customerTurnCount = transcript.filter((turn) => turn.role === 'CUSTOMER').length;
  const assistantTurnCount = transcript.filter((turn) => turn.role === 'TATA').length;
  const common = {
    evidence_label: mode === 'replay'
      ? 'EXACT_HUMAN_REPLAY_FIRST_POST_FIX_EXECUTION'
      : 'SEQUENTIAL_PARAPHRASE_GENERALIZATION_FIRST_EXECUTION',
    frozen: true,
    rerun_performed: false,
    source: source(baseUrl, health),
    customer_turn_count: customerTurnCount,
    assistant_turn_count: assistantTurnCount,
    public_turn_count: transcript.length,
    turn_ids: traces.map((trace) => trace.turn_id),
    trace_hashes: Object.fromEntries(traces.map((trace) => [trace.turn_id, trace.trace_hash])),
    transcript,
    external_action_performed: false,
    external_spend_brl: 0
  };

  fs.mkdirSync(evidenceDir, { recursive: true });
  const outputs = [];
  if (mode === 'replay') {
    const transcriptTarget = targets[0];
    const traceTarget = targets[1];
    outputs.push({
      path: transcriptTarget,
      sha256: writeFrozen(transcriptTarget, {
        schema_version: 'deliveryos-human-reality-replay-v1',
        ...common
      })
    });
    outputs.push({
      path: traceTarget,
      sha256: writeFrozen(traceTarget, {
        schema_version: 'deliveryos-human-reality-trace-evidence-v1',
        evidence_label: common.evidence_label,
        frozen: true,
        rerun_performed: false,
        source: common.source,
        turn_count: traces.length,
        turn_ids: common.turn_ids,
        trace_hashes: common.trace_hashes,
        traces
      })
    });
  } else {
    const proofTarget = targets[0];
    outputs.push({
      path: proofTarget,
      sha256: writeFrozen(proofTarget, {
        schema_version: 'deliveryos-human-reality-paraphrase-proof-v1',
        ...common,
        traces
      })
    });
  }
  process.stdout.write(`${JSON.stringify({ mode, outputs, turns: traces.length, public_turns: transcript.length })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
