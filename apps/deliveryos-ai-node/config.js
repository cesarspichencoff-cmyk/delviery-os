'use strict';

const path = require('node:path');

const SAFE_DEFAULTS = Object.freeze({
  poll_min_ms: 750,
  poll_max_ms: 15_000,
  heartbeat_ms: 15_000,
  request_timeout_ms: 20_000,
  local_host: '127.0.0.1',
  local_port: 4191,
  real_drivers_enabled: false
});

function fail(code) {
  throw Object.assign(new Error(code), { code });
}

function validateBridgeUrl(value, expectedHost) {
  let url;
  try { url = new URL(value); } catch { fail('AI_NODE_BRIDGE_URL_INVALID'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) fail('AI_NODE_BRIDGE_URL_UNSAFE');
  if (expectedHost && url.hostname.toLowerCase() !== String(expectedHost).toLowerCase()) fail('AI_NODE_BRIDGE_HOST_MISMATCH');
  return url;
}

function confinedPath(root, relative, code = 'AI_NODE_PATH_OUTSIDE_ROOT') {
  const base = path.resolve(root);
  const target = path.resolve(base, relative);
  if (target !== base && !target.startsWith(base + path.sep)) fail(code);
  return target;
}

function loadNodeConfig(input = {}) {
  const root = path.resolve(input.root || process.cwd());
  const bridge = validateBridgeUrl(input.bridge_url, input.bridge_host);
  if (input.real_drivers_enabled === true) fail('AI_NODE_REAL_DRIVERS_FORBIDDEN');
  if (input.local_host && input.local_host !== '127.0.0.1') fail('AI_NODE_LOCAL_BIND_FORBIDDEN');
  const localPort = Number(input.local_port || SAFE_DEFAULTS.local_port);
  if (!Number.isInteger(localPort) || localPort < 1024 || localPort > 65535) fail('AI_NODE_LOCAL_PORT_INVALID');
  return Object.freeze({
    ...SAFE_DEFAULTS,
    bridge_url: bridge.toString(),
    bridge_origin: bridge.origin,
    bridge_host: bridge.hostname,
    root,
    bin_root: confinedPath(root, input.bin_dir || 'bin'),
    runtime_root: confinedPath(root, input.runtime_dir || 'runtime'),
    models_root: confinedPath(root, input.models_dir || 'models'),
    config_root: confinedPath(root, input.config_dir || 'config'),
    state_root: confinedPath(root, input.state_dir || 'state'),
    logs_root: confinedPath(root, input.logs_dir || 'logs'),
    updates_root: confinedPath(root, input.updates_dir || 'updates'),
    local_host: '127.0.0.1',
    local_port: localPort,
    poll_min_ms: Number(input.poll_min_ms || SAFE_DEFAULTS.poll_min_ms),
    poll_max_ms: Number(input.poll_max_ms || SAFE_DEFAULTS.poll_max_ms),
    heartbeat_ms: Number(input.heartbeat_ms || SAFE_DEFAULTS.heartbeat_ms),
    request_timeout_ms: Number(input.request_timeout_ms || SAFE_DEFAULTS.request_timeout_ms),
    real_drivers_enabled: false
  });
}

module.exports = { SAFE_DEFAULTS, validateBridgeUrl, confinedPath, loadNodeConfig };
