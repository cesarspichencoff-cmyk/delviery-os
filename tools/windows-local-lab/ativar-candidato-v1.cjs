'use strict';
/*
 * Cadeia supervisionada de ativacao do candidato V1 no CAIXA_MOOCA, com reversao LOCAL.
 *
 *   node ativar-candidato-v1.cjs plano                  so le: linha de base, processos, portas,
 *                                                       banco do ensaio, e a configuracao do candidato
 *                                                       pelos carregadores reais dele
 *   node ativar-candidato-v1.cjs segredos               cria <candidato>\private-v1.json; nunca
 *                                                       imprime valor; recusa sobrescrever
 *   node ativar-candidato-v1.cjs ativar   --autorizacao "<quem e quando>"
 *   node ativar-candidato-v1.cjs reverter --autorizacao "<quem e quando>"   (a partir de ATIVO)
 *   node ativar-candidato-v1.cjs recuperar --autorizacao "<quem e quando>"  (executor e vigia mortos)
 *   node ativar-candidato-v1.cjs estado
 *
 * Duas linhas de base, detectadas pelo plano, nunca escolhidas por parametro:
 *   ativo  - critico, assincrono e piloto antigos rodando (o registro da pasta ativa bate com
 *            processos vivos e donos das portas). A troca para os tres e sobe os do candidato;
 *            a reversao sobe os antigos pelos lancadores da propria pasta ativa
 *            (local-control.cjs start e switch-pilot.ps1 -Mode Remote).
 *   parado - nada do ensaio rodando (medido no caixa em 15/11: o PostgreSQL do ensaio caiu em
 *            29/10 e nada voltou depois do boot de 11/11). Antes de tocar em qualquer coisa a cadeia
 *            copia o diretorio de dados do PostgreSQL parado, com manifesto SHA-256; sobe o
 *            PostgreSQL (recuperacao do desligamento sujo), confere o banco com o verificador do
 *            candidato e sobe o candidato. A reversao para o candidato e o PostgreSQL e devolve o
 *            diretorio de dados BYTE A BYTE (manifesto antes = manifesto depois): o caixa volta
 *            exatamente ao que era.
 *
 * Quem executa: ativar/reverter/recuperar so validam e entregam o trabalho a DOIS processos
 * destacados (windowsHide), independentes do conector:
 *   executor - faz os passos; cada passo vai ao diario (fsync) antes de acontecer; falha em
 *              qualquer passo depois de tocar em algo dispara a reversao;
 *   vigia    - so observa o executor; se ele morrer no meio (EXECUTANDO ou REVERTENDO), toma a
 *              trava e reverte. Perder a conexao remota nao mata nenhum dos dois.
 * Se executor E vigia morrerem, o estado fica EXECUTANDO/REVERTENDO com a trava de um pid morto:
 * `plano` e `estado` acusam, e `recuperar` reverte.
 *
 * O que NAO faz: migration, firewall, NetBird, porta nova, portao de campo, Home por hostname, GPS
 * (gps-disabled.json continua falso), pedido, impressao, Edge, Reader, tarefa agendada.
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
  pgBin: 'C:\\Users\\Tata\\DeliveryOS-Ensaio\\postgres16\\bin',
  pgData: 'C:\\Users\\Tata\\DeliveryOS-Ensaio\\pgdata',
  pgLog: 'C:\\Users\\Tata\\DeliveryOS-Ensaio\\logs\\postgres.log',
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
// Falha injetada: so no ensaio (--layout), nunca no caixa. Exercita reversao e recuperacao.
const INJETAR = opt('--layout') && process.env.COMPUTERNAME !== 'CAIXA_MOOCA' ? L.injetarFalha : undefined;
const A = L.ativa, C = L.candidato, appC = path.join(C, 'app');
const F = {
  journal: path.join(C, 'ativacao-journal.jsonl'), estado: path.join(C, 'ativacao-estado.json'),
  trava: path.join(C, 'ativacao.trava'), segredos: path.join(C, 'private-v1.json'),
  pidsC: path.join(C, 'runtime-pids.json'), pidsA: path.join(A, 'runtime-pids.json'),
  logs: path.join(C, 'logs'), dados: path.join(C, 'data', 'pilot'),
};
const SCRIPTS = { critical: 'dist/src/platform/bin/critical.js', async: 'dist/src/platform/bin/async-runtime.js', pilot: 'dist/tools/entregas_pilot_server.js' };
const TERMINAIS = ['ATIVO', 'REVERTIDO', 'REVERSAO_FALHOU', 'NUNCA_ATIVADO'];
const lerJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const agora = () => new Date().toISOString();
const carimbo = () => agora().replace(/[:.]/g, '').replace('T', '-').slice(0, 17);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const ocultar = (s) => String(s).replace(/postgres(ql)?:\/\/\S+/gi, 'postgresql://<oculto>').replace(/[a-f0-9]{32,}/gi, '<oculto>');
function gravarAtomico(f, obj) { const t = f + '.tmp-' + process.pid; fs.writeFileSync(t, JSON.stringify(obj, null, 2)); fs.renameSync(t, f); }
function diario(ev, dados) {
  fs.mkdirSync(C, { recursive: true });
  const fd = fs.openSync(F.journal, 'a');
  try { fs.writeSync(fd, JSON.stringify({ at: agora(), pid: process.pid, ev, ...dados }) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
const estado = () => (fs.existsSync(F.estado) ? lerJson(F.estado) : { fase: 'NUNCA_ATIVADO' });
const mudar = (campos) => gravarAtomico(F.estado, { ...estado(), ...campos });
const vivo = (pid) => { if (!Number.isInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const donoDaTrava = () => { try { return Number(fs.readFileSync(F.trava, 'utf8')); } catch { return 0; } };

// Uma chamada de PowerShell oculta para identidade de processos e donos de porta.
function inspecionar(pids, portas) {
  const ids = pids.filter(Number.isInteger).join(',') || '0';
  const ps = `$ErrorActionPreference='SilentlyContinue';` +
    `$p=@(Get-CimInstance Win32_Process | ?{ @(${ids}) -contains $_.ProcessId } | %{ [pscustomobject]@{pid=[int]$_.ProcessId;exe=$_.ExecutablePath;cmd=$_.CommandLine;criado=$_.CreationDate.ToUniversalTime().ToString('o')} });` +
    `$l=@(Get-NetTCPConnection -State Listen | ?{ @(${portas.join(',') || '0'}) -contains $_.LocalPort } | %{ [pscustomobject]@{porta=[int]$_.LocalPort;endereco=$_.LocalAddress;pid=[int]$_.OwningProcess} });` +
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
// Quem ESCUTA numa porta, pela tabela do sistema (so leitura, nenhum socket). Conectar nao serve: no
// caixa a guarda do NetBird DESCARTA conexao ao endereco do wt0, a tentativa expira, e expirar nao e
// "ocupado" (medido no caixa em 15/11: o ensaio reverteu por uma porta que ninguem escutava).
const CURINGAS = ['0.0.0.0', '::'];
function escutasEm(porta) { return inspecionar([], [porta]).escutas.filter((l) => l.porta === porta); }
function ocupada(host, porta) { return escutasEm(porta).some((l) => l.endereco === host || CURINGAS.includes(l.endereco) || (host === '127.0.0.1' && l.endereco === '::1')); }
async function esperarPortaLivre(host, porta, seg) { const fim = Date.now() + seg * 1000; while (Date.now() < fim) { if (!ocupada(host, porta)) return; await dormir(500); } throw Error(`porta ${host}:${porta} continua ocupada (escuta: ${JSON.stringify(escutasEm(porta))})`); }
async function parar(pid, seg = 10) { if (!vivo(pid)) return; process.kill(pid); const fim = Date.now() + seg * 1000; while (vivo(pid) && Date.now() < fim) await dormir(200); if (vivo(pid)) throw Error(`pid ${pid} nao terminou`); }
function lancar(rotulo, app, script, env) {
  fs.mkdirSync(F.logs, { recursive: true });
  const out = fs.openSync(path.join(F.logs, rotulo + '.out.log'), 'a'), err = fs.openSync(path.join(F.logs, rotulo + '.err.log'), 'a');
  const filho = cp.spawn(L.node, [script], { cwd: app, env, stdio: ['ignore', out, err], detached: true, windowsHide: true });
  fs.closeSync(out); fs.closeSync(err); filho.unref();
  return filho.pid;
}
// Os lancadores antigos e o pg_ctl deixam processo destacado vivo, que herda a saida do pai: com
// pipe, o spawnSync so voltaria no tempo maximo (medido no Foxxy). A saida vai para arquivo.
function rodarParaArquivo(exe, args, ms, env) {
  fs.mkdirSync(F.logs, { recursive: true });
  const arq = path.join(F.logs, `passo-${path.basename(args.find((a) => /\.(cjs|ps1|js)$/.test(a)) || exe)}-${Date.now()}.log`);
  const fd = fs.openSync(arq, 'a');
  let r;
  try { r = cp.spawnSync(exe, args, { cwd: A, env: env || process.env, stdio: ['ignore', fd, fd], windowsHide: true, timeout: ms }); } finally { fs.closeSync(fd); }
  return { status: r.status, stdout: fs.readFileSync(arq, 'utf8') };
}

// ---- PostgreSQL do ensaio: copia a frio, manifesto, partida e parada sem janela -------------------
function arquivos(dir) {
  const out = [];
  (function andar(d, rel) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) andar(path.join(d, e.name), r); else out.push(r); } })(dir, '');
  return out.sort();
}
function manifesto(dir) {
  const linhas = arquivos(dir).map((r) => crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, r))).digest('hex') + ' ' + r);
  return { arquivos: linhas.length, sha256: crypto.createHash('sha256').update(linhas.join('\n')).digest('hex') };
}
const pgRodando = async () => ocupada(L.dbHost, L.dbPort);
function pgCtl(args, ms) { return rodarParaArquivo(path.join(L.pgBin, 'pg_ctl.exe'), ['-D', L.pgData, ...args], ms); }

// Ambientes: os MESMOS que local-control.cjs e remote-pilot.cjs montam hoje, mais o que o V1 exige.
// Onde o piloto do CANDIDATO escuta. loopback: so 127.0.0.1, modo local, sem contas remotas nem
// origem publica - o endereco do NetBird fica exatamente como estava (padrao da linha de base
// parada, em que o NetBird hoje nao serve nada). netbird: o mesmo endereco, porta e modo de teste
// do ensaio antigo (padrao da linha de base ativa, para nao mudar a disponibilidade dele).
const MODOS_PILOTO = ['loopback', 'netbird'];
let PILOTO = L.enderecoPiloto;
const hostDoPiloto = (modo) => (modo === 'loopback' ? '127.0.0.1' : L.enderecoPiloto);

function ambientes(modoPiloto = 'netbird') {
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
  const pilotoNetbird = { ...base, ENTREGAS_ENV: 'cloud', ENTREGAS_BIND: L.enderecoPiloto, ENTREGAS_UI_PORT: String(L.portaPiloto), ENTREGAS_UNIT_ID: 'ITAIM',
    ENTREGAS_PILOT_CONFIG: path.join(A, 'pilot-local.json'), ENTREGAS_DATA_DIR: F.dados, ENTREGAS_GPS_FLAGS_CONFIG: path.join(A, 'gps-disabled.json'),
    ENTREGAS_PLATFORM_URL: `http://127.0.0.1:${L.portaCritico}`, ENTREGAS_PLATFORM_READ_SECRET: sec.read, ENTREGAS_USERS: usuarios,
    ENTREGAS_ALLOWED_ORIGINS: L.publicUrl, ENTREGAS_PUBLIC_URL: L.publicUrl, ENTREGAS_TATA_READER_ROOT: L.readerRoot,
    ENTREGAS_TATA_BINDING_PATH: path.join(A, 'tata-source-binding.json'), ENTREGAS_TRIP_GRANT_SECRET: v1.trip_grant };
  // O mesmo que remote-pilot.cjs start-local faz: modo local, so loopback, sem contas e origens remotas.
  const pilotoLoopback = { ...pilotoNetbird, ENTREGAS_ENV: 'local', ENTREGAS_BIND: '127.0.0.1' };
  for (const k of ['ENTREGAS_USERS', 'ENTREGAS_ALLOWED_ORIGINS', 'ENTREGAS_PUBLIC_URL']) delete pilotoLoopback[k];
  return {
    commit: stamp.commit,
    pilot: modoPiloto === 'loopback' ? pilotoLoopback : pilotoNetbird,
    critical: { ...comum, DELIVERYOS_DATABASE_URL: db('deliveryos_critical', sec.critical) },
    async: { ...comum, DELIVERYOS_DATABASE_URL: db('deliveryos_async', sec.async), DELIVERYOS_INSTANCE_ID: 'mooca-lab-async' },
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
const TESTE_BANCO = `(async()=>{const s=require('./dist/src/platform/persistence/sql-client.js'),d=require('./dist/src/platform/database-preflight.js'),
r=require('./dist/src/platform/migrations/runner.js'),l=require('./dist/src/platform/migrations/localizar.js');
const c=await s.createPgClient({url:process.env.DELIVERYOS_DATABASE_URL,ssl:false,max:1,statementTimeoutMs:20000});
try{const f=await d.readDatabasePreflightFacts(c);const sondas=f.applied_migrations.filter(m=>m.version.startsWith('probe:')).length;
f.applied_migrations=f.applied_migrations.filter(m=>!m.version.startsWith('probe:'));
const e=d.evaluateDatabasePreflight({facts:f,local_migrations:r.loadMigrations(l.diretorioDeMigrations()),tls_required:false});
console.log(JSON.stringify({schema_current:e.schema_current,pendentes:e.pending_migrations,desconhecidas:e.unknown_migrations,divergentes:e.checksum_mismatches.map(x=>x.version),aplicadas:f.applied_migrations.length,sondasIgnoradas:sondas}))}
finally{await c.close()}})().catch(e=>{console.log(JSON.stringify({erro:String(e&&e.message||e).slice(0,200)}));process.exitCode=1})`;
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
  if (!TERMINAIS.includes(e.fase)) falhas.push(`estado atual ${e.fase}` + (vivo(donoDaTrava()) ? '' : ' com executor morto: rode recuperar'));
  else if (e.fase === 'ATIVO' || e.fase === 'REVERSAO_FALHOU') falhas.push(`estado atual ${e.fase}`);
  const dono = donoDaTrava(); if (dono && dono !== process.pid && vivo(dono)) falhas.push(`outra execucao (pid ${dono}) em andamento`);

  // Linha de base: medida, nunca declarada.
  let antigos = null, linhaDeBase = null;
  const portas = [L.portaCritico, L.portaPiloto, L.dbPort];
  if (!fs.existsSync(F.pidsA)) falhas.push('pasta ativa sem runtime-pids.json');
  else antigos = lerJson(F.pidsA);
  const insp = inspecionar(antigos ? [antigos.critical, antigos.async, antigos.pilot] : [], portas);
  const nossos = antigos ? ['critical', 'async', 'pilot'].filter((p) => !identidade(insp, antigos[p], p)) : [];
  const donoDa = (porta) => insp.escutas.filter((l) => l.porta === porta).map((l) => l.pid);
  if (antigos && nossos.length === 3) {
    linhaDeBase = 'ativo';
    if (!donoDa(L.portaCritico).includes(antigos.critical)) falhas.push(`porta ${L.portaCritico} nao e do critico registrado`);
    if (!donoDa(L.portaPiloto).includes(antigos.pilot)) falhas.push(`porta ${L.portaPiloto} nao e do piloto registrado`);
  } else if (nossos.length === 0) {
    linhaDeBase = 'parado';
    if (donoDa(L.portaCritico).length || donoDa(L.portaPiloto).length) falhas.push(`linha de base parada, mas ha processo alheio em ${L.portaCritico}/${L.portaPiloto}`);
  } else falhas.push(`linha de base mista: so ${nossos.join(', ')} do ensaio vivo(s)`);
  const saude = { critico: await status(`http://127.0.0.1:${L.portaCritico}/health`), piloto: await status(`http://${L.enderecoPiloto}:${L.portaPiloto}/api/health`) };
  if (linhaDeBase === 'ativo' && (saude.critico !== 200 || saude.piloto !== 200)) falhas.push(`saude atual ${JSON.stringify(saude)}`);
  let banco = null;
  if (linhaDeBase === 'parado') {
    const rodando = await pgRodando();
    banco = { rodando, pgData: L.pgData, existe: fs.existsSync(L.pgData), pgCtl: fs.existsSync(path.join(L.pgBin, 'pg_ctl.exe')) };
    if (!banco.existe || !banco.pgCtl) falhas.push('PostgreSQL do ensaio sem diretorio de dados ou sem pg_ctl');
    if (!rodando && banco.existe) {
      banco.desligamentoSujo = fs.existsSync(path.join(L.pgData, 'postmaster.pid'));
      const tam = arquivos(L.pgData).reduce((s, r) => s + fs.statSync(path.join(L.pgData, r)).size, 0);
      banco.tamanhoMB = Math.round(tam / 1048576 * 10) / 10;
      const livre = fs.statfsSync ? (() => { const s = fs.statfsSync(C); return s.bavail * s.bsize; })() : Infinity;
      if (livre < tam * 3) falhas.push('espaco livre insuficiente para a copia a frio do banco');
    }
  }
  const modoPiloto = opt('--piloto') || (linhaDeBase === 'parado' ? 'loopback' : 'netbird');
  if (!MODOS_PILOTO.includes(modoPiloto)) falhas.push(`--piloto ${modoPiloto} invalido (loopback | netbird)`);
  let preflight = null;
  if (fs.existsSync(F.segredos)) {
    const amb = ambientes(modoPiloto);
    preflight = { critico: testar(TESTE_CRITICO, amb.critical), assincrono: testar(TESTE_CRITICO, amb.async), piloto: testar(TESTE_PILOTO, amb.pilot) };
    for (const [k, v] of Object.entries(preflight)) if (JSON.stringify(v).includes('RECUSADO') || v.erro || v.ok === false) falhas.push(`preflight ${k} recusado`);
    if (preflight.critico.concessaoUnidades !== 1) falhas.push('concessao de viagem nao configurada para ITAIM');
  }
  const passos = linhaDeBase === 'parado'
    ? ['copiar a frio o diretorio de dados do PostgreSQL do ensaio (manifesto SHA-256)', 'subir o PostgreSQL do ensaio (recuperacao do desligamento sujo)',
      'conferir o banco com o verificador do candidato', 'subir critico do candidato e esperar /ready', 'subir assincrono do candidato',
      'subir piloto do candidato (arquivo novo)', 'conferir saude, termo exigindo sessao e rota do candidato', `observar ${L.observacaoSeg} s`]
    : ['parar piloto antigo', 'parar assincrono antigo', 'parar critico antigo', 'subir critico do candidato e esperar /ready', 'subir assincrono do candidato',
      'subir piloto do candidato (arquivo novo)', 'conferir saude, termo exigindo sessao e rota do candidato', `observar ${L.observacaoSeg} s`];
  const reversao = linhaDeBase === 'parado'
    ? 'automatica em qualquer falha (executor ou vigia): para o candidato, para o PostgreSQL, devolve o diretorio de dados byte a byte e confere o manifesto'
    : 'automatica em qualquer falha (executor ou vigia): para o candidato, local-control.cjs start, switch-pilot.ps1 -Mode Remote, confere saude';
  return { comando: 'plano', maquina: process.env.COMPUTERNAME, em: agora(), candidato: recibo && recibo.commit, linhaDeBase, modoPiloto, enderecoDoPilotoCandidato: hostDoPiloto(modoPiloto), antigos, saude, banco, preflight,
    escutasAtuais: insp.escutas, passos, reversao, pronto: falhas.length === 0, falhas };
}

function segredos() {
  if (fs.existsSync(F.segredos)) throw Error(`${F.segredos} ja existe; nada foi alterado`);
  if (!fs.existsSync(path.join(C, 'preparacao-candidato.json'))) throw Error('candidato nao preparado');
  fs.writeFileSync(F.segredos, JSON.stringify({ schema: 'deliveryos.candidato-v1-segredos.v1', trip_grant: crypto.randomBytes(32).toString('hex') }), { flag: 'wx' });
  return { comando: 'segredos', criado: F.segredos, valores_impressos: 0 };
}

function pegarTrava() {
  try { fs.writeFileSync(F.trava, String(process.pid), { flag: 'wx' }); return; } catch (e) { if (e.code !== 'EEXIST') throw e; }
  const dono = donoDaTrava();
  if (vivo(dono)) throw Error(`outra execucao (pid ${dono}) esta em andamento`);
  fs.unlinkSync(F.trava); fs.writeFileSync(F.trava, String(process.pid), { flag: 'wx' });
}
const soltarTrava = () => { try { if (donoDaTrava() === process.pid) fs.unlinkSync(F.trava); } catch {} };

function despachar(acao, autorizacao) {
  if (!autorizacao || autorizacao.trim().length < 10) throw Error('--autorizacao "<quem autorizou e quando>" e obrigatoria');
  // A trava vale do despacho ao fim da execucao: quem despacha a pega e a entrega ao executor.
  // Sem isso, dois despachos seguidos passavam pelo plano antes de o primeiro executor comecar
  // (medido no Foxxy: o segundo executor foi recusado, mas o pedido pendente ja tinha sido trocado).
  pegarTrava();
  const id = crypto.randomBytes(6).toString('hex');
  let exec, vigia;
  try {
    mudar({ pendente: { id, acao, autorizacao: autorizacao.trim(), pedidoEm: agora() } });
    fs.mkdirSync(F.logs, { recursive: true });
    const extra = [...(opt('--layout') ? ['--layout', opt('--layout')] : []), ...(opt('--piloto') ? ['--piloto', opt('--piloto')] : [])];
    const destacar = (args, log) => { const fd = fs.openSync(path.join(F.logs, log), 'a'); const p = cp.spawn(L.node, [__filename, ...args, ...extra], { cwd: C, stdio: ['ignore', fd, fd], detached: true, windowsHide: true }); fs.closeSync(fd); p.unref(); return p.pid; };
    exec = destacar(['executar', '--execucao', id], 'ativacao-executor.log');
    fs.writeFileSync(F.trava, String(exec));
    vigia = destacar(['vigiar', '--execucao', id, '--executor', String(exec)], 'ativacao-vigia.log');
    mudar({ pendente: { ...estado().pendente, executorPid: exec, vigiaPid: vigia } });
  } catch (e) { soltarTrava(); throw e; }
  return { comando: acao, despachado: true, execucao: id, executorPid: exec, vigiaPid: vigia, acompanhar: 'node ativar-candidato-v1.cjs estado' };
}

async function reverter(motivo, inicio) {
  const e0 = estado();
  mudar({ fase: 'REVERTENDO', motivo });
  diario('REVERSAO_INICIO', { motivo, linhaDeBase: e0.linhaDeBase });
  if (INJETAR === 'matar-executor-na-reversao' && cmd === 'executar') { diario('FALHA_INJETADA', { tipo: INJETAR }); process.kill(process.pid); await dormir(5000); }
  const novos = fs.existsSync(F.pidsC) ? lerJson(F.pidsC) : (e0.novos || {});
  const insp = inspecionar(Object.values(novos).filter(Number.isInteger), []);
  for (const papel of ['pilot', 'async', 'critical']) {
    const pid = novos[papel];
    if (!Number.isInteger(pid) || !vivo(pid)) continue;
    const x = identidade(insp, pid, papel, inicio);
    if (x) { diario('REVERSAO_NAO_PAROU', { papel, pid, motivo: x }); continue; }
    await parar(pid); diario('REVERSAO_PAROU_CANDIDATO', { papel, pid });
  }
  if (fs.existsSync(F.pidsC)) fs.renameSync(F.pidsC, F.pidsC.replace(/\.json$/, `.revertido-${Date.now()}.json`));
  if (fs.existsSync(F.dados)) fs.renameSync(F.dados, F.dados + '.revertido-' + carimbo());
  await esperarPortaLivre('127.0.0.1', L.portaCritico, 15); await esperarPortaLivre(L.enderecoPiloto, L.portaPiloto, 15); await esperarPortaLivre('127.0.0.1', L.portaPiloto, 15);

  if (e0.linhaDeBase === 'parado') {
    if (e0.pgIniciadoPorNos && await pgRodando()) {
      const st = pgCtl(['-m', 'fast', '-w', '-t', '60', 'stop'], 90000);
      diario('REVERSAO_PG_PARADO', { status: st.status });
      if (st.status !== 0 || await pgRodando()) throw Error('pg_ctl stop falhou');
    }
    let comprovante = null;
    if (e0.copiaDoBanco) {
      const depois = L.pgData + '.depois-do-ensaio-' + carimbo();
      if (fs.existsSync(L.pgData)) fs.renameSync(L.pgData, depois);
      fs.cpSync(e0.copiaDoBanco.pasta, L.pgData, { recursive: true });
      const m = manifesto(L.pgData);
      comprovante = { antes: e0.copiaDoBanco.manifesto, depois: m, identico: m.sha256 === e0.copiaDoBanco.manifesto.sha256 && m.arquivos === e0.copiaDoBanco.manifesto.arquivos, guardadoParaAnalise: depois };
      diario('REVERSAO_BANCO_DEVOLVIDO', { comprovante });
      if (!comprovante.identico) throw Error('o diretorio de dados devolvido nao bate com o manifesto de antes');
    }
    const insp2 = inspecionar([], [L.portaCritico, L.portaPiloto, L.dbPort]);
    if (insp2.escutas.length) throw Error('ainda ha processo escutando nas portas do ensaio');
    mudar({ fase: 'REVERTIDO', revertidoEm: agora(), comprovante, motivo });
    diario('REVERTIDO', { linhaDeBase: 'parado', comprovante, escutas: insp2.escutas });
    return;
  }

  // Linha de base ativa: o que sobrou do ANTIGO tambem para (identidade conferida), para os
  // lancadores originais acharem as portas livres e subirem os tres de novo, juntos.
  const antigos = e0.antigos || {};
  const inspA = inspecionar(Object.values(antigos).filter(Number.isInteger), []);
  for (const papel of ['pilot', 'async', 'critical']) {
    const pid = antigos[papel];
    if (!Number.isInteger(pid) || !vivo(pid) || identidade(inspA, pid, papel)) continue;
    await parar(pid); diario('REVERSAO_PAROU_SOBRA_ANTIGA', { papel, pid });
  }
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
  mudar({ fase: 'REVERTIDO', revertidoEm: agora(), restaurado, motivo });
  diario('REVERTIDO', { linhaDeBase: 'ativo', restaurado });
}

async function ativar(id, autorizacao) {
  const p = await plano();
  if (!p.pronto) { diario('RECUSADO_NO_PLANO', { falhas: p.falhas }); mudar({ pendente: null, ultimaRecusa: { em: agora(), falhas: p.falhas } }); return; }
  const amb = ambientes(p.modoPiloto), antigos = p.antigos, inicio = agora();
  PILOTO = hostDoPiloto(p.modoPiloto);
  gravarAtomico(F.estado, { fase: 'EXECUTANDO', execucao: id, inicio, autorizacao, candidato: amb.commit, linhaDeBase: p.linhaDeBase, modoPiloto: p.modoPiloto, antigos, novos: {}, pendente: null });
  diario('INICIO', { autorizacao, candidato: amb.commit, linhaDeBase: p.linhaDeBase, antigos });
  let tocou = false;
  try {
    if (p.linhaDeBase === 'ativo') {
      fs.copyFileSync(F.pidsA, F.pidsA.replace(/\.json$/, `.antes-v1-${Date.now()}.json`));
      const insp = inspecionar([antigos.critical, antigos.async, antigos.pilot], []);
      for (const papel of ['pilot', 'async', 'critical']) {
        const x = identidade(insp, antigos[papel], papel); if (x) throw Error(x);
        tocou = true; await parar(antigos[papel]); diario('PAROU_ANTIGO', { papel, pid: antigos[papel] });
      }
      fs.renameSync(F.pidsA, F.pidsA.replace(/\.json$/, `.substituido-v1-${Date.now()}.json`));
    } else {
      if (!(await pgRodando())) {
        const pasta = path.join(C, 'pgdata-antes-do-ensaio-' + carimbo());
        fs.cpSync(L.pgData, pasta, { recursive: true });
        const copia = { pasta, manifesto: manifesto(pasta), original: manifesto(L.pgData) };
        if (copia.manifesto.sha256 !== copia.original.sha256) throw Error('a copia a frio do banco nao bate com o original');
        mudar({ copiaDoBanco: { pasta, manifesto: copia.manifesto } });
        diario('BANCO_COPIADO', { pasta, manifesto: copia.manifesto });
        tocou = true;
        mudar({ pgIniciadoPorNos: true });
        const st = pgCtl(['-o', `-p ${L.dbPort}`, '-l', L.pgLog, '-w', '-t', '120', 'start'], 150000);
        diario('PG_SUBIU', { status: st.status });
        if (st.status !== 0 || !(await pgRodando())) throw Error('pg_ctl start falhou');
      }
      // Schema atual pelas funcoes da PROPRIA plataforma do candidato, so leitura, com a credencial de
      // runtime. Nao e verificar-banco.js: ele julga a credencial de MIGRATION (o runtime reprova por
      // desenho) e, no candidato 0359e304, ainda conta a sonda probe:escrita do /ready como drift
      // (corrigido depois na plataforma; aqui a sonda e retirada do mesmo jeito).
      const sb = cp.spawnSync(L.node, ['-e', TESTE_BANCO], { cwd: appC, env: amb.critical, encoding: 'utf8', windowsHide: true, timeout: 60000 });
      let schema; try { schema = JSON.parse(ocultar(sb.stdout.trim().split('\n').pop())); } catch { schema = { erro: ocultar((sb.stderr || '').slice(0, 300)) }; }
      diario('BANCO_VERIFICADO', { schema });
      if (schema.schema_current !== true) throw Error('o schema do banco do ensaio nao e o do candidato');
    }
    await esperarPortaLivre('127.0.0.1', L.portaCritico, 15); await esperarPortaLivre(L.enderecoPiloto, L.portaPiloto, 15); await esperarPortaLivre('127.0.0.1', L.portaPiloto, 15);
    const novos = {};
    const registrar = () => { gravarAtomico(F.pidsC, { ...novos, pilotMode: 'remote-lab-v1', commit: amb.commit }); mudar({ novos }); };
    tocou = true;
    novos.critical = lancar('critical', appC, SCRIPTS.critical, amb.critical); registrar(); diario('SUBIU', { papel: 'critical', pid: novos.critical });
    if (INJETAR === 'matar-critico-antes-do-ready') { process.kill(novos.critical); diario('FALHA_INJETADA', { tipo: INJETAR }); }
    if (INJETAR === 'matar-executor-apos-subir-critico' || INJETAR === 'matar-executor-e-vigia') { diario('FALHA_INJETADA', { tipo: INJETAR }); process.kill(process.pid); await dormir(5000); }
    await esperar(`http://127.0.0.1:${L.portaCritico}/ready`, [200], 40);
    novos.async = lancar('async', appC, SCRIPTS.async, amb.async); registrar(); diario('SUBIU', { papel: 'async', pid: novos.async });
    fs.mkdirSync(F.dados, { recursive: true });
    novos.pilot = lancar('pilot', appC, SCRIPTS.pilot, amb.pilot); registrar(); diario('SUBIU', { papel: 'pilot', pid: novos.pilot });
    await esperar(`http://${PILOTO}:${L.portaPiloto}/api/health`, [200], 40);
    const termo = await esperar(`http://${PILOTO}:${L.portaPiloto}/api/term`, [401, 403], 10);
    // Impressao digital do candidato: so o V1 tem a rota de concessao delegada (sem token: 401).
    let digital = 0;
    try { digital = (await fetch(`http://${PILOTO}:${L.portaPiloto}/api/device/trip-grants`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(3000) })).status; } catch {}
    if (digital !== 401) throw Error(`o piloto que respondeu nao e o candidato (trip-grants ${digital})`);
    // Prova de nao exposicao: no modo loopback NADA pode aceitar conexao no endereco do NetBird.
    const naoExposto = p.modoPiloto !== 'loopback' || !ocupada(L.enderecoPiloto, L.portaPiloto);
    if (!naoExposto) throw Error('modo loopback, mas ha algo escutando no endereco do NetBird');
    diario('SAUDE_INICIAL', { termoSemSessao: termo, rotaDoCandidato: digital, modoPiloto: p.modoPiloto, enderecoNetbirdSemEscuta: p.modoPiloto === 'loopback' ? true : null });
    if (INJETAR === 'matar-piloto-na-observacao') { process.kill(novos.pilot); diario('FALHA_INJETADA', { tipo: INJETAR }); }
    const fim = Date.now() + L.observacaoSeg * 1000;
    while (Date.now() < fim) {
      for (const papel of ['critical', 'async', 'pilot']) if (!vivo(novos[papel])) throw Error(`${papel} do candidato morreu na observacao`);
      if (await status(`http://127.0.0.1:${L.portaCritico}/health`) !== 200) throw Error('critico do candidato perdeu a saude');
      if (await status(`http://${PILOTO}:${L.portaPiloto}/api/health`) !== 200) throw Error('piloto do candidato perdeu a saude');
      await dormir(5000);
    }
    mudar({ fase: 'ATIVO', ativadoDesde: inicio, ativadoEm: agora() });
    diario('ATIVO', { novos });
  } catch (falha) {
    diario('FALHA', { motivo: ocultar(falha.message) });
    if (!tocou) { mudar({ fase: 'NUNCA_ATIVADO', ultimaRecusa: { em: agora(), motivo: ocultar(falha.message) } }); return; }
    await reverter(`falha: ${ocultar(falha.message)}`, inicio);
  }
}

async function executar(id) {
  const e0 = estado();
  if (!e0.pendente || e0.pendente.id !== id) throw Error('execucao desconhecida');
  // A trava ja e deste executor (entregue pelo despacho); espera o despacho escrever o pid.
  for (let i = 0; i < 50 && donoDaTrava() !== process.pid; i++) await dormir(100);
  if (donoDaTrava() !== process.pid) throw Error('a trava nao foi entregue a este executor');
  const { acao, autorizacao } = e0.pendente;
  try {
    if (acao === 'reverter' || acao === 'recuperar') {
      const permitido = acao === 'reverter' ? e0.fase === 'ATIVO' : ['EXECUTANDO', 'REVERTENDO', 'REVERSAO_FALHOU'].includes(e0.fase);
      if (!permitido) throw Error(`${acao} nao se aplica ao estado ${e0.fase}`);
      mudar({ execucao: id, pendente: null });
      diario(acao === 'reverter' ? 'PEDIDO_REVERSAO' : 'PEDIDO_RECUPERACAO', { autorizacao });
      await reverter(acao === 'reverter' ? 'pedido manual' : 'recuperacao manual: executor e vigia interrompidos', e0.ativadoDesde || e0.inicio);
      return;
    }
    await ativar(id, autorizacao);
  } catch (falha) {
    diario('REVERSAO_FALHOU', { motivo: ocultar(falha.message) });
    mudar({ fase: 'REVERSAO_FALHOU', motivo: ocultar(falha.message) });
    process.exitCode = 1;
  } finally { soltarTrava(); }
}

// Vigia: nao faz passo nenhum enquanto o executor vive. Se ele morrer no meio, reverte.
async function vigiar(id, executorPid) {
  const limite = Date.now() + 30 * 60 * 1000;
  if (INJETAR === 'matar-executor-e-vigia') setTimeout(() => process.kill(process.pid), 1500);
  while (Date.now() < limite) {
    await dormir(1000);
    const e = estado();
    const minha = e.execucao === id || (e.pendente && e.pendente.id === id);
    if (!minha) return; // outra execucao assumiu: nada a vigiar
    if (e.execucao === id && TERMINAIS.includes(e.fase)) return;
    if (vivo(executorPid)) continue;
    await dormir(1500); // o executor pode ter acabado de gravar o estado final
    const e2 = estado();
    if (e2.execucao === id && TERMINAIS.includes(e2.fase)) return;
    if (!['EXECUTANDO', 'REVERTENDO'].includes(e2.fase) || e2.execucao !== id) {
      // morreu antes de tocar em qualquer coisa: so limpa o pedido.
      diario('EXECUTOR_MORREU_ANTES_DE_COMECAR', { executorPid });
      mudar({ pendente: null }); try { if (donoDaTrava() === executorPid) fs.unlinkSync(F.trava); } catch {}
      return;
    }
    if (donoDaTrava() === executorPid) fs.writeFileSync(F.trava, String(process.pid));
    else pegarTrava();
    diario('EXECUTOR_INTERROMPIDO', { executorPid, fase: e2.fase, vigia: process.pid });
    try { await reverter(`executor interrompido (pid ${executorPid}) em ${e2.fase}`, e2.inicio); }
    catch (falha) { diario('REVERSAO_FALHOU', { motivo: ocultar(falha.message) }); mudar({ fase: 'REVERSAO_FALHOU', motivo: ocultar(falha.message) }); process.exitCode = 1; }
    finally { soltarTrava(); }
    return;
  }
  diario('VIGIA_TEMPO_ESGOTADO', { executorPid });
}

(async () => {
  let r;
  if (cmd === 'plano') r = await plano();
  else if (cmd === 'segredos') r = segredos();
  else if (cmd === 'ativar') { const p = await plano(); if (!p.pronto) { console.log(JSON.stringify({ comando: 'ativar', recusado: true, falhas: p.falhas }, null, 2)); process.exitCode = 2; return; } r = despachar('ativar', opt('--autorizacao')); }
  else if (cmd === 'reverter') { if (estado().fase !== 'ATIVO') throw Error(`reverter so a partir de ATIVO (estado ${estado().fase})`); r = despachar('reverter', opt('--autorizacao')); }
  else if (cmd === 'recuperar') {
    const e = estado();
    if (!['EXECUTANDO', 'REVERTENDO', 'REVERSAO_FALHOU'].includes(e.fase)) throw Error(`recuperar so com execucao interrompida ou reversao falha (estado ${e.fase})`);
    if (vivo(donoDaTrava())) throw Error(`a execucao ainda esta viva (pid ${donoDaTrava()}); nao ha o que recuperar`);
    try { fs.unlinkSync(F.trava); } catch {}
    r = despachar('recuperar', opt('--autorizacao'));
  }
  else if (cmd === 'estado') { const e = estado(); r = { estado: e, travaDe: donoDaTrava() || null, travaViva: vivo(donoDaTrava()), ultimasLinhas: fs.existsSync(F.journal) ? fs.readFileSync(F.journal, 'utf8').trim().split('\n').slice(-12).map((l) => JSON.parse(l)) : [] }; }
  else if (cmd === 'executar') { await executar(opt('--execucao')); return; }
  else if (cmd === 'vigiar') { await vigiar(opt('--execucao'), Number(opt('--executor'))); return; }
  else throw Error('comando: plano | segredos | ativar | reverter | recuperar | estado');
  console.log(JSON.stringify(r, null, 2));
})().catch((e) => { console.error('ATIVACAO_RECUSADA:', ocultar(e.message)); process.exitCode = 1; });
