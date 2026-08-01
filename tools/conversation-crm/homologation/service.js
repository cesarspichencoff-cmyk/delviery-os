'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { NativeConversationRuntime } = require('../../../src/conversation-crm/native');
const { loadHomologationData, publicBlindCase, publicReviewCase, sha256 } = require('./data');
const { FeedbackStore } = require('./feedback-store');
const { exportReview } = require('./exporter');

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
  }

  bootstrap() {
    const summary = summarize(this.data, this.store);
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

  chat(input) {
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
    const productContexts = this.customerMenu
      ? this.customerMenu.contextForChat({
          customer_id: request.customer_id || null,
          channel: request.channel || null,
          unit_id: request.channel ? (request.unit_id || 'SIM-UNIT-ITAIM') : null,
          allergies: Array.isArray(request.allergies) ? request.allergies : []
        })
      : {};
    const result = this.runtime.processMessage({
      synthetic: true,
      message_type: 'text',
      content: value,
      channel: 'synthetic',
      subject_id: `SIM-SUBJECT-HOMO-${session}`,
      conversation_id: `SIM-CONV-HOMO-${session}`,
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
    return {
      ok: true,
      turn: {
        review_id: next.review_id,
        customer: value,
        response,
        response_hash: sha256(response),
        diagnostic: {
          endpoint: '/api/homologation/chat',
          pattern: result.execution_diagnostics?.pattern || null,
          journey: result.execution_diagnostics?.journey || null,
          journey_action: result.pattern?.journey_action || null,
          capability: result.execution_diagnostics?.capability || null,
          route_reason: result.execution_diagnostics?.route_reason || null,
          response_path: result.execution_diagnostics?.response_path || 'unknown',
          fallback_used: result.execution_diagnostics?.fallback_used === true,
          fallback_reason: result.execution_diagnostics?.fallback_reason || null,
          customer_context_source: result.execution_diagnostics?.customer_context_source || 'none',
          menu_context_source: result.execution_diagnostics?.menu_context_source || 'none',
          writer_status: result.execution_diagnostics?.writer?.status || 'unknown',
          response_contract: result.execution_diagnostics?.response_contract || null,
          envelope_contract: result.execution_diagnostics?.envelope_contract || null,
          source_of_final_text: result.execution_diagnostics?.source_of_final_text || null
        }
      }
    };
  }

  resetChat() {
    return { ok: true, ...this.store.resetChat() };
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

module.exports = { HomologationService, asPublicTechnical, average, summarize };
