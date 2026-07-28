'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { scanValue } = require('./privacy');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function gitValue(projectRoot, args, fallback = 'unknown') {
  try {
    return execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8', windowsHide: true }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function timestampSlug(timestamp) {
  return String(timestamp).replace(/[:.]/g, '-');
}

function renderSummary(summary) {
  const review = summary.cesar_review;
  return [
    '# Resumo da homologação humana',
    '',
    `- Casos avaliados: ${review.evaluated}/${review.total}`,
    `- Casos pendentes: ${review.pending}`,
    `- Nota média: ${review.overall_average ?? 'não disponível'}`,
    `- Naturalidade: ${review.criteria.naturalidade ?? 'não disponível'}`,
    `- Acolhimento: ${review.criteria.acolhimento ?? 'não disponível'}`,
    `- Avaliações anteriores preservadas: ${summary.previous_review.evaluated}`,
    '',
    'Este resumo não aprova automaticamente o chatbot. A decisão final pertence a César.',
    ''
  ].join('\n');
}

function renderCases(title, rows, predicate) {
  const selected = rows.filter(predicate);
  return [
    `# ${title}`,
    '',
    selected.length ? selected.map((row) => `- ${row.review_id} · nota ${row.rating}`).join('\n') : 'Nenhum caso.',
    ''
  ].join('\n');
}

function ensurePrivateFeedback(rows) {
  const findings = scanValue(rows);
  if (findings.length) {
    const error = new Error('export_privacy_check_failed');
    error.code = 'EXPORT_PRIVACY_CHECK_FAILED';
    error.finding_types = [...new Set(findings.flatMap((item) => item.finding_types))];
    throw error;
  }
}

function exportReview(options) {
  const { projectRoot, outputRoot, data, store, summary, now = () => new Date().toISOString() } = options;
  const timestamp = now();
  const packageName = `chatbot-refined-rehomologation-${timestampSlug(timestamp)}`;
  const packageRoot = path.join(outputRoot, packageName);
  if (fs.existsSync(packageRoot)) {
    const error = new Error('export_package_already_exists');
    error.code = 'EXPORT_PACKAGE_ALREADY_EXISTS';
    throw error;
  }
  const previousRatings = [...store.latest('humanized').values()];
  const ratings = [...store.latest('refined').values()];
  const comparisons = [...store.latest('blind').values()];
  const free = [...store.latest('free').values()];
  ensurePrivateFeedback({ previousRatings, ratings, comparisons, free });

  const git = {
    branch: gitValue(projectRoot, ['branch', '--show-current']),
    head: gitValue(projectRoot, ['rev-parse', 'HEAD'])
  };
  const files = {
    'README.md': [
      '# Pacote de avaliação humana',
      '',
      'Pacote sintético exportado pelo painel local da Mudança 004.',
      `Branch: ${git.branch}`,
      `HEAD: ${git.head}`,
      `Data: ${timestamp}`,
      '',
      'Não contém mensagens brutas do Atendimento Livre nem dados pessoais.',
      ''
    ].join('\n'),
    'HUMAN_REVIEW_SUMMARY.md': renderSummary(summary),
    'PREVIOUS_HUMANIZED_RATINGS.json': `${JSON.stringify(previousRatings, null, 2)}\n`,
    'REFINED_RATINGS_V2.json': `${JSON.stringify(ratings, null, 2)}\n`,
    'BLIND_COMPARISONS.json': `${JSON.stringify(comparisons, null, 2)}\n`,
    'FREE_CHAT_FEEDBACK.json': `${JSON.stringify(free, null, 2)}\n`,
    'FAILED_CASES.md': renderCases('Casos com nota 1 ou 2', ratings, (row) => row.rating <= 2),
    'APPROVED_CASES.md': renderCases('Casos com nota 4 ou 5', ratings, (row) => row.rating >= 4)
  };
  const preManifestFindings = scanValue(files);
  if (preManifestFindings.length) {
    const error = new Error('export_privacy_check_failed');
    error.code = 'EXPORT_PRIVACY_CHECK_FAILED';
    error.finding_types = [...new Set(preManifestFindings.flatMap((item) => item.finding_types))];
    throw error;
  }

  fs.mkdirSync(packageRoot, { recursive: true });
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(packageRoot, name), content, 'utf8');
  const manifest = {
    schema_version: '2.0.0',
    synthetic: true,
    exported_at: timestamp,
    branch: git.branch,
    head: git.head,
    corpus_version: data.corpus_version,
    composer_version: data.composer_version,
    hashes: data.hashes,
    counts: {
      previous_ratings: previousRatings.length,
      refined_ratings: ratings.length,
      comparisons: comparisons.length,
      free_chat_feedback: free.length
    },
    privacy_scan: { passed: true, findings: 0 },
    files: Object.entries(files).map(([name, content]) => ({ name, sha256: sha256(content) }))
  };
  fs.writeFileSync(path.join(packageRoot, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { packageName, packageRoot, manifest };
}

module.exports = { ensurePrivateFeedback, exportReview, gitValue, renderCases, renderSummary, timestampSlug };
