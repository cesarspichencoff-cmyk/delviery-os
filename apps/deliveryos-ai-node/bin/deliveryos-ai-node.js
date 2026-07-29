#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  loadNodeConfig,
  NodeIdentityStore,
  DpapiPowerShellProtector,
  registerWithBridge,
  collectNodeProbe,
  collectWindowsProbe,
  hardwareReport,
  writeHardwareReports,
  LlamaCppRuntime,
  LocalModelProvider,
  OutboundCloudConnector,
  DeliveryOsAiNode,
  buildDirectorPrompt
} = require('..');

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function readStdinJson() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  return JSON.parse(raw || '{}');
}

function protector(root) {
  return new DpapiPowerShellProtector({ script: path.join(root, 'scripts', 'Protect-NodeSecret.ps1') });
}

async function doctor(root) {
  let probe = collectNodeProbe();
  if (process.platform === 'win32') {
    try { probe = { ...probe, ...collectWindowsProbe(path.join(root, 'scripts', 'Collect-Hardware.ps1')) }; } catch {}
  }
  const report = hardwareReport(probe);
  const files = writeHardwareReports(report, path.join(root, 'state', 'diagnostics'));
  process.stdout.write(JSON.stringify({ report, files }) + '\n');
}

async function register(root) {
  const input = await readStdinJson();
  const config = loadNodeConfig({ ...input, root });
  const store = new NodeIdentityStore({ root: config.config_root, protector: protector(root) });
  if (!fs.existsSync(store.file)) store.create();
  const identity = store.load();
  const result = await registerWithBridge({
    ...input,
    bridge_url: config.bridge_url,
    bridge_host: config.bridge_host,
    public_key_pem: identity.public_key_pem,
    version: input.version || '0.1.0'
  });
  store.saveRegistration({
    ...result,
    unit_id: input.unit_id,
    bridge_origin: config.bridge_origin
  });
  process.stdout.write(JSON.stringify({ node_id: result.node_id, registered: true }) + '\n');
}

async function run(root) {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'config', 'node-config.json'), 'utf8'));
  const config = loadNodeConfig({ ...raw, root });
  const store = new NodeIdentityStore({ root: config.config_root, protector: protector(root) });
  const identity = store.load();
  if (!identity.node_id || !identity.device_credential) throw Object.assign(new Error('AI_NODE_NOT_REGISTERED'), { code: 'AI_NODE_NOT_REGISTERED' });
  const runtime = new LlamaCppRuntime({
    executable: path.join(config.runtime_root, 'llama.cpp', 'llama-server.exe'),
    models_root: config.models_root,
    host: '127.0.0.1',
    port: config.local_port
  });
  await runtime.start({ model: raw.model_file, context_size: raw.context_size || 4096, gpu_layers: raw.gpu_layers || 0 });
  await runtime.waitUntilReady({ timeout_ms: 90_000 });
  const provider = new LocalModelProvider({
    runtime,
    model_version: raw.model_version,
    provider_version: raw.provider_version
  });
  const connector = new OutboundCloudConnector({
    bridge_url: config.bridge_url,
    bridge_host: config.bridge_host,
    node_id: identity.node_id,
    device_credential: identity.device_credential,
    private_key: identity.private_key,
    timeout_ms: config.request_timeout_ms
  });
  const node = new DeliveryOsAiNode({
    connector,
    provider,
    node_id: identity.node_id,
    heartbeat_ms: config.heartbeat_ms,
    poll: { minimum: config.poll_min_ms, maximum: config.poll_max_ms },
    contractFactory: (job) => job.request_type === 'conversation_director'
      ? buildDirectorPrompt(job.payload)
      : ({
          messages: [
            { role: 'system', content: 'Produza somente a saída solicitada pelo contrato DeliveryOS. Não invente fatos nem ações.' },
            { role: 'user', content: JSON.stringify(job.payload) }
          ],
          max_tokens: 512
        })
  });
  const controller = new AbortController();
  process.once('SIGINT', () => { node.stop(); controller.abort(); });
  process.once('SIGTERM', () => { node.stop(); controller.abort(); });
  try { await node.start(controller.signal); } finally { await runtime.shutdown(); }
}

async function main() {
  const command = process.argv[2];
  const root = path.resolve(argument('root', path.join(process.env.ProgramData || process.cwd(), 'DeliveryOS', 'AINode')));
  if (command === 'doctor') return doctor(root);
  if (command === 'register') return register(root);
  if (command === 'run') return run(root);
  throw Object.assign(new Error('AI_NODE_COMMAND_INVALID'), { code: 'AI_NODE_COMMAND_INVALID' });
}

main().catch((error) => {
  process.stderr.write(JSON.stringify({ error: error.code || 'AI_NODE_FAILED' }) + '\n');
  process.exitCode = 1;
});
