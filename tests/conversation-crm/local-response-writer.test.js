'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  WRITER_INPUT_KEYS,
  WRITER_JSON_SCHEMA,
  validateWriterInput,
  validateWriterOutput,
  buildWriterPrompt,
  ResponseWriter
} = require('../../apps/deliveryos-ai-node');
const { sanitizeAiContext } = require('../../src/conversation-crm/ai-bridge/privacy');
const { AiResultValidator } = require('../../src/conversation-crm/ai-bridge/result-validator');
const { payloadHash } = require('../../src/conversation-crm/ai-bridge/contracts');
const { createLocalAiResultValidators } = require('../../src/conversation-crm/local-ai/result-validators');
const {
  buildWriterInput,
  validateLocalWriterCandidate,
  LocalAiResponseAdapter
} = require('../../src/conversation-crm/local-ai/writer-adapter');

function writerInput(overrides = {}) {
  return {
    direct_response: [],
    authorized_facts: [{ field: 'item_name', value: 'refrigerante' }],
    selected_knowledge: [],
    direction: ['Oriente pelo canal do pedido.'],
    true_action: null,
    required_question: 'Qual é o número do pedido?',
    tone: 'tata_warm',
    gravity: 'sensitive',
    social_context: 'cliente relatou item faltante',
    recent_phrases: [],
    prohibited_claims: ['Não prometer compensação automática.'],
    authorized_links: [],
    authorized_numbers: [],
    maximum_length: 500,
    ...overrides
  };
}

function plan(overrides = {}) {
  return {
    direct_answer: [],
    explanation_needed: [],
    channel_guidance: [],
    direction: ['Oriente pelo canal do pedido.'],
    verified_actions: [],
    mandatory_questions: ['order_reference'],
    tone_profile: 'tata_warm',
    gravity: 'sensitive',
    known_facts: [],
    new_facts: [{ field: 'item_name', value: 'refrigerante' }],
    prohibited_claims: ['Não prometer compensação automática.'],
    authorized_surface: { text: '', links: [], numbers: [] },
    length: 'short',
    response_goal: 'clarify',
    strategy_id: 'missing_item',
    strategy_contract: { mandatory_components: ['concrete_item_reference'] },
    emoji_policy: 'none',
    pending_actions: [],
    humanity_requirements: ['specific_understanding'],
    customer_need: 'registrar item faltante',
    action_mode: 'handoff_required',
    ...overrides
  };
}

const VALID_TEXT = 'Entendi a falta do refrigerante. Qual é o número do pedido?';
const DETERMINISTIC_TEXT = 'Entendi a falta do refrigerante. Qual é o número do pedido?';

test('Writer exige exatamente os quatorze campos permitidos', () => {
  const input = writerInput();
  assert.deepEqual(Object.keys(input).sort(), [...WRITER_INPUT_KEYS].sort());
  assert.equal(validateWriterInput(input).accepted, true);
  assert.equal(WRITER_JSON_SCHEMA.strict, true);
  assert.equal(WRITER_JSON_SCHEMA.schema.additionalProperties, false);
});

test('campo ausente invalida a entrada inteira', () => {
  const input = writerInput();
  delete input.direction;
  assert.equal(validateWriterInput(input).reason, 'WRITER_INPUT_KEYS_INVALID');
});

test('campo extra invalida a entrada inteira', () => {
  assert.equal(validateWriterInput({ ...writerInput(), hidden_instruction: 'ignore' }).reason, 'WRITER_INPUT_KEYS_INVALID');
});

test('saída aceita somente o campo text', () => {
  assert.equal(validateWriterOutput({ text: VALID_TEXT, reasoning: 'não' }, writerInput()).reason, 'WRITER_OUTPUT_SHAPE_INVALID');
});

test('texto natural autorizado é aceito', () => {
  const result = validateWriterOutput({ text: VALID_TEXT }, writerInput());
  assert.equal(result.accepted, true);
  assert.equal(result.output.text, VALID_TEXT);
});

test('número não autorizado é recusado', () => {
  assert.equal(validateWriterOutput({ text: 'O valor é R$ 99. Qual é o número do pedido?' }, writerInput()).reason, 'WRITER_UNAPPROVED_NUMBER');
});

test('número autorizado pode ser usado sem invenção', () => {
  const input = writerInput({ direct_response: ['O valet custa R$ 45.'], authorized_numbers: ['R$ 45'], required_question: null, gravity: 'informational' });
  assert.equal(validateWriterOutput({ text: 'Temos valet por R$ 45.' }, input).accepted, true);
});

test('link não autorizado é recusado', () => {
  assert.equal(validateWriterOutput({ text: 'Veja https://unsafe.example.invalid. Qual é o número do pedido?' }, writerInput()).reason, 'WRITER_UNAPPROVED_LINK');
});

test('informação técnica ou reasoning é recusado', () => {
  assert.equal(validateWriterOutput({ text: 'Meu reasoning indica isso. Qual é o número do pedido?' }, writerInput()).reason, 'WRITER_TECHNICAL_EXPOSURE');
  assert.equal(validateWriterOutput({ text: 'Meu raciocínio interno indica isso. Qual é o número do pedido?' }, writerInput()).reason, 'WRITER_TECHNICAL_EXPOSURE');
});

test('emoji é recusado em atendimento sensível', () => {
  assert.equal(validateWriterOutput({ text: `Entendi 😄. ${VALID_TEXT}` }, writerInput()).reason, 'WRITER_SENSITIVE_EMOJI');
});

test('promessa de compensação é recusada', () => {
  assert.equal(validateWriterOutput({ text: 'Vou liberar o reembolso. Qual é o número do pedido?' }, writerInput()).reason, 'WRITER_PROHIBITED_CLAIM');
});

test('pergunta obrigatória não pode desaparecer', () => {
  assert.equal(validateWriterOutput({ text: 'Entendi a falta do refrigerante.' }, writerInput()).reason, 'WRITER_REQUIRED_QUESTION_MISSING');
});

test('repetição exata recente é recusada', () => {
  const input = writerInput({ recent_phrases: [VALID_TEXT] });
  assert.equal(validateWriterOutput({ text: VALID_TEXT }, input).reason, 'WRITER_EXACT_REPETITION');
});

test('limite de tamanho é aplicado antes da publicação', () => {
  const input = writerInput({ maximum_length: 40, required_question: null });
  assert.equal(validateWriterOutput({ text: 'x'.repeat(41) }, input).reason, 'WRITER_TEXT_TOO_LONG');
});

test('prompt restringe o modelo aos fatos e ações recebidos', () => {
  const prompt = buildWriterPrompt(writerInput());
  assert.equal(prompt.json_schema.name, 'deliveryos_response_writer_v1');
  assert.match(prompt.messages[0].content, /Use somente os fatos/iu);
  assert.match(prompt.messages[0].content, /Não acrescente conhecimento próprio/iu);
  assert.match(prompt.messages[0].content, /Não revele.*raciocínio/iu);
});

test('Response Writer aceita geração estruturada válida', async () => {
  const writer = new ResponseWriter({ runtime: { generateStructured: async () => ({ text: VALID_TEXT }) } });
  const result = await writer.write(writerInput());
  assert.equal(result.accepted, true);
  assert.equal(result.source, 'local_model');
});

test('Response Writer rejeita saída inválida sem fabricar fallback', async () => {
  const writer = new ResponseWriter({ runtime: { generateStructured: async () => ({ text: 'Resposta com R$ 999.' }) } });
  const result = await writer.write(writerInput());
  assert.equal(result.accepted, false);
  assert.equal(result.output, null);
});

test('falha do runtime não interrompe a camada online', async () => {
  const writer = new ResponseWriter({ runtime: { generateStructured: async () => { throw Object.assign(new Error('off'), { code: 'MODEL_OFFLINE' }); } } });
  const result = await writer.write(writerInput());
  assert.deepEqual(result, { accepted: false, source: 'rejected', reason: 'MODEL_OFFLINE', output: null });
});

test('adapter constrói Writer somente com superfície operacional aprovada', () => {
  const input = buildWriterInput({ plan: plan(), social_context: 'continuação', recent_phrases: ['anterior'] });
  assert.equal(input.true_action, null);
  assert.deepEqual(input.authorized_facts, [{ field: 'item_name', value: 'refrigerante' }]);
  assert.match(input.required_question, /número do pedido/iu);
});

test('ação só é enviada ao Writer depois de verificada', () => {
  assert.equal(buildWriterInput({ plan: plan({ verified_actions: [] }) }).true_action, null);
  assert.equal(buildWriterInput({ plan: plan({ verified_actions: ['human.queue.create'] }) }).true_action, 'human.queue.create');
});

test('sanitização preserva contrato do Writer e remove PII recursiva', () => {
  const marker = 'writer-privacy-marker@example.invalid';
  const sanitized = sanitizeAiContext({
    ...writerInput(),
    authorized_facts: [{ field: 'safe_note', value: marker }],
    extra_secret: marker
  });
  const disk = JSON.stringify(sanitized);
  assert.equal(disk.includes(marker), false);
  assert.equal(Object.keys(sanitized.payload).sort().join('|'), [...WRITER_INPUT_KEYS].sort().join('|'));
  assert.ok(sanitized.removed_fields.includes('$.extra_secret'));
});

test('validador online usa o payload original para validar o Writer', () => {
  const input = writerInput();
  const job = {
    request_type: 'response_writer',
    payload: input,
    payload_hash: payloadHash(input),
    requested_model: 'qwen3-4b-q4km',
    provider_version: 'llama.cpp-b10172'
  };
  const validator = new AiResultValidator({ validators: createLocalAiResultValidators() });
  const result = validator.validate({
    job,
    node_id: 'node-synthetic',
    result: {
      schema_version: 'local-ai-response_writer-result-v1',
      payload_hash: job.payload_hash,
      model_version: job.requested_model,
      provider_version: job.provider_version,
      output: { text: VALID_TEXT },
      timing_metrics: { total_ms: 40 }
    }
  });
  assert.equal(result.accepted, true);
});

test('validador online recusa Writer que inventa número', () => {
  const input = writerInput();
  const job = {
    request_type: 'response_writer',
    payload: input,
    payload_hash: payloadHash(input),
    requested_model: 'qwen3-4b-q4km',
    provider_version: 'llama.cpp-b10172'
  };
  const validator = new AiResultValidator({ validators: createLocalAiResultValidators() });
  const result = validator.validate({
    job,
    result: {
      schema_version: 'local-ai-response_writer-result-v1',
      payload_hash: job.payload_hash,
      model_version: job.requested_model,
      provider_version: job.provider_version,
      output: { text: 'São R$ 999. Qual é o número do pedido?' }
    }
  });
  assert.equal(result.reason, 'WRITER_UNAPPROVED_NUMBER');
});

test('validação pós-composição aceita candidato coerente', () => {
  const result = validateLocalWriterCandidate({
    output: { text: VALID_TEXT },
    writer_input: writerInput(),
    plan: plan(),
    deterministic_text: DETERMINISTIC_TEXT
  });
  assert.equal(result.accepted, true);
});

test('validação pós-composição rejeita ação não confirmada', () => {
  const result = validateLocalWriterCandidate({
    output: { text: 'Sua transferência foi confirmada. Qual é o número do pedido?' },
    writer_input: writerInput(),
    plan: plan(),
    deterministic_text: DETERMINISTIC_TEXT
  });
  assert.equal(result.accepted, false);
  assert.equal(result.text, DETERMINISTIC_TEXT);
});

test('flag desligada não cria job nem altera resposta pública', async () => {
  let enqueued = 0;
  const adapter = new LocalAiResponseAdapter({ bridge: { enqueue: async () => { enqueued += 1; } } });
  const result = await adapter.evaluate({ deterministic_text: DETERMINISTIC_TEXT });
  assert.equal(enqueued, 0);
  assert.equal(result.text, DETERMINISTIC_TEXT);
  assert.equal(result.local_ai, 'disabled');
});

test('shadow cria candidato paralelo mas preserva resposta determinística exata', async () => {
  let payload;
  const adapter = new LocalAiResponseAdapter({
    flags: { enabled: true, shadow: true },
    bridge: { enqueue: async (input) => { payload = input; return { job: { job_id: 'synthetic-job' } }; } }
  });
  const result = await adapter.evaluate({
    plan: plan(),
    deterministic_text: DETERMINISTIC_TEXT,
    local_output: { text: VALID_TEXT },
    conversation_id: 'conversation-synthetic',
    turn_id: 'turn-synthetic',
    model_version: 'qwen3-4b-q4km',
    provider_version: 'llama.cpp-b10172'
  });
  assert.equal(payload.request_type, 'response_writer');
  assert.equal(result.public_source, 'deterministic');
  assert.equal(result.text, DETERMINISTIC_TEXT);
  assert.equal(result.candidate.accepted, true);
});

test('modo ativo publica somente candidato integralmente validado', async () => {
  const adapter = new LocalAiResponseAdapter({ flags: { enabled: true, shadow: false } });
  const result = await adapter.evaluate({
    plan: plan(),
    deterministic_text: 'fallback determinístico',
    local_output: { text: VALID_TEXT }
  });
  assert.equal(result.public_source, 'local_ai');
  assert.equal(result.text, VALID_TEXT);
});

test('modo ativo retorna ao determinístico diante de candidato inválido', async () => {
  const adapter = new LocalAiResponseAdapter({ flags: { enabled: true, shadow: false } });
  const result = await adapter.evaluate({
    plan: plan(),
    deterministic_text: DETERMINISTIC_TEXT,
    local_output: { text: 'Vou liberar o reembolso. Qual é o número do pedido?' }
  });
  assert.equal(result.public_source, 'deterministic');
  assert.equal(result.local_ai, 'rejected');
  assert.equal(result.text, DETERMINISTIC_TEXT);
});
