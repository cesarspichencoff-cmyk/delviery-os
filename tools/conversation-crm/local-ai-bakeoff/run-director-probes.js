#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  canonicalHash,
  ConversationDirector,
  initialJourneyState,
  LlamaCppRuntime
} = require('../../../apps/deliveryos-ai-node');

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function required(name) {
  const value = argument(name);
  if (!value) throw Object.assign(new Error(`DIRECTOR_PROBES_${name.toUpperCase().replace(/-/gu, '_')}_REQUIRED`), { code: `DIRECTOR_PROBES_${name.toUpperCase().replace(/-/gu, '_')}_REQUIRED` });
  return value;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
}

function reservationState(overrides = {}) {
  return {
    ...initialJourneyState('conversation'),
    active_journey: 'reservation',
    active_step: 'reservation_time',
    pending_question: 'reservation_time',
    collected_facts: { party_size: 4 },
    ...overrides
  };
}

const PROBES = Object.freeze([
  {
    probe_id: 'DIR-001', seed: 1534764817,
    input: { message: 'Oi', journey_state: initialJourneyState('conversation') },
    expected: (value) => value.dialogue_act === 'greet' && value.active_journey === null
  },
  {
    probe_id: 'DIR-002', seed: 401776047,
    input: { message: 'Boa noite, queria reservar uma mesa para quatro.', journey_state: initialJourneyState('conversation') },
    expected: (value) => value.dialogue_act === 'start_journey' && value.active_journey === 'reservation' && value.facts_added?.party_size === 4
  },
  {
    probe_id: 'DIR-003', seed: 205502992,
    input: { message: 'sim', journey_state: reservationState() },
    expected: (value) => value.dialogue_act === 'continue_journey' && value.active_journey === 'reservation'
  },
  {
    probe_id: 'DIR-004', seed: 1843033297,
    input: { message: 'Éramos sete, agora somos dez.', journey_state: reservationState({ collected_facts: { party_size: 7 } }) },
    expected: (value) => value.dialogue_act === 'correct_information' && value.active_journey === 'reservation' && value.facts_corrected?.party_size === 10
  },
  {
    probe_id: 'DIR-005', seed: 260068206,
    input: { message: 'Antes, vocês têm valet?', journey_state: reservationState() },
    expected: (value) => value.dialogue_act === 'answer_side_question' && value.active_journey === 'reservation' && value.return_to_previous_topic === true && value.knowledge_queries?.includes('valet_information')
  },
  {
    probe_id: 'DIR-006', seed: 2016337561,
    input: { message: 'Pode ser esse.', journey_state: initialJourneyState('conversation') },
    expected: (value) => value.dialogue_act === 'clarify_reference' && value.next_required_information === 'reference_clarification'
  },
  {
    probe_id: 'DIR-007', seed: 1183042423,
    input: {
      message: 'Voltando, e a reserva?',
      journey_state: {
        ...initialJourneyState('conversation'),
        active_journey: 'delivery_occurrence',
        suspended_journeys: [{
          journey_id: 'reservation',
          active_step: 'reservation_time',
          pending_question: 'reservation_time',
          collected_facts: { party_size: 4 }
        }]
      }
    },
    expected: (value) => value.dialogue_act === 'resume_journey' && value.active_journey === 'reservation' && value.return_to_previous_topic === true
  },
  {
    probe_id: 'DIR-008', seed: 619937407,
    input: { message: 'Faltou meu refrigerante no pedido.', journey_state: reservationState() },
    expected: (value) => (
      (['switch_topic', 'start_journey'].includes(value.dialogue_act) && value.active_journey === 'delivery_occurrence')
      || (value.dialogue_act === 'handoff' && ['reservation', 'delivery_occurrence'].includes(value.active_journey) && value.requested_action?.tool === 'create_handoff')
    )
  }
]);

async function main() {
  const runtime = new LlamaCppRuntime({
    executable: required('llama-executable'),
    models_root: required('models-root'),
    adapter_id: required('adapter'),
    host: '127.0.0.1',
    port: Number(argument('port', 4291))
  });
  const started = Date.now();
  try {
    await runtime.start({
      model: required('model-file'),
      context_size: Number(argument('context-size', 8192)),
      gpu_layers: Number(argument('gpu-layers', 0)),
      adapter_id: required('adapter')
    });
    await runtime.waitUntilReady({ timeout_ms: Number(argument('load-timeout-ms', 120000)) });
    const loadMs = Date.now() - started;
    const director = new ConversationDirector({ runtime });
    const rows = [];
    for (const probe of PROBES) {
      const probeStarted = Date.now();
      const result = await director.direct(probe.input, { seed: probe.seed });
      const latencyMs = Date.now() - probeStarted;
      rows.push({
        probe_id: probe.probe_id,
        seed: probe.seed,
        source: result.source,
        reason: result.reason,
        dialogue_act: result.directive.dialogue_act,
        active_journey: result.directive.active_journey,
        topic_changed: result.directive.topic_changed,
        return_to_previous_topic: result.directive.return_to_previous_topic,
        facts_added: result.directive.facts_added,
        facts_corrected: result.directive.facts_corrected,
        next_required_information: result.directive.next_required_information,
        knowledge_queries: result.directive.knowledge_queries,
        requested_action: result.directive.requested_action?.tool || null,
        expected: probe.expected(result.directive),
        latency_ms: latencyMs,
        metrics: runtime.metrics()
      });
      process.stdout.write(JSON.stringify(rows.at(-1)) + '\n');
    }
    const latencies = rows.map((row) => row.latency_ms);
    const artifact = {
      schema_version: 'deliveryos-current-model-director-probes-v1',
      candidate: required('candidate'),
      adapter: `${required('adapter')}@1.0.0`,
      runtime: required('runtime'),
      load_ms: loadMs,
      total: rows.length,
      local_model: rows.filter((row) => row.source === 'local_model').length,
      fallback: rows.filter((row) => row.source !== 'local_model').length,
      expected: rows.filter((row) => row.expected).length,
      p50_ms: percentile(latencies, 0.5),
      p95_ms: percentile(latencies, 0.95),
      max_ms: Math.max(...latencies),
      rows
    };
    const output = path.resolve(required('output'));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify({ ...artifact, canonical_hash: canonicalHash(artifact) }, null, 2) + '\n', 'utf8');
    process.stdout.write(JSON.stringify({ output, ...artifact, rows: undefined }) + '\n');
  } finally {
    await runtime.stop();
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(JSON.stringify({ error: error.code || 'DIRECTOR_PROBES_FAILED' }) + '\n');
    process.exitCode = 1;
  });
}

module.exports = { PROBES, percentile, reservationState, main };

