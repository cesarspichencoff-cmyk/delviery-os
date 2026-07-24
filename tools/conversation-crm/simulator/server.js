#!/usr/bin/env node
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { ConversationEngine } = require('../../../src/conversation-crm/engine');
const cases = require('../../../src/conversation-crm/simulator/cases');

const APP_ROOT = path.join(__dirname, 'app');
const MAX_BODY_BYTES = 32 * 1024;
const EVALUATION_OPTIONS = new Set(['correct', 'incorrect', 'bad_response', 'wrong_severity', 'wrong_block', 'should_be_human', 'should_not_be_human']);

function send(response, status, body, contentType = 'application/json; charset=utf-8') {
  response.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'"
  });
  response.end(body);
}

function sendJson(response, status, value) {
  send(response, status, JSON.stringify(value));
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('payload_too_large');
      error.code = 'PAYLOAD_TOO_LARGE';
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    const error = new Error('invalid_json');
    error.code = 'INVALID_JSON';
    throw error;
  }
}

function staticFile(response, fileName, contentType) {
  const filePath = path.join(APP_ROOT, fileName);
  send(response, 200, fs.readFileSync(filePath), contentType);
}

function safeError(error) {
  const allowed = new Set(['PAYLOAD_TOO_LARGE', 'INVALID_JSON', 'REAL_DATA_NOT_ALLOWED', 'PROFILE_NAO_ENCONTRADO']);
  return { ok: false, error_code: allowed.has(error?.code) ? error.code : 'SIMULATOR_REQUEST_FAILED' };
}

function createServer(options = {}) {
  const engine = options.engine || new ConversationEngine();
  const evaluations = [];
  return http.createServer(async (request, response) => {
    try {
      if (request.method === 'GET' && request.url === '/') return staticFile(response, 'index.html', 'text/html; charset=utf-8');
      if (request.method === 'GET' && request.url === '/app.js') return staticFile(response, 'app.js', 'application/javascript; charset=utf-8');
      if (request.method === 'GET' && request.url === '/styles.css') return staticFile(response, 'styles.css', 'text/css; charset=utf-8');
      if (request.method === 'GET' && request.url === '/api/health') return sendJson(response, 200, { ok: true, mode: 'synthetic_local_only' });
      if (request.method === 'GET' && request.url === '/api/cases') return sendJson(response, 200, { cases });

      if (request.method === 'POST' && request.url === '/api/triage') {
        const body = await readJson(request);
        const result = engine.triage({ message: body.message, context: { ...(body.context || {}), data_mode: 'synthetic' }, profile_id: body.profile_id });
        return sendJson(response, 200, { ok: true, result });
      }

      if (request.method === 'POST' && request.url === '/api/evaluations') {
        const body = await readJson(request);
        if (!EVALUATION_OPTIONS.has(body.verdict)) return sendJson(response, 400, { ok: false, error_code: 'INVALID_EVALUATION' });
        evaluations.push(Object.freeze({
          evaluation_id: `eval_${evaluations.length + 1}`,
          case_id: typeof body.case_id === 'string' ? body.case_id.slice(0, 40) : 'manual',
          verdict: body.verdict
        }));
        return sendJson(response, 201, { ok: true, evaluation_count: evaluations.length });
      }

      return sendJson(response, 404, { ok: false, error_code: 'NOT_FOUND' });
    } catch (error) {
      return sendJson(response, error?.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400, safeError(error));
    }
  });
}

function start(options = {}) {
  const host = '127.0.0.1';
  const port = Number(options.port || process.env.DELIVERYOS_CRM_SIMULATOR_PORT || 4179);
  const server = createServer(options);
  server.listen(port, host, () => {
    process.stdout.write(`Conversation CRM Pilot V0 disponível localmente em http://${host}:${port}\n`);
    process.stdout.write('Modo sintético; nenhuma integração externa está ativa.\n');
  });
  return server;
}

if (require.main === module) start();

module.exports = { MAX_BODY_BYTES, EVALUATION_OPTIONS, createServer, start };

