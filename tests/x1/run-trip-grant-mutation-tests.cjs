'use strict';
/**
 * X1 — mutações da concessão de captura por viagem. Cada defeito vai para o
 * código de produção, a suíte roda, e o defeito tem de derrubá-la. Mutação que
 * passa verde é teste cego: a execução reprova.
 *
 * Duas camadas do piloto são redundantes de propósito (a decisão de domínio e a
 * conferência na emissão). Cada uma sozinha é coberta pela outra; a mutação P1
 * derruba as duas juntas para provar que o teste enxerga o efeito.
 */
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const GRANT = 'src/entregas/foundation/trip-capture-grant.ts';
const INGEST = 'src/platform/ingest/device-ingest.ts';
const ROTA = 'src/platform/runtime/rota-ingestao.ts';
const PILOT = 'tools/entregas_pilot_server.ts';
const UNIT = ['npx', ['tsx', 'src/platform/run-concessao-de-viagem-tests.ts']];
// O teste HTTP sobe o piloto COMPILADO: mutação no piloto só vale depois de recompilar.
const HTTP = ['npx', ['tsx', 'src/entregas/pilot/run-capture-control-http-tests.ts']];
const BUILD = ['npx', ['tsc']];
const DELEG = ['npx', ['tsx', 'src/entregas/pilot/run-trip-grants-delegated-http-tests.ts']];

const MUTATIONS = [
  ['T1 concessão de outro motoboy vale no aparelho', [[INGEST, '!dispositivo.actor_id || c.actor_id !== dispositivo.actor_id) continue;', '!dispositivo.actor_id) continue;']], UNIT],
  ['T2 concessão de outro aparelho vale', [[INGEST, 'c.unit_id !== dispositivo.unit_id || c.device_id !== dispositivo.device_id ||', 'c.unit_id !== dispositivo.unit_id ||']], UNIT],
  ['T3 concessão de outra unidade vale', [[INGEST, 'if (c.unit_id !== dispositivo.unit_id || c.device_id', 'if (c.device_id']], UNIT],
  ['T4 viagem sem concessão entra', [[INGEST, 'const daViagem = concessoes.get(bruto.trip_id);', 'const daViagem = concessoes.get(bruto.trip_id) ?? [{ window_start: 0, window_end: 9e9 } as never];']], UNIT],
  ['T5 assinatura não é conferida', [[GRANT, 'if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "assinatura_invalida" };', '']], UNIT],
  ['T6 propósito fora do MAC', [[GRANT, 'update(TRIP_CAPTURE_GRANT_PURPOSE + "\\n" + body)', 'update(body)']], UNIT],
  ['T7 concessão vencida vale', [[GRANT, 'if (k.exp <= nowS) return { ok: false, reason: "concessao_expirada" };', '']], UNIT],
  ['T8 janela ignorada', [[GRANT, '  return dentro(occurredAtMs) || dentro(receivedAtMs);', '  return true;']], UNIT],
  ['T9 relógio do servidor ignorado (política de relógio quebrada)', [[GRANT, '  return dentro(occurredAtMs) || dentro(receivedAtMs);', '  return dentro(occurredAtMs);']], UNIT],
  ['T10 chegada a qualquer hora vale (viagem encerrada aceita ponto novo)', [[GRANT, '  return dentro(occurredAtMs) || dentro(receivedAtMs);', '  return dentro(occurredAtMs) || Number.isFinite(receivedAtMs);']], UNIT],
  ['T11 sem segredo a ingestão abre', [[ROTA, '  if (deps.segredos_de_concessao.size === 0) {', '  if (false) {']], UNIT],
  ['T12 unidade sem segredo próprio usa o de outra', [[GRANT, 'const secret = typeof c.unit_id === "string" ? secretsByUnit.get(c.unit_id) : undefined;', 'const secret = [...secretsByUnit.values()][0];']], UNIT],
  ['P1 piloto concede a viagem de outro motoboy (domínio e emissão)', [
    [PILOT, 'trip_grant: decisaoTrip.reason === "trip_not_active" ? concessaoDeCaptura(identidade.identity, trip) : null,', 'trip_grant: concessaoDeCaptura(identidade.identity, trip),'],
    [PILOT, 'if (!TRIP_GRANT_SECRET || !trip || !identity.actor_id || trip.courier_actor_id !== identity.actor_id ||', 'if (!TRIP_GRANT_SECRET || !trip || !identity.actor_id ||'],
  ], HTTP],
  ['P2 piloto concede sem aceite do termo', [[PILOT, 'trip_grant: capturaLiberada ? concessaoDeCaptura(identidade.identity, trip) : null,', 'trip_grant: concessaoDeCaptura(identidade.identity, trip),']], HTTP],
  ['P3 viagem encerrada recebe janela aberta', [[PILOT, 'const fim = trip.closed_at ? new Date(trip.closed_at) : null;', 'const fim = null as Date | null;']], HTTP],
  ['P5 rota delegada concede a viagem de outro motoboy', [[PILOT, 'if (!TRIP_GRANT_SECRET || !trip || !identity.actor_id || trip.courier_actor_id !== identity.actor_id ||', 'if (!TRIP_GRANT_SECRET || !trip || !identity.actor_id ||']], DELEG],
  ['P6 rota delegada concede viagem sem saída da loja', [[PILOT, 'grants[tripId] = trip && trip.started_at ? concessaoDeCaptura(identidade, trip) : null;', 'grants[tripId] = trip ? concessaoDeCaptura(identidade, trip) : null;']], DELEG],
  ['P4 viagem encerrada fica sem concessão (fila offline presa)', [[PILOT, 'trip_grant: decisaoTrip.reason === "trip_not_active" ? concessaoDeCaptura(identidade.identity, trip) : null,', 'trip_grant: null,']], HTTP],
];

function run([command, args]) {
  const r = spawnSync(command, args, {cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32', timeout: 300000});
  return r.status === 0;
}
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const write = (f, text) => fs.writeFileSync(path.join(ROOT, f), text);

for (const [label, suite] of [['concessao', UNIT], ['piloto', HTTP], ['delegada', DELEG]]) {
  if (!run(suite)) { console.error('CONTROLE POSITIVO FALHOU: a suite ' + label + ' nao esta verde sem mutacao'); process.exit(1); }
  console.log('CONTROLE ' + label + ' verde sem mutacao');
}
const blind = [];
let killed = 0;
for (const [label, edits, suite] of MUTATIONS) {
  const originals = new Map();
  try {
    for (const [file, search, replacement] of edits) {
      const original = originals.get(file) ?? read(file);
      if (!originals.has(file)) originals.set(file, original);
      const current = read(file);
      const eol = current.includes('\r\n') ? '\r\n' : '\n';
      const needle = search.split('\n').join(eol), swap = replacement.split('\n').join(eol);
      const hits = current.split(needle).length - 1;
      if (hits !== 1) throw new Error('MUTACAO NAO APLICAVEL (' + hits + ' ocorrencias): ' + label + ' em ' + file);
      write(file, current.replace(needle, () => swap));
    }
    if ((suite === HTTP || suite === DELEG) && !run(BUILD)) throw new Error('build falhou com a mutacao ' + label);
    const green = run(suite);
    if (green) { blind.push(label); console.log('CEGA  ' + label); }
    else { killed += 1; console.log('MORTA ' + label); }
  } catch (e) {
    console.error(String(e.message || e)); process.exitCode = 1;
  } finally {
    for (const [file, original] of originals) write(file, original);
    for (const [file, original] of originals) if (read(file) !== original) { console.error('ORIGINAL NAO RESTAURADO: ' + file); process.exit(2); }
    if ((suite === HTTP || suite === DELEG) && !run(BUILD)) { console.error('BUILD DE RESTAURACAO FALHOU'); process.exit(2); }
  }
}
console.log('X1_TRIP_GRANT_MUTATIONS ' + killed + '/' + MUTATIONS.length + ' mortas, ' + blind.length + ' cegas');
process.exit(blind.length === 0 && !process.exitCode ? 0 : 1);
