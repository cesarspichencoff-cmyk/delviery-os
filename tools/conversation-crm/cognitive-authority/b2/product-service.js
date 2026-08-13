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

function normalizedRequestText(value) {
  return publicText(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function requestedFactTarget(message, questions = []) {
  if (!questions.includes('price')) return null;
  const text = normalizedRequestText(message).replace(/[?.!,;:]+$/gu, '').trim();
  const match = text.match(/\b(?:quanto\s+(?:custa|fica)|qual\s+(?:e\s+)?o\s+(?:preco|valor)|(?:preco|valor)\s+(?:do|da|de))\s+(?:do|da|de)?\s*(.{2,90})$/u);
  return match ? match[1].replace(/^(?:o|a)\s+/u, '').trim() : null;
}

function referencesPriorOptions(message, turnAnalysis = {}) {
  if (turnAnalysis.resolved_reference || turnAnalysis.resolved_group_reference) return true;
  return /\b(?:deles|delas|dessas|desses|essas|esses|primeir[ao]|segund[ao]|terceir[ao]|op[cç][aã]o anterior|op[cç][oõ]es anteriores)\b/iu.test(String(message || ''));
}

function operationDescriptor(execution, message, commitments = []) {
  const structured = execution.result.structured_authority || null;
  const envelope = execution.result.approved_response_envelope || {};
  const diagnostic = execution.publicResult.turn.diagnostic || {};
  const analysis = diagnostic.turn_analysis || {};
  const recommendation = envelope.recommendation_context || {};
  const questions = Array.isArray(analysis.questions) ? [...new Set(analysis.questions.map(String))].sort() : [];
  if (structured) {
    return Object.freeze({
      intent: structured.intent || diagnostic.intent || null,
      topic: structured.topic || null,
      query_filter: structured.query_filter || {},
      commitments: commitments.map((item) => `${item.kind}:${normalizedRequestText(item.content)}`).sort()
    });
  }
  return Object.freeze({
    intent: diagnostic.intent || execution.result.classification?.intent || null,
    subintent: execution.result.classification?.subintent || null,
    goal: envelope.customer_goal || analysis.active_goal || null,
    requested_category: analysis.requested_category || recommendation.requested_category || null,
    fact_need: questions,
    fact_target: requestedFactTarget(message, questions),
    resolved_reference: analysis.resolved_reference?.item_id || null,
    resolved_group_reference: Array.isArray(analysis.resolved_group_reference?.item_ids)
      ? [...analysis.resolved_group_reference.item_ids].sort()
      : [],
    active_preferences: [...new Set((envelope.active_preferences || recommendation.active_preferences || []).map(String))].sort(),
    active_restrictions: [...new Set((envelope.active_restrictions || []).map((item) => String(item?.value || item?.type || item)))].sort(),
    commitments: commitments.map((item) => `${item.kind}:${normalizedRequestText(item.content)}`).sort()
  });
}

function nativeResultFingerprint(execution, message, operationFingerprint) {
  if (execution.result.structured_authority) {
    const analysis = execution.publicResult.turn.diagnostic?.turn_analysis || {};
    const guidance = execution.result.product_contexts?.conversation_guidance || {};
    const questions = Array.isArray(analysis.questions) ? analysis.questions : [];
    const priceTarget = requestedFactTarget(message, questions);
    if (priceTarget && guidance.mode === 'concise_price'
      && Array.isArray(guidance.candidates_found) && guidance.candidates_found.length
      && !referencesPriorOptions(message, analysis)) {
      return canonicalHash({
        binding: 'prior_presented_options',
        mode: guidance.mode,
        candidate_ids: [...guidance.candidates_found].map(String).sort()
      });
    }
    return operationFingerprint;
  }
  const diagnostic = execution.publicResult.turn.diagnostic || {};
  const analysis = diagnostic.turn_analysis || {};
  const nativePlan = execution.result.response?.plan || {};
  const questions = Array.isArray(analysis.questions) ? analysis.questions : [];
  const priceTarget = requestedFactTarget(message, questions);
  const reusesPriorCandidates = nativePlan.product_guidance_mode === 'concise_price'
    && Array.isArray(nativePlan.candidates_found)
    && nativePlan.candidates_found.length > 0;
  if (priceTarget && reusesPriorCandidates && !referencesPriorOptions(message, analysis)) {
    return canonicalHash({
      binding: 'prior_presented_options',
      mode: nativePlan.product_guidance_mode,
      candidate_ids: [...nativePlan.candidates_found].map(String).sort()
    });
  }
  return operationFingerprint;
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
  const questions = envelope.recommendation_context?.questions_answerable_now || [];
  const priceTarget = requestedFactTarget(source, Array.isArray(questions) && questions.includes('price') ? questions : (
    /\b(?:quanto\s+(?:custa|fica)|pre[cç]o|valor)\b/iu.test(source) ? ['price'] : []
  ));
  if (priceTarget) addCommitment(found, 'GOAL', `preço de ${priceTarget}`);
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
  const structured = execution.result.structured_authority || null;
  const envelope = execution.result.approved_response_envelope || {};
  const diagnostic = execution.publicResult.turn.diagnostic || {};
  const structuredKnowledge = Array.isArray(structured?.knowledge)
    ? structured.knowledge.map(publicText).filter(Boolean)
    : [];
  const nativeResponse = structured
    ? structuredKnowledge.join(' ')
    : publicText(execution.publicResult.turn.response);
  const requiredQuestion = publicText(structured?.required_question || envelope.question_to_ask || envelope.next_best_question || '');
  const repairRequired = diagnostic.user_repair_signal === true || diagnostic.negative_feedback_signal === true;
  const gravity = String(envelope.gravity || 'informational');
  const urgent = gravity === 'critical';
  const relation = RELATIONS.has(String(diagnostic.semantic_transition || '').toUpperCase())
    ? String(diagnostic.semantic_transition).toUpperCase()
    : (repairRequired ? 'CORRECT' : 'CONTINUE');
  const commitmentMap = new Map(publicCommitments(message, diagnostic.hospitality_context || {}, envelope)
    .map((item) => [`${item.kind}:${normalizedRequestText(item.content)}`, item]));
  const requestedCategory = structured?.query_filter?.requested_category;
  const normalizedMessage = normalizedRequestText(message);
  const categoryMentioned = requestedCategory
    && normalizedMessage.includes(normalizedRequestText(readableToken(requestedCategory)));
  const temperatureChanged = (diagnostic.facts_added || []).some((fact) => fact?.field === 'temperature_preference');
  if (categoryMentioned) addCommitment(commitmentMap, 'GOAL', `priorizar ${readableToken(requestedCategory)}`);
  if (temperatureChanged && structured?.query_filter?.preparation_preferences?.includes('not_hot')) {
    addCommitment(commitmentMap, 'CONSTRAINT', 'evitar a seção Pratos Quentes');
  }
  const commitments = [...commitmentMap.values()];
  const facts = structured ? approvedFacts({ facts: structured.facts || [] }) : approvedFacts(envelope);
  const knowledge = structured ? structuredKnowledge : (nativeResponse ? [nativeResponse] : []);
  const toolRequirement = urgent
    ? 'SAFETY_GATE'
    : (knowledge.length || facts.length
      ? (structured?.topic === 'reservation' ? 'RESERVATION_INFO'
        : (structured?.topic === 'restaurant_model' ? 'RESTAURANT_INFO'
          : (structured?.query_filter?.channel ? 'CATALOG_SEARCH' : 'OTHER_ALLOWED_TOOL')))
      : (requiredQuestion ? 'NONE' : 'OTHER_ALLOWED_TOOL'));
  const reference = requiredQuestion
    ? { required: true, status: 'NEEDS_CLARIFICATION', target: questionTarget(requiredQuestion) }
    : { required: false, status: 'NOT_REQUIRED', target: null };
  const plan = {
    relation_to_history: relation,
    conversational_move: urgent ? 'ANSWER' : (repairRequired ? 'REPAIR' : (requiredQuestion ? 'CLARIFY' : 'ANSWER')),
    tool_requirement: toolRequirement,
    user_goal: publicText(envelope.customer_goal || structured?.query_filter?.active_goal || diagnostic.turn_analysis?.active_goal || 'entender a necessidade e avançar com segurança'),
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
  const operation = operationDescriptor(execution, message, commitments);
  const operationFingerprint = canonicalHash(operation);
  const resultFingerprint = nativeResultFingerprint(execution, message, operationFingerprint);
  const toolResult = knowledge.length || facts.length
    ? {
        status: 'completed',
        source: 'deliveryos_native_authority',
        request_fingerprint: operationFingerprint,
        result_fingerprint: resultFingerprint,
        result_hash: structured?.result_hash || null,
        source_ids: structured?.source_ids || [],
        query_filter: structured?.query_filter || null,
        facts,
        knowledge
      }
    : null;
  const authorityContext = {
    confirmed_facts: [],
    tool_results: toolResult ? { [toolRequirement]: toolResult } : {},
    required_question: requiredQuestion || null,
    safety_directive: urgent ? nativeResponse : null,
    prohibited_claims: envelope.prohibited_claims || [],
    authorized_links: structured?.authorized_links || envelope.authorized_links || [],
    authorized_numbers: structured?.authorized_numbers || envelope.authorized_numbers || [],
    recent_phrases: envelope.recent_phrases_to_avoid || [],
    tone: 'calmo, direto e acolhedor',
    operation_fingerprint: operationFingerprint
  };
  return { plan, authorityContext, nativeResponse, facts, knowledge, operation, operationFingerprint, resultFingerprint };
}

function traceStep(id, label, status, detail) {
  return Object.freeze({ id, label, status, detail });
}

function traceArray(value) {
  return Array.isArray(value) ? value.map((item) => (
    typeof item === 'string' ? publicText(item) : item
  )) : [];
}

function writerIdentity(writer) {
  if (writer instanceof GemmaB2Writer) return 'gemma_local_writer';
  if (writer instanceof DeterministicB2Writer) return 'deterministic_b2_writer';
  return String(writer?.constructor?.name || 'unknown_writer');
}

function authorityQueryFilter(execution) {
  const structured = execution.result?.structured_authority || null;
  if (structured) {
    return Object.freeze({
      source: 'deliveryos_structured_authority',
      source_ids: traceArray(structured.source_ids),
      public_topic: structured.topic || null,
      intent: structured.intent || null,
      query_filter: structured.query_filter || {},
      candidates_returned: traceArray(structured.candidates_found),
      unknowns: traceArray(structured.unknowns),
      request_result_binding: Object.freeze({
        result_hash: structured.result_hash || null,
        source_catalog_hash: structured.catalog_hash || null,
        source_classification: structured.source_classification || null,
        catalog_version: structured.catalog_version || null
      })
    });
  }
  const envelope = execution.result?.approved_response_envelope || {};
  const diagnostic = execution.publicResult?.turn?.diagnostic || {};
  const hospitality = diagnostic.hospitality_context || envelope.active_context || {};
  const menu = envelope.menu_context_summary || {};
  const preferences = diagnostic.preferences || {};
  return Object.freeze({
    source: 'deliveryos_native_authority',
    channel: diagnostic.channel || menu.channel || hospitality.channel || null,
    unit_id: diagnostic.unit_id || menu.unit_id || hospitality.unit_id || null,
    customer_goal: publicText(envelope.customer_goal || diagnostic.turn_analysis?.active_goal || ''),
    number_of_people: hospitality.number_of_people ?? null,
    budget: hospitality.budget ?? null,
    preparation_preferences: traceArray(hospitality.preparation_preferences),
    preferred_ingredients: traceArray(hospitality.preferred_ingredients),
    excluded_ingredients: traceArray(hospitality.excluded_ingredients),
    dietary_restrictions: traceArray(hospitality.dietary_restrictions),
    allergies: traceArray(hospitality.allergies),
    requested_category: preferences.requested_category || diagnostic.turn_analysis?.requested_category || null,
    active_preferences: traceArray(envelope.active_preferences),
    active_restrictions: traceArray(envelope.active_restrictions),
    candidate_item_ids: traceArray(menu.item_ids),
    candidates_returned: traceArray(diagnostic.candidates_found),
    unknowns: traceArray(menu.unknowns || envelope.uncertainties_to_translate)
  });
}

function runtimeInterpretation(execution) {
  const result = execution.result || {};
  const diagnostic = execution.publicResult?.turn?.diagnostic || {};
  return Object.freeze({
    endpoint: diagnostic.endpoint || '/api/product/turn',
    runtime: diagnostic.runtime || (result.structured_authority ? 'structured_product_context' : 'NativeConversationRuntime'),
    conversation_id: result.conversation_id || null,
    message_id: result.message_id || null,
    intent: diagnostic.intent || result.classification?.intent || null,
    pattern: diagnostic.pattern || result.pattern?.pattern || null,
    semantic_transition: diagnostic.semantic_transition || null,
    active_goal: diagnostic.turn_analysis?.active_goal || null,
    previous_goal: diagnostic.turn_analysis?.previous_goal || null,
    journey: diagnostic.journey || result.journey_state?.active_journey || null,
    journey_state: diagnostic.journey_state || result.journey_state || null,
    pending_question: diagnostic.pending_question || null,
    user_repair_signal: diagnostic.user_repair_signal === true,
    negative_feedback_signal: diagnostic.negative_feedback_signal === true,
    repetition_detected: diagnostic.repetition_detected === true,
    repetition_streak: Number(diagnostic.repetition_streak || 0),
    facts_added: Array.isArray(diagnostic.facts_added) ? diagnostic.facts_added : [],
    native_response_composer_executed: result.native_response_composer_executed !== false,
    structured_authority_used: Boolean(result.structured_authority)
  });
}

function writerTrace(output, primaryWriter, fallbackWriter) {
  const fallbackUsed = Boolean(output.writer_limit);
  const primary = writerIdentity(primaryWriter);
  const fallback = writerIdentity(fallbackWriter);
  return Object.freeze({
    writer_source: output.writer_source || null,
    writer_limit: output.writer_limit || null,
    primary_attempt: Object.freeze({
      writer: primary,
      outcome: fallbackUsed ? 'rejected_or_invalidated' : (output.writer_source ? 'accepted' : 'not_completed'),
      reason: fallbackUsed ? output.writer_limit : null
    }),
    fallback_attempt: Object.freeze({
      used: fallbackUsed,
      writer: fallback,
      outcome: fallbackUsed ? (output.accepted ? 'accepted' : 'rejected') : 'not_used',
      final_source: fallbackUsed ? (output.writer_source || null) : null
    })
  });
}

function validatorTrace(output, previousPublication) {
  const currentHash = output.response_plan?.progress_state_hash || null;
  const previousHash = previousPublication?.progress_state_hash || null;
  return Object.freeze({
    accepted: output.accepted,
    status: output.accepted ? 'accepted' : 'blocked',
    detected_stage: output.stage || null,
    reason: output.accepted ? null : output.reason,
    candidate_response: output.candidate_response ? publicText(output.candidate_response) : null,
    publication_outcome: output.response_plan?.publication_outcome || null,
    authority_evidence_hash: output.response_plan?.authority_evidence_hash || null,
    previous_progress_state_hash: previousHash,
    current_progress_state_hash: currentHash,
    same_progress_state: Boolean(previousHash && currentHash && previousHash === currentHash),
    required_commitment_count: output.response_plan?.required_response_commitments?.length || 0
  });
}

function firstDivergenceFor(output, previousPublication, prepared, primaryWriter) {
  const validator = validatorTrace(output, previousPublication);
  if (!output.accepted) {
    const detectedAt = String(output.stage || 'validator').toUpperCase();
    let stage = detectedAt === 'PLANNER' ? 'UNDERSTANDING'
      : (detectedAt === 'AUTHORITY' ? 'AUTHORITY_RESULT'
        : (detectedAt === 'WRITER' ? 'WRITER_FALLBACK' : 'VALIDATOR'));
    if (output.reason === 'B2_NO_PROGRESS_WITHOUT_STATE_CHANGE') stage = 'RESPONSE_PLAN';
    if (output.reason === 'B2_WRITER_DROPPED_REQUIRED_COMMITMENT') stage = 'REQUIRED_COMMITMENTS';
    return Object.freeze({
      stage,
      detected_at: detectedAt,
      reason: output.reason,
      upstream_cause: Object.freeze({
        relation_to_history: prepared.plan.relation_to_history,
        conversational_move: prepared.plan.conversational_move,
        repair_required: prepared.plan.repair.required,
        reference_status: prepared.plan.reference.status,
        primary_writer: writerIdentity(primaryWriter),
        writer_limit: output.writer_limit || null,
        previous_progress_state_hash: validator.previous_progress_state_hash,
        current_progress_state_hash: validator.current_progress_state_hash,
        same_progress_state: validator.same_progress_state,
        authority_evidence_hash: output.response_plan?.authority_evidence_hash || null
      })
    });
  }
  if (output.writer_limit) {
    return Object.freeze({
      stage: 'WRITER_FALLBACK',
      detected_at: 'WRITER_FALLBACK',
      reason: output.writer_limit,
      upstream_cause: Object.freeze({
        primary_writer: writerIdentity(primaryWriter),
        authority_evidence_hash: output.response_plan?.authority_evidence_hash || null,
        authorized_knowledge_hashes: prepared.knowledge.map((value) => canonicalHash({ value }))
      })
    });
  }
  return null;
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
    this.publicHistory = [];
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
    const execution = typeof this.homologation.productExecutionStructured === 'function'
      ? this.homologation.productExecutionStructured({ ...input, message })
      : this.homologation.chatExecution({ ...input, message });
    const prepared = buildTurnPlan(execution, message);
    const previousPublication = this.previousPublication;
    const historyBefore = Object.freeze(this.publicHistory.map((item) => Object.freeze({ ...item })));
    const runtimeContext = runtimeInterpretation(execution);
    const capabilityNeed = authorityQueryFilter(execution);
    const planner = new FunctionPlannerAdapter({
      adapter_id: 'deliveryos-native-to-b2-product-adapter',
      plan() { return prepared.plan; }
    });
    const pipeline = new B2Pipeline({ planner, writer: this.writer, fallbackWriter: this.fallbackWriter });
    const output = await pipeline.execute({
      planner_packet: {
        transcript: historyBefore.map((turn) => ({ role: turn.role, text: turn.text })),
        compact_state: runtimeContext,
        references: { current: prepared.plan.reference },
        confirmed_facts: [],
        available_capabilities: [prepared.plan.tool_requirement],
        limits: ['ZERO_EXTERNAL_COST', 'NO_EXTERNAL_ACTION', 'LOCAL_SHADOW_ONLY'],
        safety_state: prepared.plan.safety_priority,
        current_message: message
      },
      authority_context: prepared.authorityContext,
      previous_publication: previousPublication
    });
    this.turn += 1;
    const turnId = `B2-TURN-${String(this.turn).padStart(4, '0')}`;
    const firstDivergence = firstDivergenceFor(output, previousPublication, prepared, this.writer);
    const structuredAuthority = execution.result?.structured_authority || null;
    const plannerResult = Object.freeze({
      adapter_id: output.planner_adapter || 'deliveryos-native-to-b2-product-adapter',
      contract: 'Contract V2',
      packet_hash: output.planner_packet_hash || null,
      plan_hash: output.planner_plan_hash || canonicalHash(prepared.plan),
      relation_to_history: prepared.plan.relation_to_history,
      conversational_move: prepared.plan.conversational_move,
      user_goal: prepared.plan.user_goal,
      what_changed: prepared.plan.what_changed,
      repair: prepared.plan.repair,
      reference: prepared.plan.reference,
      tool_requirement: prepared.plan.tool_requirement,
      next_best_step: prepared.plan.next_best_step
    });
    const responsePlanDetail = output.response_plan ? Object.freeze({
      status: output.response_plan.status,
      publication_outcome: output.response_plan.publication_outcome,
      relation_to_history: output.response_plan.relation_to_history,
      conversational_move: output.response_plan.conversational_move,
      repair_acknowledgement: output.response_plan.repair_acknowledgement,
      reference: output.response_plan.reference,
      required_question: output.response_plan.required_question,
      required_response_commitments: output.response_plan.required_response_commitments,
      next_best_step: output.response_plan.next_best_step,
      operation_fingerprint: output.response_plan.operation_fingerprint || prepared.operationFingerprint,
      progress_state_hash: output.response_plan.progress_state_hash,
      authority_evidence_hash: output.response_plan.authority_evidence_hash
    }) : null;
    const steps = [
      traceStep('USER', 'USER', 'observed', {
        current_message: message,
        history_state: {
          prior_public_turns: historyBefore,
          prior_turn_count: historyBefore.length,
          previous_publication: previousPublication,
          runtime_context: runtimeContext
        }
      }),
      traceStep('UNDERSTANDING', 'UNDERSTANDING', 'completed', {
        user_goal: prepared.plan.user_goal,
        cognitive_planner: plannerResult,
        relation_interpretation: prepared.plan.relation_to_history,
        repair_interpretation: prepared.plan.repair,
        reference_interpretation: prepared.plan.reference,
        runtime_context: runtimeContext
      }),
      traceStep('REQUIRED_COMMITMENTS', 'REQUIRED COMMITMENTS', prepared.plan.required_response_commitments.length ? 'required' : 'none', {
        commitments: prepared.plan.required_response_commitments,
        count: prepared.plan.required_response_commitments.length,
        preserved_in_response_plan: output.response_plan?.required_response_commitments || []
      }),
      traceStep('CAPABILITY_FACT_NEED', 'CAPABILITY / FACT NEED', 'evaluated', {
        tool_requirement: prepared.plan.tool_requirement,
        operation: prepared.operation,
        operation_fingerprint: prepared.operationFingerprint,
        result_fingerprint: prepared.resultFingerprint,
        query_filter: capabilityNeed,
        authorized_fact_count: output.response_plan?.approved_facts?.length || 0,
        authorized_knowledge_count: prepared.knowledge.length
      }),
      traceStep('AUTHORITY_RESULT', 'AUTHORITY RESULT', output.response_plan ? 'completed' : 'blocked', {
        status: output.response_plan?.status || structuredAuthority?.status || 'blocked',
        outcome: output.response_plan?.publication_outcome || null,
        evidence_hash: output.response_plan?.authority_evidence_hash || null,
        source_ids: traceArray(structuredAuthority?.source_ids),
        source_catalog_hash: structuredAuthority?.catalog_hash || null,
        source_result_hash: structuredAuthority?.result_hash || null,
        request_fingerprint: prepared.operationFingerprint,
        result_fingerprint: prepared.resultFingerprint,
        request_result_bound: prepared.operationFingerprint === prepared.resultFingerprint,
        approved_facts: output.response_plan?.approved_facts || [],
        authorized_knowledge: prepared.knowledge,
        blocked_reason: output.response_plan ? null : output.reason
      }),
      traceStep('RESPONSE_PLAN', 'RESPONSE PLAN', output.response_plan ? 'completed' : 'unavailable', responsePlanDetail),
      traceStep('WRITER_FALLBACK', 'WRITER / FALLBACK', output.writer_source ? 'completed' : 'blocked', writerTrace(output, this.writer, this.fallbackWriter)),
      traceStep('VALIDATOR', 'VALIDATOR', output.accepted ? 'accepted' : 'blocked', validatorTrace(output, previousPublication)),
      traceStep('PUBLISHED_RESPONSE', 'PUBLISHED RESPONSE', output.accepted ? 'local_shadow_preview' : 'not_published', {
        response: output.response || null,
        response_hash: output.response_hash || null,
        publication_path: output.accepted ? 'local_shadow_preview' : 'not_published',
        external_action_performed: false,
        external_spend_brl: 0
      })
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
    this.publicHistory.push(Object.freeze({ role: 'user', text: message }));
    if (output.accepted) this.publicHistory.push(Object.freeze({ role: 'assistant', text: output.response, turn_id: turnId }));
    if (output.accepted) {
      this.previousPublication = Object.freeze({
        response: output.response,
        progress_state_hash: output.progress_state_hash,
        operation_fingerprint: output.response_plan?.operation_fingerprint || null
      });
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
    this.publicHistory = [];
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
  requestedFactTarget,
  referencesPriorOptions,
  operationDescriptor,
  nativeResultFingerprint,
  buildTurnPlan,
  B2ProductService
};
