#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { canonicalHash, LlamaCppRuntime } = require('../../../../apps/deliveryos-ai-node');
const { inspectLocalWriterArtifacts, GEMMA_WRITER_ARTIFACTS } = require('../../homologation/local-writer');
const { buildProbeRequest } = require('./contract');
const { PROBE_CASES } = require('./cases');
const { evaluateCase, summarize } = require('./evaluator');

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function hashSeed(text) {
  const hash = canonicalHash(text);
  return Number.parseInt(hash.slice(0, 8), 16) & 0x7fffffff;
}

function publicPlan(plan) {
  return plan ? {
    relation_to_previous: plan.relation_to_previous,
    action: plan.action,
    confidence: plan.confidence,
    tool_need: plan.tool_need
  } : null;
}

async function executeCandidate(options = {}) {
  const inspected = options.inspected || inspectLocalWriterArtifacts();
  if (!inspected.available) throw Object.assign(new Error(inspected.reason), { code: inspected.reason });
  const runtime = options.runtime || new LlamaCppRuntime({
    executable: inspected.paths.executable,
    models_root: inspected.paths.models_root,
    adapter_id: 'gemma4',
    host: '127.0.0.1',
    port: Number(options.port || 4293)
  });
  const candidateId = options.candidate_id || 'google-gemma-4-E4B-it-q4_0';
  const rows = [];
  const startedAt = new Date().toISOString();
  let loadMs = null;
  let warmup = null;
  try {
    const loadStarted = Date.now();
    await runtime.start({
      model: inspected.paths.model,
      context_size: 8192,
      gpu_layers: 0,
      adapter_id: 'gemma4'
    });
    await runtime.waitUntilReady({ timeout_ms: Number(options.load_timeout_ms || 180_000) });
    loadMs = Date.now() - loadStarted;

    const warmupStarted = Date.now();
    let warmupStatus = 'ok';
    try {
      await runtime.generateStructured(buildProbeRequest({
        transcript: [], compact_state: 'Nenhuma jornada ativa.', objective_known: 'desconhecido',
        channel: 'desconhecido', references: {}, established_facts: [], last_plan: null,
        limits: ['Não inventar fatos.'], current_message: 'olá'
      }, { seed: 9200 }));
    } catch (error) {
      warmupStatus = error.code || 'WARMUP_FAILED';
    }
    warmup = { status: warmupStatus, latency_ms: Date.now() - warmupStarted, excluded_from_metrics: true };

    for (const definition of PROBE_CASES) {
      const caseStarted = Date.now();
      let plan = null;
      let generationError = null;
      try {
        plan = await runtime.generateStructured(buildProbeRequest(definition.input, {
          seed: hashSeed(`deliveryos-local-planner-probe-v1|${definition.case_id}`)
        }));
      } catch (error) {
        generationError = error.code || 'GENERATION_FAILED';
      }
      const latencyMs = Date.now() - caseStarted;
      const evaluation = evaluateCase(definition, plan, generationError);
      const row = {
        case_id: definition.case_id,
        expected_class: `${definition.oracle.relations.join('/')} -> ${definition.oracle.actions.join('/')}`,
        output_class: plan ? `${plan.relation_to_previous} -> ${plan.action}` : generationError,
        pass: evaluation.semantic_correct,
        latency_ms: latencyMs,
        evaluation,
        output: publicPlan(plan),
        ...(evaluation.semantic_correct ? {} : { raw_failure_output: plan })
      };
      rows.push(row);
      if (options.on_row) options.on_row(row);
    }

    const metrics = summarize(rows);
    const base = {
      schema_version: 'deliveryos_local_planner_capacity_probe_result_v1',
      probe_contract: 'deliveryos_local_planner_capacity_probe_v1',
      candidate: {
        candidate_id: candidateId,
        model_id: inspected.model_id,
        model_revision: inspected.model_revision,
        model_file: path.basename(inspected.paths.model_path),
        model_format: 'GGUF QAT Q4_0',
        model_size_bytes: inspected.size,
        model_sha256: GEMMA_WRITER_ARTIFACTS.model_sha256,
        runtime: `llama.cpp ${inspected.runtime_release}`,
        adapter: 'gemma4@1.0.0'
      },
      execution: {
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        load_ms: loadMs,
        warmup,
        gpu_layers: 0,
        external_cost_brl: 0,
        response_cache: false,
        cases: rows.length
      },
      metrics,
      rows
    };
    return { ...base, canonical_hash: canonicalHash(base) };
  } finally {
    await runtime.stop();
  }
}

async function main() {
  const output = path.resolve(argument('output', path.join(process.cwd(), 'local-planner-capacity-probe-result.json')));
  const result = await executeCandidate({
    port: Number(argument('port', 4293)),
    load_timeout_ms: Number(argument('load-timeout-ms', 180000)),
    on_row(row) {
      process.stdout.write(JSON.stringify({
        case_id: row.case_id,
        output_class: row.output_class,
        pass: row.pass,
        latency_ms: row.latency_ms,
        reason: row.evaluation.reason
      }) + '\n');
    }
  });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify({ output, canonical_hash: result.canonical_hash, metrics: result.metrics }) + '\n');
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(JSON.stringify({ error: error.code || 'LOCAL_PLANNER_CAPACITY_PROBE_FAILED' }) + '\n');
    process.exitCode = 1;
  });
}

module.exports = { argument, hashSeed, publicPlan, executeCandidate, main };

