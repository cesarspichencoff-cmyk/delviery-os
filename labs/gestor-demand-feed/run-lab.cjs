'use strict';
/**
 * BANCADA do elo sensor -> feed -> motor -> Home, com navegador de verdade.
 *
 *   node labs/gestor-demand-feed/run-lab.cjs            roteiro medido, sai 0 ou 1
 *   node labs/gestor-demand-feed/run-lab.cjs --serve    sobe tudo e fica no ar (para olhar a Home)
 *
 * O que e REAL aqui: um Microsoft Edge local com a porta DevTools em loopback,
 * o executor `gestor_mounted_demand_feed_v1.cjs` como processo separado, o
 * WebSocket do DevTools, o `Runtime.evaluate`, o arquivo de feed em disco e o
 * servidor da Home compilado (`dist/`), lendo esse arquivo.
 *
 * O que e SINTETICO: a pagina (`fixture.html`) e os pedidos. Nao e o Gestor,
 * nao ha loja, cliente nem pedido real. O executor roda em modo FIXTURE, que
 * nao consegue produzir `real`: a Home mostra tudo como demonstracao.
 *
 * Pre-requisito: `npx tsc` (o servidor roda de `dist/`).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SERVE = process.argv.includes('--serve');
const EDGE = process.env.EDGE_EXE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const HOME_PORT = Number(process.env.LAB_HOME_PORT || 5296);
const INTERVAL_MS = 2000;
const RUNNER = path.join(ROOT, 'runtime', 'reporting', 'gestor_mounted_demand_feed_v1.cjs');
const SERVER = path.join(ROOT, 'dist', 'tools', 'product_system_server.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const children = [];
let work = null, fixture = null;

const item = (name, quantity, observations = '', options = [], externalCode = null) =>
  ({name, quantity, observations, options, externalCode});
const order = (n, minute, items, status = 'CONFIRMED') => ({
  id: 'LAB-ORDER-UUID-' + n, displayId: String(n), isTest: false, merchant: {id: 'LAB-MERCHANT-UUID'},
  customer: {name: 'CLIENTE_FICTICIO_DA_BANCADA', phone: '11 90000-0000'},
  createdAt: new Date(Date.now() - minute * 60000).toISOString(), currentStatus: {code: status}, items});
const state = {orders: [
  order(4107, 14, [item('Combinado Especial Sushi 1 Pessoa', 1, 'Sem wasabi, por favor'), item('Hot Roll', 2)]),
  order(4108, 9, [item('Temaki Salmao Completo', 2, '', [{name: 'Cream cheese', quantity: 1}, {name: 'Cebolinha', quantity: 1}])]),
  order(4109, 4, [item('Yakisoba de Frango', 1, 'Pouco shoyu'), item('Guioza Suina', 6), item('Refrigerante Lata', 2)]),
]};

function startFixtureServer() {
  return new Promise(resolve => {
    const html = fs.readFileSync(path.join(__dirname, 'fixture.html'));
    const server = http.createServer((req, res) => {
      if (req.url === '/orders.json') {
        res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
        return res.end(JSON.stringify(state.orders));
      }
      if (req.url === '/gestor-fixture.html') {
        res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
        return res.end(html);
      }
      res.writeHead(404); res.end();
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}
function launch(command, args, env = {}) {
  const child = spawn(command, args, {cwd: ROOT, env: {...process.env, ...env}, stdio: 'ignore', windowsHide: true});
  children.push(child);
  return child;
}
const stop = child => new Promise(resolve => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return resolve();
  child.once('exit', () => resolve());
  try { child.kill(); } catch { resolve(); }
  setTimeout(resolve, 4000);
});
function getJson(port, route) {
  return new Promise((resolve, reject) => {
    http.get({host: '127.0.0.1', port, path: route, timeout: 5000}, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
async function until(label, fn, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < end) {
    try { const v = await fn(); if (v) return v; } catch (e) { last = e; }
    await sleep(250);
  }
  throw new Error('TEMPO ESGOTADO: ' + label + (last ? ' (' + last.message + ')' : ''));
}
// Fechar o Edge DA BANCADA pelo proprio DevTools: no Windows o processo lancado
// nao e a arvore inteira, e `kill()` deixava o navegador vivo (medido).
let labCdpPort = null;
function closeLabEdge() {
  if (labCdpPort === null) return Promise.resolve();
  const port = labCdpPort;
  labCdpPort = null;
  return getJson(port, '/json/version').then(v => new Promise(resolve => {
    const ws = new WebSocket(v.webSocketDebuggerUrl);
    const done = () => { try { ws.close(); } catch { /* fechado */ } resolve(); };
    ws.addEventListener('open', () => { ws.send(JSON.stringify({id: 1, method: 'Browser.close'})); setTimeout(done, 1500); });
    ws.addEventListener('error', done);
  })).catch(() => {});
}
const readFeed = dir => JSON.parse(fs.readFileSync(path.join(dir, 'gestor-demand-feed-v1.json'), 'utf8'));
const readJournal = dir => fs.readdirSync(dir).filter(f => /^journal-\d{8}\.jsonl$/.test(f)).sort()
  .flatMap(f => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)));
const count = (journal, kind) => journal.filter(l => l.k === kind).length;
// Um SEGUNDO cliente DevTools, so da bancada: pergunta a pagina o que mexeu nela.
function probePage(port, tamper = false) {
  // `tamper` e o CONTROLE POSITIVO: a propria bancada mexe na pagina, de
  // proposito, para provar que a sonda enxerga uma mutacao alheia quando ha uma.
  const expression = (tamper ? 'document.body.setAttribute("data-bancada-controle","1"),' : '') +
    'new Promise(function(r){setTimeout(function(){r({probe: window.__bancada, globals: Object.keys(window).length, ' +
    'hasSensorGlobal: "DeliveryGestorV3Review" in window, visibility: document.visibilityState})},50)})';
  return getJson(port, '/json/list').then(tabs => new Promise((resolve, reject) => {
    const target = tabs.find(t => t.type === 'page' && t.url.endsWith('/gestor-fixture.html'));
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    ws.addEventListener('open', () => ws.send(JSON.stringify({id: 7, method: 'Runtime.evaluate',
      params: {returnByValue: true, awaitPromise: true, expression}})));
    ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id === 7) { ws.close(); resolve(m.result.result.value); } });
    ws.addEventListener('error', () => reject(new Error('probe')));
  }));
}

async function main() {
  assert.ok(fs.existsSync(EDGE), 'Edge nao encontrado: ' + EDGE);
  assert.ok(fs.existsSync(SERVER), 'dist/ ausente: rode `npx tsc` antes');
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'gestor-demand-lab-'));
  const profile = path.join(work, 'edge-profile'), out = path.join(work, 'feed');
  fs.mkdirSync(profile); fs.mkdirSync(out);
  fixture = await startFixtureServer();
  const pageUrl = 'http://127.0.0.1:' + fixture.address().port + '/gestor-fixture.html';

  const edge = launch(EDGE, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-gpu', pageUrl]);
  const cdpPort = await until('DevToolsActivePort', () => {
    const first = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/, 1)[0];
    return /^\d+$/.test(first) ? Number(first) : null;
  });
  labCdpPort = cdpPort;
  const runnerArgs = [RUNNER, '--fixture', '--profile', profile, '--out', out, '--page-url', pageUrl, '--interval-ms', String(INTERVAL_MS)];
  let runner = launch(process.execPath, runnerArgs);
  launch(process.execPath, [SERVER], {PRODUCT_UI_PORT: String(HOME_PORT), DELIVERYOS_GESTOR_DEMAND_DIR: out,
    DELIVERYOS_DATABASE_URL: '', TATA_READER_INSTALL_ROOT: ''});
  await until('servidor da Home', () => getJson(HOME_PORT, '/api/health').then(h => h.ok === true), 60000);

  if (SERVE) {
    // Vigia: se este processo for morto sem aviso (no Windows nao ha SIGTERM),
    // o Edge, o executor e o servidor da bancada nao podem ficar orfaos (medido:
    // ficavam). O vigia fecha o Edge pelo DevTools e encerra os dois processos.
    const watch = 'const [ppid,port,...pids]=process.argv.slice(1).map(Number);setInterval(()=>{try{process.kill(ppid,0)}catch{' +
      'for(const p of pids){try{process.kill(p)}catch{}}' +
      'fetch("http://127.0.0.1:"+port+"/json/version").then(r=>r.json()).then(v=>{const w=new WebSocket(v.webSocketDebuggerUrl);' +
      'w.addEventListener("open",()=>{w.send(JSON.stringify({id:1,method:"Browser.close"}));setTimeout(()=>process.exit(0),1500)});' +
      'w.addEventListener("error",()=>process.exit(0))}).catch(()=>process.exit(0))}},1000)';
    spawn(process.execPath, ['-e', watch, String(process.pid), String(cdpPort), ...children.slice(1).map(c => String(c.pid))],
      {detached: true, stdio: 'ignore', windowsHide: true}).unref();
    console.log('BANCADA NO AR  Home: http://127.0.0.1:' + HOME_PORT + '/   (pedidos sinteticos, modo simulado)');
    console.log('feed: ' + out);
    return;
  }

  const results = [];
  const step = async (label, fn) => { await fn(); results.push(label); console.log('PASS ' + label); };
  const home = () => getJson(HOME_PORT, '/api/home');
  const codes = h => h.demanda_observada.pedidos.map(p => p.codigo);

  await step('Edge real + DevTools real: o executor le os tres cartoes e escreve o feed', async () => {
    const feed = await until('primeiro feed', () => { const f = readFeed(out); return f.scan.state === 'OBSERVED' && f.window.orders.length === 3 ? f : null; });
    assert.equal(feed.source_mode, 'simulated');
    assert.equal(feed.window.lines, 6);
    assert.equal(feed.window.units, 14);
    assert.equal(feed.edge.cdp_reachable && feed.edge.expedition_page_present, true);
  });

  await step('a Home devolve os mesmos pedidos, itens, opcoes e observacoes da pagina — como demonstracao', async () => {
    const h = await until('home com tres pedidos', async () => { const x = await home(); return x.demanda_observada && x.demanda_observada.total === 3 ? x : null; });
    assert.equal(h.titulo, 'Leitura parcial');
    assert.equal(h.demonstracao, true, 'pagina de bancada apareceu como real');
    assert.equal(h.demanda_observada.procedencia, 'simulado');
    assert.equal(h.pulso.observado, false);
    assert.equal(h.foco, null);
    assert.deepEqual(codes(h), ['4107', '4108', '4109']);
    for (const o of state.orders) {
      const shown = h.demanda_observada.pedidos.find(p => p.codigo === o.displayId);
      assert.deepEqual(shown.itens.map(i => [i.quantidade, i.nome, i.observacao, i.opcoes.map(x => [x.quantidade, x.nome])]),
        o.items.map(i => [i.quantity, i.name, i.observations || null, i.options.map(x => [x.quantity, x.name])]));
    }
    const body = JSON.stringify(h);
    for (const secret of ['LAB-ORDER-UUID', 'LAB-MERCHANT-UUID', 'CLIENTE_FICTICIO', '90000-0000'])
      assert.ok(!body.includes(secret), 'vazou para a Home: ' + secret);
    assert.ok(!JSON.stringify(readFeed(out)).includes('LAB-ORDER-UUID'));
  });

  await step('pedido novo, quantidade alterada e cartao que some: a Home acompanha, sem cancelamento inventado', async () => {
    state.orders[0].items[1].quantity = 3;
    state.orders.splice(1, 1);
    state.orders.push(order(4110, 1, [item('Sashimi de Salmao', 1, 'Cortar fino')], 'CONFIRMED'));
    const h = await until('home atualizada', async () => { const x = await home(); return x.demanda_observada && codes(x).join() === '4107,4109,4110' ? x : null; });
    assert.equal(h.demanda_observada.pedidos[0].itens[1].quantidade, 3);
    assert.equal(h.demanda_observada.pedidos[0].revisoes, 2);
    const journal = readJournal(out);
    assert.deepEqual([count(journal, 'seen'), count(journal, 'revised'), count(journal, 'left_view')], [4, 1, 1]);
    assert.ok(!/cancel/i.test(JSON.stringify(journal)));
  });

  await step('executor morto e religado: retoma do feed, sem repetir pedido ja visto', async () => {
    const before = readFeed(out), seenBefore = count(readJournal(out), 'seen');
    await stop(runner);
    await sleep(INTERVAL_MS + 500);
    assert.equal(readFeed(out).sequence, before.sequence <= readFeed(out).sequence ? readFeed(out).sequence : -1);
    const frozen = readFeed(out).sequence;
    runner = launch(process.execPath, runnerArgs);
    const after = await until('feed apos religar', () => { const f = readFeed(out); return f.sequence > frozen && f.scan.state === 'OBSERVED' ? f : null; });
    const journal = readJournal(out);
    assert.equal(count(journal, 'seen'), seenBefore, 'religar repetiu "seen"');
    assert.equal(count(journal, 'start'), 2);
    assert.equal(journal.filter(l => l.k === 'start').at(-1).restored_orders, 3);
    const firstSeen = Object.fromEntries(before.window.orders.map(o => [o.ref, o.first_seen_at]));
    for (const o of after.window.orders) assert.equal(o.first_seen_at, firstSeen[o.ref]);
  });

  await step('a pagina nao foi tocada: zero mutacao alheia, zero evento de entrada, zero global novo', async () => {
    const p = await probePage(cdpPort);
    assert.equal(p.probe.armed, true, 'a sonda nao chegou a ser armada');
    assert.equal(p.probe.foreignMutations, 0);
    assert.equal(p.probe.inputEvents, 0);
    assert.equal(p.probe.navigations, 0);
    assert.equal(p.hasSensorGlobal, false);
    assert.equal(p.globals, p.probe.globalsAtLoad);
    assert.ok(p.probe.renders >= 2);
    // Controle positivo: uma mutacao alheia de verdade TEM de aparecer.
    const tampered = await probePage(cdpPort, true);
    assert.ok(tampered.probe.foreignMutations >= 1, 'a sonda e cega: mutacao alheia nao foi contada');
  });

  await step('Edge fechado: o executor segue vivo, retem com motivo, e a Home avisa na ultima janela valida', async () => {
    await closeLabEdge();
    await stop(edge);
    const feed = await until('feed retido', () => { const f = readFeed(out); return f.scan.state === 'HOLD' ? f : null; });
    assert.match(feed.scan.reason, /^EDGE_DEVTOOLS_(NOT_REACHABLE|PORT_UNREADABLE)$/);
    assert.equal(feed.window.orders.length, 3, 'a ultima janela valida sumiu do feed');
    const h = await home();
    assert.ok(h.demanda_observada === null || /retida/.test(h.demanda_observada.retencao));
    assert.equal(count(readJournal(out), 'hold'), 1);
  });

  await step('executor parado: em menos de um minuto a Home deixa de exibir pedidos e diz que a leitura parou', async () => {
    await stop(runner);
    const h = await until('home sem leitura', async () => { const x = await home(); return x.titulo === 'Sem leitura' ? x : null; }, 120000);
    assert.equal(h.demanda_observada, null);
    assert.equal(h.pedidos_publicaveis, false);
    assert.equal(h.fontes.find(f => f.id === 'ifood_tempos').estado, 'stale');
    assert.match(h.fontes.find(f => f.id === 'ifood_tempos').detalhe, /ausencia nao significa zero/i);
    assert.ok(!JSON.stringify(h).includes('Sashimi'), 'pedido antigo continuou na Home');
  });

  console.log('DELIVERYOS_GESTOR_DEMAND_LAB_PASS ' + results.length + '/7 REAL_EDGE_REAL_CDP_SYNTHETIC_PAGE');
}

async function cleanup() {
  await closeLabEdge();
  await Promise.all(children.map(stop));
  if (fixture) await new Promise(r => fixture.close(() => r()));
  if (work) { await sleep(500); try { fs.rmSync(work, {recursive: true, force: true}); } catch { /* perfil ainda em uso */ } }
}
main().then(async () => { if (!SERVE) { await cleanup(); process.exit(0); } })
  .catch(async e => { console.error('FAIL ' + (e && e.stack || e)); await cleanup(); process.exit(1); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void cleanup().then(() => process.exit(0)); });
