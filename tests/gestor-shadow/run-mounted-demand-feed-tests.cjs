'use strict';
// Executor do sensor -> feed local. Tudo sintetico: a pagina e um documento
// falso, o DevTools e injetado. A expressao REAL (com o sensor REAL inline) e
// executada num contexto isolado e passa por JSON, como o `returnByValue` faz.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const feedModule = require('../../runtime/reporting/gestor_mounted_demand_feed_v1.cjs');
const {createDemandFeed, buildExpression, validWsUrl, parseArgs, EXPEDITION, SCHEMA} = feedModule;

const SENSOR = fs.readFileSync(path.join(__dirname, '../../runtime/reporting/gestor_v3_visible_sensor.js'), 'utf8');
const SOURCE = fs.readFileSync(path.join(__dirname, '../../runtime/reporting/gestor_mounted_demand_feed_v1.cjs'), 'utf8');
const CUSTOMER = 'NOME_SECRETO_DO_CLIENTE';
const item = (name, quantity, observations = '', options = [], externalCode = null) =>
  ({name, quantity, observations, options, externalCode});
const order = (n, items, extra = {}) => ({
  id: 'PRIVATE-ORDER-UUID-' + n, displayId: String(n).padStart(4, '0'),
  merchant: {id: 'PRIVATE-MERCHANT-UUID'}, items,
  customer: {name: CUSTOMER, phone: '11999998888'}, createdAt: '2026-11-13T19:0' + (n % 10) + ':00-03:00', ...extra});

function page(orders, hostname) {
  return {
    location: {hostname}, visibilityState: 'hidden', readyState: 'complete',
    querySelectorAll() {
      return orders.map(o => ({
        get innerText() { return 'Pedido #' + o.displayId; },
        isConnected: true, parentElement: null, getClientRects() { return [{}]; },
        __reactFiber$lab: {memoizedProps: {}, return: {memoizedProps: {order: o}, return: null}},
      }));
    },
  };
}
// O que o DevTools devolveria: a expressao avaliada na pagina, serializada por valor.
function evaluatePage(doc, sensorMode) {
  const value = vm.runInNewContext(buildExpression(SENSOR, sensorMode), {document: doc, location: doc.location});
  return {kind: 'value', value: JSON.parse(JSON.stringify(value))};
}
function lab({mode = 'FIELD', hostname = 'gestordepedidos.ifood.com.br', url = EXPEDITION, previous = null} = {}) {
  const state = {orders: [], now: Date.parse('2026-11-13T22:00:00.000Z'), feeds: [], journal: [],
    port: 9222, tabs: null, ws: 'ws://127.0.0.1:9222/devtools/page/ABCDEF0123456789', evaluations: 0, failWrite: false,
    evaluate: null};
  const feed = createDemandFeed({
    mode, pageUrl: mode === 'FIXTURE' ? url : null, previous, sensorSha: 'test',
    edgePort: () => state.port,
    targets: async () => state.tabs ?? {kind: 'reply', value: [
      {type: 'page', url, webSocketDebuggerUrl: state.ws},
      {type: 'page', url: 'https://example.invalid/outra', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/OUTRAOUTRA'}]},
    evaluate: async () => {
      state.evaluations += 1;
      if (state.evaluate) return state.evaluate();
      return evaluatePage(page(state.orders, hostname), mode === 'FIELD' ? 'FIELD_REVIEW' : 'FIXTURE');
    },
    clock: () => state.now,
    writeFeed: doc => { if (state.failWrite) throw Error('disk'); state.feeds.push(JSON.parse(JSON.stringify(doc))); },
    appendJournal: line => state.journal.push(line),
  });
  const step = async (ms = 10000) => { state.now += ms; return feed.tick(); };
  return {state, step};
}
const kinds = j => j.map(l => l.k);
let n = 0;
const tests = [];
const test = (label, fn) => tests.push([label, fn]);

test('janela qualificada vira feed real com linhas, opcoes e observacoes', async () => {
  const {state, step} = lab();
  state.orders = [
    order(1, [item('Hot Roll', 2, 'Sem cebolinha'), item('Temaki Salmao', 1, '', [{name: 'Cream cheese', quantity: 1}])]),
    order(2, [item('Combinado 20', 1, '', [], '1.02.03.004.05')])];
  const doc = await step();
  assert.equal(doc.schema, SCHEMA);
  assert.equal(doc.source_mode, 'real');
  assert.deepEqual(doc.scan, {state: 'OBSERVED', reason: null});
  assert.equal(doc.window.visible_cards, 2);
  assert.equal(doc.window.lines, 3);
  assert.equal(doc.window.units, 4);
  assert.equal(doc.window.orders[0].short_code, '0001');
  assert.deepEqual(doc.window.orders[0].items[0], {name: 'Hot Roll', quantity: 2, note: 'Sem cebolinha', options: [], external_code: null});
  assert.deepEqual(doc.window.orders[0].items[1].options, [{name: 'Cream cheese', quantity: 1}]);
  assert.equal(doc.window.orders[0].items[1].note, null);
  assert.equal(doc.window.orders[1].items[0].external_code, '1.02.03.004.05');
  assert.equal(doc.window.orders[0].placed_at, '2026-11-13T22:01:00.000Z');
  assert.equal(doc.edge.page_visibility, 'hidden');
  assert.equal(doc.physical_state_claimed, false);
  assert.deepEqual(kinds(state.journal), ['start', 'seen', 'seen']);
});

test('nenhum identificador bruto nem dado de cliente sai da pagina para o feed ou o diario', async () => {
  const {state, step} = lab();
  state.orders = [order(1, [item('Hot Roll', 2, 'Sem cebolinha')])];
  await step();
  const all = JSON.stringify(state.feeds) + JSON.stringify(state.journal);
  for (const secret of ['PRIVATE-ORDER-UUID', 'PRIVATE-MERCHANT-UUID', CUSTOMER, '11999998888'])
    assert.ok(!all.includes(secret), 'vazou: ' + secret);
  assert.match(state.feeds[0].window.orders[0].ref, /^[a-f0-9]{32}$/);
  assert.match(state.feeds[0].scope.merchant_ref, /^[a-f0-9]{32}$/);
});

test('mesma janela de novo: sequencia avanca, nenhuma linha nova de diario, primeira vista preservada', async () => {
  const {state, step} = lab();
  state.orders = [order(1, [item('Hot Roll', 2)])];
  const a = await step(), b = await step();
  assert.equal(b.sequence, a.sequence + 1);
  assert.equal(b.window.orders[0].first_seen_at, a.window.orders[0].first_seen_at);
  assert.equal(b.window.orders[0].revision_no, 1);
  assert.equal(b.window.content_changed_at, a.window.content_changed_at);
  assert.notEqual(b.window.observed_at, a.window.observed_at);
  assert.deepEqual(kinds(state.journal), ['start', 'seen']);
});

test('quantidade, observacao, opcao e status de cabecalho: cada mudanca e UMA revisao', async () => {
  const {state, step} = lab();
  state.orders = [order(1, [item('Hot Roll', 2, 'Sem cebolinha')])];
  const first = await step();
  const edits = [
    o => { o.items[0].quantity = 3; },
    o => { o.items[0].observations = 'Sem pimenta'; },
    o => { o.items[0].options = [{name: 'Molho extra', quantity: 1}]; },
    o => { o.currentStatus = {code: 'READY_TO_PICKUP'}; },
  ];
  let previous = first.window.orders[0].revision, no = 1;
  for (const edit of edits) {
    edit(state.orders[0]);
    const doc = await step();
    no += 1;
    assert.notEqual(doc.window.orders[0].revision, previous);
    assert.equal(doc.window.orders[0].revision_no, no);
    assert.equal(doc.window.orders[0].first_seen_at, first.window.orders[0].first_seen_at);
    previous = doc.window.orders[0].revision;
  }
  assert.equal(state.feeds.at(-1).window.orders[0].status_claim, 'READY_TO_PICKUP');
  assert.deepEqual(kinds(state.journal), ['start', 'seen', 'revised', 'revised', 'revised', 'revised']);
});

test('cartao some da tela: left_view, nunca cancelamento; volta com a primeira vista original', async () => {
  const {state, step} = lab();
  state.orders = [order(1, [item('Hot Roll', 2)]), order(2, [item('Temaki', 1)])];
  const first = await step();
  const gone = state.orders.pop();
  const after = await step();
  assert.deepEqual(after.window.orders.map(o => o.short_code), ['0001']);
  assert.equal(after.disappearance_means_cancellation, false);
  state.orders.push(gone);
  const back = await step();
  assert.equal(back.window.orders[1].first_seen_at, first.window.orders[1].first_seen_at);
  assert.deepEqual(kinds(state.journal), ['start', 'seen', 'seen', 'left_view', 'back_in_view']);
  assert.ok(!/cancel/i.test(JSON.stringify(state.journal).replace(/disappearance_means_cancellation/g, '')));
});

test('sensor em HOLD: janela anterior fica com o horario ANTIGO, e a retomada e registrada', async () => {
  const {state, step} = lab();
  state.orders = [order(1, [item('Hot Roll', 2)])];
  const good = await step();
  state.orders.push({...order(1, [item('Hot Roll', 2)])});
  const held = await step();
  assert.deepEqual(held.scan, {state: 'HOLD', reason: 'SENSOR_DUPLICATE_MOUNTED_ORDER'});
  assert.equal(held.window.observed_at, good.window.observed_at);
  assert.equal(held.consecutive_failures, 1);
  assert.notEqual(held.written_at, good.written_at);
  const heldAgain = await step();
  assert.equal(heldAgain.consecutive_failures, 2);
  state.orders.pop();
  const resumed = await step();
  assert.equal(resumed.scan.state, 'OBSERVED');
  assert.equal(resumed.consecutive_failures, 0);
  assert.deepEqual(kinds(state.journal), ['start', 'seen', 'hold', 'resume']);
});

test('zero cartoes nao vira janela vazia: e HOLD, e ausencia nao e zero pedidos', async () => {
  const {state, step} = lab();
  const doc = await step();
  assert.equal(doc.scan.state, 'HOLD');
  assert.equal(doc.scan.reason, 'SENSOR_MOUNTED_CARD_COVERAGE_UNKNOWN');
  assert.equal(doc.window, null);
});

test('observacao com telefone: o sensor retem a janela inteira, nada parcial e publicado', async () => {
  const {state, step} = lab();
  state.orders = [order(1, [item('Hot Roll', 2, 'ligar 11 99999-8888')])];
  const doc = await step();
  assert.equal(doc.scan.reason, 'SENSOR_NOTE_CONTENT_UNSAFE');
  assert.equal(doc.window, null);
  assert.ok(!JSON.stringify(state.feeds).includes('99999'));
});

test('falhas do Edge e do DevTools: cada uma tem motivo proprio e nenhuma avalia a pagina errada', async () => {
  const cases = [
    [s => { s.port = null; }, 'EDGE_DEVTOOLS_PORT_UNREADABLE'],
    [s => { s.tabs = {kind: 'failed', value: null}; }, 'EDGE_DEVTOOLS_NOT_REACHABLE'],
    [s => { s.tabs = {kind: 'reply', value: [{type: 'page', url: 'https://gestordepedidos.ifood.com.br/#/home/orders'}]}; }, 'EXPEDITION_PAGE_NOT_FOUND'],
    [s => { s.tabs = {kind: 'reply', value: [1, 2].map(() => ({type: 'page', url: EXPEDITION, webSocketDebuggerUrl: s.ws}))}; }, 'MULTIPLE_EXPEDITION_PAGES'],
    [s => { s.ws = 'ws://10.0.0.5:9222/devtools/page/ABCDEF0123456789'; }, 'DEVTOOLS_ENDPOINT_NOT_LOOPBACK'],
    [s => { s.ws = 'ws://127.0.0.1:9333/devtools/page/ABCDEF0123456789'; }, 'DEVTOOLS_ENDPOINT_NOT_LOOPBACK'],
  ];
  for (const [arrange, expected] of cases) {
    const {state, step} = lab();
    state.orders = [order(1, [item('Hot Roll', 2)])];
    arrange(state);
    const doc = await step();
    assert.equal(doc.scan.reason, expected);
    assert.equal(state.evaluations, 0, expected + ' avaliou mesmo assim');
    assert.equal(doc.window, null);
  }
  const {state, step} = lab();
  state.evaluate = () => ({kind: 'timeout'});
  assert.equal((await step()).scan.reason, 'CDP_EVALUATE_TIMEOUT');
  state.evaluate = () => { throw Error('socket'); };
  assert.equal((await step()).scan.reason, 'RUNNER_EXCEPTION');
});

test('modo FIXTURE nunca produz real, e pagina de laboratorio nao passa em FIELD', async () => {
  const url = 'http://127.0.0.1:5399/gestor-fixture.html';
  const fixture = lab({mode: 'FIXTURE', hostname: '127.0.0.1', url});
  fixture.state.orders = [order(1, [item('Hot Roll', 2)])];
  const doc = await fixture.step();
  assert.equal(doc.source_mode, 'simulated');
  assert.equal(doc.scan.state, 'OBSERVED');
  // FIELD so aceita a URL exata do Gestor: a aba de laboratorio nem e avaliada.
  const field = lab({mode: 'FIELD', hostname: '127.0.0.1', url});
  field.state.orders = [order(1, [item('Hot Roll', 2)])];
  const refused = await field.step();
  assert.equal(refused.scan.reason, 'EXPEDITION_PAGE_NOT_FOUND');
  assert.equal(field.state.evaluations, 0);
  // E se a URL bater mas o documento disser outro host, tambem retem.
  const spoof = lab({mode: 'FIELD', hostname: '127.0.0.1'});
  spoof.state.orders = [order(1, [item('Hot Roll', 2)])];
  assert.match((await spoof.step()).scan.reason, /^(PAGE_HOSTNAME_NOT_EXPECTED|SENSOR_GESTOR_ORIGIN_NOT_QUALIFIED)$/);
  // Mesmo que a pagina devolvesse uma leitura "qualificada" dizendo outro host,
  // a conferencia do PROPRIO executor retem — ela nao depende so do sensor.
  const forged = lab();
  forged.state.orders = [order(1, [item('Hot Roll', 2)])];
  forged.state.evaluate = () => {
    const r = evaluatePage(page(forged.state.orders, 'gestordepedidos.ifood.com.br'), 'FIELD_REVIEW');
    r.value.page.hostname = 'outro.exemplo.invalid';
    return r;
  };
  const refusedForged = await forged.step();
  assert.equal(refusedForged.scan.reason, 'PAGE_HOSTNAME_NOT_EXPECTED');
  assert.equal(refusedForged.window, null);
  assert.throws(() => createDemandFeed({mode: 'FIXTURE', pageUrl: 'https://gestordepedidos.ifood.com.br/x'}), /FIXTURE_PAGE_URL_INVALID/);
  assert.throws(() => createDemandFeed({mode: 'LIVE'}), /INVALID_FEED_MODE/);
});

test('reinicio: retoma do feed anterior sem repetir "seen" e sem trocar de loja em silencio', async () => {
  const before = lab();
  before.state.orders = [order(1, [item('Hot Roll', 2)]), order(2, [item('Temaki', 1)])];
  const last = await before.step();
  const after = lab({previous: last});
  after.state.now = before.state.now + 60000;
  after.state.orders = before.state.orders;
  const doc = await after.step();
  assert.equal(doc.sequence, last.sequence + 1);
  assert.equal(doc.window.orders[0].first_seen_at, last.window.orders[0].first_seen_at);
  assert.deepEqual(kinds(after.state.journal), ['start']);
  assert.equal(after.state.journal[0].restored_orders, 2);
  // Outra loja na mesma tela depois do reinicio: retido, nunca continuado.
  const other = lab({previous: last});
  other.state.now = before.state.now + 60000;
  other.state.orders = [order(1, [item('Hot Roll', 2)], {merchant: {id: 'OUTRA-LOJA'}})];
  const refused = await other.step();
  assert.equal(refused.scan.reason, 'MERCHANT_CHANGED_REQUIRES_NEW_REVIEW_CONTEXT');
  assert.equal(refused.scope.merchant_ref, last.scope.merchant_ref);
  // Feed anterior de OUTRO modo nao e herdado.
  const cross = lab({mode: 'FIXTURE', hostname: '127.0.0.1', url: 'http://127.0.0.1:5399/f.html', previous: last});
  cross.state.orders = [order(1, [item('Hot Roll', 2)])];
  assert.equal((await cross.step()).sequence, 1);
});

test('disco falhando nao derruba o processo, e o ciclo seguinte volta a escrever', async () => {
  const {state, step} = lab();
  state.orders = [order(1, [item('Hot Roll', 2)])];
  state.failWrite = true;
  await step();
  assert.equal(state.feeds.length, 0);
  state.failWrite = false;
  const doc = await step();
  assert.equal(doc.runner.write_failures, 1);
  assert.equal(state.feeds.length, 1);
});

test('estrutura: um unico metodo de protocolo, nenhum processo filho, nenhum destino fora do loopback', () => {
  const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
  const methods = [...code.matchAll(/method:\s*'([^']+)'/g)].map(m => m[1]);
  assert.deepEqual(methods, ['Runtime.evaluate']);
  for (const forbidden of [/child_process/, /\bspawn\b/, /\bexec(File)?(Sync)?\b\(/, /\bfetch\s*\(/,
    /Page\.|Input\.|Target\.|Emulation\.|Network\.|Browser\.|DOM\./, /throwOnSideEffect:\s*false/])
    assert.doesNotMatch(code, forbidden);
  assert.match(code, /hostname:\s*'127\.0\.0\.1'/);
  assert.ok(validWsUrl('ws://127.0.0.1:9222/devtools/page/ABCDEF0123456789', 9222));
  for (const bad of ['ws://localhost:9222/devtools/page/ABCDEF0123456789', 'wss://127.0.0.1:9222/devtools/page/ABCDEF0123456789',
    'ws://127.0.0.1:9222/devtools/browser/ABCDEF0123456789', 'ws://127.0.0.1:9222/devtools/page/ABCDEF0123456789?x=1', null])
    assert.equal(validWsUrl(bad, 9222), false);
});

test('a expressao nao deixa global na pagina e so chama a leitura dos cartoes montados', () => {
  const doc = page([order(1, [item('Hot Roll', 2)])], 'gestordepedidos.ifood.com.br');
  const sandbox = {document: doc, location: doc.location};
  vm.runInNewContext(buildExpression(SENSOR, 'FIELD_REVIEW'), sandbox);
  assert.deepEqual(Object.keys(sandbox).sort(), ['document', 'location']);
  assert.throws(() => buildExpression(SENSOR, 'REAL'), /INVALID_SENSOR_EXPRESSION_INPUT/);
  assert.throws(() => buildExpression('nada', 'FIXTURE'), /INVALID_SENSOR_EXPRESSION_INPUT/);
});

test('linha de comando: FIELD nao aceita caminho por argumento; laboratorio exige caminhos absolutos', () => {
  assert.equal(parseArgs(['--profile', 'C:\\x']), null);
  assert.equal(parseArgs(['--out', 'C:\\x']), null);
  assert.equal(parseArgs(['--page-url', 'http://127.0.0.1:1/x']), null);
  assert.equal(parseArgs(['--fixture', '--profile', 'relativo', '--out', 'C:\\x']), null);
  assert.equal(parseArgs(['--interval-ms', '500']), null);
  assert.equal(parseArgs(['--desconhecido']), null);
  assert.equal(parseArgs([]).fixture, false);
  const ok = parseArgs(['--fixture', '--profile', path.resolve('p'), '--out', path.resolve('o'), '--page-url', 'http://127.0.0.1:5399/f.html', '--once']);
  assert.equal(ok.fixture, true);
  assert.equal(ok.once, true);
});

test('modelo de tarefa do caixa: desativado, SYSTEM sem sessao interativa, Node direto, sem shell nem Edge', () => {
  const xml = fs.readFileSync(path.join(__dirname, '../../docs/operations/DeliveryOS-Itaim-Gestor-Demand-Feed.xml'), 'utf8');
  assert.match(xml, /<Enabled>false<\/Enabled>\s*<Hidden>true<\/Hidden>/);
  assert.match(xml, /<UserId>S-1-5-18<\/UserId><LogonType>ServiceAccount<\/LogonType>/);
  assert.match(xml, /<MultipleInstancesPolicy>IgnoreNew<\/MultipleInstancesPolicy>/);
  assert.match(xml, /<Command>C:\\Program Files\\nodejs\\node\.exe<\/Command>/);
  assert.match(xml, /<Arguments>"C:\\ProgramData\\DeliveryOS-Itaim-Observer\\gestor_mounted_demand_feed_v1\.cjs"<\/Arguments>/);
  assert.equal((xml.match(/<Exec>/g) || []).length, 1);
  assert.doesNotMatch(xml, /powershell|cmd\.exe|msedge|wscript|schtasks|--fixture|InteractiveToken/i);
  // O arquivo que a tarefa aponta nao aceita caminho por argumento em FIELD:
  // a tarefa nao consegue apontar o executor para outro perfil ou outra pasta.
  assert.equal(parseArgs([]).fixture, false);
});

(async () => {
  for (const [label, fn] of tests) { await fn(); n += 1; console.log('PASS ' + label); }
  console.log('DELIVERYOS_GESTOR_DEMAND_FEED_PASS ' + n + '/' + tests.length + ' SYNTHETIC_ONLY');
})().catch(e => { console.error('FAIL ' + (tests[n] ? tests[n][0] : '?') + '\n' + (e && e.stack || e)); process.exit(1); });
