'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { NativeConversationRuntime } = require('../../../src/conversation-crm/native');
const { loadHomologationData, publicBlindCase, publicReviewCase, sha256 } = require('./data');
const { FeedbackStore } = require('./feedback-store');

function asPublicTechnical(item) {
  return {
    review_id: item.review_id,
    category: item.category,
    turns: item.turns.map((turn) => ({
      turn: turn.turn,
      ...turn.technical
    }))
  };
}

function average(values) {
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : null;
}

function summarize(data, store) {
  const ratings = [...store.latest('humanized').values()];
  const comparisons = [...store.latest('blind').values()];
  const free = [...store.latest('free').values()];
  const criteria = {};
  for (const key of ['naturalidade', 'acolhimento', 'clareza', 'utilidade', 'tamanho', 'confianca']) {
    criteria[key] = average(ratings.map((row) => row.criteria[key]));
  }
  const tags = {};
  [...ratings, ...free].flatMap((row) => row.tags).forEach((tag) => { tags[tag] = (tags[tag] || 0) + 1; });
  const categories = new Set(ratings.map((row) => data.cases.find((item) => item.review_id === row.review_id)?.category).filter(Boolean));
  const lowCases = ratings.filter((row) => row.rating <= 2).map((row) => row.review_id);
  const ab = { humanized: 0, baseline: 0, equivalent: 0, both_bad: 0 };
  comparisons.forEach((row) => { ab[row.winner] = (ab[row.winner] || 0) + 1; });
  return {
    technical_result: {
      corpus_cases: data.cases.length,
      corpus_turns: data.cases.reduce((sum, item) => sum + item.turns.length, 0),
      approved_artifact_hash: data.hashes.humanized
    },
    cesar_review: {
      evaluated: ratings.length,
      pending: data.cases.length - ratings.length,
      completion_percent: Math.round((ratings.length / data.cases.length) * 100),
      categories_evaluated: categories.size,
      overall_average: average(ratings.map((row) => row.rating)),
      criteria,
      blind: ab,
      tags: Object.entries(tags).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count })),
      low_rating_cases: lowCases,
      comments_pending_analysis: ratings.filter((row) => row.comment).length + comparisons.filter((row) => row.comment).length + free.filter((row) => row.comment).length,
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
    this.runtimeOptions = {
      projectRoot: this.projectRoot,
      runtimeRoot: path.resolve(options.chatRuntimeRoot || path.join(this.store.root, 'chat-runtime'))
    };
    this.runtime = options.runtime || null;
  }

  bootstrap() {
    const summary = summarize(this.data, this.store);
    const rated = new Set([...this.store.latest('humanized').keys()].map((key) => key.split(':')[1]));
    const compared = new Set([...this.store.latest('blind').keys()].map((key) => key.split(':')[1]));
    return {
      ok: true,
      synthetic: true,
      panel_version: 'change-003-v1',
      warning: 'Não inclua dados pessoais ou informações reais de clientes.',
      review_cases: this.data.cases.map((item) => ({ ...publicReviewCase(item), evaluated: rated.has(item.review_id) })),
      blind_cases: this.data.cases.map((item) => ({ ...publicBlindCase(item), evaluated: compared.has(item.review_id) })),
      bank: this.data.bank,
      summary
    };
  }

  findCase(reviewId) {
    const item = this.data.cases.find((candidate) => candidate.review_id === reviewId);
    if (!item) throw Object.assign(new Error('review_case_not_found'), { code: 'REVIEW_CASE_NOT_FOUND' });
    return item;
  }

  feedback(body) {
    const item = body.mode === 'free' ? null : this.findCase(String(body.review_id || ''));
    const responseHash = item ? sha256(item.turns.map((turn) => turn.humanized).join('\n')) : String(body.response_hash || '');
    const saved = this.store.record(body, {
      corpusVersion: this.data.corpus_version,
      composerVersion: this.data.composer_version,
      responseHash,
      order: item?.order
    });
    return { ok: true, saved: { review_event_id: saved.review_event_id, review_id: saved.review_id, revision: saved.revision } };
  }

  technical(mode, reviewId) {
    if (!['humanized', 'blind'].includes(mode)) throw Object.assign(new Error('technical_mode_invalid'), { code: 'TECHNICAL_MODE_INVALID' });
    if (!this.store.hasVote(mode, reviewId)) throw Object.assign(new Error('vote_required'), { code: 'VOTE_REQUIRED' });
    const item = this.findCase(reviewId);
    return {
      ok: true,
      decision: asPublicTechnical(item),
      reveal: mode === 'blind' ? { A: item.order.A, B: item.order.B } : undefined
    };
  }

  chat(message) {
    const value = String(message || '').trim();
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
    });
    const response = String(result.response?.text || '');
    return {
      ok: true,
      turn: {
        review_id: next.review_id,
        customer: value,
        response,
        response_hash: sha256(response)
      }
    };
  }

  resetChat() {
    return { ok: true, ...this.store.resetChat() };
  }

  summary() {
    return { ok: true, summary: summarize(this.data, this.store) };
  }
}

module.exports = { HomologationService, asPublicTechnical, average, summarize };
