'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const {
  DIRECTOR_JSON_SCHEMA,
  WRITER_JSON_SCHEMA,
  LlamaCppRuntime,
  ConversationDirector,
  emptyDirective,
  fixedGrammar,
  parseStrictJsonObject
} = require('../../apps/deliveryos-ai-node');

function runtimeFor(content, capture = null) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-structured-'));
  const runtime = new LlamaCppRuntime({
    executable: 'synthetic.exe',
    models_root: root,
    fetch: async (_url, init) => {
      if (capture) capture.payload = JSON.parse(init.body);
      return { ok: true, json: async () => ({ choices: [{ message: { content } }], usage: {} }) };
    }
  });
  runtime.process = {};
  runtime.model = 'synthetic.gguf';
  return { runtime, root };
}

function validDirective(overrides = {}) {
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

test('gramáticas fixadas correspondem aos schemas canônicos', () => {
  assert.match(fixedGrammar(DIRECTOR_JSON_SCHEMA), /dialogue-act/iu);
  assert.match(fixedGrammar(WRITER_JSON_SCHEMA), /text-kv/iu);
  assert.equal(fixedGrammar({ name: 'unknown', schema: {} }), null);
});

test('runtime envia GBNF sem combinar com response_format', async () => {
  const capture = {};
  const raw = JSON.stringify(validDirective());
  const { runtime, root } = runtimeFor(raw, capture);
  try {
    const output = await runtime.generateStructured({ messages: [], json_schema: DIRECTOR_JSON_SCHEMA });
    assert.equal(output.dialogue_act, 'continue_journey');
    assert.match(capture.payload.grammar, /root ::=/u);
    assert.equal(Object.hasOwn(capture.payload, 'response_format'), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

for (const [name, raw, code] of [
  ['JSON truncado', '{"text":"oi"', 'STRUCTURED_JSON_INVALID'],
  ['chave isolada', '{', 'STRUCTURED_JSON_INVALID'],
  ['texto antes do JSON', 'antes {"text":"oi"}', 'STRUCTURED_JSON_INVALID'],
  ['texto depois do JSON', '{"text":"oi"} depois', 'STRUCTURED_JSON_INVALID'],
  ['bloco Markdown', '```json\n{"text":"oi"}\n```', 'STRUCTURED_JSON_INVALID'],
  ['reasoning junto do JSON', 'reasoning\n{"text":"oi"}', 'STRUCTURED_JSON_INVALID'],
  ['resposta vazia', '', 'STRUCTURED_JSON_BOUNDARY_INVALID'],
  ['dois objetos', '{"text":"oi"}{"text":"tchau"}', 'STRUCTURED_JSON_INVALID'],
  ['prefixo de espaço', ' {"text":"oi"}', 'STRUCTURED_JSON_BOUNDARY_INVALID']
]) {
  test(`parsing estrito rejeita ${name}`, () => assert.throws(() => parseStrictJsonObject(raw), { code }));
}

test('parsing estrito rejeita objeto de conteúdo no lugar de string', () => {
  assert.throws(() => parseStrictJsonObject({ text: 'oi' }), { code: 'STRUCTURED_CONTENT_TYPE_INVALID' });
});

test('runtime rejeita conteúdo não textual retornado pelo adapter', async () => {
  const { runtime, root } = runtimeFor({ text: 'oi' });
  try {
    await assert.rejects(runtime.generateStructured({ messages: [], json_schema: WRITER_JSON_SCHEMA }), { code: 'LLAMA_CPP_CONTENT_TYPE_INVALID' });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('camada semântica rejeita campo ausente, adicional, enum e tipo incorreto', async () => {
  const cases = [];
  const missing = validDirective(); delete missing.customer_need; cases.push([missing, 'DIRECTOR_KEYS_INVALID']);
  cases.push([{ ...validDirective(), extra: true }, 'DIRECTOR_KEYS_INVALID']);
  cases.push([validDirective({ dialogue_act: 'invented' }), 'DIRECTOR_DIALOGUE_ACT_INVALID']);
  cases.push([validDirective({ confidence: '0.9' }), 'DIRECTOR_CONFIDENCE_INVALID']);
  cases.push([validDirective({ requested_action: { tool: 'search_tata_knowledge', arguments: 'invalid' } }), 'DIRECTOR_ACTION_INVALID']);
  for (const [generated, reason] of cases) {
    const director = new ConversationDirector({ runtime: { generateStructured: async () => generated } });
    const result = await director.direct({ message: 'sim', journey_state: { active_journey: 'reservation', collected_facts: {} } });
    assert.equal(result.source, 'deterministic_fallback');
    assert.equal(result.reason, reason);
  }
});

test('schema correto com jornada impossível cai em fallback', async () => {
  const generated = validDirective({ active_journey: 'delivery_occurrence' });
  const director = new ConversationDirector({ runtime: { generateStructured: async () => generated } });
  const result = await director.direct({ message: 'sim', journey_state: { active_journey: 'reservation', collected_facts: {} } });
  assert.equal(result.source, 'deterministic_fallback');
  assert.equal(result.reason, 'DIRECTOR_JOURNEY_STATE_CONFLICT');
  assert.equal(result.directive.active_journey, 'reservation');
});

test('pergunta já respondida não pode ser solicitada outra vez', async () => {
  const generated = validDirective({ next_required_information: 'reservation_time' });
  const director = new ConversationDirector({ runtime: { generateStructured: async () => generated } });
  const result = await director.direct({ message: 'sim', journey_state: { active_journey: 'reservation', collected_facts: { reservation_time: '20:00' } } });
  assert.equal(result.reason, 'DIRECTOR_INFORMATION_ALREADY_KNOWN');
});

test('sentinela textual não substitui null nem cria jornada', async () => {
  const generated = validDirective({ dialogue_act: 'greet', active_journey: 'none', next_required_information: null });
  const director = new ConversationDirector({ runtime: { generateStructured: async () => generated } });
  const result = await director.direct({ message: 'Oi', journey_state: { active_journey: null, collected_facts: {} } });
  assert.equal(result.source, 'deterministic_fallback');
  assert.equal(result.reason, 'DIRECTOR_JOURNEY_SENTINEL_INVALID');
  assert.equal(result.directive.active_journey, null);
});

test('movimento passivo não pode criar nem apagar jornada silenciosamente', async () => {
  const creates = new ConversationDirector({ runtime: { generateStructured: async () => validDirective({ dialogue_act: 'greet', active_journey: 'reservation', next_required_information: null }) } });
  assert.equal((await creates.direct({ message: 'Oi', journey_state: { active_journey: null, collected_facts: {} } })).reason, 'DIRECTOR_JOURNEY_UNSUPPORTED');
  const erases = new ConversationDirector({ runtime: { generateStructured: async () => validDirective({ dialogue_act: 'greet', active_journey: null, next_required_information: null }) } });
  assert.equal((await erases.direct({ message: 'Oi', journey_state: { active_journey: 'reservation', collected_facts: {} } })).reason, 'DIRECTOR_JOURNEY_STATE_CONFLICT');
});
