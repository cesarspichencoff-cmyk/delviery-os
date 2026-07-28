'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { requireSafeComment } = require('./privacy');

const FILES = Object.freeze({
  humanized: 'humanized-ratings.jsonl',
  blind: 'blind-comparisons.jsonl',
  free: 'free-chat-feedback.jsonl'
});
const RATING_TAGS = new Set(['seco', 'robotico', 'longo', 'curto_demais', 'generico', 'pouco_acolhedor', 'informacao_errada', 'pergunta_repetida', 'nao_respondeu', 'parece_mensagem_pronta', 'muito_bom']);
const FREE_TAGS = new Set(['gostei', 'seco', 'robotico', 'longo', 'pouco_acolhedor', 'informacao_errada', 'pergunta_repetida', 'nao_respondeu', 'estranho']);
const CRITERIA = Object.freeze(['naturalidade', 'acolhimento', 'clareza', 'utilidade', 'tamanho', 'confianca']);

function defaultFeedbackRoot() {
  return path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'DeliveryOS', 'human-homologation');
}

function safeJsonLines(file) {
  if (!fs.existsSync(file)) return [];
  const rows = [];
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* linha parcial é ignorada na projeção */ }
  }
  return rows;
}

function atomicWrite(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, file);
}

class FeedbackStore {
  constructor(options = {}) {
    this.root = path.resolve(options.root || defaultFeedbackRoot());
    this.now = options.now || (() => new Date().toISOString());
    this.metadata = Object.freeze({ ...(options.metadata || {}) });
    fs.mkdirSync(this.root, { recursive: true });
    this.stateFile = path.join(this.root, 'session-state.json');
    this.state = this.readState();
  }

  readState() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      return { schema_version: '1.0.0', chat_session: 1, chat_turn: 0, ...parsed };
    } catch {
      return { schema_version: '1.0.0', chat_session: 1, chat_turn: 0, updated_at: this.now(), synthetic: true };
    }
  }

  persistState() {
    this.state.updated_at = this.now();
    atomicWrite(this.stateFile, this.state);
  }

  rows(mode) {
    const name = FILES[mode];
    if (!name) return [];
    return safeJsonLines(path.join(this.root, name));
  }

  latest(mode) {
    const map = new Map();
    for (const row of this.rows(mode)) map.set(row.record_key, row);
    return map;
  }

  append(mode, record) {
    const file = path.join(this.root, FILES[mode]);
    fs.appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8');
    this.persistState();
    return record;
  }

  hasVote(mode, reviewId) {
    return this.latest(mode).has(`${mode}:${reviewId}`);
  }

  record(body, context) {
    const mode = body.mode;
    if (!FILES[mode]) throw Object.assign(new Error('feedback_mode_invalid'), { code: 'FEEDBACK_MODE_INVALID' });
    const reviewId = String(body.review_id || '');
    if (!/^(?:REV-\d{3}|CHAT-\d{4}-\d{4})$/.test(reviewId)) throw Object.assign(new Error('review_id_invalid'), { code: 'REVIEW_ID_INVALID' });
    const recordKey = `${mode}:${reviewId}`;
    const previous = this.latest(mode).get(recordKey);
    const tags = [...new Set((Array.isArray(body.tags) ? body.tags : []).map(String))];
    const allowedTags = mode === 'free' ? FREE_TAGS : RATING_TAGS;
    if (tags.some((tag) => !allowedTags.has(tag))) throw Object.assign(new Error('feedback_tag_invalid'), { code: 'FEEDBACK_TAG_INVALID' });
    const comment = requireSafeComment(body.comment);
    const base = {
      schema_version: '1.0.0',
      review_event_id: `HFB-${crypto.randomUUID()}`,
      record_key: recordKey,
      review_id: reviewId,
      mode,
      timestamp: this.now(),
      synthetic: true,
      corpus_version: context.corpusVersion,
      composer_version: context.composerVersion,
      response_hash: String(body.response_hash || context.responseHash || ''),
      tags,
      comment,
      revision: previous ? previous.revision + 1 : 1,
      supersedes_review_event_id: previous?.review_event_id || null,
      revision_reason: previous ? requireSafeComment(body.revision_reason || 'Revisão do voto') : null
    };
    if (!/^[a-f0-9]{64}$/.test(base.response_hash)) throw Object.assign(new Error('response_hash_invalid'), { code: 'RESPONSE_HASH_INVALID' });
    if (mode === 'humanized') {
      const rating = Number(body.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw Object.assign(new Error('rating_invalid'), { code: 'RATING_INVALID' });
      const criteria = {};
      for (const key of CRITERIA) {
        const value = Number(body.criteria?.[key]);
        if (!Number.isInteger(value) || value < 1 || value > 5) throw Object.assign(new Error('criteria_invalid'), { code: 'CRITERIA_INVALID' });
        criteria[key] = value;
      }
      Object.assign(base, { rating, criteria, evaluated_version: 'humanized' });
    } else if (mode === 'blind') {
      const choice = String(body.choice || '');
      if (!['A', 'B', 'equivalent', 'both_bad'].includes(choice)) throw Object.assign(new Error('blind_choice_invalid'), { code: 'BLIND_CHOICE_INVALID' });
      const winner = choice === 'A' || choice === 'B' ? context.order[choice] : choice;
      Object.assign(base, { choice, winner, blind_order: context.order });
    } else {
      Object.assign(base, { evaluated_version: 'runtime_current' });
    }
    return this.append(mode, Object.freeze(base));
  }

  nextChatTurn() {
    this.state.chat_turn += 1;
    this.persistState();
    return {
      session: this.state.chat_session,
      turn: this.state.chat_turn,
      review_id: `CHAT-${String(this.state.chat_session).padStart(4, '0')}-${String(this.state.chat_turn).padStart(4, '0')}`
    };
  }

  resetChat() {
    this.state.chat_session += 1;
    this.state.chat_turn = 0;
    this.persistState();
    return { reset: true, chat_session: this.state.chat_session };
  }

  resetReviewSession(confirmation) {
    if (confirmation !== 'RESET_SYNTHETIC_REVIEW_SESSION') throw Object.assign(new Error('confirmation_required'), { code: 'CONFIRMATION_REQUIRED' });
    this.state.review_session = (this.state.review_session || 1) + 1;
    this.persistState();
    return { reset: true, review_session: this.state.review_session };
  }

  deleteSyntheticFeedback(confirmation) {
    if (confirmation !== 'DELETE_SYNTHETIC_FEEDBACK') throw Object.assign(new Error('confirmation_required'), { code: 'CONFIRMATION_REQUIRED' });
    for (const name of Object.values(FILES)) fs.rmSync(path.join(this.root, name), { force: true });
    this.state = { schema_version: '1.0.0', chat_session: 1, chat_turn: 0, updated_at: this.now(), synthetic: true };
    this.persistState();
    return { deleted: true };
  }
}

module.exports = { CRITERIA, FILES, FREE_TAGS, FeedbackStore, RATING_TAGS, defaultFeedbackRoot, safeJsonLines };
