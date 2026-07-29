'use strict';

function fail(code) { throw Object.assign(new Error(code), { code }); }

async function registerWithBridge(input = {}) {
  const base = new URL(input.bridge_url);
  if (base.protocol !== 'https:' || base.username || base.password) fail('AI_NODE_BRIDGE_URL_UNSAFE');
  if (input.bridge_host && base.hostname.toLowerCase() !== String(input.bridge_host).toLowerCase()) fail('AI_NODE_BRIDGE_HOST_MISMATCH');
  const target = new URL('/api/conversation-ai/register', base);
  if (target.origin !== base.origin) fail('AI_NODE_DESTINATION_FORBIDDEN');
  const response = await (input.fetch || globalThis.fetch)(target, {
    method: 'POST',
    redirect: 'error',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      installation_code: input.installation_code,
      unit_id: input.unit_id,
      public_key_pem: input.public_key_pem,
      allowed_models: input.allowed_models,
      version: input.version
    })
  });
  if (!response.ok) fail(`AI_NODE_REGISTRATION_HTTP_${response.status}`);
  const result = await response.json();
  if (!result.node_id || !result.device_credential) fail('AI_NODE_REGISTRATION_RESPONSE_INVALID');
  return result;
}

module.exports = { registerWithBridge };
