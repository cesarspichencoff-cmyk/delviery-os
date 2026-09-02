'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createNativeServer } = require('../../tools/conversation-crm/native-server');

function request(port, method, route, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: route,
      method,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function withServer(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-customer-menu-panel-'));
  const server = createNativeServer({ runtimeRoot: path.join(root, 'runtime'), feedbackRoot: path.join(root, 'feedback') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return server.address().port;
}

test('painel mantém navegação nativa e seis áreas de inteligência', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '..', '..', 'tools', 'conversation-crm', 'simulator', 'app', 'index.html'), 'utf8');
  for (const label of [
    'Clientes — CRM', 'Importações', 'Cardápios e conhecimento',
    'Recomendações', 'Consentimentos', 'Auditoria'
  ]) assert.ok(html.includes(label), label);
  assert.ok(html.includes('AMBIENTE DE SIMULAÇÃO'));
});

test('bootstrap do painel mantém clientes sintéticos, catálogo oficial e custo zero', async (t) => {
  const port = await withServer(t);
  const response = await request(port, 'GET', '/api/customer-menu/bootstrap');
  const body = JSON.parse(response.body);
  assert.equal(response.status, 200);
  assert.equal(body.synthetic, true);
  assert.equal(body.external_cost_brl, 0);
  assert.equal(body.real_drivers, false);
  assert.equal(body.customers.length, 3);
  assert.equal(body.menu.items.length, 426);
  assert.equal(body.menu.conflicts.length, 1);
});

test('ficha segura não expõe telefone sintético', async (t) => {
  const port = await withServer(t);
  const response = await request(port, 'GET', '/api/customer-menu/customers/SIM-CUSTOMER-001');
  assert.equal(response.status, 200);
  assert.equal(response.body.includes('11990000101'), false);
});

test('recomendação do painel respeita canal', async (t) => {
  const port = await withServer(t);
  const response = await request(port, 'POST', '/api/customer-menu/recommend', {
    customer_id: 'SIM-CUSTOMER-001',
    channel: 'ifood',
    unit_id: 'tata-sushi-vila-nova-conceicao',
    cream_cheese: 'without'
  });
  const body = JSON.parse(response.body);
  assert.equal(response.status, 200);
  assert.ok(body.result.data.candidates.every((item) => item.channel === 'ifood'));
});

test('alergia sem garantia devolve nenhuma opção segura', async (t) => {
  const port = await withServer(t);
  const response = await request(port, 'POST', '/api/customer-menu/recommend', {
    customer_id: 'SIM-CUSTOMER-002',
    channel: 'dining_room',
    unit_id: 'tata-sushi-itaim-bibi',
    allergies: ['gluten']
  });
  const body = JSON.parse(response.body);
  assert.equal(body.result.data.status, 'no_safe_candidate');
});

test('headers mantêm painel local sem origem externa', async (t) => {
  const port = await withServer(t);
  const response = await request(port, 'GET', '/');
  assert.match(response.headers['content-security-policy'], /default-src 'self'/u);
  assert.match(response.headers['content-security-policy'], /connect-src 'self'/u);
});
