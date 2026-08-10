'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { PLAN_SCHEMA, validatePlan, buildBlindPlannerPacket } = require('../../tools/conversation-crm/cognitive-authority/b2/contract');
const { approvePlan } = require('../../tools/conversation-crm/cognitive-authority/b2/authority');
const { DeterministicB2Writer, GemmaB2Writer, toWriterInput, validateWriterText } = require('../../tools/conversation-crm/cognitive-authority/b2/writer');
const { B2Pipeline } = require('../../tools/conversation-crm/cognitive-authority/b2/pipeline');
const { scorePlan, summarize } = require('../../tools/conversation-crm/cognitive-authority/b2/evaluator');

function plan(overrides = {}) {
  return {
    relation_to_history: 'CONTINUE',
    conversational_move: 'EXPAND',
    tool_requirement: 'CATALOG_SEARCH',
    user_goal: 'ver outras opções de sushi',
    what_changed: 'a pessoa pediu mais alternativas',
    repair: { required: false, acknowledgement: null },
    reference: { required: true, status: 'RESOLVED', target: 'alternativas além das opções anteriores' },
    safety_priority: 'NONE',
    next_best_step: 'buscar opções adicionais autorizadas sem repetir as anteriores',
    ...overrides
  };
}

test('Contract V2 separa compreensão, ferramenta, repair, referência e safety sem texto final', () => {
  assert.equal(PLAN_SCHEMA.required.includes('response_text'), false);
  assert.equal(validatePlan(plan()).accepted, true);
  assert.equal(validatePlan({ ...plan(), response_text: 'texto indevido' }).reason, 'B2_PLAN_KEYS_INVALID');
});

test('packet cego contém somente contexto autorizado e não recebe oracle ou gold', () => {
  const packet = buildBlindPlannerPacket({ current_message: 'tem mais opções?', oracle: { hidden: true }, expected: 'EXPAND' });
  const text = JSON.stringify(packet);
  assert.equal(text.includes('oracle'), false);
  assert.equal(text.includes('expected'), false);
  assert.equal(packet.current_message, 'tem mais opções?');
});

test('autoridade exige ferramenta antes de publicar fato', () => {
  const pending = approvePlan(plan(), {});
  assert.equal(pending.accepted, true);
  assert.equal(pending.status, 'NEEDS_TOOL');
  assert.deepEqual(pending.response_plan.approved_facts, []);
  const approved = approvePlan(plan(), { tool_results: { CATALOG_SEARCH: { facts: [{ field: 'option', value: 'Opção sintética autorizada' }] } } });
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.response_plan.approved_facts[0].value, 'Opção sintética autorizada');
});

test('autoridade bloqueia afirmação factual sem evidência', () => {
  const unsafe = plan({ tool_requirement: 'NONE', reference: { required: false, status: 'NOT_REQUIRED', target: null }, next_best_step: 'afirmar que custa R$ 10' });
  assert.equal(approvePlan(unsafe, {}).reason, 'B2_UNSUPPORTED_FACT_IN_PLAN');
});

test('referência sem contexto e sem ferramenta vira clarificação segura', () => {
  const unresolved = plan({
    conversational_move: 'REPAIR', tool_requirement: 'NONE',
    repair: { required: true, acknowledgement: 'Eu entendi errado.' },
    reference: { required: true, status: 'NEEDS_CONTEXT_LOOKUP', target: 'pergunta anterior' }
  });
  const output = approvePlan(unresolved, { clarification_question: 'Qual era o item da sua pergunta?' });
  assert.equal(output.status, 'NEEDS_CLARIFICATION');
  assert.equal(output.response_plan.required_question, 'Qual era o item da sua pergunta?');
});

test('safety urgente exige diretiva determinística e Writer não pode alterá-la', async () => {
  const urgent = plan({
    conversational_move: 'ANSWER', tool_requirement: 'SAFETY_GATE', safety_priority: 'URGENT',
    user_goal: 'obter ajuda imediata', what_changed: 'surgiu dificuldade para respirar',
    reference: { required: true, status: 'RESOLVED', target: 'a pessoa mencionada anteriormente' },
    next_best_step: 'interromper o fluxo comercial e seguir a orientação de emergência autorizada'
  });
  assert.equal(approvePlan(urgent, {}).reason, 'B2_SAFETY_DIRECTIVE_MISSING');
  const authorized = approvePlan(urgent, { safety_directive: 'Procure atendimento de emergência imediatamente.' });
  const output = await new DeterministicB2Writer().write(authorized.response_plan);
  assert.equal(output.text, 'Procure atendimento de emergência imediatamente.');
  assert.equal(validateWriterText('Pode continuar escolhendo pratos.', authorized.response_plan).accepted, false);
});

test('pipeline mantém Planner, autoridade e Writer como etapas distintas', async () => {
  const observed = [];
  const pipeline = new B2Pipeline({
    planner: { async plan(packet) { observed.push(['planner', packet]); return { accepted: true, plan: plan() }; } },
    authority: { approve(value, context) { observed.push(['authority', context]); return approvePlan(value, context); } },
    writer: { async write(value) { observed.push(['writer', value]); return new DeterministicB2Writer().write(value); } }
  });
  const output = await pipeline.execute({ planner_packet: { current_message: 'outras?' }, authority_context: { tool_results: { CATALOG_SEARCH: { facts: [{ field: 'option', value: 'Alternativa Um' }] } } } });
  assert.equal(output.accepted, true);
  assert.deepEqual(observed.map(([stage]) => stage), ['planner', 'authority', 'writer']);
  assert.equal(output.response.includes('Alternativa Um'), true);
});

test('Gemma recebe somente o Response Plan aprovado e não reinterpreta o transcript', async () => {
  let received;
  const localWriter = { async ensureReady() { return { async write(input) { received = input; return { accepted: true, output: { text: 'Posso buscar outras opções para você.' } }; } }; } };
  const authorized = approvePlan(plan(), { prohibited_claims: ['preço confirmado'] });
  const input = toWriterInput(authorized.response_plan);
  assert.equal(Object.hasOwn(input, 'transcript'), false);
  const output = await new GemmaB2Writer({ localWriter }).write(authorized.response_plan);
  assert.equal(output.accepted, true);
  assert.deepEqual(received, input);
  assert.equal(received.prohibited_claims.includes('preço confirmado'), true);
});

test('post-validation bloqueia disponibilidade sem fato e linguagem interna', () => {
  const authorized = approvePlan(plan(), {}).response_plan;
  assert.equal(validateWriterText('As opções estão disponíveis.', authorized).reason, 'B2_WRITER_UNSUPPORTED_AVAILABILITY');
  assert.equal(validateWriterText('A fonte sintética confirma a fixture.', authorized).reason, 'B2_WRITER_INTERNAL_LANGUAGE');
});

test('Writer degradado cai para fallback seguro sem alterar o Planner', async () => {
  const frozen = plan();
  const pipeline = new B2Pipeline({
    planner: { async plan() { return { accepted: true, plan: frozen }; } },
    writer: { async write() { return { accepted: false, reason: 'B2_WRITER_UNSUPPORTED_AVAILABILITY' }; } }
  });
  const output = await pipeline.execute({ planner_packet: {}, authority_context: {} });
  assert.equal(output.accepted, true);
  assert.equal(output.writer_source, 'deterministic_b2_writer');
  assert.equal(output.writer_limit, 'B2_WRITER_UNSUPPORTED_AVAILABILITY');
  assert.deepEqual(output.plan, frozen);
});

test('evaluator fica vermelho em controle negativo sem safety', () => {
  const oracle = { acceptable_equivalence_set: {
    relation_to_history: ['CONTINUE'], conversational_move: ['ANSWER'], tool_requirement: ['SAFETY_GATE'],
    repair_required: [false], reference_resolution: ['RESOLVED'], safety_priority: ['URGENT']
  } };
  const unsafe = plan({ conversational_move: 'ANSWER', tool_requirement: 'SAFETY_GATE' });
  const score = scorePlan(unsafe, oracle, {
    hard_semantic: false, repair: true, reference: true, safety: false,
    catastrophic: true, reason: 'urgência não preservada'
  });
  assert.equal(score.hard_semantic, false);
  assert.equal(score.catastrophic, true);
  assert.equal(summarize([{ score }]).passed, false);
});

test('implementação B2 não contém frases dos casos golden nem dependência de oracle', () => {
  const root = path.resolve(__dirname, '..', '..', 'tools', 'conversation-crm', 'cognitive-authority', 'b2');
  const source = fs.readdirSync(root).filter((name) => name.endsWith('.js')).map((name) => fs.readFileSync(path.join(root, name), 'utf8').toLowerCase()).join('\n');
  for (const phrase of ['tem mais opções', 'por que só essas', 'essa segunda é crua', 'quero reservar para 7']) assert.equal(source.includes(phrase), false, phrase);
  assert.equal(source.includes('oracle_v2'), false);
});
