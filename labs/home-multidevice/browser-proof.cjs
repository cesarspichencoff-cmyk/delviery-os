'use strict';
/**
 * Home pela porta de operador num navegador de verdade (Edge), em largura de celular e de desktop.
 *
 *   Edge -> TLS de bancada (certificado gerado na hora) -> piloto REAL com a porta da Home
 *        -> apresentacao REAL em loopback <- feed do executor real sobre pagina falsa
 *
 * Mede o que so um navegador mede: o redirecionamento para a entrada, o cookie
 * __Host- aceito e invisivel ao JavaScript, a interface V3.3 inteira carregando
 * com os cabecalhos de seguranca, sem erro de console e sem rolagem lateral.
 * Tudo sintetico. NAO prova Safari, aparelho fisico, rede movel nem o proxy real.
 *
 * Uso: node labs/home-multidevice/browser-proof.cjs [pasta-de-capturas]
 * Onde um antivirus intercepta HTTPS (medido no Foxxy), o certificado de bancada
 * e bloqueado e esta prova nao roda: ela roda na CI.
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const {spawn} = require('node:child_process');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const repo = path.resolve(__dirname, '..', '..');
const out = process.argv[2] ? path.resolve(process.argv[2]) : null;
const {chromium} = require(path.join(repo, 'node_modules', 'playwright-core'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

function bancadaTls() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'home-multi-tls-'));
  const candidates = ['openssl', 'C:/Program Files/Git/usr/bin/openssl.exe', 'C:/Program Files/Git/mingw64/bin/openssl.exe'];
  for (const exe of candidates) {
    const r = spawnSync(exe, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem'),
      '-days', '2', '-subj', '/CN=copiloto.itaim.test', '-addext', 'subjectAltName=DNS:copiloto.itaim.test'],
      {encoding: 'utf8', env: {...process.env, MSYS_NO_PATHCONV: '1', MSYS2_ARG_CONV_EXCL: '*'}});
    if (r.status === 0 && fs.existsSync(path.join(dir, 'cert.pem'))) return dir;
  }
  throw Error('openssl nao encontrado: sem certificado de bancada, a prova nao roda');
}
function semSessaoApi(port) {
  return new Promise((resolve, reject) => {
    const req = https.request({host: '127.0.0.1', port, path: '/api/home', method: 'GET', rejectUnauthorized: false,
      servername: 'copiloto.itaim.test', headers: {host: 'copiloto.itaim.test:' + port}}, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.end();
  });
}
const results = [];
let stage = 'inicio';
let currentPage = null;
let onde = null;
const trail = [];

(async () => {
  const tlsDir = bancadaTls();
  const tlsPort = await freePort();
  const HOME = 'https://copiloto.itaim.test:' + tlsPort;
  
  const chain = spawn('npx tsx src/platform/run-home-multidevice-chain-tests.ts', [],
    {cwd: repo, env: {...process.env, HOME_CHAIN_SERVE: '1', HOME_CHAIN_PUBLIC_URL: HOME}, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: true});
  let log = '';
  chain.stdout.on('data', d => { log += d; });
  chain.stderr.on('data', d => { log += d; });
  let info = null;
  for (let i = 0; i < 240 && !info; i++) { const m = log.match(/SERVINDO (\{.*\})/); if (m) info = JSON.parse(m[1]); else await sleep(500); }
  if (!info) throw Error('bancada nao subiu: ' + log.slice(-600));
  // TLS de bancada na frente do piloto, como o proxy HTTPS faria: preserva o Host.
  const front = https.createServer({key: fs.readFileSync(path.join(tlsDir, 'key.pem')), cert: fs.readFileSync(path.join(tlsDir, 'cert.pem'))}, (req, res) => {
    const up = http.request({host: '127.0.0.1', port: info.piloto, method: req.method, path: req.url, headers: req.headers}, ur => {
      res.writeHead(ur.statusCode, ur.headers); ur.pipe(res); });
    up.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  await new Promise(r => front.listen(tlsPort, '127.0.0.1', r));
  const browser = await chromium.launch({headless: true,
    executablePath: process.env.EDGE_EXE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--host-resolver-rules=MAP copiloto.itaim.test 127.0.0.1', '--ignore-certificate-errors']});
  try {
    for (const [name, width, height, mobile] of [['celular', 390, 844, true], ['desktop', 1440, 900, false]]) {
      const ctx = await browser.newContext({viewport: {width, height}, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 3 : 1, ignoreHTTPSErrors: true});
      stage = name + ': entrada';
      const page = await ctx.newPage();
      currentPage = page;
      // Rastro das respostas da Home, so caminho e status, para o diagnostico.
      page.on('response', r => { try { trail.push(r.status() + ' ' + r.request().method() + ' ' + new URL(r.url()).pathname); } catch { /* sem url */ } if (trail.length > 30) trail.shift(); });
      const errors = [];
      // Recurso que respondeu 401/404 (a propria entrada recusada, o favicon) e registrado, nao reprova.
      // Reprova: erro de script e recusa de CSP — e o que deixaria a Home em branco no aparelho.
      const recursos = [];
      page.on('console', m => { if (m.type() !== 'error') return; const t = m.text().slice(0, 200);
        (/^Failed to load resource/.test(t) ? recursos : errors).push(t); });
      page.on('pageerror', e => errors.push('pageerror ' + String(e).slice(0, 200)));
      const r1 = await page.goto(HOME + '/', {waitUntil: 'networkidle'});
      const naEntrada = new URL(page.url()).pathname === '/entrar';
      if (out) await page.screenshot({path: path.join(out, 'home-porta-de-operador-entrada-' + name + '-SIMULADO.png')});
      const corpoDaEntrada = (await page.textContent('body') || '').trim().slice(0, 160);
      if (!naEntrada || !(await page.$('#codigo'))) throw Error('a tela de entrada nao apareceu; o navegador mostrou: ' + corpoDaEntrada);
      // Sem sessao, direto no TLS de bancada com o Host da Home. Nao por fetch() da pagina (a CSP da
      // entrada recusa) nem por page.request (sai pelo Node, que nao usa o mapeamento de DNS do navegador).
      const semSessao = await semSessaoApi(tlsPort);
      await page.fill('#codigo', 'codigo-errado-do-navegador');
      await Promise.all([page.waitForLoadState('networkidle'), page.click('button[type=submit]')]);
      const aviso = await page.textContent('.aviso').catch(() => null);
      stage = name + ': home';
      await page.fill('#codigo', info.codigo_sintetico);
      // A URL final pode ganhar rota em hash; o que importa e ter saido da entrada para a raiz.
      await Promise.all([page.waitForURL(u => u.pathname === '/', {waitUntil: 'commit', timeout: 30000}), page.click('button[type=submit]')]);
      await page.waitForSelector('.org-pedido', {timeout: 20000});
      const cookies = await ctx.cookies();
      const sessao = cookies.find(c => c.name === '__Host-deliveryos_home');
      const metrics = await page.evaluate(() => ({
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        pedidos: document.querySelectorAll('.org-pedido').length,
        titulo: (document.querySelector('.org-topo__vida') || {}).textContent || null,
        cookieVisivelAoJs: document.cookie.includes('deliveryos_home'),
        menorFonte: Math.min(...[...document.querySelectorAll('.org-pedidos *')].filter(e => e.children.length === 0 && e.textContent.trim())
          .map(e => parseFloat(getComputedStyle(e).fontSize))),
      }));
      if (out) await page.screenshot({path: path.join(out, 'home-porta-de-operador-' + name + '-SIMULADO.png'), fullPage: true});
      results.push({name, statusInicial: r1.status(), redirecionouParaEntrada: naEntrada, apiSemSessao: semSessao, avisoCodigoErrado: aviso, recursosRecusados: recursos,
        cookie: sessao ? {httpOnly: sessao.httpOnly, secure: sessao.secure, sameSite: sessao.sameSite, path: sessao.path} : null, ...metrics, errosDeConsole: errors});
      await ctx.close();
    }
  } finally {
    // Retrato da pagina ANTES de fechar o navegador: depois nao ha mais o que ler.
    try {
      if (currentPage && !currentPage.isClosed()) onde = {url: currentPage.url().replace(/:\d+\//, ':PORTA/'),
        texto: ((await currentPage.textContent('body', {timeout: 2000})) || '').replace(/\s+/g, ' ').trim().slice(0, 240)};
    } catch { /* pagina sem corpo */ }
    await browser.close();
    front.close();
    // A bancada encerra os proprios processos quando ve este arquivo.
    fs.writeFileSync(path.join(info.pasta, 'parar'), '');
    await new Promise(r => { chain.once('exit', r); setTimeout(r, 15000); });
    await sleep(500);
    try { fs.rmSync(tlsDir, {recursive: true, force: true}); } catch { /* em uso */ }
  }
  for (const r of results) console.log(JSON.stringify(r));
  const bad = results.filter(r => !(r.redirecionouParaEntrada && r.apiSemSessao === 401 && r.cookie && r.cookie.httpOnly && r.cookie.secure &&
    r.pedidos === 2 && r.overflowX === 0 && !r.cookieVisivelAoJs && r.errosDeConsole.length === 0));
  if (bad.length) throw Error('medidas fora do esperado');
  console.log('HOME_GATEWAY_BROWSER_PROOF_PASS ' + results.length + '/' + results.length + ' REAL_EDGE_SYNTHETIC_ORDERS');
  process.exit(0);
})().catch(async e => {
  const d = JSON.stringify({falha: String(e && e.message || e).split(/\r?\n/)[0].slice(0, 400), etapa: stage, onde, rastro: trail.slice(-12), medidas: results});
  console.error('FAIL ' + String(e && e.stack || e));
  console.error('DIAGNOSTICO ' + d);
  if (process.env.GITHUB_ACTIONS === 'true') console.log('::error title=prova de navegador da Home::' + d.replace(/%/g, '%25'));
  process.exit(1);
});
