'use strict';
/**
 * Empacota a Home (servidor de leitura) e o executor do Gestor para o caixa.
 *
 *   npx tsc && node tools/empacotar_home_do_caixa.cjs <pasta-de-saida-vazia>
 *
 * NAO instala nada e nao toca no caixa: so monta uma pasta e a PROVA aqui.
 *
 * COMO O CONTEUDO E DECIDIDO. Nada de lista escrita a mao: o servidor compilado
 * sobe uma vez com um rastreador de `fs` e de modulos, todas as rotas sao
 * pedidas, e o pacote e exatamente o que ele abriu — mais as pastas de
 * arquivos estaticos, que so sao lidas quando o navegador pede cada arquivo.
 *
 * COMO SE SABE QUE ESTA COMPLETO. O pacote e iniciado de novo A PARTIR DA PASTA
 * DE SAIDA, com outro diretorio de trabalho, e as rotas precisam responder. Se
 * faltar um arquivo, isto falha aqui e nao no caixa.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {createHash} = require('node:crypto');
const {spawn, execFileSync} = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : null;
const SERVER = 'dist/tools/product_system_server.js';
const STATIC_DIRS = ['src/product/ui', 'src/entregas/ui/shared'];
// O executor do sensor e o que ele carrega; a tarefa do caixa aponta para o primeiro.
const OBSERVER_FILES = ['runtime/reporting/gestor_mounted_demand_feed_v1.cjs',
  'runtime/reporting/gestor_mounted_window_differential_v1.cjs', 'runtime/reporting/gestor_v3_visible_sensor.js'];
const TASKS = ['docs/operations/DeliveryOS-Itaim-Gestor-Demand-Feed.xml'];
const ROUTES = ['/api/health', '/', '/app.js', '/tokens/product-tokens.css', '/tokens/organismo-tokens.css',
  '/surfaces/home.js', '/surfaces/home.css', '/api/home', '/api/home?cena=foco', '/api/fontes', '/api/navegacao',
  '/api/estados', '/api/entregas', '/api/operacao-viva', '/api/conference-brain', '/api/copiloto', '/api/historico'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// Rastreador: registra, de forma sincrona, todo caminho DENTRO da raiz que o
// processo abre, testa ou carrega como modulo. Sincrono porque o servidor e
// encerrado sem aviso e nenhum `exit` chegaria a rodar.
const TRACER = `'use strict';
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=process.env.PACK_ROOT,out=process.env.PACK_TRACE,seen=new Set();
const note=p=>{try{if(typeof p!=='string')return;const a=path.resolve(p);
 if(!a.toLowerCase().startsWith(root.toLowerCase()+path.sep)||seen.has(a))return;seen.add(a);
 fs.appendFileSync(out,a+'\\n');}catch{}};
for(const k of ['readFileSync','openSync','statSync','lstatSync','existsSync','readdirSync','createReadStream']){
 const orig=fs[k];fs[k]=function(p,...r){note(p);return orig.call(this,p,...r);};}
const load=Module._load;Module._load=function(request,parent,...r){
 try{note(Module._resolveFilename(request,parent));}catch{}return load.call(this,request,parent,...r);};`;

function get(port, route) {
  return new Promise(resolve => {
    http.get({host: '127.0.0.1', port, path: route, timeout: 8000}, res => {
      res.resume(); res.on('end', () => resolve(res.statusCode));
    }).on('error', () => resolve(0)).on('timeout', function () { this.destroy(); resolve(0); });
  });
}
async function serve(cwd, entry, extraArgs, env, port) {
  const child = spawn(process.execPath, [...extraArgs, entry], {cwd, stdio: 'ignore', windowsHide: true,
    env: {...process.env, PRODUCT_UI_PORT: String(port), DELIVERYOS_DATABASE_URL: '', CONFERENCE_BRAIN_DATA_DIR: '',
      TATA_READER_INSTALL_ROOT: '', DELIVERYOS_GESTOR_DEMAND_DIR: '', ...env}});
  for (let i = 0; i < 120; i++) { if (await get(port, '/api/health') === 200) return child; await sleep(250); }
  child.kill();
  throw new Error('servidor nao respondeu em ' + cwd);
}
const stop = child => new Promise(resolve => { child.once('exit', resolve); child.kill(); setTimeout(resolve, 3000); });
function walk(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : e.isFile() ? [full] : [];
  });
}

async function main() {
  if (!OUT) throw new Error('uso: node tools/empacotar_home_do_caixa.cjs <pasta-de-saida-vazia>');
  if (fs.existsSync(OUT) && fs.readdirSync(OUT).length > 0) throw new Error('a pasta de saida precisa estar vazia: ' + OUT);
  if (!fs.existsSync(path.join(ROOT, SERVER))) throw new Error('dist/ ausente: rode `npx tsc` antes');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'home-pack-'));
  const trace = path.join(tmp, 'trace.txt'), tracer = path.join(tmp, 'tracer.cjs');
  fs.writeFileSync(tracer, TRACER); fs.writeFileSync(trace, '');

  // 1. Subir uma vez, rastreado, e pedir todas as rotas.
  const traced = await serve(ROOT, SERVER, ['--require', tracer], {PACK_ROOT: ROOT, PACK_TRACE: trace}, 5390);
  const first = {};
  for (const r of ROUTES) first[r] = await get(5390, r);
  await stop(traced);
  const bad = Object.entries(first).filter(([, code]) => code !== 200);
  if (bad.length) throw new Error('rota sem 200 no repositorio: ' + JSON.stringify(bad));

  // 2. O conteudo: o que foi aberto + os estaticos + o executor + a tarefa.
  const files = new Set();
  for (const abs of fs.readFileSync(trace, 'utf8').split('\n').filter(Boolean)) {
    try { if (fs.statSync(abs).isFile()) files.add(path.relative(ROOT, abs)); } catch { /* caminho testado e inexistente */ }
  }
  for (const d of STATIC_DIRS) for (const f of walk(path.join(ROOT, d))) files.add(path.relative(ROOT, f));
  for (const f of [...OBSERVER_FILES, ...TASKS]) files.add(path.normalize(f));
  const list = [...files].filter(f => !f.startsWith('..') && !/(^|[\\/])\.git([\\/]|$)/.test(f)).sort();

  // 3. Copiar para <saida>/home, preservando os caminhos relativos.
  const home = path.join(OUT, 'home');
  for (const rel of list) {
    const to = path.join(home, rel);
    fs.mkdirSync(path.dirname(to), {recursive: true});
    fs.copyFileSync(path.join(ROOT, rel), to);
  }
  // O Agendador nao define variavel de ambiente: este lancador faz isso, e so isso.
  fs.writeFileSync(path.join(home, 'iniciar-home.cjs'), `'use strict';
// Inicia a Home do Delivery OS no caixa. Somente leitura, so em 127.0.0.1.
const path = require('node:path');
process.chdir(__dirname);
process.env.PRODUCT_UI_PORT = process.env.PRODUCT_UI_PORT || '5290';
process.env.TATA_READER_INSTALL_ROOT = process.env.TATA_READER_INSTALL_ROOT || 'C:\\\\ProgramData\\\\TataComandaReader';
process.env.DELIVERYOS_GESTOR_DEMAND_DIR = process.env.DELIVERYOS_GESTOR_DEMAND_DIR ||
  'C:\\\\ProgramData\\\\DeliveryOS-Itaim-Observer\\\\gestor-demand-v1';
const { criarServidor } = require(path.join(__dirname, 'dist', 'tools', 'product_system_server.js'));
criarServidor().then(s => s.listen(Number(process.env.PRODUCT_UI_PORT), '127.0.0.1'))
  .catch(() => { process.exitCode = 1; });
`);

  // 4. A prova: subir DE DENTRO do pacote, com outro diretorio de trabalho.
  const packed = await serve(home, 'iniciar-home.cjs', [], {PRODUCT_UI_PORT: '5391',
    TATA_READER_INSTALL_ROOT: path.join(tmp, 'sem-reader'), DELIVERYOS_GESTOR_DEMAND_DIR: path.join(tmp, 'sem-feed')}, 5391);
  const second = {};
  for (const r of ROUTES) second[r] = await get(5391, r);
  await stop(packed);
  const missing = Object.entries(second).filter(([, code]) => code !== 200);
  if (missing.length) throw new Error('rota sem 200 DENTRO DO PACOTE: ' + JSON.stringify(missing));

  // 5. Manifesto: o que e, de qual commit, e o hash de cada arquivo.
  let commit = 'desconhecido', dirty = true;
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: ROOT, encoding: 'utf8'}).trim();
    dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {cwd: ROOT, encoding: 'utf8'}).trim() !== '';
  } catch { /* fora de um repositorio */ }
  const all = walk(home).map(f => path.relative(home, f)).sort();
  const bytes = all.reduce((n, f) => n + fs.statSync(path.join(home, f)).size, 0);
  fs.writeFileSync(path.join(OUT, 'MANIFESTO.json'), JSON.stringify({
    schema: 'deliveryos.home-do-caixa.manifesto.v1', commit, arvore_com_alteracoes_locais: dirty,
    node_usado_na_prova: process.version, arquivos: all.length, bytes,
    rotas_provadas_dentro_do_pacote: ROUTES.length,
    observador: OBSERVER_FILES.map(f => ({arquivo: f.split('/').join(path.sep), sha256: sha(path.join(home, f))})),
    sha256: Object.fromEntries(all.map(f => [f, sha(path.join(home, f))])),
  }, null, 1));
  fs.rmSync(tmp, {recursive: true, force: true});
  console.log('PACOTE_DA_HOME_PROVADO arquivos=' + all.length + ' bytes=' + bytes + ' rotas=' + ROUTES.length +
    ' commit=' + commit.slice(0, 8) + (dirty ? ' (ARVORE COM ALTERACOES LOCAIS)' : ''));
}
main().catch(e => { console.error('FALHOU ' + (e && e.message || e)); process.exit(1); });
