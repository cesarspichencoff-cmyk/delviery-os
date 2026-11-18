'use strict';
/*
 * Sonda SOMENTE LEITURA da leitura de pedidos reais do Reader (Reader V3, camada 1) no caixa.
 * Roda o modulo compilado `pedidos-reais-do-reader.js` (mesma pasta) sobre a pasta real do Reader e
 * imprime SO AGREGADOS: contagens, codigos de retencao, turnos, completude, cobertura de nome, tempo.
 * Nenhum codigo de pedido, chave, nome de produto, item ou observacao sai.
 *   node sondar-pedidos-reais.cjs [--raiz <pasta>]
 */
const path = require('node:path');
const { lerPedidosReaisDoReader } = require(path.join(__dirname, 'pedidos-reais-do-reader.js'));
const i = process.argv.indexOf('--raiz');
const raiz = i > 0 ? process.argv[i + 1] : 'C:\\ProgramData\\TataComandaReader';
const conta = (m, k) => { m[k] = (m[k] || 0) + 1; };
const r = lerPedidosReaisDoReader(raiz);
if (r.estado !== 'lido') { console.log(JSON.stringify(r)); process.exit(0); }
const a = { estado: r.estado, politica: r.politica, pedidos: r.pedidos.length, fora_do_escopo: r.fora_do_escopo, invalidos: r.invalidos,
  bytes_lidos: r.bytes_lidos, duracao_ms: r.duracao_ms, retidos: 0, por_origem: {}, por_turno: {}, por_dia: {}, motivos: {},
  substituidos: {}, observacoes: {}, itens_total: 0, itens_com_nome: 0, itens_qtd_nao_inteira: 0, estados_nativos_pedido: {},
  pedidos_com_obs_do_pedido: 0, itens_com_obs: 0, sem_codigo_curto: 0, idade_da_revisao_mais_nova_s: null };
let maisNova = 0;
for (const p of r.pedidos) {
  if (p.retido) a.retidos++;
  conta(a.por_origem, p.origem); conta(a.por_turno, p.turno); conta(a.por_dia, p.dia); conta(a.estados_nativos_pedido, p.estado_nativo);
  for (const m of p.motivos_de_retencao) conta(a.motivos, m);
  for (const s of p.bloqueios_de_turno_substituidos) conta(a.substituidos, s);
  conta(a.observacoes, p.completude.observacoes);
  if (p.observacoes_do_pedido && p.observacoes_do_pedido.length) a.pedidos_com_obs_do_pedido++;
  if (p.codigo_curto === null) a.sem_codigo_curto++;
  maisNova = Math.max(maisNova, Date.parse(p.observado_em));
  for (const it of p.itens) {
    a.itens_total++; if (it.nome) a.itens_com_nome++; if (it.quantidade === null) a.itens_qtd_nao_inteira++;
    if (it.observacoes && it.observacoes.length) a.itens_com_obs++;
  }
}
a.idade_da_revisao_mais_nova_s = maisNova ? Math.round((Date.now() - maisNova) / 1000) : null;
console.log(JSON.stringify(a, null, 1));
