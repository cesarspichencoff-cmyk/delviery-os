'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DIRECTOR_KEYS,
  DIRECTOR_JSON_SCHEMA,
  validateDirectorOutput,
  partySize,
  emptyDirective,
  deterministicDirector,
  buildDirectorPrompt,
  ConversationDirector,
  DialogueToolRouter,
  ALLOWED_DIALOGUE_TOOLS,
  initialJourneyState,
  applyDirective,
  applyActionResult,
  sanitizeFacts,
  MemoryJourneyStore,
  JsonlJourneyStore
} = require('../../apps/deliveryos-ai-node');

function directive(overrides = {}) {
  return emptyDirective({
    dialogue_act: 'continue_journey',
    social_act: 'acknowledge',
    active_journey: 'reservation',
    customer_need: 'continuar reserva',
    next_required_information: 'reservation_time',
    confidence: 0.9,
    ...overrides
  });
}

test('contrato do Director exige exatamente os quatorze campos', () => {
  const value = directive();
  assert.deepEqual(Object.keys(value).sort(), [...DIRECTOR_KEYS].sort());
  assert.equal(validateDirectorOutput(value).accepted, true);
  assert.equal(DIRECTOR_JSON_SCHEMA.strict, true);
  assert.equal(DIRECTOR_JSON_SCHEMA.schema.additionalProperties, false);
});

test('campo ausente ou extra invalida saída inteira', () => {
  const missing = directive();
  delete missing.customer_need;
  assert.equal(validateDirectorOutput(missing).reason, 'DIRECTOR_KEYS_INVALID');
  const extra = { ...directive(), answer: 'não permitido' };
  assert.equal(validateDirectorOutput(extra).reason, 'DIRECTOR_KEYS_INVALID');
});

test('ação fora da allowlist é recusada antes de qualquer execução', () => {
  const value = directive({ requested_action: { tool: 'shell', arguments: {} } });
  assert.equal(validateDirectorOutput(value).reason, 'DIRECTOR_ACTION_INVALID');
});

test('reasoning e chain of thought não cabem nos mapas de fatos', () => {
  assert.equal(validateDirectorOutput(directive({ facts_added: { reasoning: 'segredo' } })).reason, 'DIRECTOR_FACTS_INVALID');
  assert.equal(validateDirectorOutput(directive({ facts_corrected: { chain_of_thought: 'segredo' } })).reason, 'DIRECTOR_FACTS_INVALID');
});

test('prompt do Director pede classificação, não resposta final', () => {
  const prompt = buildDirectorPrompt({ message: 'Oi', journey_state: initialJourneyState('conversation') });
  assert.equal(prompt.json_schema.name, 'deliveryos_conversation_director_v1');
  assert.match(prompt.messages[0].content, /sem escrever a resposta/iu);
  assert.match(prompt.messages[0].content, /Não exponha raciocínio/iu);
});

test('saída válida do modelo é aceita sem reinterpretação', async () => {
  const generated = directive({ dialogue_act: 'start_journey', facts_added: { party_size: 4 } });
  const director = new ConversationDirector({ runtime: { generateStructured: async () => generated } });
  const result = await director.direct({ message: 'Quero reservar para quatro' });
  assert.equal(result.source, 'local_model');
  assert.strictEqual(result.directive, generated);
});

test('Director encaminha seed explícita para reprodução', async () => {
  let request;
  const generated = directive({ dialogue_act: 'start_journey', facts_added: { party_size: 4 } });
  const director = new ConversationDirector({ runtime: { generateStructured: async (input) => { request = input; return generated; } } });
  const result = await director.direct({ message: 'Quero reservar para quatro' }, { seed: 20260729 });
  assert.equal(result.source, 'local_model');
  assert.equal(request.seed, 20260729);
});

test('JSON inválido aciona controlador determinístico', async () => {
  const director = new ConversationDirector({ runtime: { generateStructured: async () => ({ dialogue_act: 'greet' }) } });
  const result = await director.direct({ message: 'Oi' });
  assert.equal(result.source, 'deterministic_fallback');
  assert.equal(result.reason, 'DIRECTOR_KEYS_INVALID');
  assert.equal(result.directive.dialogue_act, 'greet');
});

test('falha do runtime aciona fallback sem interromper conversa', async () => {
  const director = new ConversationDirector({
    runtime: { generateStructured: async () => { throw Object.assign(new Error('offline'), { code: 'MODEL_OFFLINE' }); } }
  });
  const result = await director.direct({ message: 'Quero reservar' });
  assert.equal(result.source, 'deterministic_fallback');
  assert.equal(result.reason, 'MODEL_OFFLINE');
  assert.equal(result.directive.active_journey, 'reservation');
});

test('saudação isolada recebe movimento social correto', () => {
  const result = deterministicDirector({ message: 'Boa noite!' });
  assert.equal(result.dialogue_act, 'greet');
  assert.equal(result.social_act, 'return_greeting');
  assert.equal(result.active_journey, null);
});

test('saudação no meio da jornada não apaga jornada ativa', () => {
  const state = { ...initialJourneyState('conversation'), active_journey: 'reservation', pending_question: 'reservation_time' };
  const result = deterministicDirector({ message: 'Oi', journey_state: state });
  const next = applyDirective(state, result);
  assert.equal(next.active_journey, 'reservation');
  assert.equal(next.pending_question, 'reservation_time');
});

test('saudação com pedido inicia jornada em vez de ficar só no social', () => {
  const result = deterministicDirector({ message: 'Oi, quero reservar uma mesa para quatro.' });
  assert.equal(result.dialogue_act, 'start_journey');
  assert.equal(result.social_act, 'return_greeting');
  assert.equal(result.active_journey, 'reservation');
  assert.equal(result.facts_added.party_size, 4);
});

test('quantidade distingue pessoas de outros números no fallback', () => {
  assert.equal(partySize('mesa para 9'), 9);
  assert.equal(partySize('somos dez'), 10);
  assert.equal(partySize('chegamos em dez minutos'), null);
  assert.equal(partySize('pedido 1234'), null);
});

test('resposta curta continua a jornada sem reiniciar', () => {
  const state = { ...initialJourneyState('conversation'), active_journey: 'reservation', pending_question: 'reservation_time' };
  const result = deterministicDirector({ message: 'sim', journey_state: state });
  assert.equal(result.dialogue_act, 'continue_journey');
  assert.equal(result.active_journey, 'reservation');
});

test('correção atualiza o fato certo', () => {
  const state = {
    ...initialJourneyState('conversation'),
    active_journey: 'reservation',
    pending_question: 'reservation_time',
    collected_facts: { party_size: 7 }
  };
  const result = deterministicDirector({ message: 'Éramos sete, agora somos dez.', journey_state: state });
  const next = applyDirective(state, result);
  assert.equal(result.dialogue_act, 'correct_information');
  assert.equal(next.collected_facts.party_size, 10);
  assert.equal(next.corrections.length, 1);
});

test('pergunta lateral sobre valet preserva e retoma reserva', () => {
  const state = {
    ...initialJourneyState('conversation'),
    active_journey: 'reservation',
    pending_question: 'reservation_time',
    collected_facts: { party_size: 4 }
  };
  const result = deterministicDirector({ message: 'Antes, vocês têm valet?', journey_state: state });
  const next = applyDirective(state, result);
  assert.equal(result.dialogue_act, 'answer_side_question');
  assert.deepEqual(result.knowledge_queries, ['valet_information']);
  assert.equal(result.return_to_previous_topic, true);
  assert.equal(next.active_journey, 'reservation');
  assert.equal(next.pending_question, 'reservation_time');
  assert.equal(next.side_questions.length, 1);
});

test('referência vaga pede esclarecimento em vez de inventar', () => {
  const result = deterministicDirector({ message: 'Pode ser esse.' });
  assert.equal(result.dialogue_act, 'clarify_reference');
  assert.equal(result.next_required_information, 'reference_clarification');
  assert.ok(result.confidence < 0.5);
});

test('despedida e cancelamento são movimentos distintos', () => {
  assert.equal(deterministicDirector({ message: 'Obrigado, tchau' }).dialogue_act, 'close');
  assert.equal(deterministicDirector({ message: 'Deixa pra lá' }).dialogue_act, 'cancel');
});

test('switch topic suspende jornada atual sem perder fatos', () => {
  const state = {
    ...initialJourneyState('conversation'),
    active_journey: 'reservation',
    active_step: 'reservation_time',
    pending_question: 'reservation_time',
    collected_facts: { party_size: 4 }
  };
  const next = applyDirective(state, directive({
    dialogue_act: 'switch_topic',
    active_journey: 'delivery_occurrence',
    topic_changed: true,
    next_required_information: 'order_channel'
  }));
  assert.equal(next.active_journey, 'delivery_occurrence');
  assert.equal(next.suspended_journeys[0].journey_id, 'reservation');
  assert.equal(next.suspended_journeys[0].collected_facts.party_size, 4);
});

test('resume restaura jornada suspensa e pergunta pendente', () => {
  const state = {
    ...initialJourneyState('conversation'),
    active_journey: 'delivery_occurrence',
    suspended_journeys: [{
      journey_id: 'reservation',
      active_step: 'reservation_time',
      pending_question: 'reservation_time',
      collected_facts: { party_size: 4 }
    }]
  };
  const next = applyDirective(state, directive({
    dialogue_act: 'resume_journey',
    active_journey: 'reservation',
    return_to_previous_topic: true,
    next_required_information: null
  }));
  assert.equal(next.active_journey, 'reservation');
  assert.equal(next.pending_question, 'reservation_time');
  assert.equal(next.collected_facts.party_size, 4);
  assert.equal(next.suspended_journeys.length, 0);
});

test('cancelamento limpa aptidão conversacional atual sem apagar histórico', () => {
  const state = {
    ...initialJourneyState('conversation'),
    active_journey: 'reservation',
    collected_facts: { party_size: 4 },
    pending_question: 'reservation_time'
  };
  const next = applyDirective(state, directive({ dialogue_act: 'cancel', active_journey: 'reservation', next_required_information: null }));
  assert.equal(next.active_journey, null);
  assert.equal(next.pending_question, null);
  assert.equal(next.collected_facts.party_size, 4);
});

test('ação só vira bem-sucedida quando o DeliveryOS confirma', () => {
  const state = initialJourneyState('conversation');
  assert.strictEqual(applyActionResult(state, { confirmed: false, action: 'reserve' }), state);
  const next = applyActionResult(state, { confirmed: true, action: 'prepare_handoff', result_id: 'synthetic-result' });
  assert.equal(next.last_successful_action.action, 'prepare_handoff');
});

test('store em memória deduplica por conversa e turno', () => {
  const store = new MemoryJourneyStore({ clock: () => Date.parse('2026-07-28T12:00:00Z') });
  const input = { conversation_id: 'conversation-1', turn_id: 'turn-1', directive: directive({ dialogue_act: 'start_journey' }) };
  assert.equal(store.append(input).appended, true);
  assert.equal(store.append(input).appended, false);
  assert.equal(store.eventsFor('conversation-1').length, 1);
  assert.equal(store.reconstruct('conversation-1').active_journey, 'reservation');
});

test('store JSONL restaura projeção e tolera linha parcial', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-journey-replay-'));
  const file = path.join(root, 'journey.runtime.jsonl');
  const store = new JsonlJourneyStore({ file, clock: () => Date.parse('2026-07-28T12:00:00Z') });
  store.append({ conversation_id: 'conversation-1', turn_id: 'turn-1', directive: directive({ dialogue_act: 'start_journey', facts_added: { party_size: 4 } }) });
  store.append({ conversation_id: 'conversation-1', turn_id: 'turn-2', directive: directive({ dialogue_act: 'continue_journey', facts_added: { reservation_time: '20:00' }, next_required_information: null }) });
  fs.appendFileSync(file, '{"partial":');
  const replayed = new JsonlJourneyStore({ file });
  const state = replayed.reconstruct('conversation-1');
  assert.equal(state.collected_facts.party_size, 4);
  assert.equal(state.collected_facts.reservation_time, '20:00');
  assert.equal(replayed.eventsFor('conversation-1').length, 2);
  fs.rmSync(root, { recursive: true, force: true });
});

test('PII em chave ou valor não entra no estado de jornada', () => {
  const marker = 'privacy-marker@example.invalid';
  const facts = sanitizeFacts({
    party_size: 4,
    telefone: 'PII-PHONE-UNIQUE',
    note: marker,
    safe_reference: 'SIM-REF-1'
  });
  assert.deepEqual(facts, { party_size: 4, safe_reference: 'SIM-REF-1' });
  const store = new MemoryJourneyStore();
  store.append({
    conversation_id: 'conversation-privacy',
    turn_id: 'turn-privacy',
    directive: directive({ facts_added: { party_size: 4, email: marker } })
  });
  assert.equal(JSON.stringify(store.events).includes(marker), false);
});

test('router executa apenas as oito ferramentas allowlisted', async () => {
  const calls = [];
  const handlers = Object.fromEntries(ALLOWED_DIALOGUE_TOOLS.map((tool) => [tool, async (args) => { calls.push({ tool, args }); return { ok: true }; }]));
  const router = new DialogueToolRouter({ handlers });
  for (const tool of ALLOWED_DIALOGUE_TOOLS) await router.execute({ tool, arguments: { synthetic: true } });
  assert.equal(calls.length, 8);
  await assert.rejects(router.execute({ tool: 'filesystem', arguments: {} }), { code: 'DIALOGUE_TOOL_FORBIDDEN' });
  await assert.rejects(new DialogueToolRouter().execute({ tool: 'search_tata_knowledge', arguments: {} }), { code: 'DIALOGUE_TOOL_UNAVAILABLE' });
});

test('exemplo valet mantém R$45 no conhecimento e só solicita consulta ao Director', () => {
  const publicInfo = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../src/conversation-crm/native/catalogs/TATA_OPERATIONAL_PUBLIC_INFO_V1.json'), 'utf8'));
  assert.equal(publicInfo.valet.fee_brl, 45);
  const state = {
    ...initialJourneyState('conversation-valet'),
    active_journey: 'reservation',
    pending_question: 'reservation_time',
    collected_facts: { party_size: 4, reservation_day: 'tomorrow' }
  };
  const movement = deterministicDirector({ message: 'Antes, vocês têm valet?', journey_state: state });
  assert.equal(movement.question_to_answer, 'valet_information');
  assert.equal(movement.next_required_information, 'reservation_time');
  assert.equal(Object.values(movement.facts_added).includes(45), false);
});

test('interrupção explícita suspende jornada sem apagar seus dados', () => {
  const state = {
    ...initialJourneyState('conversation'),
    active_journey: 'reservation',
    pending_question: 'reservation_time',
    collected_facts: { party_size: 4 }
  };
  const next = applyDirective(state, directive({ dialogue_act: 'suspend_journey', active_journey: 'reservation', next_required_information: null }));
  assert.equal(next.active_journey, null);
  assert.equal(next.suspended_journeys[0].collected_facts.party_size, 4);
});

test('repeat preserva jornada, fato e pergunta pendente', () => {
  const state = {
    ...initialJourneyState('conversation'),
    active_journey: 'reservation',
    pending_question: 'reservation_time',
    collected_facts: { party_size: 4 }
  };
  const next = applyDirective(state, directive({ dialogue_act: 'repeat', next_required_information: null }));
  assert.equal(next.active_journey, 'reservation');
  assert.equal(next.pending_question, 'reservation_time');
  assert.equal(next.collected_facts.party_size, 4);
});

test('nova necessidade reabre conversa encerrada como nova jornada', () => {
  const closed = applyDirective(initialJourneyState('conversation'), directive({ dialogue_act: 'close', active_journey: null, next_required_information: null }));
  const movement = deterministicDirector({ message: 'Voltei, quero reservar para quatro.', journey_state: closed });
  const reopened = applyDirective(closed, movement);
  assert.equal(reopened.active_journey, 'reservation');
  assert.equal(reopened.collected_facts.party_size, 4);
});
