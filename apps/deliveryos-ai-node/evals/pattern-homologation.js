'use strict';

const { canonicalHash, blindLabels } = require('../bakeoff/runner');

const DEFAULT_PATTERN_HOMOLOGATION_CASES = Object.freeze([
  'LDIAG-001', 'LDIAG-002', 'LDIAG-005', 'LDIAG-006', 'LDIAG-008',
  'LDIAG-013', 'LDIAG-016', 'LDIAG-017', 'LDIAG-018', 'LDIAG-019',
  'LDIAG-020', 'LDIAG-021', 'LDIAG-022', 'LDIAG-023', 'LDIAG-026',
  'LDIAG-027', 'LDIAG-030', 'LDIAG-031', 'LDIAG-032', 'LBAKE-002'
]);

function rowsById(result) {
  return new Map((result?.writer?.rows || []).map((row) => [row.case_id, row]));
}

function corpusCases(baseCorpus, diagnosticCorpus) {
  return new Map([...(baseCorpus?.cases || []), ...(diagnosticCorpus?.cases || [])].map((item) => [item.case_id, item]));
}

function assertStoredResult(result, label) {
  if (!result || result.schema_version !== 'deliveryos-current-model-result-v1') {
    const error = new Error(`PATTERN_HOMOLOGATION_${label}_RESULT_INVALID`);
    error.code = error.message;
    throw error;
  }
}

function buildPatternHomologationBundle(options = {}) {
  assertStoredResult(options.gemma_result, 'GEMMA');
  assertStoredResult(options.qwen_result, 'QWEN');
  const casesById = corpusCases(options.base_corpus, options.diagnostic_corpus);
  const gemmaRows = rowsById(options.gemma_result);
  const qwenRows = rowsById(options.qwen_result);
  const seed = String(options.seed || 'TATA-PATTERN-HOMOLOGATION-V1');
  const candidateKeys = ['deterministic_pattern_engine', 'gemma4_e4b_writer', 'qwen35_4b_writer'];
  const publicCases = [];
  const privateCases = [];

  for (const caseId of options.case_ids || DEFAULT_PATTERN_HOMOLOGATION_CASES) {
    const item = casesById.get(caseId);
    const gemma = gemmaRows.get(caseId);
    const qwen = qwenRows.get(caseId);
    if (!item || !gemma || !qwen || gemma.status !== 'accepted' || qwen.status !== 'accepted') {
      const error = new Error(`PATTERN_HOMOLOGATION_CASE_UNAVAILABLE:${caseId}`);
      error.code = 'PATTERN_HOMOLOGATION_CASE_UNAVAILABLE';
      throw error;
    }
    const labels = blindLabels(caseId, candidateKeys, seed);
    const texts = {
      deterministic_pattern_engine: item.deterministic_response,
      gemma4_e4b_writer: gemma.text,
      qwen35_4b_writer: qwen.text
    };
    const stateContract = {
      category: item.category,
      turns: item.turns,
      writer_input: item.writer_input,
      pattern_engine: 'deliveryos-conversation-pattern-decision-v1',
      response_envelope: 'deliveryos-approved-response-envelope-v1'
    };
    publicCases.push({
      case_id: caseId,
      category: item.category,
      turns: item.turns,
      options: labels.map(({ option, candidate_key: candidateKey }) => ({ option, text: texts[candidateKey] }))
    });
    privateCases.push({
      case_id: caseId,
      mapping: Object.fromEntries(labels.map(({ option, candidate_key: candidateKey }) => [option, candidateKey])),
      shared_plan_hash: canonicalHash(item.writer_input),
      shared_state_hash: canonicalHash(stateContract),
      source_evidence: 'stored_005b_writer_outputs_no_new_inference',
      candidates: Object.fromEntries(candidateKeys.map((key) => [key, {
        response_hash: canonicalHash(texts[key]),
        status: 'accepted'
      }]))
    });
  }

  const publicBase = {
    schema_version: 'deliveryos-local-ai-blind-public-v1',
    corpus_seed: seed,
    total_cases: publicCases.length,
    cases: publicCases
  };
  const publicArtifact = Object.freeze({ ...publicBase, canonical_hash: canonicalHash(publicBase) });
  const privateBase = {
    schema_version: 'deliveryos-local-ai-blind-private-v1',
    corpus_seed: seed,
    corpus_hash: canonicalHash({ base: options.base_corpus, diagnostic: options.diagnostic_corpus }),
    public_hash: publicArtifact.canonical_hash,
    candidates: [
      { candidate_key: 'deterministic_pattern_engine', kind: 'deterministic', model_version: null, provider_version: 'deliveryos-change-006' },
      { candidate_key: 'gemma4_e4b_writer', kind: 'stored_local_writer', model_version: options.gemma_result.candidate?.candidate_id || 'gemma4-e4b', provider_version: options.gemma_result.candidate?.runtime || null },
      { candidate_key: 'qwen35_4b_writer', kind: 'stored_local_writer', model_version: options.qwen_result.candidate?.candidate_id || 'qwen35-4b', provider_version: options.qwen_result.candidate?.runtime || null }
    ],
    cases: privateCases,
    human_winner: null,
    promotion_authorized: false
  };
  return Object.freeze({ public: publicArtifact, private: Object.freeze({ ...privateBase, canonical_hash: canonicalHash(privateBase) }) });
}

function validatePatternHomologationBundle(bundle) {
  const findings = [];
  const publicBase = { ...bundle.public };
  delete publicBase.canonical_hash;
  if (canonicalHash(publicBase) !== bundle.public.canonical_hash) findings.push('PUBLIC_HASH_INVALID');
  if (bundle.private.public_hash !== bundle.public.canonical_hash) findings.push('PUBLIC_PRIVATE_LINK_INVALID');
  const publicText = JSON.stringify(bundle.public);
  if (/gemma|qwen|model_version|provider_version|deterministic_pattern_engine|mapping|latency/iu.test(publicText)) findings.push('BLIND_IDENTITY_EXPOSED');
  if (bundle.public.cases.some((item) => item.options.length !== 3)) findings.push('BLIND_OPTION_COUNT_INVALID');
  if (bundle.private.cases.some((item) => !item.shared_plan_hash || !item.shared_state_hash)) findings.push('SHARED_PLAN_STATE_MISSING');
  if (bundle.private.human_winner !== null || bundle.private.promotion_authorized !== false) findings.push('MODEL_PROMOTION_FABRICATED');
  return Object.freeze({ passed: findings.length === 0, findings: Object.freeze(findings), total_cases: bundle.public.total_cases });
}

module.exports = {
  DEFAULT_PATTERN_HOMOLOGATION_CASES,
  buildPatternHomologationBundle,
  validatePatternHomologationBundle
};
