'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  adapters,
  defineModelAdapter,
  getModelAdapter,
  samplingFor,
  LlamaCppRuntime,
  WRITER_JSON_SCHEMA
} = require('../../apps/deliveryos-ai-node');

function temporary(name) { return fs.mkdtempSync(path.join(os.tmpdir(), `deliveryos-adapter-${name}-`)); }

function fakeProcess() {
  return { once() {}, kill() {}, stdout: null, stderr: null };
}

function files(root) {
  const executable = path.join(root, 'llama-server.exe');
  const model = path.join(root, 'candidate.gguf');
  fs.writeFileSync(executable, 'synthetic');
  fs.writeFileSync(model, 'synthetic');
  return { executable, model };
}

test('registro contém somente as quatro famílias autorizadas', () => {
  assert.deepEqual(Object.keys(adapters), ['default', 'qwen3', 'qwen35', 'gemma4']);
  assert.equal(getModelAdapter('qwen35').family, 'qwen3.5');
  assert.throws(() => getModelAdapter('unknown'), { code: 'MODEL_ADAPTER_UNKNOWN' });
});

test('contrato do adapter recusa conteúdo semântico', () => {
  const base = JSON.parse(JSON.stringify(getModelAdapter('default')));
  base.non_thinking.chat_template_kwargs.facts = 'não permitido';
  assert.throws(() => defineModelAdapter(base), { code: 'MODEL_ADAPTER_SEMANTIC_CONTENT_FORBIDDEN' });
});

test('adapter Qwen3 preserva parâmetros do baseline anterior', () => {
  const adapter = getModelAdapter('qwen3');
  assert.deepEqual(adapter.non_thinking.chat_template_kwargs, {});
  assert.deepEqual(samplingFor(adapter, 'structured', WRITER_JSON_SCHEMA.name), {});
  assert.equal(adapter.limits.default_context_size, 4096);
});

test('adapter Qwen3.5 fixa non-thinking e amostragem oficial de superfície', () => {
  const adapter = getModelAdapter('qwen35');
  const sampling = samplingFor(adapter, 'structured', WRITER_JSON_SCHEMA.name);
  assert.deepEqual(adapter.non_thinking.chat_template_kwargs, { enable_thinking: false });
  assert.equal(sampling.temperature, 0.7);
  assert.equal(sampling.top_p, 0.8);
  assert.equal(sampling.top_k, 20);
  assert.equal(sampling.min_p, 0);
  assert.equal(sampling.presence_penalty, 1.5);
});

test('adapter Gemma 4 desliga thinking e limita contexto experimental', () => {
  const adapter = getModelAdapter('gemma4');
  assert.deepEqual(adapter.non_thinking.chat_template_kwargs, { enable_thinking: false, preserve_thinking: false });
  assert.equal(adapter.limits.default_context_size, 8192);
  assert.equal(adapter.limits.maximum_context_size, 16384);
  assert.deepEqual(adapter.stop, ['<turn|>']);
});

test('runtime aplica adapter Qwen3.5 no servidor e na requisição', async () => {
  const root = temporary('qwen35');
  const artifact = files(root);
  let spawnCapture;
  let requestCapture;
  const runtime = new LlamaCppRuntime({
    executable: artifact.executable,
    models_root: root,
    adapter_id: 'qwen35',
    spawn: (_file, args) => { spawnCapture = args; return fakeProcess(); },
    fetch: async (_url, init) => {
      requestCapture = JSON.parse(init.body);
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"text":"Oi"}' } }], usage: {} }) };
    }
  });
  try {
    await runtime.start({ model: 'candidate.gguf', gpu_layers: 0 });
    assert.equal(spawnCapture[spawnCapture.indexOf('--ctx-size') + 1], '8192');
    await runtime.generateStructured({ messages: [], json_schema: WRITER_JSON_SCHEMA, temperature: 0.1, max_tokens: 900 });
    assert.deepEqual(requestCapture.chat_template_kwargs, { enable_thinking: false });
    assert.equal(requestCapture.temperature, 0.7);
    assert.equal(requestCapture.max_tokens, 700);
    assert.equal(requestCapture.response_format, undefined);
    assert.match(requestCapture.grammar, /text-kv/u);
    assert.equal(runtime.metrics().adapter_id, 'qwen35');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('runtime aplica adapter Gemma 4 sem adicionar conteúdo de domínio', async () => {
  const root = temporary('gemma4');
  const artifact = files(root);
  let requestCapture;
  const runtime = new LlamaCppRuntime({
    executable: artifact.executable,
    models_root: root,
    adapter_id: 'gemma4',
    spawn: () => fakeProcess(),
    fetch: async (_url, init) => {
      requestCapture = JSON.parse(init.body);
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"text":"Olá"}' } }], usage: {} }) };
    }
  });
  try {
    await runtime.start({ model: 'candidate.gguf' });
    await runtime.generateStructured({ messages: [], json_schema: WRITER_JSON_SCHEMA });
    assert.deepEqual(requestCapture.chat_template_kwargs, { enable_thinking: false, preserve_thinking: false });
    assert.deepEqual(requestCapture.stop, ['<turn|>']);
    assert.equal(JSON.stringify(getModelAdapter('gemma4')).includes('reserva'), false);
    assert.equal(JSON.stringify(getModelAdapter('gemma4')).includes('reembolso'), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('contexto abaixo do mínimo da família falha fechado', async () => {
  const root = temporary('context');
  const artifact = files(root);
  const runtime = new LlamaCppRuntime({ executable: artifact.executable, models_root: root, adapter_id: 'qwen35' });
  try {
    await assert.rejects(runtime.start({ model: 'candidate.gguf', context_size: 4096 }), { code: 'MODEL_ADAPTER_CONTEXT_INVALID' });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
