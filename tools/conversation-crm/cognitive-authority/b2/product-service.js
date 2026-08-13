'use strict';

const { B2Pipeline } = require('./pipeline');
const { FunctionPlannerAdapter } = require('./planner-port');
const { DeterministicB2Writer, GemmaB2Writer } = require('./writer');
const { canonicalHash } = require('./contract');
const { evaluatePublicationGate } = require('./publication-gate');
const { redactSensitiveText } = require('../../../../src/conversation-crm/ai-bridge/privacy');

const RELATIONS = new Set(['CONTINUE', 'REFINE', 'CORRECT', 'SWITCH', 'INTERRUPT', 'RESUME', 'OPEN']);

function publicText(value) {
  return redactSensitiveText(String(value || ''), new Set()).trim();
}

function readableToken(value) {
  return String(value || '').replace(/[_-]+/gu, ' ').trim();
}

function addCommitment(target, kind, content) {
  const value = publicText(content).replace(/[.;,\s]+$/gu, '').trim();
  if (!value) return;
  const key = `${kind}:${value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()}`;
  if (!target.has(key)) target.set(key, Object.freeze({ kind, content: value }));
}

function publicCommitments(message, hospitality = {}, envelope = {}) {
  const found = new Map();
  const source = publicText(message);
  for (const match of source.matchAll(/\bsem\s+(.{2,70}?)(?=\s+(?:para|e|mas|com)\b|[,.;!?]|$)/giu)) addCommitment(found, 'CONSTRAINT', `sem ${match[1]}`);
  for (const match of source.matchAll(/\b(?:alergia|al[eé]rgic[oa])\s+(?:a|ao|à)\s+([^,.;!?]{2,70})/giu)) {
    addCommitment(found, 'CONSTRAINT', `alergia informada: ${match[1]}`);
  }
  for (const match of source.matchAll(/\b(?:at[eé]|limite(?:\s+de)?|m[aá]ximo(?:\s+de)?)\s*(R\$\s*\d+(?:[.,]\d{1,2})?)/giu)) {
    addCommitment(found, 'CONSTRAINT', `limite de gasto: ${match[1]}`);
  }
  const people = hospitality.number_of_people;
  if (Number.isFinite(Number(people)) && Number(people) > 0) {
    addCommitment(found, 'CONSTRAINT', `refeição para ${Number(people)} ${Number(people) === 1 ? 'pessoa' : 'pessoas'}`);
  }
  const budgetMaximum = hospitality.budget && typeof hospitality.budget === 'object'
    ? hospitality.budget.maximum_brl
    : hospitality.budget;
  if (budgetMaximum !== null && budgetMaximum !== undefined && Number.isFinite(Number(budgetMaximum))) {
    addCommitment(found, 'CONSTRAINT', `limite de gasto: R$ ${Number(budgetMaximum)}`);
  }
  for (const allergy of hospitality.allergies || []) addCommitment(found, 'CONSTRAINT', `alergia informada: ${readableToken(allergy)}`);
  for (const restriction of hospitality.dietary_restrictions || []) addCommitment(found, 'CONSTRAINT', `restrição alimentar: ${readableToken(restriction)}`);
  for (const restriction of envelope.active_restrictions || []) {
    const value = typeof restriction === 'string' ? restriction : (restriction?.value || restriction?.type);
    if (value) addCommitment(found, 'CONSTRAINT', readableToken(value));
  }
  return [...found.values()];
}

function approvedFacts(envelope = {}) {
  const facts = [...(envelope.confirmed_facts || []), ...(envelope.facts || [])];
  const seen = new Set();
  return facts.filter((fact) => fact && typeof fact.field === 'string'
    && ['string', 'number', 'boolean'].includes(typeof fact.value))
    .filter((fact) => {
      const key = `${fact.field}:${String(fact.value)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function questionTarget(question) {
  return publicText(question).replace(/\?+$/gu, '').trim();
}

function buildTurnPlan(execution, message) {
  const envelope = execution.result.approved_response_envelope || {};
  const diagnostic = execution.publicResult.turn.diagnostic || {};
  const nativeResponse = publicText(execution.publicResult.turn.response);
  const requiredQuestion = publicText(envelope.question_to_ask || envelope.next_best_question || '');
  const repairRequired = diagnostic.user_repair_signal === true || diagnostic.negative_feedback_signal === true;
  const gravity = String(envelope.gravity || 'informational');
  const urgent = gravity === 'critical';
  const relation = RELATIONS.has(String(diagnostic.semantic_transition || '').toUpperCase())
    ? String(diagnostic.semantic_transition).toUpperCase()
    : (repairRequired ? 'CORRECT' : 'CONTINUE');
  const commitments = publicCommitments(message, diagnostic.hospitality_context || {}, envelope);
  const facts = approvedFacts(envelope);
  const knowledge = nativeResponse ? [nativeResponse] : [];
  const toolRequirement = urgent
    ? 'SAFETY_GATE'
    : (knowledge.length || facts.length ? 'OTHER_ALLOWED_TOOL' : (requiredQuestion ? 'NONE' : 'OTHER_ALLOWED_TOOL'));
  const reference = requiredQuestion
    ? { required: true, status: 'NEEDS_CLARIFICATION', target: questionTarget(requiredQuestion) }
    : { required: false, status: 'NOT_REQUIRED', target: null };
  const plan = {
    relation_to_history: relation,
    conversational_move: urgent ? 'ANSWER' : (repairRequired ? 'REPAIR' : (requiredQuestion ? 'CLARIFY' : 'ANSWER')),
    tool_requirement: toolRequirement,
    user_goal: publicText(envelope.customer_goal || diagnostic.turn_analysis?.active_goal || 'entender a necessidade e avançar com segurança'),
    what_changed: repairRequired
      ? 'A pessoa corrigiu ou contestou uma informação anterior e essa mudança precisa ser reconhecida.'
      : 'A mensagem atual acrescenta informação pública que precisa ser preservada na resposta.',
    repair: repairRequired
      ? { required: true, acknowledgement: 'Você tem razão; vou considerar a correção antes de continuar.' }
      : { required: false, acknowledgement: null },
    reference,
    safety_priority: urgent ? 'URGENT' : (gravity === 'sensitive' ? 'PREVENTIVE' : 'NONE'),
    next_best_step: requiredQuestion
      ? `pedir ${questionTarget(requiredQuestion)}`
      : (knowledge.length ? 'responder somente com o resultado autorizado já obtido' : 'explicar a limitação atual e oferecer um próximo passo sem prometer execução'),
    required_response_commitments: commitments
  };
  const toolResult = knowledge.length || facts.length
    ? { status: 'completed', source: 'deliveryos_native_authority', facts: [], knowledge }
    : null;
  const authorityContext = {
    confirmed_facts: [],
    tool_results: toolResult ? { [toolRequirement]: toolResult } : {},
    required_question: requiredQuestion || null,
    safety_directive: urgent ? nativeResponse : null,
    prohibited_claims: envelope.prohibited_claims || [],
    authorized_links: envelope.authorized_links || [],
    authorized_numbers: envelope.authorized_numbers || [],
    recent_phrases: envelope.recent_phrases_to_avoid || [],
    tone: 'calmo, direto e acolhedor'
  };
  return { plan, authorityContext, nativeResponse, facts, knowledge };
}

function traceStep(id, label, status, detail) {
  return Object.freeze({ id, label, status, detail });
}

class B2ProductService {
  constructor(options = {}) {
    if (!options.homologation) throw new TypeError('B2_PRODUCT_HOMOLOGATION_REQUIRED');
    this.homologation = options.homologation;
    this.now = options.now || (() => new Date().toISOString());
    this.writer = options.writer || (options.localWriter
      ? new GemmaB2Writer({ localWriter: options.localWriter })
      : new DeterministicB2Writer());
    this.fallbackWriter = options.fallbackWriter || new DeterministicB2Writer();
    this.previousPublication = null;
    this.traces = new Map();
    this.turn = 0;
  }

  async process(input = {}) {
    const message = publicText(input.message);
    if (!message) throw Object.assign(new Error('message_required'), { code: 'MESSAGE_REQUIRED' });
    if (message.length > 2000) throw Object.assign(new Error('message_too_long'), { code: 'MESSAGE_TOO_LONG' });
    const gate = evaluatePublicationGate(input);
    if (!gate.LOCAL_PREVIEW_ALLOWED || !gate.SHADOW_MODE) {
      throw Object.assign(new Error('publication_gate_blocked'), { code: 'PUBLICATION_GATE_BLOCKED', gate });
    }
    const execution = this.homologation.chatExecution({ ...input, message });
    const prepared = buildTurnPlan(execution, message);
    const planner = new FunctionPlannerAdapter({
      adapter_id: 'deliveryos-native-to-b2-product-adapter',
      plan() { return prepared.plan; }
    });
    const pipeline = new B2Pipeline({ planner, writer: this.writer, fallbackWriter: this.fallbackWriter });
    const output = await pipeline.execute({
      planner_packet: {
        transcript: [],
        compact_state: null,
        references: {},
        confirmed_facts: [],
        available_capabilities: [prepared.plan.tool_requirement],
        limits: ['ZERO_EXTERNAL_COST', 'NO_EXTERNAL_ACTION', 'LOCAL_SHADOW_ONLY'],
        safety_state: prepared.plan.safety_priority,
        current_message: message
      },
      authority_context: prepared.authorityContext,
      previous_publication: this.previousPublication
    });
    this.turn += 1;
    const turnId = `B2-TURN-${String(this.turn).padStart(4, '0')}`;
    const firstDivergence = !output.accepted
      ? { stage: output.stage, reason: output.reason }
      : (output.writer_limit ? { stage: 'WRITER_FALLBACK', reason: output.writer_limit } : null);
    const steps = [
      traceStep('USER', 'USER', 'observed', message),
      traceStep('UNDERSTANDING', 'UNDERSTANDING', 'completed', prepared.plan.user_goal),
      traceStep('REQUIRED_COMMITMENTS', 'REQUIRED COMMITMENTS', prepared.plan.required_response_commitments.length ? 'required' : 'none', prepared.plan.required_response_commitments),
      traceStep('CAPABILITY_FACT_NEED', 'CAPABILITY / FACT NEED', 'evaluated', {
        tool_requirement: prepared.plan.tool_requirement,
        authorized_fact_count: output.response_plan?.approved_facts?.length || 0,
        authorized_knowledge_count: prepared.knowledge.length
      }),
      traceStep('AUTHORITY_RESULT', 'AUTHORITY RESULT', output.response_plan ? 'completed' : 'blocked', output.response_plan ? { status: output.response_plan.status, outcome: output.response_plan.publication_outcome, evidence_hash: output.response_plan.authority_evidence_hash } : output.reason),
      traceStep('RESPONSE_PLAN', 'RESPONSE PLAN', output.response_plan ? 'completed' : 'unavailable', output.response_plan ? { required_question: output.response_plan.required_question, next_best_step: output.response_plan.next_best_step, progress_state_hash: output.response_plan.progress_state_hash } : null),
      traceStep('WRITER_FALLBACK', 'WRITER / FALLBACK', output.writer_source ? 'completed' : 'blocked', { source: output.writer_source || null, limit: output.writer_limit || null }),
      traceStep('VALIDATOR', 'VALIDATOR', output.accepted ? 'accepted' : 'blocked', output.accepted ? 'Commitments, authority and progress contract preserved.' : output.reason),
      traceStep('PUBLISHED_RESPONSE', 'PUBLISHED RESPONSE', output.accepted ? 'local_shadow_preview' : 'not_published', output.response || null)
    ];
    const trace = Object.freeze({
      schema_version: 'deliveryos-b2-truth-trace-v1',
      turn_id: turnId,
      created_at: this.now(),
      mode: 'LOCAL_SHADOW_PREVIEW',
      gate,
      first_divergence: firstDivergence,
      steps,
      stages: steps,
      trace_hash: canonicalHash({ turnId, gate, firstDivergence, steps })
    });
    this.traces.set(turnId, trace);
    if (output.accepted) {
      this.previousPublication = Object.freeze({ response: output.response, progress_state_hash: output.progress_state_hash });
    }
    return {
      ok: output.accepted,
      turn_id: turnId,
      response: output.response || null,
      trace_url: `/trace/${turnId}`,
      mode: 'LOCAL_SHADOW_PREVIEW',
      external_action_performed: false,
      external_spend_brl: 0,
      error_code: output.accepted ? null : output.reason
    };
  }

  trace(turnId) {
    const trace = this.traces.get(String(turnId || ''));
    if (!trace) throw Object.assign(new Error('trace_not_found'), { code: 'TRACE_NOT_FOUND' });
    return { ok: true, trace };
  }

  reset() {
    this.previousPublication = null;
    this.traces.clear();
    this.turn = 0;
    const reset = this.homologation.resetChat();
    return { ok: true, reset: true, shadow_mode: true, external_action_performed: false, ...reset };
  }
}

module.exports = {
  publicText,
  publicCommitments,
  approvedFacts,
  buildTurnPlan,
  B2ProductService
};
