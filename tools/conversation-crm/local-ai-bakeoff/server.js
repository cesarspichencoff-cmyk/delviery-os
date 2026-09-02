#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { BlindBakeoffStore, canonicalHash } = require('../../../apps/deliveryos-ai-node');

const APP_ROOT = path.join(__dirname, 'app');
const MIME = Object.freeze({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' });

function body(request, maximum = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      raw += chunk;
      if (Buffer.byteLength(raw, 'utf8') > maximum) reject(Object.assign(new Error('PAYLOAD_TOO_LARGE'), { code: 'PAYLOAD_TOO_LARGE' }));
    });
    request.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch { reject(Object.assign(new Error('JSON_INVALID'), { code: 'JSON_INVALID' })); }
    });
    request.on('error', reject);
  });
}

function json(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

function createBakeoffServer(options = {}) {
  const store = options.store || new BlindBakeoffStore({ root: options.votesRoot, bundle: options.bundle, now: options.now });
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/api/bakeoff') {
        return json(response, 200, { ...store.bundle.public, summary: store.summary() });
      }
      if (request.method === 'POST' && url.pathname === '/api/bakeoff/vote') {
        return json(response, 200, { ok: true, vote: store.vote(await body(request)), summary: store.summary() });
      }
      if (request.method === 'GET' && url.pathname === '/api/bakeoff/reveal') {
        return json(response, 200, { ok: true, reveal: store.reveal(url.searchParams.get('case_id')) });
      }
      const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!/^[A-Za-z0-9._-]+$/u.test(requested)) return json(response, 404, { error: 'NOT_FOUND' });
      const file = path.join(APP_ROOT, requested);
      if (!fs.existsSync(file)) return json(response, 404, { error: 'NOT_FOUND' });
      response.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      return response.end(fs.readFileSync(file));
    } catch (error) {
      return json(response, 400, { error: error.code || 'BAKEOFF_REQUEST_FAILED' });
    }
  });
}

function loadBundle(root) {
  const resolved = path.resolve(root);
  const publicArtifact = JSON.parse(fs.readFileSync(path.join(resolved, 'BLIND_BAKEOFF_PUBLIC.json'), 'utf8'));
  const privateArtifact = JSON.parse(fs.readFileSync(path.join(resolved, 'BLIND_BAKEOFF_PRIVATE.json'), 'utf8'));
  const { canonical_hash: publicHash, ...publicBase } = publicArtifact;
  if (canonicalHash(publicBase) !== publicHash || privateArtifact.public_hash !== publicHash) {
    throw Object.assign(new Error('BAKEOFF_BUNDLE_INTEGRITY_INVALID'), { code: 'BAKEOFF_BUNDLE_INTEGRITY_INVALID' });
  }
  if (publicArtifact.schema_version !== 'deliveryos-local-ai-blind-public-v1' || privateArtifact.schema_version !== 'deliveryos-local-ai-blind-private-v1') {
    throw Object.assign(new Error('BAKEOFF_BUNDLE_SCHEMA_INVALID'), { code: 'BAKEOFF_BUNDLE_SCHEMA_INVALID' });
  }
  return { public: publicArtifact, private: privateArtifact };
}

if (require.main === module) {
  const bundleIndex = process.argv.indexOf('--bundle-root');
  const votesIndex = process.argv.indexOf('--votes-root');
  if (bundleIndex < 0 || votesIndex < 0) throw new Error('BAKEOFF_ROOTS_REQUIRED');
  const server = createBakeoffServer({ bundle: loadBundle(process.argv[bundleIndex + 1]), votesRoot: process.argv[votesIndex + 1] });
  const port = Number(process.env.PORT || 4189);
  server.listen(port, '127.0.0.1', () => process.stdout.write(`Bake-off local em http://127.0.0.1:${port}\n`));
}

module.exports = { APP_ROOT, body, createBakeoffServer, loadBundle };

