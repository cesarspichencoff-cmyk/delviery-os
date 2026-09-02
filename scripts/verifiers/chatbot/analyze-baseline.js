'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { sha256, canonicalJson } = require('../../../src/conversation-crm/native/deterministic');
const { normalize, questions, verifyConversation, summarize, BUREAUCRATIC } = require('./checks');

const projectRoot = path.resolve(__dirname, '..', '..', '..');
const inputFile = path.join(projectRoot, 'evals', 'human-review', 'results', 'baseline-responses-v1.json');
const outputFile = path.join(projectRoot, 'evals', 'human-review', 'results', 'baseline-metrics-v1.json');

function sentences(text) {
  return String(text || '').split(/(?<=[.!?])\s+/u).filter(Boolean);
}

function ngrams(words, size) {
  const output = [];
  for (let index = 0; index <= words.length - size; index += 1) output.push(words.slice(index, index + size).join(' '));
  return output;
}

function similarity(a, b) {
  const left = new Set(normalize(a).split(' ').filter(Boolean));
  const right = new Set(normalize(b).split(' ').filter(Boolean));
  const union = new Set([...left, ...right]);
  if (!union.size) return 1;
  return [...left].filter((word) => right.has(word)).length / union.size;
}

function frequency(values) {
  return Object.entries(values.reduce((map, item) => ({ ...map, [item]: (map[item] || 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, count }));
}

function run() {
  const baseline = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const conversations = baseline.results;
  const allTurns = conversations.flatMap((conversation) => conversation.results.map((turn, index) => ({ ...turn, case_id: conversation.case_id, category: conversation.category, turn: index + 1 })));
  const texts = allTurns.map((turn) => turn.response_text);
  const openings = texts.map((text) => normalize(text).split(' ').slice(0, 4).join(' '));
  const closings = texts.map((text) => normalize(text).split(' ').slice(-4).join(' '));
  const trigramRows = frequency(texts.flatMap((text) => ngrams(normalize(text).split(' ').filter(Boolean), 3))).slice(0, 20);
  const pairSimilarities = [];
  for (let left = 0; left < texts.length; left += 1) {
    for (let right = left + 1; right < texts.length; right += 1) {
      const score = similarity(texts[left], texts[right]);
      if (score >= 0.7) pairSimilarities.push({ left: allTurns[left].case_id, right: allTurns[right].case_id, score: Number(score.toFixed(3)) });
    }
  }
  const checks = conversations.flatMap((conversation) => verifyConversation(conversation, { projectRoot }));
  const checkSummary = summarize(checks);
  const lengths = allTurns.map((turn) => {
    const text = turn.response_text;
    const wordCount = normalize(text).split(' ').filter(Boolean).length;
    return {
      case_id: turn.case_id,
      turn: turn.turn,
      category: turn.category,
      characters: text.length,
      words: wordCount,
      sentences: sentences(text).length,
      questions: questions(text).length
    };
  });
  const byCategory = {};
  for (const row of lengths) {
    const state = byCategory[row.category] || { turns: 0, characters: 0, words: 0, sentences: 0 };
    state.turns += 1;
    state.characters += row.characters;
    state.words += row.words;
    state.sentences += row.sentences;
    byCategory[row.category] = state;
  }
  for (const state of Object.values(byCategory)) {
    state.average_characters = Number((state.characters / state.turns).toFixed(1));
    state.average_words = Number((state.words / state.turns).toFixed(1));
  }
  const bureaucracy = BUREAUCRATIC.map((phrase) => ({
    phrase,
    count: texts.filter((text) => normalize(text).includes(normalize(phrase))).length
  }));
  const useful = texts.filter((text) => /\b(?:posso|pode|vou|link|horário|endereço|pedido|reserva|fila)\b/iu.test(text)).length;
  const abrupt = texts.filter((text) => sentences(text).length <= 1 && questions(text).length === 0 && text.length < 90).length;

  const metrics = {
    schema_version: 'deliveryos-conversation-baseline-metrics-v1',
    synthetic: true,
    source_hash: baseline.canonical_hash,
    objective: {
      conversations: conversations.length,
      turns: allTurns.length,
      lengths,
      by_category: byCategory,
      repeated_openings: frequency(openings).filter((item) => item.count > 1).slice(0, 15),
      repeated_closings: frequency(closings).filter((item) => item.count > 1).slice(0, 15),
      frequent_trigrams: trigramRows,
      high_similarity_pairs: pairSimilarities.sort((a, b) => b.score - a.score).slice(0, 30),
      verifier: { total: checkSummary.total, passed: checkSummary.passed, failed: checkSummary.failed },
      verifier_failures: checks.filter((item) => item.status === 'failed')
    },
    heuristic: {
      bureaucratic_patterns: bureaucracy,
      responses_with_structural_usefulness_signal: useful,
      short_abrupt_candidates: abrupt,
      note: 'Heurísticas indicam candidatos à revisão; não provam qualidade humana.'
    },
    human_required: [
      'naturalidade da voz TATÁ',
      'acolhimento proporcional ao caso',
      'sensação de interesse genuíno',
      'adequação do ritmo e da continuidade',
      'preferência de César entre versões factual e igualmente seguras'
    ]
  };
  metrics.canonical_hash = sha256(canonicalJson(metrics));
  fs.writeFileSync(outputFile, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ conversations: conversations.length, turns: allTurns.length, verifier_failures: checkSummary.failed, hash: metrics.canonical_hash })}\n`);
}

try {
  run();
} catch (error) {
  process.stderr.write(`${error.code || error.message || 'BASELINE_ANALYSIS_FAILED'}\n`);
  process.exitCode = 1;
}
