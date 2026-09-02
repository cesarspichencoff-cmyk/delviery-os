'use strict';

const { validateWriterInput, validateWriterOutput } = require('../../../apps/deliveryos-ai-node/dialogue/writer-contract');
const { approvedEnvelopeToWriterInput, validateApprovedWriterOutput } = require('../../../apps/deliveryos-ai-node/dialogue/approved-response-envelope');
const { independentQuestion, validatePostComposition } = require('../native/post-composition-validator');

const MAXIMUM_BY_LENGTH = Object.freeze({ short: 500, medium: 700, careful: 900 });

function operationalFacts(plan = {}) {
  return [...(plan.known_facts || []), ...(plan.new_facts || [])]
    .filter((fact) => fact && typeof fact.field === 'string' && ['string', 'number', 'boolean'].includes(typeof fact.value))
    .map((fact) => ({ field: fact.field, value: fact.value }));
}

function requiredQuestion(plan = {}) {
  const questions = (plan.mandatory_questions || []).map(independentQuestion).filter(Boolean);
  return questions.length ? questions.join(' ') : null;
}

function buildWriterInput(input = {}) {
  if (input.approved_response_envelope) return approvedEnvelopeToWriterInput(input.approved_response_envelope);
  const plan = input.plan || {};
  const value = {
    direct_response: [...(plan.direct_answer || [])],
    authorized_facts: operationalFacts(plan),
    selected_knowledge: [...(plan.explanation_needed || []), ...(plan.channel_guidance || [])],
    direction: [...(plan.direction || [])],
    true_action: (plan.verified_actions || [])[0] || null,
    required_question: requiredQuestion(plan),
    tone: String(plan.tone_profile || 'tata_warm'),
    gravity: String(plan.gravity || 'informational'),
    social_context: String(input.social_context || ''),
    recent_phrases: [...(input.recent_phrases || [])],
    prohibited_claims: [...(plan.prohibited_claims || [])],
    authorized_links: [...(plan.authorized_surface?.links || [])],
    authorized_numbers: [...(plan.authorized_surface?.numbers || [])],
    maximum_length: MAXIMUM_BY_LENGTH[plan.length] || 700
  };
  const checked = validateWriterInput(value);
  if (!checked.accepted) throw Object.assign(new Error(checked.reason), { code: checked.reason });
  return Object.freeze(value);
}

function validateLocalWriterCandidate(input = {}) {
  const writer = input.approved_response_envelope
    ? validateApprovedWriterOutput(input.output, input.approved_response_envelope)
    : validateWriterOutput(input.output, input.writer_input);
  if (!writer.accepted) return { accepted: false, reason: writer.reason, text: input.deterministic_text };
  const post = validatePostComposition({
    text: writer.output.text,
    plan: input.plan,
    previous_responses: input.previous_responses || []
  });
  if (!post.passed) return { accepted: false, reason: `POST_COMPOSITION:${post.finding_codes.join(',')}`, text: input.deterministic_text };
  return { accepted: true, reason: null, text: writer.output.text, validation: post };
}

class LocalAiResponseAdapter {
  constructor(options = {}) {
    this.bridge = options.bridge;
    this.flags = Object.freeze({ enabled: false, shadow: true, ...(options.flags || {}) });
  }

  async evaluate(input = {}) {
    const deterministicText = String(input.deterministic_text || '');
    if (!this.flags.enabled) return { text: deterministicText, public_source: 'deterministic', local_ai: 'disabled', job: null };
    const writerInput = input.writer_input || buildWriterInput(input);
    const queued = this.bridge ? await this.bridge.enqueue({
      conversation_id: input.conversation_id,
      turn_id: input.turn_id,
      request_type: 'response_writer',
      model_version: input.model_version,
      provider_version: input.provider_version,
      prompt_contract_version: input.prompt_contract_version || 'writer-v1',
      payload: writerInput
    }) : null;
    const candidate = input.local_output
      ? validateLocalWriterCandidate({ ...input, writer_input: writerInput, deterministic_text: deterministicText, output: input.local_output })
      : { accepted: false, reason: 'LOCAL_RESULT_PENDING', text: deterministicText };
    if (this.flags.shadow) return { text: deterministicText, public_source: 'deterministic', local_ai: 'shadow', candidate, job: queued?.job || null };
    if (!candidate.accepted) return { text: deterministicText, public_source: 'deterministic', local_ai: 'rejected', candidate, job: queued?.job || null };
    return { text: candidate.text, public_source: 'local_ai', local_ai: 'active', candidate, job: queued?.job || null };
  }
}

module.exports = { MAXIMUM_BY_LENGTH, operationalFacts, requiredQuestion, buildWriterInput, validateLocalWriterCandidate, LocalAiResponseAdapter };

