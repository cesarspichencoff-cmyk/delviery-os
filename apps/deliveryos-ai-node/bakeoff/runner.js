'use strict';

const crypto = require('node:crypto');
const { validateWriterOutput } = require('../dialogue/writer-contract');

function canonicalize(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function canonicalHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function blindLabels(caseId, candidateKeys, seed) {
  return [...candidateKeys]
    .sort((a, b) => canonicalHash(`${seed}|${caseId}|${a}`).localeCompare(canonicalHash(`${seed}|${caseId}|${b}`)))
    .map((candidateKey, index) => ({ option: String.fromCharCode(65 + index), candidate_key: candidateKey }));
}

async function evaluateCandidate(candidate, item) {
  const started = process.hrtime.bigint();
  try {
    const result = await candidate.write(item.writer_input, item);
    const checked = result?.accepted
      ? validateWriterOutput(result.output, item.writer_input)
      : { accepted: false, reason: result?.reason || 'CANDIDATE_REJECTED' };
    const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
    if (!checked.accepted) {
      return { text: item.deterministic_response, status: 'fallback', reason: checked.reason, latency_ms: elapsed, metrics: candidate.metrics?.() || {} };
    }
    return { text: checked.output.text, status: 'accepted', reason: null, latency_ms: elapsed, metrics: candidate.metrics?.() || {} };
  } catch (error) {
    const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
    return { text: item.deterministic_response, status: 'fallback', reason: error.code || 'CANDIDATE_FAILED', latency_ms: elapsed, metrics: candidate.metrics?.() || {} };
  }
}

async function runBlindBakeoff(options = {}) {
  const corpus = options.corpus;
  const seed = String(options.seed || corpus.seed);
  const candidates = [
    {
      key: 'deterministic_change_004',
      kind: 'deterministic',
      model_version: null,
      provider_version: 'deliveryos-change-004',
      write: async (input, item) => ({ accepted: true, output: { text: item.deterministic_response } })
    },
    ...(options.candidates || [])
  ];
  const results = new Map(candidates.map((candidate) => [candidate.key, new Map()]));
  for (const candidate of candidates) {
    await candidate.start?.();
    try {
      for (let index = 0; index < corpus.cases.length; index += 1) {
        const item = corpus.cases[index];
        const outcome = candidate.kind === 'deterministic'
          ? { text: item.deterministic_response, status: 'accepted', reason: null, latency_ms: 0, metrics: {} }
          : await evaluateCandidate(candidate, item);
        results.get(candidate.key).set(item.case_id, outcome);
        options.onProgress?.({ candidate_key: candidate.key, completed: index + 1, total: corpus.cases.length });
      }
    } finally {
      await candidate.stop?.();
    }
  }

  const publicCases = [];
  const privateCases = [];
  for (const item of corpus.cases) {
    const labels = blindLabels(item.case_id, candidates.map((candidate) => candidate.key), seed);
    publicCases.push({
      case_id: item.case_id,
      category: item.category,
      turns: item.turns,
      options: labels.map(({ option, candidate_key: candidateKey }) => ({ option, text: results.get(candidateKey).get(item.case_id).text }))
    });
    privateCases.push({
      case_id: item.case_id,
      mapping: Object.fromEntries(labels.map(({ option, candidate_key: candidateKey }) => [option, candidateKey])),
      candidates: Object.fromEntries(candidates.map((candidate) => {
        const outcome = results.get(candidate.key).get(item.case_id);
        return [candidate.key, {
          kind: candidate.kind,
          model_version: candidate.model_version || null,
          provider_version: candidate.provider_version || null,
          status: outcome.status,
          reason: outcome.reason,
          latency_ms: outcome.latency_ms,
          metrics: outcome.metrics,
          response_hash: canonicalHash(outcome.text)
        }];
      }))
    });
  }
  const publicArtifact = {
    schema_version: 'deliveryos-local-ai-blind-public-v1',
    corpus_seed: seed,
    total_cases: publicCases.length,
    cases: publicCases
  };
  const privateArtifact = {
    schema_version: 'deliveryos-local-ai-blind-private-v1',
    corpus_seed: seed,
    corpus_hash: canonicalHash(corpus),
    public_hash: canonicalHash(publicArtifact),
    candidates: candidates.map((candidate) => ({
      candidate_key: candidate.key,
      kind: candidate.kind,
      model_version: candidate.model_version || null,
      provider_version: candidate.provider_version || null
    })),
    cases: privateCases
  };
  return Object.freeze({
    public: Object.freeze({ ...publicArtifact, canonical_hash: canonicalHash(publicArtifact) }),
    private: Object.freeze({ ...privateArtifact, canonical_hash: canonicalHash(privateArtifact) })
  });
}

module.exports = { canonicalize, canonicalHash, blindLabels, evaluateCandidate, runBlindBakeoff };
