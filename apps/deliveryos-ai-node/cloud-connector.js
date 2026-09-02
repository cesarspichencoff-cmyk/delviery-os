'use strict';

const { signNodeRequest } = require('./request-signing');

function fail(code) { throw Object.assign(new Error(code), { code }); }

class OutboundCloudConnector {
  constructor(options = {}) {
    this.base = new URL(options.bridge_url);
    if (this.base.protocol !== 'https:' || this.base.username || this.base.password) fail('AI_NODE_BRIDGE_URL_UNSAFE');
    this.expectedHost = String(options.bridge_host || this.base.hostname).toLowerCase();
    if (this.base.hostname.toLowerCase() !== this.expectedHost) fail('AI_NODE_BRIDGE_HOST_MISMATCH');
    this.nodeId = options.node_id;
    this.credential = options.device_credential;
    this.privateKey = options.private_key;
    this.fetch = options.fetch || globalThis.fetch;
    this.clock = options.clock || (() => Date.now());
    this.nonceFactory = options.nonceFactory || (() => require('node:crypto').randomUUID());
    this.timeoutMs = Number(options.timeout_ms || 20_000);
  }

  async request(pathname, body = {}) {
    if (!/^\/api\/conversation-ai\/(?:heartbeat|claim|processing|complete)$/u.test(pathname)) fail('AI_NODE_PATH_NOT_ALLOWED');
    const target = new URL(pathname, this.base);
    if (target.protocol !== 'https:' || target.hostname.toLowerCase() !== this.expectedHost || target.origin !== this.base.origin) fail('AI_NODE_DESTINATION_FORBIDDEN');
    const base = {
      node_id: this.nodeId,
      timestamp: new Date(this.clock()).toISOString(),
      nonce: this.nonceFactory(),
      method: 'POST',
      path: pathname,
      body
    };
    const signed = signNodeRequest(base, this.privateKey);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    timeout.unref?.();
    try {
      const response = await this.fetch(target, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-deliveryos-node-id': this.nodeId,
          'x-deliveryos-device-credential': this.credential,
          'x-deliveryos-timestamp': base.timestamp,
          'x-deliveryos-nonce': base.nonce,
          'x-deliveryos-body-hash': signed.body_hash,
          'x-deliveryos-signature': signed.signature
        },
        body: JSON.stringify(body)
      });
      if (!response.ok) fail(`AI_NODE_HTTP_${response.status}`);
      return response.status === 204 ? null : response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  heartbeat(body) { return this.request('/api/conversation-ai/heartbeat', body); }
  claim(body) { return this.request('/api/conversation-ai/claim', body); }
  processing(body) { return this.request('/api/conversation-ai/processing', body); }
  complete(body) { return this.request('/api/conversation-ai/complete', body); }
}

module.exports = { OutboundCloudConnector };
