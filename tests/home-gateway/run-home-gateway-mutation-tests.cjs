'use strict';
/**
 * Mutacoes da porta de operador da Home. Cada defeito e posto no codigo de
 * producao, a suite roda, e o defeito tem de derruba-la. Mutacao que passa
 * verde e teste cego: a execucao reprova.
 */
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const GW = 'src/platform/auth/home-operator-gateway.ts';
const PILOT = 'tools/entregas_pilot_server.ts';
const UNIT = ['npx', ['tsx', 'src/platform/run-home-operator-gateway-tests.ts']];
const CHAIN = ['npx', ['tsx', 'src/platform/run-home-multidevice-chain-tests.ts']];

const MUTATIONS = [
  ['G1 a Home sai sem sessao', GW, 'if (!liveSession(req)) {', 'if (false) {', UNIT],
  ['G2 codigo revogado continua valendo', GW, 'const actor = now() < s.expiresAt ? deps.actorOf(s.code) : null;', 'const actor = now() < s.expiresAt ? { actor_id: s.actor_id, role: s.role } : null;', UNIT],
  ['G3 sessao nunca vence', GW, 'const actor = now() < s.expiresAt ? ', 'const actor = true ? ', UNIT],
  ['G4 qualquer papel entra', GW, 'if (outcome.status !== "ok" || !HOME_ROLES.includes(outcome.actor.role)) {', 'if (outcome.status !== "ok") {', UNIT],
  ['G5 codigo que mudou de pessoa mantem a sessao', GW, 'actor.actor_id !== s.actor_id || ', '', UNIT],
  ['G6 papel rebaixado mantem a sessao', GW, 'actor.role !== s.role || !HOME_ROLES.includes(actor.role)) {', 'false) {', UNIT],
  ['G7 entrada aceita formulario de outra origem', GW, 'if (!sameOrigin) { page(res, 403,', 'if (false) { page(res, 403,', UNIT],
  ['G8 escrita chega a apresentacao', GW, 'if (req.method !== "GET" && req.method !== "HEAD") { json(res, 405, { erro: "somente_leitura" }); return true; }', '', UNIT],
  ['G9 cookie do visitante segue para a apresentacao', GW, 'host: `127.0.0.1:${cfg.upstreamPort}` },', 'host: `127.0.0.1:${cfg.upstreamPort}`, cookie: String(req.headers.cookie || "") },', UNIT],
  ['G10 Set-Cookie da apresentacao vaza para o navegador', GW, 'const DROPPED_FROM_UPSTREAM = ["set-cookie", ', 'const DROPPED_FROM_UPSTREAM = [', UNIT],
  ['G11 qualquer hostname e tratado como Home', GW, 'if (String(req.headers.host || "").toLowerCase() !== config.host) return false;', '', UNIT],
  ['G12 cookie de sessao sem Secure', GW, '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${', '; Path=/; HttpOnly; SameSite=Lax; Max-Age=${', UNIT],
  ['G13 dois cookies: o primeiro e aceito', GW, 'if (found.length !== 1 || ', 'if (found.length < 1 || ', UNIT],
  ['G14 destino fora do loopback e aceito', GW, '!["127.0.0.1", "localhost", "[::1]"].includes(up.hostname) || ', '', UNIT],
  ['G15 hostname igual ao do piloto e aceito', GW, 'if (pilot.host.toLowerCase() === pub.host.toLowerCase()) throw', 'if (false) throw', UNIT],
  ['G16 limite de tentativas vira codigo errado', GW, 'if (outcome.status === "throttled") { page(res, 429, MUITAS); return true; }', '', UNIT],
  ['G17 saida forjada de outra origem derruba a sessao', GW, 'if (!sameOrigin) { json(res, 403, { erro: "origem_nao_permitida" }); return true; }', '', UNIT],
  ['G18 corpo da entrada sem limite', GW, 'if (size > MAX_LOGIN_BODY) { over = true; return; }', '', UNIT],
  ['G19 API da Home fica em cache no aparelho', GW, 'if (isApi || path === "/") headers["cache-control"] = "no-store";', '', UNIT],
  ['G20 codigo valido de outro papel recebe resposta propria', GW, 'if (outcome.status !== "ok" || !HOME_ROLES.includes(outcome.actor.role)) { page(res, 401, NEGADO); return true; }',
    'if (outcome.status !== "ok") { page(res, 401, NEGADO); return true; }\n        if (!HOME_ROLES.includes(outcome.actor.role)) { page(res, 401, "Sem permissao."); return true; }', UNIT],
  ['G21 alvo com barra dupla segue para a apresentacao', GW, 'if (!raw.startsWith("/") || raw.startsWith("//")) {', 'if (!raw.startsWith("/")) {', UNIT],
  ['G22 configuracao parcial liga a porta pela metade', GW, 'if (!rawPublic || !rawUpstream) throw new Error("HOME_GATEWAY_CONFIG_PARTIAL");', 'if (!rawPublic || !rawUpstream) return null;', UNIT],
  ['G23 entrada volta a no-referrer (o navegador manda Origin: null e todo login cai)', GW, '"Referrer-Policy": "same-origin",', '"Referrer-Policy": "no-referrer",', UNIT],
  ['W1 piloto: entrada da Home sem limite de tentativas', PILOT, '    if (accessThrottle.blocked(remote, code)) return { status: "throttled" };', '', CHAIN],
  ['W2 piloto: a porta da Home nao e consultada', PILOT, '  if (await homeGateway.handle(req, res)) return;', '', CHAIN],
  ['W3 piloto: erro de codigo na Home nao conta para o limite', PILOT, '    else accessThrottle.failure(remote);', '', CHAIN],
];

function run([command, args]) {
  const r = spawnSync(command, args, {cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32', timeout: 300000});
  return r.status === 0;
}
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const write = (f, text) => fs.writeFileSync(path.join(ROOT, f), text);

for (const [label, suite] of [['porta', UNIT], ['cadeia', CHAIN]]) {
  if (!run(suite)) { console.error('CONTROLE POSITIVO FALHOU: a suite ' + label + ' nao esta verde sem mutacao'); process.exit(1); }
  console.log('CONTROLE ' + label + ' verde sem mutacao');
}
const blind = [];
let killed = 0;
for (const [label, file, search, replacement, suite] of MUTATIONS) {
  const original = read(file);
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const needle = search.split('\n').join(eol), swap = replacement.split('\n').join(eol);
  const hits = original.split(needle).length - 1;
  if (hits !== 1) { console.error('MUTACAO NAO APLICAVEL (' + hits + ' ocorrencias): ' + label); process.exit(1); }
  let green = true;
  try {
    write(file, original.replace(needle, () => swap));
    green = run(suite);
  } finally { write(file, original); }
  if (read(file) !== original) { console.error('ORIGINAL NAO RESTAURADO: ' + file); process.exit(2); }
  if (green) { blind.push(label); console.log('CEGA  ' + label); }
  else { killed += 1; console.log('MORTA ' + label); }
}
console.log('HOME_GATEWAY_MUTATIONS ' + killed + '/' + MUTATIONS.length + ' mortas, ' + blind.length + ' cegas');
process.exit(blind.length === 0 ? 0 : 1);
