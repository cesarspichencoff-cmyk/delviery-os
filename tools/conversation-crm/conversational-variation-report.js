#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  NativeConversationEngine,
  composeConversationalResponse,
  responseSegments,
  canonicalJson,
  sha256
} = require('../../src/conversation-crm/native');
const { loadFeatureFlags } = require('../../src/conversation-crm/native/feature-flags');
const { loadRuntimeCatalogs } = require('../../src/conversation-crm/native/catalogs/operational');
const { loadCanonicalCatalogs } = require('../../src/conversation-crm/native/catalogs/oracle');

const ROOT = path.resolve(__dirname, '..', '..');
const OUTPUT = path.join(ROOT, 'docs', 'conversation-crm', 'CONVERSATIONAL_VARIATION_REPORT.md');
const flags = loadFeatureFlags({ projectRoot: ROOT, file: 'config/conversation-crm/native-flags.simulator.json' });
const engine = new NativeConversationEngine({ flags, catalogs: loadRuntimeCatalogs() });
const scenarios = loadCanonicalCatalogs().scenarios.scenarios;

function normalized(value) {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/gu, ' ').trim();
}

function wordSet(value) {
  return new Set(normalized(value).split(' ').filter((word) => word.length > 2));
}

function jaccard(left, right) {
  const a = wordSet(left);
  const b = wordSet(right);
  const intersection = [...a].filter((value) => b.has(value)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 1;
}

function frequency(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

const responses = scenarios.map((scenario, index) => {
  const classification = engine.analyze({ content: scenario.input, context: { synthetic: true } });
  const response = composeConversationalResponse({
    classification,
    result: { status: classification.expected_result?.status || 'unknown' },
    handoff: classification.escalation === 'E0' ? null : { status: 'confirmed' },
    seed: 'TATA-SIM-V1',
    conversation: {
      conversation_id: `SIM-VARIATION-${String(index + 1).padStart(4, '0')}`,
      turn_order: 1,
      source_text: scenario.input,
      previous_responses: [],
      context: { synthetic: true }
    }
  });
  return { scenario_id: scenario.scenario_id, intent: classification.intent, text: response.text, response };
});

const openings = frequency(responses.map((item) => normalized(responseSegments(item.text).opening)));
const closings = frequency(responses.map((item) => normalized(responseSegments(item.text).closing)));
const sentences = frequency(responses.flatMap((item) => String(item.text).split(/(?<=[.!?])\s+/u).map(normalized)));
const byIntent = new Map();
for (const response of responses) {
  if (!byIntent.has(response.intent)) byIntent.set(response.intent, []);
  byIntent.get(response.intent).push(response.text);
}

const intentSimilarity = [...byIntent].map(([intent, texts]) => {
  const pairs = [];
  for (let left = 0; left < texts.length; left += 1) {
    for (let right = left + 1; right < texts.length; right += 1) pairs.push(jaccard(texts[left], texts[right]));
  }
  return { intent, responses: texts.length, approximate_similarity: pairs.length ? pairs.reduce((sum, value) => sum + value, 0) / pairs.length : 1 };
}).sort((left, right) => right.responses - left.responses || left.intent.localeCompare(right.intent));

const validationFailures = responses.filter((item) => !item.response.validation.passed);
const fallbackCount = responses.filter((item) => item.response.validation.fallback_used).length;
const dominantOpening = openings[0] || ['', 0];
const reportData = {
  seed: 'TATA-SIM-V1',
  responses: responses.length,
  validated: responses.length - validationFailures.length,
  fallbacks: fallbackCount,
  dominant_opening_count: dominantOpening[1],
  dominant_opening_share: dominantOpening[1] / responses.length,
  report_hash: sha256(canonicalJson(responses.map((item) => ({
    scenario_id: item.scenario_id,
    intent: item.intent,
    text: item.text,
    variation_key: item.response.variation_key,
    validation: item.response.validation
  }))))
};

const topRows = (entries, limit = 10) => entries.slice(0, limit).map(([value, count]) => `| ${value || '—'} | ${count} |`).join('\n');
const similarityRows = intentSimilarity.map((item) => `| ${item.intent} | ${item.responses} | ${item.approximate_similarity.toFixed(3)} |`).join('\n');
const report = `# Relatório de variação conversacional V1.3

## Execução canônica

- Seed: \`${reportData.seed}\`
- Respostas produzidas: **${reportData.responses}**
- Respostas aprovadas pelo validador: **${reportData.validated}**
- Fallbacks seguros: **${reportData.fallbacks}**
- Maior participação de uma abertura: **${(reportData.dominant_opening_share * 100).toFixed(1)}%**
- Hash determinístico: \`${reportData.report_hash}\`

O relatório usa os 200 cenários sintéticos canônicos exclusivamente como entradas externas de teste. O runtime e o compositor não importam o oráculo.

## Aberturas mais usadas

| Abertura normalizada | Uso |
|---|---:|
${topRows(openings)}

## Fechamentos mais usados

| Fechamento normalizado | Uso |
|---|---:|
${topRows(closings)}

## Frases mais usadas

| Frase normalizada | Uso |
|---|---:|
${topRows(sentences)}

## Similaridade aproximada por intenção

| Intenção | Respostas | Similaridade Jaccard média |
|---|---:|---:|
${similarityRows}

## Interpretação

- a escolha de variação é determinística por seed, conversa, intenção e estágio;
- informação simples permanece direta;
- reclamações variam a abertura sem variar fatos, ação ou autoridade;
- casos sensíveis têm menos variação de propósito;
- nenhuma resposta pode adicionar número, link ou confirmação fora da lista permitida;
- alertas de repetição são diagnósticos de desenvolvimento e não mudam a decisão operacional.

## Gate

${validationFailures.length === 0 && fallbackCount === 0 && reportData.dominant_opening_share < 0.35
    ? '**APROVADO:** 200 respostas validadas, zero fallback e nenhuma abertura excessivamente dominante.'
    : `**ATENÇÃO:** ${validationFailures.length} falhas de validação; ${fallbackCount} fallbacks; participação dominante ${(reportData.dominant_opening_share * 100).toFixed(1)}%.`}
`;

fs.writeFileSync(OUTPUT, report, 'utf8');
process.stdout.write(`${JSON.stringify(reportData)}\n`);
