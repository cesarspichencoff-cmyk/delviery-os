'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DeliveryOsAiNode,
  OutboundCloudConnector,
  LlamaCppRuntime,
  UpdateManager,
  classifyHardware,
  signNodeRequest: signPortableRequest
} = require('../../apps/deliveryos-ai-node');
const {
  MemoryAiBridgeStore,
  AiNodeRegistry,
  AiNodeAuth,
  AiJobService,
  AiResultValidator,
  AiFallbackRouter,
  loadLocalAiFlags,
  payloadHash
} = require('../../src/conversation-crm/ai-bridge');
const { createLocalAiResultValidators } = require('../../src/conversation-crm/local-ai/result-validators');

function writerPayload(overrides = {}) {
  return {
    direct_response: [],
    authorized_facts: [{ field: 'item_name', value: 'refrigerante' }],
    selected_knowledge: [],
    direction: ['Oriente pelo canal do pedido.'],
    true_action: null,
    required_question: 'Qual é o número do pedido?',
    tone: 'tata_warm',
    gravity: 'sensitive',
    social_context: '',
    recent_phrases: [],
    prohibited_claims: ['Não prometer compensação automática.'],
    authorized_links: [],
    authorized_numbers: [],
    maximum_length: 500,
    ...overrides
  };
}

function context(options = {}) {
  let now = Date.parse('2026-07-28T12:00:00.000Z');
  let sequence = 0;
  const clock = () => now;
  const store = options.store || new MemoryAiBridgeStore();
  const tokenFactory = () => `synthetic-secret-${++sequence}`;
  const registry = new AiNodeRegistry({ store, clock, tokenFactory });
  const jobs = new AiJobService({
    store,
    clock,
    tokenFactory,
    defaultLeaseMs: options.lease_ms || 1000,
    defaultTtlMs: options.ttl_ms || 60_000,
    maxAttempts: options.max_attempts || 3
  });
  const validator = new AiResultValidator({ validators: createLocalAiResultValidators() });
  return { store, registry, jobs, validator, clock, advance: (ms) => { now += ms; } };
}

async function register(ctx, suffix = 'a') {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const issued = await ctx.registry.issueInstallationCode({ unit_id: `SIM-UNIT-${suffix}`, ttl_ms: 60_000 });
  const node = await ctx.registry.register({
    installation_code: issued.code,
    unit_id: `SIM-UNIT-${suffix}`,
    public_key_pem: publicKey.export({ type: 'spki', format: 'pem' }),
    allowed_models: ['qwen3-4b-q4km'],
    version: 'synthetic-test'
  });
  return { ...node, publicKey, privateKey };
}

function enqueueInput(turn = 'turn-1', payload = writerPayload()) {
  return {
    conversation_id: 'conversation-synthetic',
    turn_id: turn,
    request_type: 'response_writer',
    model_version: 'qwen3-4b-q4km',
    provider_version: 'llama.cpp-b10172',
    prompt_contract_version: 'writer-v1',
    payload
  };
}

function resultFor(job, output = { text: 'Entendi a falta do refrigerante. Qual é o número do pedido?' }) {
  return {
    schema_version: 'local-ai-response_writer-result-v1',
    payload_hash: job.payload_hash,
    model_version: job.requested_model,
    provider_version: job.provider_version,
    output,
    timing_metrics: { total_ms: 30 }
  };
}

async function claim(ctx, node, turn = 'turn-1', payload) {
  await ctx.jobs.enqueue(enqueueInput(turn, payload));
  return ctx.jobs.claim({ node_id: node.node_id, models: ['qwen3-4b-q4km'] });
}

test('DeliveryOS sem node mantém job em fila e resposta determinística', async () => {
  const ctx = context();
  const queued = await ctx.jobs.enqueue(enqueueInput());
  const route = new AiFallbackRouter({ flags: loadLocalAiFlags({ CONVERSATION_LOCAL_AI_ENABLED: 'true' }) }).route({ node_ready: false });
  assert.equal((await ctx.store.getJob(queued.job.job_id)).state, 'queued');
  assert.equal(route.public_source, 'deterministic');
});

test('node desligado nunca torna fallback obrigatório por padrão', () => {
  const flags = loadLocalAiFlags({});
  assert.deepEqual(flags, { enabled: false, shadow: true, node_required: false, fallback: 'deterministic' });
});

test('internet indisponível falha localmente e restauração permite concluir o próximo tick', async () => {
  let online = false;
  let completed = 0;
  let claims = 0;
  const job = { job_id: 'job-network', request_type: 'response_writer', payload_hash: 'hash', payload: writerPayload() };
  const connector = {
    heartbeat: async () => { if (!online) throw Object.assign(new Error('offline'), { code: 'NETWORK_OFFLINE' }); },
    claim: async () => (++claims === 1 ? { job, lease_token: 'lease' } : null),
    processing: async () => {},
    complete: async () => { completed += 1; }
  };
  const runtime = { health: async () => ({ state: 'ready' }), metrics: () => ({}), generateStructured: async () => ({ text: 'segura' }) };
  const provider = {
    runtime,
    modelVersion: 'qwen3-4b-q4km',
    providerVersion: 'llama.cpp-b10172',
    generate: async () => resultFor({ ...job, requested_model: 'qwen3-4b-q4km', provider_version: 'llama.cpp-b10172' }, { text: 'segura' })
  };
  const node = new DeliveryOsAiNode({ connector, provider, node_id: 'node', clock: () => 100_000, contractFactory: () => ({}) });
  await assert.rejects(node.tick(), { code: 'NETWORK_OFFLINE' });
  online = true;
  const recovered = await node.tick();
  assert.equal(recovered.state, 'completed');
  assert.equal(completed, 1);
});

test('timeout HTTPS não abre destino alternativo', async () => {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const connector = new OutboundCloudConnector({
    bridge_url: 'https://deliveryos.example.invalid',
    bridge_host: 'deliveryos.example.invalid',
    node_id: 'node-synthetic',
    device_credential: 'synthetic',
    private_key: privateKey,
    timeout_ms: 5,
    fetch: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })
  });
  await assert.rejects(connector.claim({ models: ['qwen3-4b-q4km'] }), { name: 'AbortError' });
});

test('lease expirada volta à fila sem criar segundo fato', async () => {
  const ctx = context({ lease_ms: 1000 });
  const node = await register(ctx, 'lease');
  const first = await claim(ctx, node);
  ctx.advance(1001);
  await ctx.jobs.expireLeases();
  const second = await ctx.jobs.claim({ node_id: node.node_id, models: ['qwen3-4b-q4km'] });
  assert.equal(second.job.job_id, first.job.job_id);
  assert.equal((await ctx.store.listJobs()).length, 1);
});

test('reinício do node retoma o mesmo job após lease', async () => {
  const ctx = context({ lease_ms: 1000 });
  const firstNode = await register(ctx, 'restart-a');
  const replacement = await register(ctx, 'restart-b');
  const first = await claim(ctx, firstNode);
  ctx.advance(1001);
  await ctx.jobs.expireLeases();
  const recovered = await ctx.jobs.claim({ node_id: replacement.node_id, models: ['qwen3-4b-q4km'] });
  assert.equal(recovered.job.job_id, first.job.job_id);
  assert.equal(recovered.job.attempt_count, 2);
});

test('modelo removido falha antes de iniciar runtime', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-model-missing-'));
  const executable = path.join(root, 'llama-server.exe');
  fs.writeFileSync(executable, 'synthetic');
  const runtime = new LlamaCppRuntime({ executable, models_root: root });
  await assert.rejects(runtime.start({ model: 'missing.gguf' }), { code: 'LLAMA_CPP_MODEL_MISSING' });
  fs.rmSync(root, { recursive: true, force: true });
});

test('runtime morto não publica resultado como concluído', async () => {
  let completed = 0;
  const job = { job_id: 'job-runtime-dead', request_type: 'response_writer', payload: writerPayload() };
  const connector = {
    heartbeat: async () => ({}),
    claim: async () => ({ job, lease_token: 'lease' }),
    processing: async () => {},
    complete: async () => { completed += 1; }
  };
  const provider = {
    runtime: { health: async () => ({ state: 'ready' }), metrics: () => ({}) },
    modelVersion: 'qwen3-4b-q4km',
    providerVersion: 'llama.cpp-b10172',
    generate: async () => { throw Object.assign(new Error('dead'), { code: 'RUNTIME_DEAD' }); }
  };
  const node = new DeliveryOsAiNode({ connector, provider, node_id: 'node', clock: () => 100_000, contractFactory: () => ({}) });
  const result = await node.tick();
  assert.equal(result.state, 'local_failed');
  assert.equal(result.code, 'RUNTIME_DEAD');
  assert.equal(completed, 0);
});

test('resposta estruturalmente inválida é rejeitada pelo bridge', async () => {
  const ctx = context();
  const node = await register(ctx, 'invalid');
  const claimed = await claim(ctx, node);
  const completed = await ctx.jobs.complete({
    job_id: claimed.job.job_id,
    node_id: node.node_id,
    lease_token: claimed.lease_token,
    result: resultFor(claimed.job, { text: 'segura', extra: 'não permitido' })
  }, ctx.validator);
  assert.equal(completed.accepted, false);
  assert.equal(completed.job.state, 'rejected');
});

test('fila de cem jobs mantém ordenação e identidade estáveis', async () => {
  const ctx = context();
  const node = await register(ctx, 'queue');
  for (let index = 0; index < 100; index += 1) await ctx.jobs.enqueue(enqueueInput(`turn-${String(index).padStart(3, '0')}`));
  const before = await ctx.store.listJobs();
  const expected = [...before].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.job_id.localeCompare(b.job_id))[0];
  const first = await ctx.jobs.claim({ node_id: node.node_id, models: ['qwen3-4b-q4km'] });
  assert.equal(before.length, 100);
  assert.equal(first.job.job_id, expected.job_id);
});

test('node revogado não recebe trabalho', async () => {
  const ctx = context();
  const node = await register(ctx, 'revoked');
  await ctx.registry.setState(node.node_id, 'revoked');
  await ctx.jobs.enqueue(enqueueInput());
  await assert.rejects(ctx.jobs.claim({ node_id: node.node_id, models: ['qwen3-4b-q4km'] }), { code: 'NODE_NOT_CLAIMABLE' });
});

test('credencial copiada sem chave privada válida não autentica', async () => {
  const ctx = context();
  const node = await register(ctx, 'stolen');
  const attacker = crypto.generateKeyPairSync('ed25519');
  const base = {
    node_id: node.node_id,
    device_credential: node.device_credential,
    timestamp: new Date(ctx.clock()).toISOString(),
    nonce: 'nonce-stolen',
    method: 'POST',
    path: '/api/conversation-ai/claim',
    body: { models: ['qwen3-4b-q4km'] }
  };
  const signed = signPortableRequest(base, attacker.privateKey);
  const auth = new AiNodeAuth({ store: ctx.store, clock: ctx.clock });
  await assert.rejects(auth.verify({ ...base, ...signed }), { code: 'NODE_SIGNATURE_INVALID' });
});

test('assinatura do cliente portátil é compatível com autenticação online', async () => {
  const ctx = context();
  const node = await register(ctx, 'compatible');
  const base = {
    node_id: node.node_id,
    device_credential: node.device_credential,
    timestamp: new Date(ctx.clock()).toISOString(),
    nonce: 'nonce-compatible',
    method: 'POST',
    path: '/api/conversation-ai/heartbeat',
    body: { version: 'synthetic' }
  };
  const signed = signPortableRequest(base, node.privateKey);
  const auth = new AiNodeAuth({ store: ctx.store, clock: ctx.clock });
  assert.equal((await auth.verify({ ...base, ...signed })).node_id, node.node_id);
});

test('dois nodes concorrentes não recebem o mesmo lease', async () => {
  const ctx = context();
  const a = await register(ctx, 'two-a');
  const b = await register(ctx, 'two-b');
  await ctx.jobs.enqueue(enqueueInput());
  const claims = await Promise.all([
    ctx.jobs.claim({ node_id: a.node_id, models: ['qwen3-4b-q4km'] }),
    ctx.jobs.claim({ node_id: b.node_id, models: ['qwen3-4b-q4km'] })
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
});

test('crash após persistir resultado é retomado como confirmação idempotente', async () => {
  class AckCrashStore extends MemoryAiBridgeStore {
    constructor() { super(); this.crashed = false; }
    async finalizeJob(job, event) {
      const result = await super.finalizeJob(job, event);
      if (!this.crashed && result.applied) {
        this.crashed = true;
        throw Object.assign(new Error('ACK_CRASH'), { code: 'ACK_CRASH' });
      }
      return result;
    }
  }
  const ctx = context({ store: new AckCrashStore() });
  const node = await register(ctx, 'ack-crash');
  const claimed = await claim(ctx, node);
  const input = {
    job_id: claimed.job.job_id,
    node_id: node.node_id,
    lease_token: claimed.lease_token,
    result: resultFor(claimed.job)
  };
  await assert.rejects(ctx.jobs.complete(input, ctx.validator), { code: 'ACK_CRASH' });
  const replay = await ctx.jobs.complete(input, ctx.validator);
  assert.equal(replay.accepted, true);
  assert.equal(replay.duplicate, true);
  assert.equal((await ctx.store.eventsForJob(claimed.job.job_id)).filter((event) => event.type === 'completed').length, 1);
});

test('PII alucinada na saída é rejeitada antes de persistir', async () => {
  const marker = 'privacy-output-marker@example.invalid';
  const ctx = context();
  const node = await register(ctx, 'privacy-output');
  const claimed = await claim(ctx, node);
  const result = await ctx.jobs.complete({
    job_id: claimed.job.job_id,
    node_id: node.node_id,
    lease_token: claimed.lease_token,
    result: resultFor(claimed.job, { text: `Contato ${marker}. Qual é o número do pedido?` })
  }, ctx.validator);
  assert.equal(result.accepted, false);
  assert.equal(result.job.fallback_reason, 'RESULT_SENSITIVE_VALUE');
  assert.equal(JSON.stringify(await ctx.store.snapshot()).includes(marker), false);
});

test('PII na entrada é redigida antes de entrar na fila', async () => {
  const marker = 'privacy-input-marker@example.invalid';
  const ctx = context();
  await ctx.jobs.enqueue(enqueueInput('turn-privacy', writerPayload({
    authorized_facts: [{ field: 'safe_note', value: marker }]
  })));
  assert.equal(JSON.stringify(await ctx.store.snapshot()).includes(marker), false);
});

test('resultado rejeitado registra somente caminho e código, nunca o valor', () => {
  const marker = 'privacy-direct-marker@example.invalid';
  const payload = writerPayload();
  const job = {
    request_type: 'response_writer',
    payload,
    payload_hash: payloadHash(payload),
    requested_model: 'qwen3-4b-q4km',
    provider_version: 'llama.cpp-b10172'
  };
  const validator = new AiResultValidator({ validators: createLocalAiResultValidators() });
  const result = validator.validate({ job, result: resultFor(job, { text: marker }) });
  assert.equal(result.reason, 'RESULT_SENSITIVE_VALUE');
  assert.equal(JSON.stringify(result).includes(marker), false);
});

test('atualização interrompida por disco cheio remove arquivo parcial', async () => {
  const bytes = Buffer.from('synthetic-artifact');
  const removed = [];
  const diskError = Object.assign(new Error('disk full'), { code: 'ENOSPC' });
  const fakeFs = {
    mkdirSync: () => {},
    rmSync: (file) => { removed.push(file); },
    writeFileSync: () => { throw diskError; },
    renameSync: () => { throw new Error('SHOULD_NOT_RENAME'); }
  };
  const manager = new UpdateManager({
    root: path.join(os.tmpdir(), 'deliveryos-update-disk-full'),
    fs: fakeFs,
    fetch: async () => ({ ok: true, arrayBuffer: async () => bytes })
  });
  const artifact = {
    id: 'synthetic-artifact',
    filename: 'synthetic.bin',
    url: 'https://github.com/example/synthetic.bin',
    size_bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')
  };
  await assert.rejects(manager.download(artifact), { code: 'ENOSPC' });
  assert.equal(removed.filter((file) => file.endsWith('.synthetic-artifact.partial')).length, 2);
});

test('update remove partial antigo e promove somente hash verificado', async () => {
  const bytes = Buffer.from('synthetic-retry-artifact');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-update-retry-'));
  const partial = path.join(root, '.synthetic-retry.partial');
  fs.writeFileSync(partial, 'interrupted');
  const manager = new UpdateManager({ root, fetch: async () => ({ ok: true, arrayBuffer: async () => bytes }) });
  const artifact = {
    id: 'synthetic-retry',
    filename: 'synthetic.bin',
    url: 'https://github.com/example/synthetic.bin',
    size_bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')
  };
  const destination = await manager.download(artifact);
  assert.equal(fs.existsSync(partial), false);
  assert.deepEqual(fs.readFileSync(destination), bytes);
  fs.rmSync(root, { recursive: true, force: true });
});

test('hash inválido nunca cria artefato parcial', async () => {
  const bytes = Buffer.from('synthetic-invalid-hash');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-update-hash-'));
  const manager = new UpdateManager({ root, fetch: async () => ({ ok: true, arrayBuffer: async () => bytes }) });
  const artifact = {
    id: 'synthetic-hash',
    filename: 'synthetic.bin',
    url: 'https://github.com/example/synthetic.bin',
    size_bytes: bytes.length,
    sha256: '0'.repeat(64)
  };
  await assert.rejects(manager.download(artifact), { code: 'UPDATE_HASH_MISMATCH' });
  assert.equal(fs.readdirSync(root).length, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test('RAM, CPU ou disco insuficientes bloqueiam instalação conservadoramente', () => {
  assert.equal(classifyHardware({ ram_total_bytes: 7 * 1024 ** 3, disk_free_bytes: 20 * 1024 ** 3, cpu: { threads: 8 } }), 'nao_compativel');
  assert.equal(classifyHardware({ ram_total_bytes: 16 * 1024 ** 3, disk_free_bytes: 7 * 1024 ** 3, cpu: { threads: 8 } }), 'nao_compativel');
  assert.equal(classifyHardware({ ram_total_bytes: 16 * 1024 ** 3, disk_free_bytes: 20 * 1024 ** 3, cpu: { threads: 2 } }), 'nao_compativel');
});

test('runtime local fixa 127.0.0.1 e recusa bind público', () => {
  assert.throws(() => new LlamaCppRuntime({
    executable: path.join(os.tmpdir(), 'llama-server.exe'),
    models_root: os.tmpdir(),
    host: '0.0.0.0'
  }), { code: 'LLAMA_CPP_PUBLIC_BIND_FORBIDDEN' });
});

test('circuito aberto sempre mantém texto determinístico', () => {
  const breaker = { state: () => 'open' };
  const router = new AiFallbackRouter({
    flags: loadLocalAiFlags({ CONVERSATION_LOCAL_AI_ENABLED: 'true', CONVERSATION_LOCAL_AI_SHADOW: 'false' }),
    breaker
  });
  const route = router.route({ node_id: 'node', node_ready: true, validated_result: true });
  assert.equal(route.public_source, 'deterministic');
  assert.equal(route.reason, 'circuit_open');
});
