'use strict';
/*
 * Cadeia supervisionada de ativacao do candidato V1 no CAIXA_MOOCA.
 * Troca os TRES processos do ensaio (critico, assincrono, piloto) da pasta ativa para a pasta do
 * candidato preparada por preparar-candidato-v1.ps1, com reversao LOCAL e automatica.
 *
 *   node ativar-candidato-v1.cjs plano                  so le: confere tudo e testa a configuracao
 *                                                       do candidato com os carregadores reais dele
 *                                                       (sem porta, sem conexao, sem processo novo
 *                                                       alem do proprio teste)
 *   node ativar-candidato-v1.cjs segredos               cria <candidato>\private-v1.json (segredo da
 *                                                       concessao de viagem); nunca imprime valor;
 *                                                       recusa sobrescrever
 *   node ativar-candidato-v1.cjs ativar  --autorizacao "<quem e quando>"
 *   node ativar-candidato-v1.cjs reverter --autorizacao "<quem e quando>"
 *   node ativar-candidato-v1.cjs estado
 *
 * ativar/reverter so validam e entregam o trabalho a um EXECUTOR DESTACADO (windowsHide): se a
 * conexao remota cair no meio, o executor termina sozinho - ou conclui, ou reverte. Cada passo vai
 * para <candidato>\ativacao-journal.jsonl antes de acontecer. Falha em qualquer passo depois de
 * parar o primeiro processo antigo dispara a reversao: para o que o candidato subiu, sobe de novo
 * os processos antigos pelos MESMOS lancadores da pasta ativa (local-control.cjs start e
 * switch-pilot.ps1 -Mode Remote) e confere a saude deles.
 *
 * O que NAO faz: migration (as do candidato sao identicas as do app ativo), firewall, NetBird,
 * porta nova, portao de campo, Home por hostname, GPS (gps-disabled.json continua falso), pedido,
 * impressao, Edge, Reader. O piloto continua no mesmo endereco, porta e modo de teste; muda o
 * codigo e o armazenamento (arquivo novo em <candidato>\data\pilot, decisao D102).
 */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const net = require('node:net');
const crypto = require('node:crypto');

const LAYOUT_CAIXA = {
  maquina: 'CAIXA_MOOCA',
  ativa: 'C:\\Users\\Tata\\DeliveryOS-Ensaio',
  candidato: 'C:\\Users\\Tata\\DeliveryOS-Ensaio-V1',
  node: 'C:\\Program Files\\nodejs\\node.exe',
  enderecoPiloto: '100.107.78.202', portaPiloto: 5193, portaCritico: 8080,
  dbHost: '127.0.0.1', dbPort: 55436, dbNome: 'deliveryos_lab',
  publicUrl: 'https://deliveryos-piloto.eu1.netbird.services',
  readerRoot: 'C:\\ProgramData\\TataComandaReader',
  observacaoSeg: 60,
};

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (nome) => { const i = argv.indexOf(nome); return i > 0 ? argv[i + 1] : undefined; };
let L = LAYOUT_CAIXA;
if (opt('--layout')) {
  if (process.env.COMPUTERNAME === 'CAIXA_MOOCA') throw Error('--layout nao e aceito no CAIXA_MOOCA');
  L = { ...LAYOUT_CAIXA, ...JSON.parse(fs.readFileSync(opt('--layout'), 'utf8')) };
} else if (process.env.COMPUTERNAME !== 'CAIXA_MOOCA') {
  throw Error('sem --layout este script so roda no CAIXA_MOOCA');
}
// Falha injetada: so no ensaio (--layout), nunca no caixa. Exercita a reversao automatica.
const INJETAR = opt('--layout') && process.env.COMPUTERNAME !== 'CAIXA_MOOCA' ? L.injetarFalha : undefined;
const A = L.ativa, C = L.candidato, appA = path.join(A, 'app'), appC = path.join(C, 'app');
const F = {
  journal: path.join(C, 'ativacao-journal.jsonl'), estado: path.join(C, 'ativacao-estado.json'),
  trava: path.join(C, 'ativacao.trava'), segredos: path.join(C, 'private-v1.json'),
  pidsC: path.join(C, 'runtime-pids.json'), pidsA: path.join(A, 'runtime-pids.json'),
  logs: path.join(C, 'logs'), dados: path.join(C, 'data', 'pilot'),
};
const SCRIPTS = { critical: 'dist/src/platform/bin/critical.js', async: 'dist/src/platform/bin/async-runtime.js', pilot: 'dist/tools/entregas_pilot_server.js' };
const lerJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const agora = () => new Date().toISOString();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const ocultar = (s) => String(s).replace(/postgres(ql)?:\/\/\S+/gi, 'postgresql://<oculto>').replace(/[a-f0-9]{32,}/gi, '<oculto>');
function gravarAtomico(f, obj) { const t = f + '.tmp-' + process.pid; fs.writeFileSync(t, JSON.stringify(obj, null, 2)); fs.renameSync(t, f); }
function diario(ev, dados) {
  fs.mkdirSync(C, { recursive: true });
  const fd = fs.openSync(F.journal, 'a');
  try { fs.writeSync(fd, JSON.stringify({ at: agora(), ev, ...dados }) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
const estado = () => (fs.existsSync(F.estado) ? lerJson(F.estado) : { fase: 'NUNCA_ATIVADO' });
const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

// Uma chamada de PowerShell oculta para identidade de processos e donos de porta.
function inspecionar(pids, portas) {
  const ids = pids.filter(Number.isInteger).join(',') || '0';
  const ps = `$ErrorActionPreference='SilentlyContinue';` +
    `$p=@(Get-CimInstance Win32_Process | ?{ @(${ids}) -contains $_.ProcessId } | %{ [pscustomobject]@{pid=[int]$_.ProcessId;exe=$_.ExecutablePath;cmd=$_.CommandLine;criado=$_.CreationDate.ToUniversalTime().ToString('o')} });` +
    `$l=@(Get-NetTCPConnection -State Listen | ?{ @(${portas.join(',')}) -contains $_.LocalPort } | %{ [pscustomobject]@{porta=[int]$_.LocalPort;endereco=$_.LocalAddress;pid=[int]$_.OwningProcess} });` +
    `[pscustomobject]@{processos=$p;escutas=$l} | ConvertTo-Json -Depth 4 -Compress`;
  const r = cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  if (r.status !== 0) throw Error('inspecao de processos falhou');
  const j = JSON.parse(r.stdout);
  const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
  return { processos: arr(j.processos), escutas: arr(j.escutas) };
}
function identidade(insp, pid, papel, desde) {
  const p = insp.processos.find((x) => x.pid === pid);
  if (!p) return `pid ${pid} (${papel}) nao esta vivo`;
  if (!p.exe || p.exe.toLowerCase() !== L.node.toLowerCase()) return `pid ${pid} (${papel}) nao e o node esperado`;
  if (!p.cmd || !p.cmd.includes(SCRIPTS[papel])) return `pid ${pid} (${papel}) nao roda ${SCRIPTS[papel]}`;
  if (desde && p.criado < desde) return `pid ${pid} (${papel}) e anterior a esta ativacao`;
  return null;
}
async function status(url, ms = 3000) { try { return (await fetch(url, { signal: AbortSignal.timeout(ms) })).status; } catch { return 0; } }
async function esperar(url, aceitos, seg) {
  const fim = Date.now() + seg * 1000; let s = 0;
  while (Date.now() < fim) { s = await status(url); if (aceitos.includes(s)) return s; await dormir(500); }
  throw Error(`${url} respondeu ${s} (esperado ${aceitos.join('/')})`);
}
const portaLivre = (host, porta) => new Promise((ok) => { const s = net.createServer(); s.once('error', () => ok(false)); s.listen(porta, host, () => s.close(() => ok(true))); });
async function esperarPortaLivre(host, porta, seg) { const fim = Date.now() + seg * 1000; while (Date.now() < fim) { if (await portaLivre(host, porta)) return; await dormir(300); } throw Error(`porta ${host}:${porta} continua ocupada`); }
async function parar(pid, seg = 10) { if (!vivo(pid)) return; process.kill(pid); const fim = Date.now() + seg * 1000; while (vivo(pid) && Date.now() < fim) await dormir(200); if (vivo(pid)) throw Error(`pid ${pid} nao terminou`); }
function lancar(rotulo, app, script, env) {
  fs.mkdirSync(F.logs, { recursive: true });
  const out = fs.openSync(path.join(F.logs, rotulo + '.out.log'), 'a'), err = fs.openSync(path.join(F.logs, rotulo + '.err.log'), 'a');
  const filho = cp.spawn(L.node, [script], { cwd: app, env, stdio: ['ignore', out, err], detached: true, windowsHide: true });
  fs.closeSync(out); fs.closeSync(err); filho.unref();
  return filho.pid;
}

// Ambientes: os MESMOS que local-control.cjs e remote-pilot.cjs montam hoje, mais o que o V1 exige.
function ambientes() {
  const sec = lerJson(path.join(A, 'private-local.json'));
  const v1 = lerJson(F.segredos);
  const stamp = lerJson(path.join(appC, 'dist', 'build-stamp.json'));
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('DELIVERYOS_') && !k.startsWith('ENTREGAS_')));
  const db = (papel, senha) => `postgresql://${papel}:${senha}@${L.dbHost}:${L.dbPort}/${L.dbNome}`;
  const comum = { ...base, DELIVERYOS_ENV: 'local', DELIVERYOS_DATABASE_SSL: 'false', DELIVERYOS_HOST: '127.0.0.1', DELIVERYOS_PORT: String(L.portaCritico),
    DELIVERYOS_COMMIT: stamp.commit, DELIVERYOS_SOURCE_MODE: 'simulated', DELIVERYOS_MIGRATE_ON_BOOT: 'false', DELIVERYOS_DEVICE_TOKEN_SECRET: sec.device,
    DELIVERYOS_PILOT_READ_SECRETS: JSON.stringify({ ITAIM: sec.read }), DELIVERYOS_PILOT_TRIP_GRANT_SECRETS: JSON.stringify({ ITAIM: v1.trip_grant }) };
  const usuarios = sec.users.map((u) => {
    if (!/^lab-mooca-\d+$/.test(u.actor_id) || !/^[a-f0-9]{64}$/.test(u.token) || [u.actor_id, u.role, u.label].some((v) => typeof v !== 'string' || /[;:]/.test(v))) throw Error('conta sintetica invalida');
    return [u.actor_id, u.role, u.label, u.token].join(':');
  }).join(';');
  return {
    commit: stamp.commit,
    critical: { ...comum, DELIVERYOS_DATABASE_URL: db('deliveryos_critical', sec.critical) },
    async: { ...comum, DELIVERYOS_DATABASE_URL: db('deliveryos_async', sec.async), DELIVERYOS_INSTANCE_ID: 'mooca-lab-async' },
    pilot: { ...base, ENTREGAS_ENV: 'cloud', ENTREGAS_BIND: L.enderecoPiloto, ENTREGAS_UI_PORT: String(L.portaPiloto), ENTREGAS_UNIT_ID: 'ITAIM',
      ENTREGAS_PILOT_CONFIG: path.join(A, 'pilot-local.json'), ENTREGAS_DATA_DIR: F.dados, ENTREGAS_GPS_FLAGS_CONFIG: path.join(A, 'gps-disabled.json'),
      ENTREGAS_PLATFORM_URL: `http://127.0.0.1:${L.portaCritico}`, ENTREGAS_PLATFORM_READ_SECRET: sec.read, ENTREGAS_USERS: usuarios,
      ENTREGAS_ALLOWED_ORIGINS: L.publicUrl, ENTREGAS_PUBLIC_URL: L.publicUrl, ENTREGAS_TATA_READER_ROOT: L.readerRoot,
      ENTREGAS_TATA_BINDING_PATH: path.join(A, 'tata-source-binding.json'), ENTREGAS_TRIP_GRANT_SECRET: v1.trip_grant },
  };
}

// Preflight com os carregadores reais do CANDIDATO, num processo que nao abre porta nem conexao.
const TESTE_CRITICO = `const r={};const t=(k,f)=>{try{r[k]=f()}catch(e){r[k]='RECUSADO: '+String(e&&e.message||e).slice(0,160)}};
t('config',()=>{require('./dist/src/platform/config/platform-config.js').loadPlatformConfig();return 'ok'});
t('modo',()=>require('./dist/src/platform/config/modo-da-instancia.js').lerModoDaInstancia());
t('contrato',()=>require('./dist/src/platform/contracts/event-schema.js').carregarCatalogo().version);
t('segredoAparelho',()=>{require('./dist/src/platform/auth/device-token.js').lerSegredo();return 'ok'});
t('concessaoUnidades',()=>require('./dist/src/entregas/foundation/trip-capture-grant.js').loadTripGrantSecrets(process.env.DELIVERYOS_PILOT_TRIP_GRANT_SECRETS,'DELIVERYOS_PILOT_TRIP_GRANT_SECRETS').size);
t('leituraUnidades',()=>require('./dist/src/platform/runtime/rota-localizacao-despacho.js').loadPilotReadSecrets().size);
console.log(JSON.stringify(r));`;
const TESTE_PILOTO = `const m=require('./dist/src/entregas/pilot/cloud-config.js');const p=m.loadCloudConfig(process.env);
console.log(JSON.stringify(p.ok?{ok:true,descricao:m.describe(p.config)}:{ok:false,erros:p.errors||p.error||'recusado'}));`;
function testar(codigo, env) {
  const r = cp.spawnSync(L.node, ['-e', codigo], { cwd: appC, env, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  try { return JSON.parse(ocultar(r.stdout.trim().split('\n').pop())); } catch { return { erro: ocultar((r.stderr || '').slice(0, 300)) }; }
}

async function plano() {
  const falhas = [];
  const recibo = fs.existsSync(path.join(C, 'preparacao-candidato.json')) ? lerJson(path.join(C, 'preparacao-candidato.json')) : null;
  if (!recibo || recibo.schema !== 'deliveryos.candidato-v1-preparacao.v2') falhas.push('candidato sem recibo v2 de preparacao');
  const stamp = fs.existsSync(path.join(appC, 'dist', 'build-stamp.json')) ? lerJson(path.join(appC, 'dist', 'build-stamp.json')) : {};
  if (recibo && stamp.commit !== recibo.commit) falhas.push('carimbo do build difere do recibo');
  const cfg = lerJson(path.join(A, 'pilot-local.json')), flags = lerJson(path.join(A, 'gps-disabled.json'));
  if (cfg.unit_id !== 'ITAIM' || cfg.mode !== 'test' || cfg.source_mode !== 'simulated' || flags.gps_capture_enabled !== false || Object.values(cfg.features).some(Boolean)) falhas.push('configuracao do ensaio nao e a isolada de teste');
  if (!fs.existsSync(F.segredos)) falhas.push('falta private-v1.json (rode: segredos)');
  if (fs.existsSync(F.dados) && fs.readdirSync(F.dados).length) falhas.push(`${F.dados} ja tem dados`);
  const e = estado();
  if (['EXECUTANDO', 'ATIVO', 'REVERTENDO', 'REVERSAO_FALHOU'].includes(e.fase)) falhas.push(`estado atual ${e.fase}`);
  try { const dono = Number(fs.readFileSync(F.trava, 'utf8')); if (dono !== process.pid && vivo(dono)) falhas.push(`outra execucao (pid ${dono}) em andamento`); } catch {}
  let antigos = null, insp = null;
  if (!fs.existsSync(F.pidsA)) falhas.push('pasta ativa sem runtime-pids.json');
  else {
    antigos = lerJson(F.pidsA);
    insp = inspecionar([antigos.critical, antigos.async, antigos.pilot], [L.portaCritico, L.portaPiloto]);
    for (const papel of ['critical', 'async', 'pilot']) { const x = identidade(insp, antigos[papel], papel); if (x) falhas.push(x); }
    const dono = (porta) => insp.escutas.filter((l) => l.porta === porta).map((l) => l.pid);
    if (!dono(L.portaCritico).includes(antigos.critical)) falhas.push(`porta ${L.portaCritico} nao e do critico registrado`);
    if (!dono(L.portaPiloto).includes(antigos.pilot)) falhas.push(`porta ${L.portaPiloto} nao e do piloto registrado`);
  }
  const saude = { critico: await status(`http://127.0.0.1:${L.portaCritico}/health`), piloto: await status(`http://${L.enderecoPiloto}:${L.portaPiloto}/api/health`) };
  if (saude.critico !== 200 || saude.piloto !== 200) falhas.push(`saude atual ${JSON.stringify(saude)}`);
  let preflight = null;
  if (fs.existsSync(F.segredos)) {
    const amb = ambientes();
    preflight = { critico: testar(TESTE_CRITICO, amb.critical), assincrono: testar(TESTE_CRITICO, amb.async), piloto: testar(TESTE_PILOTO, amb.pilot) };
    for (const [k, v] of Object.entries(preflight)) if (JSON.stringify(v).includes('RECUSADO') || v.erro || v.ok === false) falhas.push(`preflight ${k} recusado`);
    if (preflight.critico.concessaoUnidades !== 1) falhas.push('concessao de viagem nao configurada para ITAIM');
  }
  const r = { comando: 'plano', maquina: process.env.COMPUTERNAME, em: agora(), candidato: recibo && recibo.commit, antigos, saude, preflight,
    passos: ['parar piloto antigo', 'parar assincrono antigo', 'parar critico antigo', 'subir critico do candidato e esperar /ready',
      'subir assincrono do candidato', 'subir piloto do candidato (arquivo novo)', 'conferir saude e termo exigindo sessao', `observar ${L.observacaoSeg} s`],
    reversao: 'automatica em qualquer falha: para o candidato, local-control.cjs start, switch-pilot.ps1 -Mode Remote, confere saude',
    pronto: falhas.length === 0, falhas };
  return r;
}

function segredos() {
  if (fs.existsSync(F.segredos)) throw Error(`${F.segredos} ja existe; nada foi alterado`);
  if (!fs.existsSync(path.join(C, 'preparacao-candidato.json'))) throw Error('candidato nao preparado');
  fs.writeFileSync(F.segredos, JSON.stringify({ schema: 'deliveryos.candidato-v1-segredos.v1', trip_grant: crypto.randomBytes(32).toString('hex') }), { flag: 'wx' });
  return { comando: 'segredos', criado: F.segredos, valores_impressos: 0 };
}

function pegarTrava() {
  try { fs.writeFileSync(F.trava, String(process.pid), { flag: 'wx' }); return; } catch (e) { if (e.code !== 'EEXIST') throw e; }
  const dono = Number(fs.readFileSync(F.trava, 'utf8'));
  if (vivo(dono)) throw Error(`outra execucao (pid ${dono}) esta em andamento`);
  fs.unlinkSync(F.trava); fs.writeFileSync(F.trava, String(process.pid), { flag: 'wx' });
}
const soltarTrava = () => { try { if (Number(fs.readFileSync(F.trava, 'utf8')) === process.pid) fs.unlinkSync(F.trava); } catch {} };

function despachar(acao, autorizacao) {
  if (!autorizacao || autorizacao.trim().length < 10) throw Error('--autorizacao "<quem autorizou e quando>" e obrigatoria');
  // A trava vale do despacho ao fim da execucao: quem despacha a pega e a entrega ao executor.
  // Sem isso, dois despachos seguidos passavam pelo plano antes de o primeiro executor comecar
  // (medido no Foxxy: o segundo executor foi recusado, mas o pedido pendente ja tinha sido trocado).
  pegarTrava();
  const id = crypto.randomBytes(6).toString('hex');
  let filho;
  try {
    gravarAtomico(F.estado, { ...estado(), pendente: { id, acao, autorizacao: autorizacao.trim(), pedidoEm: agora() } });
    fs.mkdirSync(F.logs, { recursive: true });
    const log = fs.openSync(path.join(F.logs, 'ativacao-executor.log'), 'a');
    const args = [__filename, 'executar', '--execucao', id];
    if (opt('--layout')) args.push('--layout', opt('--layout'));
    filho = cp.spawn(L.node, args, { cwd: C, stdio: ['ignore', log, log], detached: true, windowsHide: true });
    fs.closeSync(log); filho.unref();
    fs.writeFileSync(F.trava, String(filho.pid));
  } catch (e) { soltarTrava(); throw e; }
  return { comando: acao, despachado: true, execucao: id, executorPid: filho.pid, acompanhar: `node ativar-candidato-v1.cjs estado` };
}

// Os lancadores antigos deixam um processo destacado vivo, que herda a saida do pai: com pipe, o
// spawnSync so voltaria no tempo maximo (medido no Foxxy). A saida vai para arquivo e e lida depois.
function rodarParaArquivo(exe, args, ms) {
  fs.mkdirSync(F.logs, { recursive: true });
  const arq = path.join(F.logs, `reversao-${path.basename(args.find((a) => /\.(cjs|ps1)$/.test(a)) || exe)}-${Date.now()}.log`);
  const fd = fs.openSync(arq, 'a');
  let r;
  try { r = cp.spawnSync(exe, args, { cwd: A, stdio: ['ignore', fd, fd], windowsHide: true, timeout: ms }); } finally { fs.closeSync(fd); }
  return { status: r.status, stdout: fs.readFileSync(arq, 'utf8') };
}

async function reverter(motivo, inicio) {
  gravarAtomico(F.estado, { ...estado(), fase: 'REVERTENDO', motivo });
  diario('REVERSAO_INICIO', { motivo });
  const novos = fs.existsSync(F.pidsC) ? lerJson(F.pidsC) : (estado().novos || {});
  const insp = inspecionar(Object.values(novos).filter(Number.isInteger), []);
  for (const papel of ['pilot', 'async', 'critical']) {
    const pid = novos[papel];
    if (!Number.isInteger(pid) || !vivo(pid)) continue;
    const x = identidade(insp, pid, papel, inicio);
    if (x) { diario('REVERSAO_NAO_PAROU', { papel, pid, motivo: x }); continue; }
    await parar(pid); diario('REVERSAO_PAROU_CANDIDATO', { papel, pid });
  }
  // Falha no meio da parada: o que sobrou do ANTIGO tambem para (com identidade conferida), para os
  // lancadores originais acharem as portas livres e subirem os tres de novo, juntos.
  const antigos = estado().antigos || {};
  const inspA = inspecionar(Object.values(antigos).filter(Number.isInteger), []);
  for (const papel of ['pilot', 'async', 'critical']) {
    const pid = antigos[papel];
    if (!Number.isInteger(pid) || !vivo(pid) || identidade(inspA, pid, papel)) continue;
    await parar(pid); diario('REVERSAO_PAROU_SOBRA_ANTIGA', { papel, pid });
  }
  if (fs.existsSync(F.pidsC)) fs.renameSync(F.pidsC, F.pidsC.replace(/\.json$/, `.revertido-${Date.now()}.json`));
  await esperarPortaLivre('127.0.0.1', L.portaCritico, 15); await esperarPortaLivre(L.enderecoPiloto, L.portaPiloto, 15);
  if (fs.existsSync(F.pidsA)) fs.renameSync(F.pidsA, F.pidsA.replace(/\.json$/, `.antes-reversao-${Date.now()}.json`));
  const lc = rodarParaArquivo(L.node, [path.join(A, 'local-control.cjs'), 'start'], 90000);
  diario('REVERSAO_LOCAL_CONTROL', { status: lc.status, saida: ocultar(lc.stdout).slice(0, 400) });
  if (lc.status !== 0) throw Error('local-control.cjs start falhou');
  await esperar(`http://127.0.0.1:${L.portaCritico}/health`, [200], 40);
  await esperar(`http://127.0.0.1:${L.portaPiloto}/api/health`, [200], 40);
  const sw = rodarParaArquivo('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(A, 'switch-pilot.ps1'), '-Mode', 'Remote'], 120000);
  diario('REVERSAO_SWITCH_PILOT', { status: sw.status, saida: ocultar(sw.stdout).slice(0, 400) });
  if (sw.status !== 0 || !String(sw.stdout).includes('PILOT_SWITCH_PASS')) throw Error('switch-pilot.ps1 -Mode Remote falhou');
  await esperar(`http://${L.enderecoPiloto}:${L.portaPiloto}/api/health`, [200], 30);
  const restaurado = lerJson(F.pidsA);
  gravarAtomico(F.estado, { ...estado(), fase: 'REVERTIDO', revertidoEm: agora(), restaurado, motivo });
  diario('REVERTIDO', { restaurado });
}

async function executar(id) {
  const e0 = estado();
  if (!e0.pendente || e0.pendente.id !== id) throw Error('execucao desconhecida');
  // A trava ja e deste executor (entregue pelo despacho); espera o despacho escrever o pid.
  for (let i = 0; i < 50 && (() => { try { return Number(fs.readFileSync(F.trava, 'utf8')) !== process.pid; } catch { return true; } })(); i++) await dormir(100);
  if (Number(fs.readFileSync(F.trava, 'utf8')) !== process.pid) throw Error('a trava nao foi entregue a este executor');
  const { acao, autorizacao } = e0.pendente;
  const inicio = agora();
  try {
    if (acao === 'reverter') {
      if (e0.fase !== 'ATIVO') throw Error(`reverter so a partir de ATIVO (estado ${e0.fase})`);
      gravarAtomico(F.estado, { ...e0, execucao: id, pendente: null });
      diario('PEDIDO_REVERSAO', { autorizacao });
      await reverter('pedido manual', e0.ativadoDesde);
      return;
    }
    const p = await plano();
    if (!p.pronto) { diario('RECUSADO_NO_PLANO', { falhas: p.falhas }); gravarAtomico(F.estado, { ...estado(), pendente: null, ultimaRecusa: { em: agora(), falhas: p.falhas } }); return; }
    const amb = ambientes(), antigos = p.antigos;
    gravarAtomico(F.estado, { fase: 'EXECUTANDO', execucao: id, inicio, autorizacao, candidato: amb.commit, antigos, novos: {} });
    diario('INICIO', { autorizacao, candidato: amb.commit, antigos });
    let tocou = false;
    try {
      fs.copyFileSync(F.pidsA, F.pidsA.replace(/\.json$/, `.antes-v1-${Date.now()}.json`));
      const insp = inspecionar([antigos.critical, antigos.async, antigos.pilot], []);
      for (const papel of ['pilot', 'async', 'critical']) {
        const x = identidade(insp, antigos[papel], papel); if (x) throw Error(x);
        tocou = true; await parar(antigos[papel]); diario('PAROU_ANTIGO', { papel, pid: antigos[papel] });
      }
      fs.renameSync(F.pidsA, F.pidsA.replace(/\.json$/, `.substituido-v1-${Date.now()}.json`));
      await esperarPortaLivre('127.0.0.1', L.portaCritico, 15); await esperarPortaLivre(L.enderecoPiloto, L.portaPiloto, 15);
      const novos = {};
      const registrar = () => { gravarAtomico(F.pidsC, { ...novos, pilotMode: 'remote-lab-v1', commit: amb.commit }); gravarAtomico(F.estado, { ...estado(), novos }); };
      novos.critical = lancar('critical', appC, SCRIPTS.critical, amb.critical); registrar(); diario('SUBIU', { papel: 'critical', pid: novos.critical });
      if (INJETAR === 'matar-critico-antes-do-ready') { process.kill(novos.critical); diario('FALHA_INJETADA', { tipo: INJETAR }); }
      await esperar(`http://127.0.0.1:${L.portaCritico}/ready`, [200], 40);
      novos.async = lancar('async', appC, SCRIPTS.async, amb.async); registrar(); diario('SUBIU', { papel: 'async', pid: novos.async });
      fs.mkdirSync(F.dados, { recursive: true });
      novos.pilot = lancar('pilot', appC, SCRIPTS.pilot, amb.pilot); registrar(); diario('SUBIU', { papel: 'pilot', pid: novos.pilot });
      await esperar(`http://${L.enderecoPiloto}:${L.portaPiloto}/api/health`, [200], 40);
      const termo = await esperar(`http://${L.enderecoPiloto}:${L.portaPiloto}/api/term`, [401, 403], 10);
      // Impressao digital do candidato: so o V1 tem a rota de concessao delegada (sem token: 401).
      let digital = 0;
      try { digital = (await fetch(`http://${L.enderecoPiloto}:${L.portaPiloto}/api/device/trip-grants`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(3000) })).status; } catch {}
      if (digital !== 401) throw Error(`o piloto que respondeu nao e o candidato (trip-grants ${digital})`);
      diario('SAUDE_INICIAL', { termoSemSessao: termo, rotaDoCandidato: digital });
      if (INJETAR === 'matar-piloto-na-observacao') { process.kill(novos.pilot); diario('FALHA_INJETADA', { tipo: INJETAR }); }
      const fim = Date.now() + L.observacaoSeg * 1000;
      while (Date.now() < fim) {
        for (const papel of ['critical', 'async', 'pilot']) if (!vivo(novos[papel])) throw Error(`${papel} do candidato morreu na observacao`);
        if (await status(`http://127.0.0.1:${L.portaCritico}/health`) !== 200) throw Error('critico do candidato perdeu a saude');
        if (await status(`http://${L.enderecoPiloto}:${L.portaPiloto}/api/health`) !== 200) throw Error('piloto do candidato perdeu a saude');
        await dormir(5000);
      }
      gravarAtomico(F.estado, { ...estado(), fase: 'ATIVO', ativadoDesde: inicio, ativadoEm: agora(), pendente: null });
      diario('ATIVO', { novos });
    } catch (falha) {
      diario('FALHA', { motivo: ocultar(falha.message) });
      if (!tocou) { gravarAtomico(F.estado, { ...estado(), fase: 'NUNCA_ATIVADO', pendente: null, ultimaRecusa: { em: agora(), motivo: ocultar(falha.message) } }); return; }
      await reverter(`falha: ${ocultar(falha.message)}`, inicio);
    }
  } catch (falha) {
    diario('REVERSAO_FALHOU', { motivo: ocultar(falha.message) });
    gravarAtomico(F.estado, { ...estado(), fase: 'REVERSAO_FALHOU', motivo: ocultar(falha.message) });
    process.exitCode = 1;
  } finally { soltarTrava(); }
}

(async () => {
  let r;
  if (cmd === 'plano') r = await plano();
  else if (cmd === 'segredos') r = segredos();
  else if (cmd === 'ativar') { const p = await plano(); if (!p.pronto) { console.log(JSON.stringify({ comando: 'ativar', recusado: true, falhas: p.falhas }, null, 2)); process.exitCode = 2; return; } r = despachar('ativar', opt('--autorizacao')); }
  else if (cmd === 'reverter') { if (estado().fase !== 'ATIVO') throw Error(`reverter so a partir de ATIVO (estado ${estado().fase})`); r = despachar('reverter', opt('--autorizacao')); }
  else if (cmd === 'estado') r = { estado: estado(), ultimasLinhas: fs.existsSync(F.journal) ? fs.readFileSync(F.journal, 'utf8').trim().split('\n').slice(-12).map((l) => JSON.parse(l)) : [] };
  else if (cmd === 'executar') { await executar(opt('--execucao')); return; }
  else throw Error('comando: plano | segredos | ativar | reverter | estado');
  console.log(JSON.stringify(r, null, 2));
})().catch((e) => { console.error('ATIVACAO_RECUSADA:', ocultar(e.message)); process.exitCode = 1; });
