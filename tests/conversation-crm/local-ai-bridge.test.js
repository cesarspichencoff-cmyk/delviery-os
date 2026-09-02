'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  MemoryAiBridgeStore,
  AiNodeRegistry,
  AiNodeAuth,
  AiJobService,
  AiResultValidator,
  AiHeartbeatService,
  AiFallbackRouter,
  CircuitBreaker,
  AiBridgeMetrics,
  loadLocalAiFlags,
  sanitizeAiContext,
  signNodeRequest,
  payloadHash,
  POSTGRES_MIGRATION,
  PostgresAiBridgeStore
} = require('../../src/conversation-crm/ai-bridge');

function fixture(options = {}) {
  let now = Date.parse('2026-07-28T12:00:00.000Z');
  let sequence = 0;
  const clock = () => now;
  const advance = (ms) => { now += ms; };
  const tokenFactory = () => `synthetic-token-${++sequence}`;
  const store = new MemoryAiBridgeStore();
  const registry = new AiNodeRegistry({ store, clock, tokenFactory });
  const jobs = new AiJobService({
    store,
    clock,
    tokenFactory,
    defaultTtlMs: options.ttlMs || 60_000,
    defaultLeaseMs: options.leaseMs || 10_000,
    maxAttempts: options.maxAttempts || 2
  });
  const validator = new AiResultValidator();
  return { store, registry, jobs, validator, clock, advance };
}

async function registerNode(ctx, suffix = 'a') {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const issued = await ctx.registry.issueInstallationCode({ unit_id: `SIM-UNIT-${suffix}`, ttl_ms: 60_000 });
  const registration = await ctx.registry.register({
    installation_code: issued.code,
    unit_id: `SIM-UNIT-${suffix}`,
    public_key_pem: publicKey.export({ type: 'spki', format: 'pem' }),
    allowed_models: ['qwen3-4b-q4km'],
    version: 'test-v1'
  });
  return { ...registration, privateKey };
}

function enqueueInput(turn = 'turn-1', payload = { message: 'mensagem sintetica segura' }) {
  return {
    conversation_id: 'conversation-synthetic',
    turn_id: turn,
    request_type: 'conversation_director',
    model_version: 'qwen3-4b-q4km',
    provider_version: 'llama.cpp-b10172',
    prompt_contract_version: 'director-v1',
    payload
  };
}

function validResult(job, output = { dialogue_act: 'answer', safe: true }) {
  return {
    schema_version: 'local-ai-conversation_director-result-v1',
    payload_hash: job.payload_hash,
    model_version: job.requested_model,
    provider_version: job.provider_version,
    output,
    timing_metrics: { total_ms: 42, ignored: 123 }
  };
}

async function claimedJob(ctx, node, turn = 'turn-1') {
  const queued = await ctx.jobs.enqueue(enqueueInput(turn));
  const claim = await ctx.jobs.claim({ node_id: node.node_id, models: ['qwen3-4b-q4km'] });
  return { queued: queued.job, ...claim };
}

test('flags locais são seguras por padrão e fallback permanece determinístico', () => {
  assert.deepEqual(loadLocalAiFlags({}), { enabled: false, shadow: true, node_required: false, fallback: 'deterministic' });
  const route = new AiFallbackRouter({ flags: loadLocalAiFlags({}) }).route({ node_ready: true, validated_result: true });
  assert.deepEqual(route, { public_source: 'deterministic', local_ai: 'disabled', reason: 'flag_disabled' });
});

test('flag inválida falha de forma fechada', () => {
  assert.throws(() => loadLocalAiFlags({ CONVERSATION_LOCAL_AI_ENABLED: 'talvez' }), { code: 'LOCAL_AI_FLAG_INVALID' });
  assert.throws(() => loadLocalAiFlags({ CONVERSATION_AI_FALLBACK: 'model' }), { code: 'LOCAL_AI_FALLBACK_INVALID' });
});

test('código de instalação é de uso único', async () => {
  const ctx = fixture();
  const { publicKey } = crypto.generateKeyPairSync('ed25519');
  const issued = await ctx.registry.issueInstallationCode({ unit_id: 'SIM-UNIT-one', ttl_ms: 60_000 });
  const input = {
    installation_code: issued.code,
    unit_id: 'SIM-UNIT-one',
    public_key_pem: publicKey.export({ type: 'spki', format: 'pem' }),
    allowed_models: ['qwen3-4b-q4km']
  };
  await ctx.registry.register(input);
  await assert.rejects(ctx.registry.register(input), { code: 'INSTALL_CODE_INVALID' });
});

test('código de instalação expirado é recusado', async () => {
  const ctx = fixture();
  const { publicKey } = crypto.generateKeyPairSync('ed25519');
  const issued = await ctx.registry.issueInstallationCode({ unit_id: 'SIM-UNIT-expired', ttl_ms: 30_000 });
  ctx.advance(30_001);
  await assert.rejects(ctx.registry.register({
    installation_code: issued.code,
    unit_id: 'SIM-UNIT-expired',
    public_key_pem: publicKey.export({ type: 'spki', format: 'pem' })
  }), { code: 'INSTALL_CODE_INVALID' });
});

test('registro vincula unidade e aceita somente chave Ed25519', async () => {
  const ctx = fixture();
  const issued = await ctx.registry.issueInstallationCode({ unit_id: 'SIM-UNIT-key', ttl_ms: 60_000 });
  const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  await assert.rejects(ctx.registry.register({
    installation_code: issued.code,
    unit_id: 'SIM-UNIT-key',
    public_key_pem: publicKey.export({ type: 'spki', format: 'pem' })
  }), { code: 'NODE_KEY_TYPE_INVALID' });
});

test('autenticação exige credencial e assinatura Ed25519 válidas', async () => {
  const ctx = fixture();
  const node = await registerNode(ctx, 'auth');
  const auth = new AiNodeAuth({ store: ctx.store, clock: ctx.clock });
  const base = {
    node_id: node.node_id,
    device_credential: node.device_credential,
    timestamp: new Date(ctx.clock()).toISOString(),
    nonce: 'nonce-auth-1',
    method: 'POST',
    path: '/v1/jobs/claim',
    body: { models: ['qwen3-4b-q4km'] }
  };
  const signed = signNodeRequest(base, node.privateKey);
  const verified = await auth.verify({ ...base, ...signed });
  assert.equal(verified.node_id, node.node_id);

  const second = { ...base, nonce: 'nonce-auth-2', device_credential: 'wrong' };
  await assert.rejects(auth.verify({ ...second, ...signNodeRequest(second, node.privateKey) }), { code: 'NODE_CREDENTIAL_INVALID' });
});

test('nonce repetido é bloqueado mesmo com assinatura válida', async () => {
  const ctx = fixture();
  const node = await registerNode(ctx, 'nonce');
  const auth = new AiNodeAuth({ store: ctx.store, clock: ctx.clock });
  const base = {
    node_id: node.node_id,
    device_credential: node.device_credential,
    timestamp: new Date(ctx.clock()).toISOString(),
    nonce: 'nonce-replay',
    method: 'POST',
    path: '/v1/heartbeat',
    body: { ok: true }
  };
  const request = { ...base, ...signNodeRequest(base, node.privateKey) };
  await auth.verify(request);
  await assert.rejects(auth.verify(request), { code: 'NODE_NONCE_REPLAY' });
});

test('nó revogado não autentica nem recebe trabalho', async () => {
  const ctx = fixture();
  const node = await registerNode(ctx, 'revoked');
  await ctx.registry.setState(node.node_id, 'revoked');
  await ctx.jobs.enqueue(enqueueInput());
  await assert.rejects(ctx.jobs.claim({ node_id: node.node_id, models: ['qwen3-4b-q4km'] }), { code: 'NODE_NOT_CLAIMABLE' });
});

test('enqueue idempotente preserva um único job e evento queued', async () => {
  const ctx = fixture();
  const first = await ctx.jobs.enqueue(enqueueInput());
  const second = await ctx.jobs.enqueue(enqueueInput());
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.job.job_id, second.job.job_id);
  assert.equal((await ctx.store.eventsForJob(first.job.job_id)).length, 1);
});

test('sanitização remove PII recursiva antes de persistir', async () => {
  const ctx = fixture();
  const markers = ['PII-PHONE-UNIQUE', 'PII-EMAIL-UNIQUE', 'PII-TOKEN-UNIQUE'];
  const queued = await ctx.jobs.enqueue(enqueueInput('turn-pii', {
    message: 'texto operacional permitido',
    recent_history: [{
      telefone: markers[0],
      nested: [{ EMAIL: markers[1], safe: 'contexto sintetico' }],
      token: markers[2]
    }]
  }));
  const persisted = JSON.stringify(await ctx.store.snapshot());
  for (const marker of markers) assert.equal(persisted.includes(marker), false);
  assert.equal(queued.job.payload.message, 'texto operacional permitido');
  assert.ok(queued.job.privacy_removed_fields.some((path) => /telefone/iu.test(path)));
});

test('duas reivindicações concorrentes produzem um único vencedor', async () => {
  const ctx = fixture();
  const nodeA = await registerNode(ctx, 'claim-a');
  const nodeB = await registerNode(ctx, 'claim-b');
  await ctx.jobs.enqueue(enqueueInput());
  const claims = await Promise.all([
    ctx.jobs.claim({ node_id: nodeA.node_id, models: ['qwen3-4b-q4km'] }),
    ctx.jobs.claim({ node_id: nodeB.node_id, models: ['qwen3-4b-q4km'] })
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
});

test('job percorre queued, claimed, processing e completed', async () => {
  const ctx = fixture();
  const node = await registerNode(ctx, 'lifecycle');
  const claim = await claimedJob(ctx, node);
  await ctx.jobs.markProcessing({ job_id: claim.job.job_id, node_id: node.node_id, lease_token: claim.lease_token });
  const result = await ctx.jobs.complete({
    job_id: claim.job.job_id,
    node_id: node.node_id,
    lease_token: claim.lease_token,
    result: validResult(claim.job)
  }, ctx.validator);
  assert.equal(result.accepted, true);
  assert.equal(result.job.state, 'completed');
  assert.deepEqual((await ctx.store.eventsForJob(claim.job.job_id)).map((item) => item.type), ['queued', 'claimed', 'processing', 'completed']);
});

test('resultado idêntico repetido é idempotente e não cria segundo evento', async () => {
  const ctx = fixture();
  const node = await registerNode(ctx, 'result-idem');
  const claim = await claimedJob(ctx, node);
  const wrapper = validResult(claim.job, { dialogue_act: 'answer', value: 'synthetic' });
  const input = { job_id: claim.job.job_id, node_id: node.node_id, lease_token: claim.lease_token, result: wrapper };
  const first = await ctx.jobs.complete(input, ctx.validator);
  ctx.advance(20_000);
  const second = await ctx.jobs.complete(input, ctx.validator);
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal((await ctx.store.eventsForJob(claim.job.job_id)).filter((item) => item.type === 'completed').length, 1);
});

test('resultado divergente posterior não substitui o primeiro', async () => {
  const ctx = fixture();
  const node = await registerNode(ctx, 'result-conflict');
  const claim = await claimedJob(ctx, node);
  const base = { job_id: claim.job.job_id, node_id: node.node_id, lease_token: claim.lease_token };
  await ctx.jobs.complete({ ...base, result: validResult(claim.job, { value: 'first' }) }, ctx.validator);
  await assert.rejects(ctx.jobs.complete({ ...base, result: validResult(claim.job, { value: 'second' }) }, ctx.validator), { code: 'AI_RESULT_ALREADY_FINALIZED' });
  assert.deepEqual((await ctx.store.getJob(claim.job.job_id)).result, { value: 'first' });
});

test('resultado incompatível é rejeitado e nunca aplicado', async () => {
  const ctx = fixture();
  const node = await registerNode(ctx, 'validation');
  const claim = await claimedJob(ctx, node);
  const invalid = validResult(claim.job);
  invalid.payload_hash = 'different';
  const result = await ctx.jobs.complete({
    job_id: claim.job.job_id,
    node_id: node.node_id,
    lease_token: claim.lease_token,
    result: invalid
  }, ctx.validator);
  assert.equal(result.accepted, false);
  assert.equal(result.job.state, 'rejected');
  assert.equal(result.job.fallback_reason, 'RESULT_PAYLOAD_HASH_MISMATCH');
});

test('resultado com raciocínio interno é recusado', async () => {
  const ctx = fixture();
  const node = await registerNode(ctx, 'reasoning');
  const claim = await claimedJob(ctx, node);
  const invalid = validResult(claim.job, { reasoning: 'não deve persistir' });
  const result = await ctx.jobs.complete({
    job_id: claim.job.job_id,
    node_id: node.node_id,
    lease_token: claim.lease_token,
    result: invalid
  }, ctx.validator);
  assert.equal(result.accepted, false);
  assert.equal(result.job.fallback_reason, 'RESULT_FORBIDDEN_FIELD');
});

test('lease expirada reencaminha job sem duplicar o fato', async () => {
  const ctx = fixture({ leaseMs: 1_000, maxAttempts: 2 });
  const node = await registerNode(ctx, 'lease');
  const first = await claimedJob(ctx, node);
  ctx.advance(1_001);
  const changed = await ctx.jobs.expireLeases();
  assert.equal(changed[0].state, 'queued');
  const second = await ctx.jobs.claim({ node_id: node.node_id, models: ['qwen3-4b-q4km'] });
  assert.equal(second.job.job_id, first.job.job_id);
  assert.equal(second.job.attempt_count, 2);
});

test('tentativas esgotadas falham de forma terminal', async () => {
  const ctx = fixture({ leaseMs: 1_000, maxAttempts: 1 });
  const node = await registerNode(ctx, 'attempts');
  const claim = await claimedJob(ctx, node);
  ctx.advance(1_001);
  await ctx.jobs.expireLeases();
  assert.equal((await ctx.store.getJob(claim.job.job_id)).state, 'failed');
});

test('job vencido não é reaproveitado após expiração', async () => {
  const ctx = fixture({ leaseMs: 1_000, ttlMs: 1_500 });
  const node = await registerNode(ctx, 'expired');
  const claim = await claimedJob(ctx, node);
  ctx.advance(1_501);
  await ctx.jobs.expireLeases();
  assert.equal((await ctx.store.getJob(claim.job.job_id)).state, 'expired');
});

test('heartbeat distingue active de stale de forma determinística', async () => {
  const ctx = fixture();
  const node = await registerNode(ctx, 'heartbeat');
  const service = new AiHeartbeatService({ store: ctx.store, clock: ctx.clock, staleAfterMs: 5_000 });
  const current = await service.record({ node_id: node.node_id, version: '1.0', runtime_version: 'llama.cpp-b10172' });
  assert.equal(service.status(current), 'active');
  ctx.advance(5_001);
  assert.equal(service.status(current), 'stale');
});

test('circuit breaker abre e retorna a half-open após cooldown', () => {
  let now = 1000;
  const breaker = new CircuitBreaker({ threshold: 2, cooldownMs: 500, clock: () => now });
  breaker.failure('node');
  assert.equal(breaker.state('node'), 'closed');
  breaker.failure('node');
  assert.equal(breaker.state('node'), 'open');
  now += 501;
  assert.equal(breaker.state('node'), 'half_open');
});

test('roteador nunca abandona fallback determinístico sem resultado validado', () => {
  const flags = loadLocalAiFlags({ CONVERSATION_LOCAL_AI_ENABLED: 'true', CONVERSATION_LOCAL_AI_SHADOW: 'false' });
  const router = new AiFallbackRouter({ flags });
  assert.equal(router.route({ node_ready: false }).public_source, 'deterministic');
  assert.equal(router.route({ node_ready: true, validated_result: false }).public_source, 'deterministic');
  assert.equal(router.route({ node_ready: true, validated_result: true }).public_source, 'local_ai');
});

test('rotação invalida credencial antiga e preserva identidade do nó', async () => {
  const ctx = fixture();
  const node = await registerNode(ctx, 'rotate');
  const rotated = await ctx.registry.rotateCredential(node.node_id);
  assert.equal(rotated.node_id, node.node_id);
  assert.notEqual(rotated.device_credential, node.device_credential);
  assert.equal((await ctx.store.getNode(node.node_id)).credential_version, 2);
});

test('métricas não carregam payload conversacional', () => {
  const metrics = new AiBridgeMetrics();
  metrics.record({ job_id: 'job', node_id: 'node', state: 'completed', total_ms: 12, tokens_per_second: 4, message: 'não persistir' });
  const snapshot = metrics.snapshot();
  assert.equal(JSON.stringify(snapshot).includes('não persistir'), false);
  assert.equal(snapshot.completed, 1);
});

test('contrato PostgreSQL possui claim concorrente, idempotência e eventos append-only', () => {
  assert.match(POSTGRES_MIGRATION, /idempotency_key text NOT NULL UNIQUE/iu);
  assert.match(PostgresAiBridgeStore.prototype.claimNext.toString(), /FOR UPDATE SKIP LOCKED/iu);
  assert.match(POSTGRES_MIGRATION, /append_only/iu);
  assert.match(POSTGRES_MIGRATION, /conversation_ai_job_one_result/iu);
  assert.match(POSTGRES_MIGRATION, /conversation_ai_nonce/iu);
});

test('hash do payload é canônico e independente da ordem de chaves', () => {
  assert.equal(payloadHash({ a: 1, b: 2 }), payloadHash({ b: 2, a: 1 }));
  const sanitized = sanitizeAiContext({ message: 'segura', unauthorized: 'removida' });
  assert.deepEqual(sanitized.payload, { message: 'segura' });
  assert.ok(sanitized.removed_fields.includes('$.unauthorized'));
});
