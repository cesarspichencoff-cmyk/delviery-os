'use strict';
/**
 * MUTACOES do elo demanda observada. Cada uma REMOVE uma garantia e exige que a
 * suite correspondente fique vermelha. Mutacao que sobrevive e teste cego.
 *
 * O arquivo e alterado em disco, a suite roda, e o original volta num `finally`.
 * Antes de tudo, os controles positivos: as duas suites precisam estar verdes
 * SEM mutacao — senao um vermelho nao provaria nada.
 */
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const RUNNER = 'runtime/reporting/gestor_mounted_demand_feed_v1.cjs';
const READER = 'src/platform/leitura/demanda-do-gestor.ts';
const PRODUCER = 'src/product/eventos/demanda-gestor.ts';
const HOME_VM = 'src/product/viewmodels/home-vm.ts';
const RECON = 'src/product/eventos/conciliacao-reader.ts';
const NATIVE = 'src/platform/leitura/pedidos-do-reader.ts';
const UNIT = ['node', ['tests/gestor-shadow/run-mounted-demand-feed-tests.cjs']];
const CHAIN = ['npx', ['tsx', 'tests/gestor-shadow/run-demand-feed-home-chain-tests.ts']];
const CROSS = ['npx', ['tsx', 'tests/gestor-shadow/run-reader-reconciliation-tests.ts']];

const MUTATIONS = [
  ['R1 laboratorio carimbado como real', RUNNER, "const sourceMode = mode === 'FIELD' ? 'real' : 'simulated';", "const sourceMode = 'real';", UNIT],
  ['R2 executor deixa de conferir o host do documento', RUNNER, "if (page.hostname !== expectedHostname) hold = 'PAGE_HOSTNAME_NOT_EXPECTED';", "if (false) hold = 'PAGE_HOSTNAME_NOT_EXPECTED';", UNIT],
  ['R3 qualquer aba serve, nao so a de expedicao', RUNNER, "t.type === 'page' && t.url === expectedUrl", "t.type === 'page' && typeof t.url === 'string'", UNIT],
  ['R4 endpoint DevTools fora do loopback e aceito', RUNNER, "'^ws://127\\\\.0\\\\.0\\\\.1:' + port", "'^ws://[0-9.]+:[0-9]+' + ''", UNIT],
  ['R5 sair da tela vira cancelamento', RUNNER, "lines.push({k: 'left_view', t: iso, ref});", "lines.push({k: 'cancelled', t: iso, ref});", UNIT],
  ['R6 janela velha reapresentada como recem-lida durante o HOLD', RUNNER, "window: lastWindow,", "window: lastWindow === null || hold === null ? lastWindow : {...lastWindow, observed_at: iso},", UNIT],
  ['R7 troca de loja continua em silencio', RUNNER, "if (merchantRef !== null && merchantRef !== ref) hold", "if (false) hold", UNIT],
  ['R8 reinicio esquece o que ja foi visto', RUNNER, "if (isObject(previous) && previous.schema === SCHEMA && previous.source_mode === sourceMode) {", "if (false) {", UNIT],
  ['R9 expressao nao copia os candidatos privados', RUNNER, "'o.privateCandidates=r.privateCandidates||null;' +", "", UNIT],
  ['R10 segundo metodo de protocolo enviado a pagina', RUNNER, "includeCommandLineAPI: false, timeout: 4000}}));", "includeCommandLineAPI: false, timeout: 4000}}));\n        socket.send(JSON.stringify({id: 2, method: 'Page.reload'}));", UNIT],
  ['R11 HOLD deixa de contar falhas consecutivas', RUNNER, "consecutiveFailures += 1;", "consecutiveFailures += 0;", UNIT],
  ['L1 contrato do executor nao e conferido', READER, 'bruto["physical_state_claimed"] !== false ||', '', CHAIN],
  ['L2 feed parado continua valendo', READER, 'if (idade > LIMITE_FEED_PARADO_MS) return', 'if (false) return', CHAIN],
  ['L3 agregados nao precisam fechar', READER, 'if (linhas !== bruto["lines"] || unidades !== bruto["units"]) return null;', '', CHAIN],
  ['L4 janela retida nunca envelhece', READER, 'if (idadeDaJanela > LIMITE_JANELA_MS)', 'if (false)', CHAIN],
  ['L5 modo desconhecido atravessa', READER, 'if (modo !== "real" && modo !== "simulated") return invalido;', '', CHAIN],
  ['L6 relogio adiantado e aceito', READER, 'if (idade < -TOLERANCIA_DE_RELOGIO_MS) return', 'if (false) return', CHAIN],
  ['L7 numero curto repetido e aceito', READER, '!/^\\d{4}$/.test(codigo) || codigos.has(codigo) ||', '!/^\\d{4}$/.test(codigo) ||', CHAIN],
  ['P1 fato de laboratorio sem prefixo fixture', PRODUCER, 'const prefixo = d.modo === "real" ? "" : "fixture:";', 'const prefixo = "";', CHAIN],
  ['P2 cancelamento alegado vira demanda', PRODUCER, 'if (p.alegacao_do_provedor !== null && /cancel/i.test(p.alegacao_do_provedor)) {', 'if (false) {', CHAIN],
  ['P3 cartoes montados declarados cobertura completa', PRODUCER, 'completa: false,', 'completa: true,', CHAIN],
  ['P4 praca inventada para o item', PRODUCER, 'nome: i.nome, praca: null, qtd: i.quantidade', 'nome: i.nome, praca: "combinados", qtd: i.quantidade', CHAIN],
  ['P5 estado fisico afirmado a partir da tela', PRODUCER, 'estado: "aceito", source_revision: p.revisao_no', 'estado: "pronto", source_revision: p.revisao_no', CHAIN],
  ['P6 revisao sai da chave idempotente', PRODUCER, 'source_event_id: `${p.ref}:${p.revisao}`,', 'source_event_id: `${p.ref}`,', CHAIN],
  ['V1 leitura parcial sustenta a contagem da casa', HOME_VM, 'const pulsoSustentado = leituraParcialDePedidos\n    ? false', 'const pulsoSustentado = leituraParcialDePedidos\n    ? true', CHAIN],
  ['V2 fonte parcial sem carimbo vira leitura parcial', HOME_VM, '(l.linhagem?.transformacoes ?? []).includes(TRANSFORMACAO_DEMANDA_OBSERVADA);', 'true;', CHAIN],
  ['C1 quantidades diferentes viram conciliado', RECON, 'const iguais = casado.itemLines === linhas && casado.itemUnits === unidades &&', 'const iguais = true ||', CROSS],
  ['C2 revisao retida pelo Reader sustenta conciliacao', RECON, 'return !n.retido_pelo_produtor && CHAVE.test(n.chave)', 'return CHAVE.test(n.chave)', CROSS],
  ['C3 pedidos de outro dia entram no cruzamento', RECON, 'const doDia = reader.pedidos.filter((n) => n.dia === dia);', 'const doDia = reader.pedidos;', CROSS],
  ['C4 recusa do reconciliador e ignorada', RECON, 'if (r.status !== "CANDIDATES_SHADOW_ONLY" && r.status !== "SIMULATION_ONLY")', 'if (false)', CROSS],
  ['C5 laboratorio cruza como janela viva', RECON, 'source: "GESTOR_WEB", mode: modo === "real" ? "LIVE_SHADOW" : "SIMULATED"', 'source: "GESTOR_WEB", mode: "LIVE_SHADOW"', CROSS],
  ['C6 divergencia nao e dita a quem opera', PRODUCER, '(c.resultado === "divergente" || c.resultado === "ambiguo") ? c.detalhe : null', '(c.resultado === "ambiguo") ? c.detalhe : null', CROSS],
  ['N1 evento de outro pedido aceito pelo leitor do Reader', NATIVE, '[o["CDFILIAL"], o["CDLOJA"], o["NRVENDAREST"], o["NRCOMANDA"]].some((v, i) => v !== partes[i])', 'false', CROSS],
  ['N2 checkpoint com chave repetida aceito', NATIVE, 'e["emitted_hash"] !== hash ||\n        vistas.has(e["order_key"]))', 'e["emitted_hash"] !== hash)', CROSS],
  ['N3 quantidade fracionada vira inteira', NATIVE, 'quantidade: inteiro ? Number(q) : null', 'quantidade: Math.max(1, Math.round(Number(q)))', CROSS],
];

function run([command, args]) {
  const r = spawnSync(command, args, {cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32', timeout: 180000});
  return r.status === 0;
}
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const write = (f, text) => fs.writeFileSync(path.join(ROOT, f), text);

for (const [label, suite] of [['executor', UNIT], ['cadeia', CHAIN], ['cruzamento', CROSS]]) {
  if (!run(suite)) { console.error('CONTROLE POSITIVO FALHOU: a suite ' + label + ' nao esta verde sem mutacao'); process.exit(1); }
  console.log('CONTROLE ' + label + ' verde sem mutacao');
}
const blind = [];
let killed = 0;
for (const [label, file, search, replacement, suite] of MUTATIONS) {
  const original = read(file);
  // Normaliza fim de linha so para LOCALIZAR; o arquivo volta byte a byte.
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
console.log('DELIVERYOS_GESTOR_DEMAND_MUTATIONS ' + killed + '/' + MUTATIONS.length + ' mortas, ' + blind.length + ' cegas');
process.exit(blind.length === 0 ? 0 : 1);
