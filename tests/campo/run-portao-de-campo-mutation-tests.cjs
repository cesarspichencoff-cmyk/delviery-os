'use strict';
/**
 * Mutações do portão de campo e da restrição de papel no piloto (D101). A prova
 * sobe os binários de dist/, então cada mutação recompila antes de medir e a
 * restauração recompila depois. Mutação que passa verde é teste cego.
 */
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const GATE = 'src/platform/campo/portao-de-campo.ts';
const PILOT = 'tools/entregas_pilot_server.ts';
const SUITE = ['npx', ['tsx', 'src/platform/run-portao-de-campo-tests.ts']];
const BUILD = ['npx', ['tsc']];

const SOMENTE = (process.env.CAMPO_MUT || "").split(",").filter(Boolean);
const MUTATIONS = [
  ['C1 rota fora da lista passa', [[GATE, '  }\n  return null;\n}', '  }\n  return { metodos: [metodo], caminho: alvo, destino: "piloto", tetoBytes: 4096, query: true };\n}']]],
  ['C2 método não é conferido', [[GATE, 'if (!casa || !r.metodos.includes(metodo)) continue;', 'if (!casa) continue;']]],
  ['C3 truque de caminho atravessa', [[GATE, 'if (decodificado !== caminho || caminho.includes("/../")', 'if (false && caminho.includes("/../")']]],
  ['C4 cookie do cliente segue', [[GATE, 'const DO_CLIENTE = ["authorization",', 'const DO_CLIENTE = ["cookie", "authorization",']]],
  ['C5 cliente apaga a marca do campo', [[GATE, '    if (rota.destino === "piloto") headers[MARCA_DE_CAMPO] = "1";\n', '    if (rota.destino === "piloto" && req.headers[MARCA_DE_CAMPO] !== "0") headers[MARCA_DE_CAMPO] = "1";\n']]],
  ['C6 teto de corpo declarado ignorado', [[GATE, 'if (Number.isFinite(declarado) && declarado > rota.tetoBytes && rota.tetoBytes > 0) return negar(res, 413, "corpo_grande_demais");', '']]],
  ['C7 Set-Cookie da origem volta ao celular', [[GATE, 'const NAO_VOLTAM = ["set-cookie", ', 'const NAO_VOLTAM = [']]],
  ['C8 escuta em todas as interfaces aceita', [[GATE, 'if (escuta.host === "0.0.0.0" ||', 'if (false && escuta.host === "0.0.0.0" ||']]],
  ['C9 GET com corpo passa', [[GATE, 'if (rota.tetoBytes === 0 && (req.headers["transfer-encoding"] || (Number.isFinite(declarado) && declarado > 0)))', 'if (false)']]],
  ['P1 piloto aceita gerente no campo', [[PILOT, 'if (doCampo && actor && actor.role !== "motoboy_interno") {', 'if (false) {']]],
  ['P2 login de gerente no campo', [[PILOT, 'if (doCampo && requestActor(tentativa)?.role !== "motoboy_interno") {', 'if (false) {']]],
];

const anotar = (m) => { if (process.env.GITHUB_ACTIONS === 'true') console.log('::error title=mutações do portão::' + String(m).slice(0, 900).replace(/%/g, '%25')); };
let ultimaSaida = '';
function run([command, args]) {
  const r = spawnSync(command, args, {cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32', timeout: 600000});
  ultimaSaida = String(r.stdout || '') + String(r.stderr || '');
  return r.status === 0;
}
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const write = (f, text) => fs.writeFileSync(path.join(ROOT, f), text);

if (!run(BUILD) || !run(SUITE)) { console.error('CONTROLE POSITIVO FALHOU: a prova do portão não está verde sem mutação'); anotar('controle positivo falhou: ' + ultimaSaida.split(/\r?\n/).filter((l) => /FAIL|Error|Assert|PASS/.test(l)).slice(-6).join(' | ')); process.exit(1); }
console.log('CONTROLE portão verde sem mutação');
const blind = [];
let killed = 0;
for (const [label, edits] of MUTATIONS.filter(([l]) => !SOMENTE.length || SOMENTE.includes(l.split(' ')[0]))) {
  const originals = new Map();
  try {
    for (const [file, search, replacement] of edits) {
      if (!originals.has(file)) originals.set(file, read(file));
      const current = read(file);
      const eol = current.includes('\r\n') ? '\r\n' : '\n';
      const needle = search.split('\n').join(eol), swap = replacement.split('\n').join(eol);
      const hits = current.split(needle).length - 1;
      if (hits !== 1) throw new Error('MUTAÇÃO NÃO APLICÁVEL (' + hits + '): ' + label);
      write(file, current.replace(needle, () => swap));
    }
    if (!run(BUILD)) { killed += 1; console.log('MORTA ' + label + ' (não compila)'); continue; }
    if (run(SUITE)) { blind.push(label); console.log('CEGA  ' + label); anotar('mutação cega: ' + label); } else { killed += 1; console.log('MORTA ' + label); }
  } catch (e) { console.error(String(e.message || e)); anotar(String(e.message || e)); process.exitCode = 1; }
  finally {
    for (const [file, original] of originals) write(file, original);
    for (const [file, original] of originals) if (read(file) !== original) { console.error('ORIGINAL NÃO RESTAURADO: ' + file); process.exit(2); }
  }
}
if (!run(BUILD)) { console.error('BUILD DE RESTAURAÇÃO FALHOU'); process.exit(2); }
console.log('PORTAO_DE_CAMPO_MUTATIONS ' + killed + '/' + MUTATIONS.length + ' mortas, ' + blind.length + ' cegas');
process.exit(blind.length === 0 && !process.exitCode ? 0 : 1);
