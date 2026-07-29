'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { canonicalHash } = require('./runner');

const CRITERIA = Object.freeze(['naturalidade', 'saudacao', 'continuidade', 'compreensao', 'retomada', 'utilidade', 'confianca', 'cesar_enviaria']);

class BlindBakeoffStore {
  constructor(options = {}) {
    this.root = path.resolve(options.root);
    this.bundle = options.bundle;
    this.now = options.now || (() => new Date().toISOString());
    this.file = path.join(this.root, 'blind-votes.runtime.jsonl');
    fs.mkdirSync(this.root, { recursive: true });
  }

  case(caseId) {
    return this.bundle.public.cases.find((item) => item.case_id === caseId) || null;
  }

  rows() {
    if (!fs.existsSync(this.file)) return [];
    return fs.readFileSync(this.file, 'utf8').split(/\r?\n/u).filter(Boolean).flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
  }

  latest() {
    return new Map(this.rows().map((row) => [row.case_id, row]));
  }

  vote(input = {}) {
    const item = this.case(input.case_id);
    if (!item) throw Object.assign(new Error('BAKEOFF_CASE_NOT_FOUND'), { code: 'BAKEOFF_CASE_NOT_FOUND' });
    if (!item.options.some((option) => option.option === input.choice)) throw Object.assign(new Error('BAKEOFF_CHOICE_INVALID'), { code: 'BAKEOFF_CHOICE_INVALID' });
    const keys = Object.keys(input.criteria || {}).sort();
    if (JSON.stringify(keys) !== JSON.stringify([...CRITERIA].sort())) throw Object.assign(new Error('BAKEOFF_CRITERIA_INVALID'), { code: 'BAKEOFF_CRITERIA_INVALID' });
    if (Object.values(input.criteria).some((value) => !Number.isInteger(value) || value < 1 || value > 5)) throw Object.assign(new Error('BAKEOFF_RATING_INVALID'), { code: 'BAKEOFF_RATING_INVALID' });
    const previous = this.latest().get(input.case_id);
    const event = {
      schema_version: 'deliveryos-local-ai-blind-vote-v1',
      vote_id: `lbv_${canonicalHash(`${input.case_id}|${this.now()}|${this.rows().length}`).slice(0, 24)}`,
      case_id: input.case_id,
      choice: input.choice,
      criteria: input.criteria,
      occurred_at: this.now(),
      supersedes_vote_id: previous?.vote_id || null
    };
    fs.appendFileSync(this.file, JSON.stringify(event) + '\n', 'utf8');
    return event;
  }

  reveal(caseId) {
    const vote = this.latest().get(caseId);
    if (!vote) throw Object.assign(new Error('BAKEOFF_VOTE_REQUIRED'), { code: 'BAKEOFF_VOTE_REQUIRED' });
    const privateCase = this.bundle.private.cases.find((item) => item.case_id === caseId);
    return { case_id: caseId, vote, mapping: privateCase.mapping, candidates: privateCase.candidates };
  }

  summary() {
    const votes = [...this.latest().values()];
    const choices = Object.fromEntries(['A', 'B', 'C'].map((choice) => [choice, votes.filter((vote) => vote.choice === choice).length]));
    return {
      total_cases: this.bundle.public.total_cases,
      evaluated: votes.length,
      choices,
      human_winner: null,
      status: votes.length ? 'human_review_in_progress' : 'awaiting_human_review'
    };
  }
}

module.exports = { CRITERIA, BlindBakeoffStore };
