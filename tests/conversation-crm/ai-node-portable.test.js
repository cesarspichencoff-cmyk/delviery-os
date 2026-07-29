'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  loadNodeConfig,
  validateBridgeUrl,
  confinedPath,
  AdaptivePollSchedule,
  InMemorySecretProtector,
  DpapiPowerShellProtector,
  NodeIdentityStore,
  OutboundCloudConnector,
  registerWithBridge,
  classifyHardware,
  hardwareReport,
  writeHardwareReports,
  LlamaCppRuntime,
  LocalModelProvider,
  DeliveryOsAiNode,
  sha256File,
  validateArtifact,
  UpdateManager
} = require('../../apps/deliveryos-ai-node');

const APP_ROOT = path.resolve(__dirname, '../../apps/deliveryos-ai-node');

function temporary(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `deliveryos-ai-node-${name}-`));
}

test('configuração aceita somente bridge HTTPS explícito e bind local', () => {
  const root = temporary('config');
  const config = loadNodeConfig({
    root,
    bridge_url: 'https://deliveryos.example.invalid',
    bridge_host: 'deliveryos.example.invalid'
  });
  assert.equal(config.local_host, '127.0.0.1');
  assert.equal(config.real_drivers_enabled, false);
  assert.ok(config.models_root.startsWith(root));
  assert.throws(() => validateBridgeUrl('http://deliveryos.example.invalid'), { code: 'AI_NODE_BRIDGE_URL_UNSAFE' });
  assert.throws(() => validateBridgeUrl('https://user:secret@deliveryos.example.invalid'), { code: 'AI_NODE_BRIDGE_URL_UNSAFE' });
  assert.throws(() => loadNodeConfig({ root, bridge_url: 'https://deliveryos.example.invalid', local_host: '0.0.0.0' }), { code: 'AI_NODE_LOCAL_BIND_FORBIDDEN' });
  fs.rmSync(root, { recursive: true, force: true });
});

test('host divergente e path fora da raiz são recusados', () => {
  const root = temporary('paths');
  assert.throws(() => validateBridgeUrl('https://one.example.invalid', 'two.example.invalid'), { code: 'AI_NODE_BRIDGE_HOST_MISMATCH' });
  assert.throws(() => confinedPath(root, '..\\outside'), { code: 'AI_NODE_PATH_OUTSIDE_ROOT' });
  fs.rmSync(root, { recursive: true, force: true });
});

test('polling adaptativo reduz latência com trabalho e faz backoff sem trabalho', () => {
  const schedule = new AdaptivePollSchedule({ minimum: 100, maximum: 500, factor: 2, jitterRatio: 0, random: () => 0.5 });
  assert.equal(schedule.next(false), 200);
  assert.equal(schedule.next(false), 400);
  assert.equal(schedule.next(false), 500);
  assert.equal(schedule.next(true), 100);
});

test('identidade local nunca persiste chave privada ou credencial em texto puro', () => {
  const root = temporary('identity');
  const protector = new InMemorySecretProtector();
  const store = new NodeIdentityStore({ root, protector });
  const created = store.create();
  const before = fs.readFileSync(store.file, 'utf8');
  assert.match(created.public_key_pem, /PUBLIC KEY/u);
  assert.doesNotMatch(before, /PRIVATE KEY/u);
  store.saveRegistration({
    node_id: 'ain_synthetic',
    device_credential: 'DEVICE-CREDENTIAL-UNIQUE',
    unit_id: 'SIM-UNIT',
    bridge_origin: 'https://deliveryos.example.invalid'
  });
  const persisted = fs.readFileSync(store.file, 'utf8');
  assert.equal(persisted.includes('DEVICE-CREDENTIAL-UNIQUE'), false);
  const loaded = store.load();
  assert.equal(loaded.device_credential, 'DEVICE-CREDENTIAL-UNIQUE');
  assert.equal(loaded.private_key.asymmetricKeyType, 'ed25519');
  fs.rmSync(root, { recursive: true, force: true });
});

test('registro usa apenas endpoint HTTPS canônico e envia chave pública', async () => {
  let captured;
  const result = await registerWithBridge({
    bridge_url: 'https://deliveryos.example.invalid',
    bridge_host: 'deliveryos.example.invalid',
    installation_code: 'synthetic-code',
    unit_id: 'SIM-UNIT',
    public_key_pem: 'PUBLIC-KEY-SYNTHETIC',
    allowed_models: ['qwen3-4b-q4km'],
    version: '0.1.0',
    fetch: async (url, init) => {
      captured = { url: String(url), init };
      return { ok: true, json: async () => ({ node_id: 'ain_synthetic', device_credential: 'credential-synthetic' }) };
    }
  });
  assert.equal(result.node_id, 'ain_synthetic');
  assert.equal(captured.url, 'https://deliveryos.example.invalid/api/conversation-ai/register');
  assert.equal(captured.init.redirect, 'error');
  assert.equal(JSON.parse(captured.init.body).public_key_pem, 'PUBLIC-KEY-SYNTHETIC');
});

test('conector é somente de saída, assina requisição e fixa destino', async () => {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  let captured;
  const connector = new OutboundCloudConnector({
    bridge_url: 'https://deliveryos.example.invalid',
    bridge_host: 'deliveryos.example.invalid',
    node_id: 'ain_synthetic',
    device_credential: 'credential-synthetic',
    private_key: privateKey,
    clock: () => Date.parse('2026-07-28T12:00:00Z'),
    nonceFactory: () => 'nonce-synthetic',
    fetch: async (url, init) => {
      captured = { url: String(url), init };
      return { ok: true, status: 200, json: async () => ({ accepted: true }) };
    }
  });
  await connector.heartbeat({ version: '0.1.0' });
  assert.equal(captured.url, 'https://deliveryos.example.invalid/api/conversation-ai/heartbeat');
  assert.ok(captured.init.headers['x-deliveryos-signature']);
  assert.equal(captured.init.headers['x-deliveryos-device-credential'], 'credential-synthetic');
  await assert.rejects(connector.request('/admin', {}), { code: 'AI_NODE_PATH_NOT_ALLOWED' });
});

test('doctor classifica hardware de forma conservadora', () => {
  const GiB = 1024 ** 3;
  assert.equal(classifyHardware({ ram_total_bytes: 4 * GiB, disk_free_bytes: 20 * GiB, cpu: { threads: 8 } }), 'nao_compativel');
  assert.equal(classifyHardware({ ram_total_bytes: 8 * GiB, disk_free_bytes: 20 * GiB, cpu: { threads: 4 } }), 'basico');
  assert.equal(classifyHardware({ ram_total_bytes: 16 * GiB, disk_free_bytes: 20 * GiB, cpu: { threads: 8 }, gpu: null }), 'intermediario');
  assert.equal(classifyHardware({ ram_total_bytes: 32 * GiB, disk_free_bytes: 20 * GiB, cpu: { threads: 16 }, gpu: { vram_bytes: 12 * GiB } }), 'avancado');
});

test('doctor escreve JSON e Markdown sem depender de caminho de máquina', () => {
  const root = temporary('doctor');
  const GiB = 1024 ** 3;
  const report = hardwareReport({
    platform: 'win32',
    release: 'synthetic',
    architecture: 'x64',
    cpu: { model: 'Synthetic CPU', threads: 8 },
    ram_total_bytes: 16 * GiB,
    ram_available_bytes: 8 * GiB,
    gpu: { name: 'Synthetic GPU', vram_bytes: 6 * GiB },
    disk_free_bytes: 50 * GiB
  });
  const files = writeHardwareReports(report, root);
  assert.equal(fs.existsSync(files.json), true);
  assert.match(fs.readFileSync(files.markdown, 'utf8'), /intermediario/u);
  assert.equal(fs.readFileSync(files.json, 'utf8').includes('C:\\Users\\'), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('runtime llama.cpp proíbe bind público e traversal de modelo', () => {
  assert.throws(() => new LlamaCppRuntime({
    executable: 'llama-server.exe',
    models_root: temporary('model-root'),
    host: '0.0.0.0'
  }), { code: 'LLAMA_CPP_PUBLIC_BIND_FORBIDDEN' });
  const root = temporary('model-path');
  const runtime = new LlamaCppRuntime({ executable: path.join(root, 'llama.exe'), models_root: root });
  assert.throws(() => runtime.resolveModel('..\\outside.gguf'), { code: 'LLAMA_CPP_MODEL_PATH_INVALID' });
  fs.rmSync(root, { recursive: true, force: true });
});

test('runtime inicia llama-server com 127.0.0.1 e shell desativado', async () => {
  const root = temporary('llama-start');
  const executable = path.join(root, 'llama-server.exe');
  const model = path.join(root, 'model.gguf');
  fs.writeFileSync(executable, 'synthetic');
  fs.writeFileSync(model, 'synthetic');
  let captured;
  const fakeProcess = {
    once() {},
    kill() {},
    stdout: null,
    stderr: null
  };
  const runtime = new LlamaCppRuntime({
    executable,
    models_root: root,
    spawn: (file, args, options) => {
      captured = { file, args, options };
      return fakeProcess;
    }
  });
  await runtime.start({ model: 'model.gguf', context_size: 2048, gpu_layers: 0 });
  assert.deepEqual(captured.args.slice(0, 4), ['--host', '127.0.0.1', '--port', '4191']);
  assert.equal(captured.options.shell, false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('runtime estruturado aceita somente JSON parseável', async () => {
  const runtime = new LlamaCppRuntime({
    executable: 'synthetic.exe',
    models_root: temporary('structured'),
    fetch: async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"dialogue_act":"greet"}' } }], usage: {} })
    })
  });
  runtime.process = {};
  runtime.model = 'synthetic.gguf';
  const result = await runtime.generateStructured({ messages: [], json_schema: { name: 'director', schema: {} } });
  assert.equal(result.dialogue_act, 'greet');
  fs.rmSync(runtime.modelsRoot, { recursive: true, force: true });
});

test('provider devolve envelope vinculado ao hash e versões do job', async () => {
  const runtime = {
    generateStructured: async () => ({ dialogue_act: 'greet' }),
    generateText: async () => 'texto',
    metrics: () => ({ total_ms: 5 })
  };
  const provider = new LocalModelProvider({ runtime, model_version: 'model-v1', provider_version: 'runtime-v1' });
  const job = { request_type: 'conversation_director', payload_hash: 'hash' };
  const result = await provider.generate(job, { messages: [], json_schema: { schema: {} } });
  assert.equal(result.schema_version, 'local-ai-conversation_director-result-v1');
  assert.equal(result.payload_hash, 'hash');
  assert.deepEqual(result.output, { dialogue_act: 'greet' });
});

test('node processa claim completo sem abrir servidor local', async () => {
  const calls = [];
  const connector = {
    heartbeat: async () => calls.push('heartbeat'),
    claim: async () => ({ job: { job_id: 'job-1', request_type: 'response_writer', payload_hash: 'hash' }, lease_token: 'lease' }),
    processing: async () => calls.push('processing'),
    complete: async () => calls.push('complete')
  };
  const provider = {
    modelVersion: 'model-v1',
    providerVersion: 'runtime-v1',
    runtime: { health: async () => ({ state: 'ready' }), metrics: () => ({}) },
    generate: async () => ({ output: 'safe' })
  };
  const node = new DeliveryOsAiNode({
    connector,
    provider,
    node_id: 'ain_synthetic',
    clock: () => 1000,
    contractFactory: () => ({ messages: [] })
  });
  await node.heartbeat(true);
  const result = await node.tick();
  assert.equal(result.state, 'completed');
  assert.deepEqual(calls, ['heartbeat', 'processing', 'complete']);
  assert.equal(Object.hasOwn(node, 'server'), false);
});

test('falha local não é apresentada como resultado concluído', async () => {
  let completed = 0;
  const node = new DeliveryOsAiNode({
    connector: {
      heartbeat: async () => null,
      claim: async () => ({ job: { job_id: 'job-fail' }, lease_token: 'lease' }),
      processing: async () => null,
      complete: async () => { completed += 1; }
    },
    provider: {
      modelVersion: 'model-v1',
      providerVersion: 'runtime-v1',
      runtime: { health: async () => ({ state: 'ready' }), metrics: () => ({}) },
      generate: async () => { throw Object.assign(new Error('fail'), { code: 'MODEL_FAILED' }); }
    },
    node_id: 'ain_synthetic',
    contractFactory: () => ({})
  });
  const result = await node.tick();
  assert.equal(result.state, 'local_failed');
  assert.equal(completed, 0);
});

test('manifesto fixa origem, versão, tamanho, digest e licença', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'manifests/model-manifest.json'), 'utf8'));
  assert.equal(manifest.artifacts.length, 5);
  for (const artifact of manifest.artifacts) {
    assert.doesNotMatch(artifact.url, /\/latest\b/iu);
    assert.match(artifact.sha256, /^[a-f0-9]{64}$/u);
    assert.ok(artifact.size_bytes > 0);
    assert.ok(artifact.version);
    assert.ok(artifact.license);
    validateArtifact(artifact);
  }
});

test('update manager verifica tamanho e SHA-256 antes de promover arquivo', async () => {
  const root = temporary('update');
  const body = Buffer.from('synthetic-official-artifact');
  const artifact = {
    id: 'synthetic-artifact',
    filename: 'artifact.bin',
    url: 'https://nodejs.org/synthetic/artifact.bin',
    size_bytes: body.length,
    sha256: crypto.createHash('sha256').update(body).digest('hex')
  };
  const manager = new UpdateManager({
    root,
    fetch: async () => ({ ok: true, arrayBuffer: async () => body })
  });
  const destination = await manager.download(artifact);
  assert.equal(sha256File(destination), artifact.sha256);
  assert.equal(fs.existsSync(path.join(root, '.synthetic-artifact.partial')), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('hash divergente aborta instalação e remove arquivo parcial', async () => {
  const root = temporary('bad-update');
  const body = Buffer.from('synthetic');
  const manager = new UpdateManager({ root, fetch: async () => ({ ok: true, arrayBuffer: async () => body }) });
  await assert.rejects(manager.download({
    id: 'bad-artifact',
    filename: 'bad.bin',
    url: 'https://nodejs.org/bad.bin',
    size_bytes: body.length,
    sha256: '0'.repeat(64)
  }), { code: 'UPDATE_HASH_MISMATCH' });
  assert.equal(fs.readdirSync(root).length, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test('scripts do instalador têm sintaxe PowerShell válida', () => {
  const scripts = fs.readdirSync(path.join(APP_ROOT, 'installer')).filter((name) => name.endsWith('.ps1'))
    .concat(fs.readdirSync(path.join(APP_ROOT, 'scripts')).filter((name) => name.endsWith('.ps1')).map((name) => `..\\scripts\\${name}`));
  for (const relative of scripts) {
    const file = path.resolve(APP_ROOT, 'installer', relative);
    const escaped = file.replace(/'/gu, "''");
    const command = `$e=$null;$t=$null;[Management.Automation.Language.Parser]::ParseFile('${escaped}',[ref]$t,[ref]$e)|Out-Null;if($e.Count){$e|ForEach-Object{Write-Error $_};exit 1}`;
    const parsed = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true });
    assert.equal(parsed.status, 0, `${relative}: ${parsed.stderr}`);
  }
});

test('instalador suporta offline, hashes e inicialização sem login', () => {
  const install = fs.readFileSync(path.join(APP_ROOT, 'installer/Install-DeliveryOS-AINode.ps1'), 'utf8');
  const common = fs.readFileSync(path.join(APP_ROOT, 'installer/Common.ps1'), 'utf8');
  assert.match(install, /OfflineBundle/u);
  assert.match(install, /ScheduledTaskPrincipal -UserId 'SYSTEM'/u);
  assert.match(install, /127\.0\.0\.1/u);
  assert.doesNotMatch(install, /0\.0\.0\.0/u);
  assert.match(common, /Get-FileHash/u);
  assert.match(common, /Invoke-WebRequest/u);
  assert.doesNotMatch(common, /Invoke-Expression|iex\b/iu);
});

test('árvore do AI Node não contém peso, binário ou caminho pessoal', () => {
  const files = [];
  const walk = (root) => {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      const target = path.join(root, entry.name);
      if (entry.isDirectory()) walk(target);
      else files.push(target);
    }
  };
  walk(APP_ROOT);
  assert.equal(files.some((file) => /\.gguf$|\.exe$|\.zip$/iu.test(file)), false);
  const text = files.filter((file) => /\.(?:js|json|md|ps1)$/iu.test(file)).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.equal(text.includes('C:\\Users\\italo'), false);
  assert.equal(text.includes('Desktop\\'), false);
  assert.equal(text.includes('Downloads\\'), false);
});

test('AI Node carrega isolado após ser movido para outro caminho', () => {
  const root = temporary('moved-copy');
  const moved = path.join(root, 'renamed-portable-node');
  fs.cpSync(APP_ROOT, moved, { recursive: true });
  const isolated = require(path.join(moved, 'index.js'));
  const config = isolated.loadNodeConfig({
    root: moved,
    bridge_url: 'https://deliveryos.example.invalid'
  });
  assert.equal(config.local_host, '127.0.0.1');
  fs.rmSync(root, { recursive: true, force: true });
});

test('DPAPI protege e restaura segredo sintético no Windows', { skip: process.platform !== 'win32' }, () => {
  const protector = new DpapiPowerShellProtector({
    script: path.join(APP_ROOT, 'scripts/Protect-NodeSecret.ps1')
  });
  const marker = 'SYNTHETIC-DPAPI-MARKER';
  assert.equal(protector.unprotect(protector.protect(marker)), marker);
});
