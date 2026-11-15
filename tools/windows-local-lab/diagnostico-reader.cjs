'use strict';
/*
 * Diagnostico SOMENTE LEITURA do Reader instalado no caixa (C:\ProgramData\TataComandaReader).
 * Le eventos e decisoes JA gravados pelo proprio Reader; nao toca SQL, servico, processo nem arquivo.
 * Imprime so CONTAGENS, nomes de campo do esquema e CODIGOS (texto que casa ^[A-Z][A-Z0-9_]{2,80}$);
 * qualquer outro texto vira OUTRO. Nenhum identificador de pedido, nome, item, observacao ou valor sai.
 *
 *   node diagnostico-reader.cjs [--raiz <pasta>]   (a raiz alternativa so para bancada)
 */
const fs = require('node:fs');
const path = require('node:path');
const i = process.argv.indexOf('--raiz');
const RAIZ = i > 0 ? process.argv[i + 1] : 'C:\\ProgramData\\TataComandaReader';
const EV = path.join(RAIZ, 'state', 'reader-events-v1');
const DE = path.join(RAIZ, 'state', 'reader-shadow-decisions-v1');
const CODIGO = /^[A-Z][A-Z0-9_]{2,80}$/;
const cod = (c) => (typeof c === 'string' && CODIGO.test(c) ? c : 'OUTRO');
const conta = (m, k) => { m[k] = (m[k] || 0) + 1; };
const ler = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const chaves = (o, prefixo, saida, prof) => {
  if (!o || typeof o !== 'object' || prof > 3) return;
  for (const [k, v] of Object.entries(o)) {
    const kp = prefixo ? prefixo + '.' + k : k;
    const tipo = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
    conta(saida, kp + ':' + tipo);
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') chaves(v[0], kp + '[]', saida, prof + 1);
    else if (tipo === 'object') chaves(v, kp, saida, prof + 1);
  }
};
const t0 = Date.now();
const evs = fs.existsSync(EV) ? fs.readdirSync(EV).filter((f) => f.toLowerCase().endsWith('.json')) : [];
const dec = fs.existsSync(DE) ? new Set(fs.readdirSync(DE)) : new Set();
const r = {
  em: new Date().toISOString(), raiz: RAIZ, eventos: evs.length, decisoes: dec.size,
  leitura_de_diretorio_ms: Date.now() - t0,
  eventos_sem_decisao: 0, pronto_para_jusante: { sim: 0, nao: 0, ausente: 0 },
  bloqueios_do_evento: {}, bloqueios_do_servico: {}, decisao: { ready: 0, blocked: 0 }, motivos_da_decisao: {},
  esquemas: {}, por_dia: {}, campos_do_evento: {}, campos_da_decisao: {}, ilegiveis: 0, _pedidos: {},
};
let amostraEv = 0, amostraDe = 0;
for (const f of evs) {
  let e;
  try { e = ler(path.join(EV, f)); } catch { r.ilegiveis++; continue; }
  conta(r.esquemas, cod(String(e.schema || '').toUpperCase().replace(/[.@-]/g, '_')) === 'OUTRO' ? String(e.schema).slice(0, 60) : e.schema);
  if (e.ready_for_downstream_shadow === true) r.pronto_para_jusante.sim++; else if (e.ready_for_downstream_shadow === false) r.pronto_para_jusante.nao++; else r.pronto_para_jusante.ausente++;
  for (const b of Array.isArray(e.blockers) ? e.blockers : []) conta(r.bloqueios_do_evento, cod(typeof b === 'string' ? b : b && b.code));
  for (const b of Array.isArray(e.service_resolution && e.service_resolution.blockers) ? e.service_resolution.blockers : []) conta(r.bloqueios_do_servico, cod(typeof b === 'string' ? b : b && b.code));
  const quando = e.observed_at || e.captured_at || (e.order && (e.order.DTHRABERTURA || e.order.DTABERTURA)) || null;
  const dia = typeof quando === 'string' && /^\d{4}-\d{2}-\d{2}/.test(quando) ? quando.slice(0, 10) : 'sem_data';
  conta(r.por_dia, dia);
  // Pedidos DISTINTOS por dia de abertura (delivery do Itaim), e quantas revisoes cada um teve.
  const o = e.order || {};
  if (o.CDFILIAL === '0001' && o.CDLOJA === '01' && /^DLV_/.test(String(o.IDORGCMDVENDA || '')) && typeof o.DTHRABERMESA === 'string') {
    const d = o.DTHRABERMESA.slice(0, 10);
    (r._pedidos[d] = r._pedidos[d] || new Map()).set(e.order_key, ((r._pedidos[d].get(e.order_key)) || 0) + 1);
  }
  if (amostraEv < 400) { chaves(e, '', r.campos_do_evento, 0); amostraEv++; }
  const d = f.replace(/\.json$/i, '.decision.json');
  if (!dec.has(d)) { r.eventos_sem_decisao++; continue; }
  let x; try { x = ler(path.join(DE, d)); } catch { r.ilegiveis++; continue; }
  if (x.ready) r.decisao.ready++; else r.decisao.blocked++;
  for (const m of [].concat(x.blockers || [], x.reasons || [], x.block_reasons || [], x.reason || [])) conta(r.motivos_da_decisao, cod(typeof m === 'string' ? m : m && (m.code || m.reason)));
  if (amostraDe < 400) { chaves(x, '', r.campos_da_decisao, 0); amostraDe++; }
}
r.duracao_ms = Date.now() - t0;
r.pedidos_distintos_por_dia = Object.fromEntries(Object.keys(r._pedidos).sort().slice(-14).map((d) => {
  const revs = [...r._pedidos[d].values()];
  return [d, { pedidos: revs.length, revisoes: revs.reduce((s, x) => s + x, 0), max_revisoes_de_um_pedido: Math.max(...revs) }];
}));
delete r._pedidos;
const dias = Object.keys(r.por_dia).sort();
r.por_dia = Object.fromEntries(dias.slice(-20).map((d) => [d, r.por_dia[d]]));
r.dias_com_evento = dias.length;
console.log(JSON.stringify(r, null, 1));
