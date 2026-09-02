'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { LocalInferenceRuntime } = require('./local-inference-runtime');
const { fixedGrammar, parseStrictJsonObject } = require('./structured-output');
const { getModelAdapter, samplingFor } = require('../model-adapters');

function fail(code) { throw Object.assign(new Error(code), { code }); }

class LlamaCppRuntime extends LocalInferenceRuntime {
  constructor(options = {}) {
    super();
    this.executable = path.resolve(options.executable);
    this.modelsRoot = path.resolve(options.models_root);
    this.host = options.host || '127.0.0.1';
    this.port = Number(options.port || 4191);
    this.fetch = options.fetch || globalThis.fetch;
    this.spawn = options.spawn || spawn;
    this.process = null;
    this.model = null;
    this.startedAt = null;
    this.lastMetrics = {};
    this.adapter = getModelAdapter(options.adapter_id || 'default');
    if (this.host !== '127.0.0.1') fail('LLAMA_CPP_PUBLIC_BIND_FORBIDDEN');
  }

  resolveModel(relative) {
    const target = path.resolve(this.modelsRoot, relative);
    if (!target.startsWith(this.modelsRoot + path.sep) || !target.toLowerCase().endsWith('.gguf')) fail('LLAMA_CPP_MODEL_PATH_INVALID');
    return target;
  }

  async start(input = {}) {
    if (this.process) return this.health();
    this.adapter = getModelAdapter(input.adapter_id || this.adapter.id);
    const model = this.resolveModel(input.model);
    if (!fs.existsSync(this.executable)) fail('LLAMA_CPP_EXECUTABLE_MISSING');
    if (!fs.existsSync(model)) fail('LLAMA_CPP_MODEL_MISSING');
    const contextSize = Number(input.context_size || this.adapter.limits.default_context_size);
    if (!Number.isInteger(contextSize) || contextSize < this.adapter.limits.minimum_context_size || contextSize > this.adapter.limits.maximum_context_size) fail('MODEL_ADAPTER_CONTEXT_INVALID');
    const args = [
      '--host', '127.0.0.1',
      '--port', String(this.port),
      '--model', model,
      '--ctx-size', String(contextSize),
      '--parallel', '1',
      '--jinja',
      '--reasoning', this.adapter.non_thinking.server_reasoning
    ];
    if (Number.isInteger(input.gpu_layers) && input.gpu_layers >= 0) args.push('--n-gpu-layers', String(input.gpu_layers));
    this.process = this.spawn(this.executable, args, {
      cwd: path.dirname(this.executable),
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    this.process.stdout?.on?.('data', () => {});
    this.process.stderr?.on?.('data', () => {});
    this.process.once('exit', () => { this.process = null; });
    this.model = path.basename(model);
    this.startedAt = Date.now();
    return { state: 'starting', host: this.host, port: this.port, model: this.model, adapter_id: this.adapter.id };
  }

  async health() {
    if (!this.process) return { state: 'stopped', host: this.host, port: this.port, model: this.model, adapter_id: this.adapter.id };
    try {
      const response = await this.fetch(`http://127.0.0.1:${this.port}/health`, { redirect: 'error' });
      return { state: response.ok ? 'ready' : 'degraded', host: this.host, port: this.port, model: this.model, adapter_id: this.adapter.id };
    } catch {
      return { state: 'starting', host: this.host, port: this.port, model: this.model, adapter_id: this.adapter.id };
    }
  }

  async waitUntilReady(options = {}) {
    const timeoutMs = Number(options.timeout_ms || 60_000);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const status = await this.health();
      if (status.state === 'ready') return status;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    fail('LLAMA_CPP_START_TIMEOUT');
  }

  async request(payload, signal) {
    const started = Date.now();
    const response = await this.fetch(`http://127.0.0.1:${this.port}/v1/chat/completions`, {
      method: 'POST',
      redirect: 'error',
      signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) fail('LLAMA_CPP_GENERATION_FAILED');
    const body = await response.json();
    this.lastMetrics = {
      total_ms: Date.now() - started,
      prompt_tokens: Number(body.usage?.prompt_tokens || 0),
      completion_tokens: Number(body.usage?.completion_tokens || 0)
    };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string') fail('LLAMA_CPP_CONTENT_TYPE_INVALID');
    return content;
  }

  async generateStructured(input = {}) {
    const grammar = fixedGrammar(input.json_schema);
    const sampling = samplingFor(this.adapter, 'structured', input.json_schema?.name);
    const payload = {
      model: this.model,
      messages: input.messages,
      temperature: Number(sampling.temperature ?? input.temperature ?? 0.2),
      max_tokens: Math.min(Number(input.max_tokens || 512), this.adapter.limits.structured_max_tokens),
      ...sampling,
      ...(Number.isInteger(input.seed) ? { seed: input.seed } : {})
    };
    if (Object.keys(this.adapter.non_thinking.chat_template_kwargs).length) payload.chat_template_kwargs = this.adapter.non_thinking.chat_template_kwargs;
    if (this.adapter.stop.length) payload.stop = this.adapter.stop;
    if (grammar) payload.grammar = grammar;
    else payload.response_format = { type: 'json_schema', json_schema: input.json_schema };
    const text = await this.request(payload, input.signal);
    return parseStrictJsonObject(text);
  }

  generateText(input = {}) {
    const sampling = samplingFor(this.adapter, 'text');
    return this.request({
      model: this.model,
      messages: input.messages,
      temperature: Number(sampling.temperature ?? input.temperature ?? 0.35),
      max_tokens: Math.min(Number(input.max_tokens || 256), this.adapter.limits.text_max_tokens),
      ...sampling,
      ...(Object.keys(this.adapter.non_thinking.chat_template_kwargs).length ? { chat_template_kwargs: this.adapter.non_thinking.chat_template_kwargs } : {}),
      ...(this.adapter.stop.length ? { stop: this.adapter.stop } : {}),
      ...(Number.isInteger(input.seed) ? { seed: input.seed } : {})
    }, input.signal);
  }

  loadModel(input) { return this.start(input); }
  unloadModel() { return this.stop(); }
  cancel(controller) { controller?.abort?.(); }
  metrics() { return { ...this.lastMetrics, adapter_id: this.adapter.id, adapter_version: this.adapter.version, uptime_ms: this.startedAt ? Date.now() - this.startedAt : 0 }; }

  async stop() {
    const current = this.process;
    if (!current) return { state: 'stopped' };
    await new Promise((resolve) => {
      const timeout = setTimeout(() => { current.kill('SIGKILL'); resolve(); }, 5_000);
      current.once('exit', () => { clearTimeout(timeout); resolve(); });
      current.kill('SIGTERM');
    });
    this.process = null;
    return { state: 'stopped' };
  }

  shutdown() { return this.stop(); }
}

module.exports = { LlamaCppRuntime };
