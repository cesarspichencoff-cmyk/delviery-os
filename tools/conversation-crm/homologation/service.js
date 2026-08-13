'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  NativeConversationRuntime,
  detectPublicTopic,
  intentForPublicTopic,
  loadRuntimeCatalogs,
  publicInformationResponse
} = require('../../../src/conversation-crm/native');
const { loadHomologationData, publicBlindCase, publicReviewCase, sha256 } = require('./data');
const { FeedbackStore } = require('./feedback-store');
const { exportReview } = require('./exporter');
const {
  validateApprovedWriterOutput, unapprovedTopics, CONTROLLED_TOPIC_PATTERNS
} = require('../../../apps/deliveryos-ai-node/dialogue/approved-response-envelope');

function normalizeTopicText(value) {
  return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function publicationTopicDrift(writerText, deterministicText, pattern) {
  const writer = normalizeTopicText(writerText);
  const deterministic = normalizeTopicText(deterministicText);
  const drift = CONTROLLED_TOPIC_PATTERNS.filter(([, topicPattern]) => (
    topicPattern.test(writer) && !topicPattern.test(deterministic)
  )).map(([topic]) => topic);
  if (/\bmarketplace\b/u.test(writer) && !/\bmarketplace\b/u.test(deterministic)) drift.push('marketplace');
  return ['greeting', 'chitchat', 'repeat'].includes(pattern) ? [...new Set(drift)] : [];
}

function publicSurface(value) {
  const text = String(value || '').trim();
  return Object.freeze({
    text,
    links: Object.freeze([...new Set([...text.matchAll(/https?:\/\/[^\s)\]}>,]+/giu)]
      .map((match) => match[0].replace(/[.!?]+$/u, '')))]),
    numbers: Object.freeze([...new Set([...text.replace(/https?:\/\/\S+/giu, ' ').matchAll(/(?:R\$\s*)?\d+(?:[.,]\d+)?/giu)]
      .map((match) => match[0].replace(/\s+/gu, ' ').trim()))])
  });
}

function structuredAuthorityFromContexts(message, productContexts, catalogs) {
  const detectedTopic = detectPublicTopic(message);
  const state = productContexts.conversation_state || {};
  const topic = detectedTopic === 'institutional_menu' && state.channel === 'dining_room'
    ? 'dining_room_menu'
    : (detectedTopic === 'institutional_menu' && state.channel === 'own_delivery'
      ? 'delivery_menu'
      : detectedTopic);
  const intent = intentForPublicTopic(topic);
  const guidance = productContexts.conversation_guidance || null;
  const catalogAnswer = topic && !(topic === 'institutional_menu' && state.channel === 'ifood')
    ? publicInformationResponse({
        topic,
        content: message,
        publicInfo: catalogs.publicInfo,
        fieldsMissing: [],
        intentId: intent
      })
    : null;
  const guidedAnswers = Array.isArray(guidance?.direct_answers)
    ? guidance.direct_answers.map(String).map((value) => value.trim()).filter(Boolean)
    : [];
  const knowledge = catalogAnswer ? [catalogAnswer] : guidedAnswers;
  const surface = publicSurface(knowledge.join(' '));
  const hospitality = productContexts.hospitality_context || {};
  const menu = productContexts.menu_context || {};
  const sourceIds = [...new Set([
    ...(catalogAnswer ? ['TATA_OPERATIONAL_PUBLIC_INFO_V1'] : []),
    guidance?.knowledge_source,
    ...(Array.isArray(menu.sources) ? menu.sources : []),
    ...(Array.isArray(productContexts.source_summary?.menu) ? productContexts.source_summary.menu : [])
  ].filter(Boolean).map(String))];
  const queryFilter = Object.freeze({
    public_topic: topic,
    intent,
    channel: state.channel || menu.channel || hospitality.channel || null,
    unit_id: state.unit_id || menu.unit_id || hospitality.unit_id || null,
    active_goal: state.turn_analysis?.active_goal || null,
    requested_category: state.turn_analysis?.requested_category || state.preferences?.requested_category || null,
    number_of_people: hospitality.number_of_people ?? null,
    budget: hospitality.budget ?? null,
    preparation_preferences: Object.freeze([...(hospitality.preparation_preferences || [])]),
    preferred_ingredients: Object.freeze([...(hospitality.preferred_ingredients || [])]),
    excluded_ingredients: Object.freeze([...(hospitality.excluded_ingredients || [])]),
    dietary_restrictions: Object.freeze([...(hospitality.dietary_restrictions || [])]),
    allergies: Object.freeze([...(hospitality.allergies || [])]),
    candidate_item_ids: Object.freeze([...(menu.items || []).map((item) => item.item_id).filter(Boolean)])
  });
  return Object.freeze({
    schema_version: 'deliveryos-product-structured-authority-v1',
    status: knowledge.length ? 'completed' : (guidance?.question ? 'needs_clarification' : 'unknown'),
    topic,
    intent,
    source_ids: Object.freeze(sourceIds),
    source_classification: catalogAnswer ? catalogs.publicInfo.classification : null,
    catalog_version: catalogAnswer ? catalogs.publicInfo.version : null,
    catalog_hash: catalogAnswer ? catalogs.hashes.TATA_OPERATIONAL_PUBLIC_INFO_V1 : null,
    query_filter: queryFilter,
    facts: Object.freeze([]),
    knowledge: Object.freeze(knowledge),
    authorized_links: surface.links,
    authorized_numbers: surface.numbers,
    required_question: typeof guidance?.question === 'string' ? guidance.question : null,
    candidates_found: Object.freeze([...(guidance?.candidates_found || [])]),
    unknowns: Object.freeze([...(menu.unknowns || [])]),
    result_hash: sha256(JSON.stringify({ topic, intent, sourceIds, queryFilter, knowledge }))
  });
}

function asPublicTechnical(item, field = 'technical_refined') {
  return {
    review_id: item.review_id,
    category: item.category,
    turns: item.turns.map((turn) => ({
      turn: turn.turn,
      ...(turn[field] || {})
    }))
  };
}

function average(values) {
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : null;
}

function summarize(data, store) {
  const previousRatings = [...store.latest('humanized').values()];
  const ratings = [...store.latest('refined').values()];
  const comparisons = [...store.latest('blind').values()];
  const free = [...store.latest('free').values()];
  const criteria = {};
  for (const key of ['naturalidade', 'acolhimento', 'clareza', 'utilidade', 'tamanho', 'confianca']) {
    criteria[key] = average(ratings.map((row) => row.criteria[key]));
  }
  const tags = {};
  [...ratings, ...free].flatMap((row) => row.tags).forEach((tag) => { tags[tag] = (tags[tag] || 0) + 1; });
  const categories = new Set(ratings.map((row) => data.rehomologation_cases.find((item) => item.review_id === row.review_id)?.category).filter(Boolean));
  const lowCases = ratings.filter((row) => row.rating <= 2).map((row) => row.review_id);
  const ab = { humanized: 0, baseline: 0, equivalent: 0, both_bad: 0 };
  comparisons.forEach((row) => { ab[row.winner] = (ab[row.winner] || 0) + 1; });
  return {
    technical_result: {
      corpus_cases: data.cases.length,
      corpus_turns: data.cases.reduce((sum, item) => sum + item.turns.length, 0),
      approved_artifact_hash: data.hashes.refined
    },
    previous_review: {
      preserved: true,
      evaluated: previousRatings.length,
      overall_average: average(previousRatings.map((row) => row.rating)),
      low_rating_cases: previousRatings.filter((row) => row.rating <= 2).map((row) => row.review_id)
    },
    cesar_review: {
      evaluated: ratings.length,
      total: data.rehomologation_cases.length,
      pending: data.rehomologation_cases.length - ratings.length,
      completion_percent: Math.round((ratings.length / data.rehomologation_cases.length) * 100),
      categories_evaluated: categories.size,
      overall_average: average(ratings.map((row) => row.rating)),
      criteria,
      blind: ab,
      tags: Object.entries(tags).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count })),
      low_rating_cases: lowCases,
      comments_pending_analysis: ratings.filter((row) => row.comment).length + free.filter((row) => row.comment).length,
      incorrect_information_cases: ratings.filter((row) => row.tags.includes('informacao_errada')).map((row) => row.review_id),
      repeated_question_cases: ratings.filter((row) => row.tags.includes('pergunta_repetida')).map((row) => row.review_id)
    },
    approval_reference: {
      minimum_cases: 45,
      minimum_overall: 4,
      minimum_naturalidade: 4,
      minimum_acolhimento: 4,
      minimum_humanized_win_percent: 70,
      automatic_approval: false,
      authority: 'Cesar'
    }
  };
}

class HomologationService {
  constructor(options = {}) {
    this.projectRoot = path.resolve(options.projectRoot || path.resolve(__dirname, '..', '..', '..'));
    this.data = loadHomologationData(this.projectRoot);
    this.hospitalityCatalog = JSON.parse(fs.readFileSync(path.join(__dirname, 'hospitality-conversations.v1.json'), 'utf8'));
    if (this.hospitalityCatalog.conversation_count !== 20
      || this.hospitalityCatalog.cases.some((item) => item.turns.length < 4 || item.turns.length > 10)) {
      throw Object.assign(new Error('hospitality_catalog_invalid'), { code: 'HOSPITALITY_CATALOG_INVALID' });
    }
    this.store = options.store || new FeedbackStore({
      root: options.feedbackRoot,
      now: options.now,
      metadata: {
        corpus_version: this.data.corpus_version,
        composer_version: this.data.composer_version
      }
    });
    this.now = options.now || (() => new Date().toISOString());
    this.exportRoot = path.resolve(options.exportRoot || process.env.DELIVERYOS_HOMOLOGATION_EXPORT_ROOT || path.join(this.projectRoot, '..', 'deliveryos-review-packets'));
    this.runtimeOptions = {
      projectRoot: this.projectRoot,
      runtimeRoot: path.resolve(options.chatRuntimeRoot || path.join(this.store.root, 'chat-runtime')),
      flagsFile: options.flagsFile || 'config/conversation-crm/native-flags.homologation.json'
    };
    this.runtime = options.runtime || null;
    this.customerMenu = options.customerMenu || null;
    this.localWriter = options.localWriter || null;
  }

  bootstrap() {
    const summary = summarize(this.data, this.store);
    const writer = this.localWriter?.inspect?.() || { status: 'deterministic_fallback', reason: 'LOCAL_WRITER_NOT_CONFIGURED' };
    const rated = new Set([...this.store.latest('refined').keys()].map((key) => key.split(':')[1]));
    const compared = new Set([...this.store.latest('blind').keys()].map((key) => key.split(':')[1]));
    return {
      ok: true,
      synthetic: true,
      panel_version: 'change-004-v2',
      warning: 'Não inclua dados pessoais ou informações reais de clientes.',
      review_cases: this.data.rehomologation_cases.map((item) => ({ ...publicReviewCase(item), evaluated: rated.has(item.review_id) })),
      blind_cases: this.data.cases.map((item) => ({ ...publicBlindCase(item), evaluated: compared.has(item.review_id) })),
      bank: this.data.bank,
      hospitality_cases: this.hospitalityCatalog.cases.map((item) => ({
        case_id: item.case_id,
        title: item.title,
        turn_count: item.turns.length,
        turns: item.turns
      })),
      local_writer: {
        status: writer.status,
        reason: writer.reason || null,
        model_id: writer.model_id || null,
        runtime_release: writer.runtime_release || null
      },
      summary
    };
  }

  findCase(reviewId) {
    const item = [...this.data.cases, ...this.data.rehomologation_cases].find((candidate) => candidate.review_id === reviewId);
    if (!item) throw Object.assign(new Error('review_case_not_found'), { code: 'REVIEW_CASE_NOT_FOUND' });
    return item;
  }

  feedback(body) {
    const item = body.mode === 'free' ? null : this.findCase(String(body.review_id || ''));
    const responseKey = body.mode === 'refined' ? 'refined' : 'humanized';
    const responseHash = item ? sha256(item.turns.map((turn) => turn[responseKey] || '').join('\n')) : String(body.response_hash || '');
    const saved = this.store.record(body, {
      corpusVersion: this.data.corpus_version,
      composerVersion: this.data.composer_version,
      responseHash,
      order: item?.order
    });
    return { ok: true, saved: { review_event_id: saved.review_event_id, review_id: saved.review_id, revision: saved.revision } };
  }

  technical(mode, reviewId) {
    if (!['humanized', 'refined', 'blind'].includes(mode)) throw Object.assign(new Error('technical_mode_invalid'), { code: 'TECHNICAL_MODE_INVALID' });
    if (!this.store.hasVote(mode, reviewId)) throw Object.assign(new Error('vote_required'), { code: 'VOTE_REQUIRED' });
    const item = this.findCase(reviewId);
    return {
      ok: true,
      decision: asPublicTechnical(item, mode === 'humanized' || mode === 'blind' ? 'technical' : 'technical_refined'),
      reveal: mode === 'blind' ? { A: item.order.A, B: item.order.B } : undefined,
      comparison: mode === 'refined' && item.turns.every((turn) => typeof turn.humanized === 'string')
        ? {
            label: 'Resposta anterior × resposta refinada',
            turns: item.turns.map((turn) => ({
              turn: turn.turn,
              previous: turn.humanized,
              refined: turn.refined
            }))
          }
        : undefined
    };
  }

  productExecutionStructured(input) {
    const request = typeof input === 'string' ? { message: input } : (input || {});
    const value = String(request.message || '').trim();
    if (!value) throw Object.assign(new Error('message_required'), { code: 'MESSAGE_REQUIRED' });
    if (value.length > 2000) throw Object.assign(new Error('message_too_long'), { code: 'MESSAGE_TOO_LONG' });
    const next = this.store.nextChatTurn();
    const session = String(next.session).padStart(4, '0');
    const turn = String(next.turn).padStart(4, '0');
    const messageId = `SIM-HOMO-${session}-${turn}`;
    const conversationId = `SIM-CONV-HOMO-${session}`;
    const businessChannel = ['dining_room', 'ifood', 'own_delivery'].includes(String(request.channel || ''))
      ? String(request.channel)
      : null;
    const productContexts = this.customerMenu
      ? this.customerMenu.contextForChat({
          conversation_id: conversationId,
          message: value,
          customer_id: request.customer_id || null,
          channel: businessChannel,
          unit_id: businessChannel
            ? (request.unit_id || this.customerMenu.defaultUnitForChannel?.(businessChannel) || null)
            : null,
          allergies: Array.isArray(request.allergies) ? request.allergies : []
        })
      : {};
    const catalogs = loadRuntimeCatalogs();
    const structuredAuthority = structuredAuthorityFromContexts(value, productContexts, catalogs);
    const state = productContexts.conversation_state || {};
    return {
      result: {
        schema_version: 'deliveryos-product-structured-execution-v1',
        synthetic: true,
        conversation_id: conversationId,
        message_id: messageId,
        input_content_hash: sha256(value),
        structured_authority: structuredAuthority,
        product_contexts: productContexts,
        native_response_composer_executed: false,
        external_system_accessed: false,
        real_driver_used: false
      },
      publicResult: {
        ok: true,
        turn: {
          review_id: next.review_id,
          customer: value,
          response: null,
          response_hash: null,
          diagnostic: {
            endpoint: '/api/product/turn',
            runtime: 'structured_product_context',
            intent: structuredAuthority.intent,
            pattern: null,
            semantic_transition: state.semantic_transition || null,
            user_repair_signal: state.user_repair_signal === true,
            negative_feedback_signal: state.negative_feedback_signal === true,
            journey: null,
            journey_state: null,
            pending_question: state.pending_question || null,
            channel: state.channel || structuredAuthority.query_filter.channel || 'unknown',
            unit_id: state.unit_id || structuredAuthority.query_filter.unit_id || null,
            knowledge_sources: [...structuredAuthority.source_ids],
            candidates_found: [...structuredAuthority.candidates_found],
            preferences: state.preferences || null,
            repetition_detected: state.repetition_detected === true,
            repetition_streak: state.repetition_streak || 0,
            facts_added: state.facts_added || [],
            turn_analysis: state.turn_analysis || null,
            hospitality_context: productContexts.hospitality_context || null,
            source_of_final_text: null,
            native_response_composer_executed: false
          }
        }
      }
    };
  }

  chatExecution(input) {
    const request = typeof input === 'string' ? { message: input } : (input || {});
    const value = String(request.message || '').trim();
    if (!value) throw Object.assign(new Error('message_required'), { code: 'MESSAGE_REQUIRED' });
    if (value.length > 2000) throw Object.assign(new Error('message_too_long'), { code: 'MESSAGE_TOO_LONG' });
    if (!this.runtime) {
      fs.mkdirSync(this.runtimeOptions.runtimeRoot, { recursive: true });
      this.runtime = new NativeConversationRuntime(this.runtimeOptions);
    }
    const next = this.store.nextChatTurn();
    const session = String(next.session).padStart(4, '0');
    const turn = String(next.turn).padStart(4, '0');
    const messageId = `SIM-HOMO-${session}-${turn}`;
    const conversationId = `SIM-CONV-HOMO-${session}`;
    const productContexts = this.customerMenu
      ? this.customerMenu.contextForChat({
          conversation_id: conversationId,
          message: value,
          customer_id: request.customer_id || null,
          channel: request.channel || null,
          unit_id: request.channel
            ? (request.unit_id || this.customerMenu.defaultUnitForChannel?.(request.channel) || null)
            : null,
          allergies: Array.isArray(request.allergies) ? request.allergies : []
        })
      : {};
    const result = this.runtime.processMessage({
      synthetic: true,
      message_type: 'text',
      content: value,
      channel: 'synthetic',
      subject_id: `SIM-SUBJECT-HOMO-${session}`,
       conversation_id: conversationId,
      message_id: messageId,
      correlation_id: `SIM-CORR-${messageId}`,
      idempotency_key: `homologation:${messageId}`,
      occurred_at: this.runtime.clock.iso(),
      turn_order: next.turn,
      unit_id: 'SIM-UNIT-001',
      context: { synthetic: true }
    }, {
      product_contexts: productContexts
    });
    const response = String(result.response?.text || '');
    return { result, publicResult: {
      ok: true,
      turn: {
        review_id: next.review_id,
        customer: value,
        response,
        response_hash: sha256(response),
        diagnostic: {
          endpoint: '/api/homologation/chat',
          social_act: productContexts.conversation_state?.social_act || null,
          intent: result.classification?.intent || null,
          pattern: result.execution_diagnostics?.pattern || null,
          semantic_transition: productContexts.conversation_state?.semantic_transition
            || result.execution_diagnostics?.semantic_transition || null,
          user_repair_signal: productContexts.conversation_state?.user_repair_signal === true
            || result.execution_diagnostics?.user_repair_signal === true,
          negative_feedback_signal: productContexts.conversation_state?.negative_feedback_signal === true
            || result.execution_diagnostics?.negative_feedback_signal === true,
          journey: result.execution_diagnostics?.journey || null,
          journey_state: result.execution_diagnostics?.journey_state || null,
          journey_action: result.pattern?.journey_action || null,
          capability: result.execution_diagnostics?.capability || null,
          route_reason: result.execution_diagnostics?.route_reason || null,
          response_path: result.execution_diagnostics?.response_path || 'unknown',
          fallback_used: result.execution_diagnostics?.fallback_used === true,
          fallback_reason: result.execution_diagnostics?.fallback_reason || null,
          context_reason: result.execution_diagnostics?.context_reason || null,
          pending_question: productContexts.conversation_state?.pending_question || null,
          channel: result.execution_diagnostics?.channel || 'unknown',
          unit_id: result.execution_diagnostics?.unit_id || null,
          knowledge_sources: result.execution_diagnostics?.knowledge_sources || [],
          candidates_found: result.execution_diagnostics?.candidates_found || [],
          preferences: productContexts.conversation_state?.preferences || null,
          repetition_detected: productContexts.conversation_state?.repetition_detected === true,
          repetition_streak: productContexts.conversation_state?.repetition_streak || 0,
          facts_added: productContexts.conversation_state?.facts_added || [],
          turn_analysis: productContexts.conversation_state?.turn_analysis || null,
          customer_context_source: result.execution_diagnostics?.customer_context_source || 'none',
          menu_context_source: result.execution_diagnostics?.menu_context_source || 'none',
          writer_status: result.execution_diagnostics?.writer?.status || 'unknown',
          response_contract: result.execution_diagnostics?.response_contract || null,
          envelope_contract: result.execution_diagnostics?.envelope_contract || null,
          source_of_final_text: result.execution_diagnostics?.source_of_final_text || null,
          hospitality_context: productContexts.hospitality_context || null
        }
      }
    } };
  }

  chat(input) {
    return this.chatExecution(input).publicResult;
  }

  async chatWithWriter(input) {
    const execution = this.chatExecution(input);
    const output = structuredClone(execution.publicResult);
    const deterministicText = output.turn.response;
    if (!this.localWriter) {
      output.turn.diagnostic.writer_status = 'deterministic_fallback';
      output.turn.diagnostic.response_path = 'deterministic_fallback';
      output.turn.diagnostic.fallback_used = true;
      output.turn.diagnostic.fallback_reason = 'LOCAL_WRITER_NOT_CONFIGURED';
      output.turn.diagnostic.source_of_final_text = 'controlled_response_composer';
      return output;
    }
    let generated = await this.localWriter.writeApproved(execution.result.approved_response_envelope);
    if (generated.accepted) {
      const publicationGate = validateApprovedWriterOutput(generated.output, execution.result.approved_response_envelope);
      const topics = unapprovedTopics(generated.output?.text, execution.result.approved_response_envelope);
      const drift = publicationTopicDrift(
        generated.output?.text,
        deterministicText,
        execution.result.execution_diagnostics?.pattern
      );
      if (!publicationGate.accepted || topics.length || drift.length) {
        generated = {
          accepted: false,
          source: 'rejected',
          reason: publicationGate.reason || 'WRITER_UNAPPROVED_TOPIC',
          output: null
        };
      }
    }
    if (!generated.accepted) {
      output.turn.diagnostic.writer_status = 'deterministic_fallback';
      output.turn.diagnostic.response_path = 'deterministic_fallback';
      output.turn.diagnostic.fallback_used = true;
      output.turn.diagnostic.fallback_reason = generated.reason || 'LOCAL_WRITER_REJECTED';
      output.turn.diagnostic.source_of_final_text = 'controlled_response_composer';
      return output;
    }
    const writerText = String(generated.output.text || '');
    const publicationTopics = [
      ...unapprovedTopics(writerText, execution.result.approved_response_envelope),
      ...publicationTopicDrift(writerText, deterministicText, execution.result.execution_diagnostics?.pattern)
    ];
    if (publicationTopics.length) {
      output.turn.diagnostic.writer_status = 'deterministic_fallback';
      output.turn.diagnostic.response_path = 'deterministic_fallback';
      output.turn.diagnostic.fallback_used = true;
      output.turn.diagnostic.fallback_reason = 'WRITER_UNAPPROVED_TOPIC';
      output.turn.diagnostic.source_of_final_text = 'controlled_response_composer';
      output.turn.diagnostic.publication_gate = 'deliveryos-writer-publication-gate-v1';
      return output;
    }
    output.turn.response = writerText;
    output.turn.response_hash = sha256(writerText);
    output.turn.diagnostic.writer_status = 'gemma_local';
    output.turn.diagnostic.response_path = 'gemma_local_writer';
    output.turn.diagnostic.fallback_used = false;
    output.turn.diagnostic.fallback_reason = null;
    output.turn.diagnostic.source_of_final_text = 'gemma_local_writer';
    output.turn.diagnostic.publication_gate = 'deliveryos-writer-publication-gate-v1';
    output.turn.diagnostic.deterministic_reference_hash = sha256(deterministicText);
    output.turn.writer_comparison = {
      schema_version: 'deliveryos-writer-human-comparison-v1',
      approved_envelope_hash: sha256(JSON.stringify(execution.result.approved_response_envelope)),
      A: deterministicText,
      B: writerText,
      reveal: { A: 'deterministic_composer', B: 'gemma_local_writer' }
    };
    return output;
  }

  resetChat() {
    const reset = this.store.resetChat();
    const context = this.customerMenu?.resetChatContext?.() || { context_reset: false };
    return { ok: true, ...reset, ...context };
  }

  summary() {
    return { ok: true, summary: summarize(this.data, this.store) };
  }

  export() {
    fs.mkdirSync(this.exportRoot, { recursive: true });
    const result = exportReview({
      projectRoot: this.projectRoot,
      outputRoot: this.exportRoot,
      data: this.data,
      store: this.store,
      summary: summarize(this.data, this.store),
      now: this.now
    });
    return {
      ok: true,
      package_name: result.packageName,
      privacy_scan: result.manifest.privacy_scan,
      counts: result.manifest.counts
    };
  }
}

module.exports = {
  HomologationService,
  asPublicTechnical,
  average,
  summarize,
  publicationTopicDrift,
  publicSurface,
  structuredAuthorityFromContexts
};
