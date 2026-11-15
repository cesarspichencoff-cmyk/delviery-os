/** Opt-in shadow projection; never falls back to old data when configured V3 is broken. */
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import type { PedidoReal, PedidosReaisDoReader } from './pedidos-reais-do-reader';
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function lerPedidosReaderV3(root: string, agora = new Date()): PedidosReaisDoReader {
  const start = Date.now();
  try {
    if (!isAbsolute(root) || lstatSync(root).isSymbolicLink() || realpathSync(root) !== resolve(root)) throw Error();
    const file = join(root, 'consumer.json'), st = lstatSync(file);
    if (!st.isFile() || st.isSymbolicLink() || st.size > 32 * 1024 * 1024) throw Error();
    const raw = readFileSync(file, 'utf8'), envelope = JSON.parse(raw);
    const statusFile = join(root, 'source-status.json'), statusStat = lstatSync(statusFile);
    if (!statusStat.isFile() || statusStat.isSymbolicLink() || statusStat.size > 1048576) throw Error();
    const statusEnvelope = JSON.parse(readFileSync(statusFile,'utf8'));
    if (statusEnvelope.digest !== hash(statusEnvelope.data)) throw Error();
    const status = statusEnvelope.data;
    const age = agora.getTime() - Date.parse(status.at);
    if (!Number.isFinite(age) || age > 30000 || age < -5000 || status.schema !== 1 || status.seq !== envelope.data.seq || status.producerSeq < status.seq) throw Error();
    if (!envelope || envelope.digest !== hash(envelope.data)) throw Error();
    const s = envelope.data;
    if (s.schema !== 1 || !Number.isSafeInteger(s.seq) || s.seq < 0 || !s.latest || Array.isArray(s.latest)) throw Error();
    const orders: PedidoReal[] = [];
    for (const [key, value] of Object.entries(s.latest)) {
      const p = value as PedidoReal;
      if (!p || p.chave !== key || !key.startsWith('0001|01|') || !['DLV_IFO','DLV_NMO'].includes(p.origem) || !Array.isArray(p.itens) ||
          !p.reader_v3 || p.reader_v3.independent_ifood_completeness !== 'NOT_CONFIRMED' ||
          p.reader_v3.sql_snapshot_atomicity_proven !== false || p.reader_v3.source_writer_finished_proven !== false ||
          !/^[a-f0-9]{64}$/.test(p.revisao) || !Number.isFinite(Date.parse(p.observado_em))) throw Error();
      if (Date.parse(p.aberto_em_local + '-03:00') >= agora.getTime() - 48 * 3600000) orders.push(status.holds?.[key] ? {...p,retido:true,motivos_de_retencao:[...p.motivos_de_retencao,"READER_V3_REVISION_HELD"]} : status.failures > 0 || status.producerSeq > status.seq ? {...p,retido:true,motivos_de_retencao:[...p.motivos_de_retencao,"READER_V3_SOURCE_DEGRADED"]} : p);
    }
    orders.sort((a,b) => b.aberto_em_local.localeCompare(a.aberto_em_local));
    return {estado:'lido', lido_em: agora.toISOString(), politica:{valida: orders.every(p=>p.turno!=='SEM_POLITICA'),versao:orders[0]?.reader_v3?.politica??null},
      pedidos:orders,fora_do_escopo:0,invalidos:0,bytes_lidos:Buffer.byteLength(raw),duracao_ms:Date.now()-start};
  } catch { return {estado:'indisponivel',motivo:'reader_v3_integridade_ou_checkpoint'}; }
}
