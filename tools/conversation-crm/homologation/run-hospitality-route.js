#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const catalog = require('./hospitality-conversations.v1.json');
const { createNativeServer } = require('../native-server');

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/gu, ' ').trim();
}

function contextChecks(expected, context) {
  const checks = [];
  const check = (name, passed, actual) => checks.push({ name, passed, actual });
  if (expected.occasion) check('occasion', context.occasion === expected.occasion, context.occasion);
  if (expected.channel) check('channel', context.channel === expected.channel, context.channel);
  if (expected.number_of_people) check('number_of_people', context.number_of_people === expected.number_of_people, context.number_of_people);
  if (expected.desired_experience) check('desired_experience', context.desired_experience === expected.desired_experience, context.desired_experience);
  if (expected.budget_maximum_brl) check('budget', context.budget?.maximum_brl === expected.budget_maximum_brl, context.budget);
  if (expected.preferred_ingredient) check('preferred_ingredient', context.preferred_ingredients.includes(expected.preferred_ingredient), context.preferred_ingredients);
  if (expected.preparation) check('preparation', context.preparation_preferences.includes(expected.preparation), context.preparation_preferences);
  if (expected.dietary_restriction) check('dietary_restriction', context.dietary_restrictions.includes(expected.dietary_restriction), context.dietary_restrictions);
  if (expected.allergy) check('allergy', context.allergies.includes(expected.allergy), context.allergies);
  return checks;
}

async function post(baseUrl, route, body) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  const value = await response.json();
  if (!response.ok || value.ok === false) throw new Error(value.error_code || `HTTP_${response.status}`);
  return value;
}

async function run(baseUrl) {
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/u.test(baseUrl)) throw new Error('loopback_url_required');
  const conversations = [];
  let totalTurns = 0;
  for (const definition of catalog.cases) {
    await post(baseUrl, '/api/homologation/chat/reset', {});
    const turns = [];
    const previousQuestions = new Set();
    for (const message of definition.turns) {
      const result = await post(baseUrl, '/api/homologation/chat', { message });
      const response = String(result.turn.response || '');
      const responseWithoutUrls = response.replace(/https?:\/\/\S+/giu, ' ');
      const questions = responseWithoutUrls.split(/(?<=[?])\s+/u).filter((part) => part.includes('?')).map(normalize);
      turns.push({
        customer: message,
        response,
        response_path: result.turn.diagnostic.response_path,
        fallback_reason: result.turn.diagnostic.fallback_reason,
        question_count: (responseWithoutUrls.match(/\?/gu) || []).length,
        repeated_question: questions.some((question) => previousQuestions.has(question)),
        hospitality_context: result.turn.diagnostic.hospitality_context
      });
      questions.forEach((question) => previousQuestions.add(question));
      totalTurns += 1;
    }
    const finalContext = turns.at(-1).hospitality_context;
    conversations.push({
      case_id: definition.case_id,
      title: definition.title,
      turns,
      context_checks: contextChecks(definition.expected, finalContext)
    });
  }
  const flatTurns = conversations.flatMap((item) => item.turns);
  const allChecks = conversations.flatMap((item) => item.context_checks);
  const generic = /(?:ainda n[aã]o tenho uma confirma[cç][aã]o segura para concluir esse ponto|voc[eê] pode me contar se a d[uú]vida [eé] sobre)/iu;
  const internal = /\b(?:pattern engine|writer|fallback|capability_id|scenario_id|confidence|candidato|dado sint[eé]tico)\b/iu;
  const metrics = {
    conversations: conversations.length,
    turns: totalTurns,
    errors: 0,
    generic_fallbacks: flatTurns.filter((item) => generic.test(item.response)).length,
    internal_language: flatTurns.filter((item) => internal.test(item.response)).length,
    one_question_violations: flatTurns.filter((item) => item.question_count > 1).length,
    repeated_questions: flatTurns.filter((item) => item.repeated_question).length,
    context_checks: allChecks.length,
    context_checks_passed: allChecks.filter((item) => item.passed).length,
    context_preservation_percent: allChecks.length ? Math.round((allChecks.filter((item) => item.passed).length / allChecks.length) * 10000) / 100 : 100
  };
  return {
    schema_version: 'deliveryos-hospitality-route-evidence-v1',
    generated_at: new Date().toISOString(),
    base_url: baseUrl,
    synthetic: true,
    external_cost_brl: 0,
    metrics,
    gate_passed: metrics.conversations === 20 && metrics.turns >= 80
      && metrics.generic_fallbacks === 0 && metrics.internal_language === 0
      && metrics.one_question_violations === 0 && metrics.repeated_questions === 0
      && metrics.context_preservation_percent >= 98,
    conversations
  };
}

async function main() {
  const args = process.argv.slice(2).filter((value) => value !== '--self-host');
  const selfHost = process.argv.includes('--self-host');
  const baseUrl = args[0] || 'http://127.0.0.1:4179';
  const output = args[1] ? path.resolve(args[1]) : null;
  let server = null;
  let runtimeRoot = null;
  if (selfHost) {
    const url = new URL(baseUrl);
    if (url.hostname !== '127.0.0.1' || Number(url.port) !== 4179) throw new Error('self_host_requires_127_0_0_1_4179');
    runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-hospitality-route-'));
    server = createNativeServer({
      projectRoot: path.resolve(__dirname, '..', '..', '..'),
      runtimeRoot: path.join(runtimeRoot, 'runtime'),
      chatRuntimeRoot: path.join(runtimeRoot, 'chat'),
      feedbackRoot: path.join(runtimeRoot, 'feedback'),
      menuReviewRoot: path.join(runtimeRoot, 'menu-review'),
      exportRoot: path.join(runtimeRoot, 'export'),
      enableLocalWriter: false
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(4179, '127.0.0.1', resolve);
    });
  }
  let evidence;
  try {
    evidence = await run(baseUrl);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (runtimeRoot) fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
  const json = `${JSON.stringify(evidence, null, 2)}\n`;
  if (output) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, json, 'utf8');
  }
  process.stdout.write(`${JSON.stringify({ gate_passed: evidence.gate_passed, metrics: evidence.metrics })}\n`);
  if (!evidence.gate_passed) process.exitCode = 1;
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

module.exports = { contextChecks, run };

