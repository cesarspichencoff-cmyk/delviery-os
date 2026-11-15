/**
 * LEVELDB SOMENTE LEITURA — sem dependencia, para ler o que um aplicativo Chromium/Electron ja gravou
 * (Local Storage) SEM abrir o banco: nunca toma o LOCK, nunca escreve, nunca compacta. Le as tabelas
 * `.ldb` (blocos crus ou Snappy) e o diario `.log`, e devolve o estado mais recente de cada chave pela
 * maior sequencia, com remocao (tipo 0) respeitada.
 *
 * Quem chama decide QUAIS chaves decodificar: este modulo entrega bytes, nunca interpreta valores.
 * Arquivo que some no meio (compactacao do dono) vira erro declarado desta leitura, nunca valor parcial.
 */
import { closeSync, fstatSync, openSync, readSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const TETO_DE_ARQUIVO_LEVELDB = 64 * 1024 * 1024;

export interface Registro { readonly chave: Buffer; readonly seq: number; readonly tipo: number; readonly valor: Buffer | null }

function lerArquivo(f: string): Buffer {
  const fd = openSync(f, "r");
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.size > TETO_DE_ARQUIVO_LEVELDB) throw new Error("arquivo_fora_do_teto");
    const b = Buffer.alloc(st.size);
    let lido = 0;
    while (lido < st.size) { const n = readSync(fd, b, lido, st.size - lido, lido); if (n <= 0) break; lido += n; }
    return lido === st.size ? b : b.subarray(0, lido);
  } finally { closeSync(fd); }
}

interface Pos { i: number }
function varint(b: Buffer, p: Pos): number {
  let r = 0, s = 0, x: number;
  do {
    if (p.i >= b.length || s > 49) throw new Error("varint_invalido");
    x = b[p.i++]!; r += (x & 0x7f) * 2 ** s; s += 7;
  } while (x & 0x80);
  return r;
}

/** Descompressor Snappy (formato de bloco), com limites: nunca le ou escreve fora do buffer. */
export function snappy(src: Buffer): Buffer {
  const p: Pos = { i: 0 };
  const n = varint(src, p);
  if (n > TETO_DE_ARQUIVO_LEVELDB) throw new Error("snappy_grande_demais");
  const out = Buffer.alloc(n); let o = 0;
  while (p.i < src.length) {
    const tag = src[p.i++]!; const t = tag & 3;
    if (t === 0) {
      let len = tag >> 2;
      if (len >= 60) { const k = len - 59; len = 0; for (let j = 0; j < k; j++) len |= src[p.i++]! << (8 * j); }
      len += 1;
      if (p.i + len > src.length || o + len > n) throw new Error("snappy_literal_invalido");
      src.copy(out, o, p.i, p.i + len); p.i += len; o += len;
    } else {
      let len: number, off: number;
      if (t === 1) { len = 4 + ((tag >> 2) & 7); off = ((tag >> 5) << 8) | src[p.i++]!; }
      else if (t === 2) { len = (tag >> 2) + 1; off = src.readUInt16LE(p.i); p.i += 2; }
      else { len = (tag >> 2) + 1; off = src.readUInt32LE(p.i); p.i += 4; }
      if (off === 0 || off > o || o + len > n) throw new Error("snappy_copia_invalida");
      for (let j = 0; j < len; j++) { out[o] = out[o - off]!; o++; }
    }
  }
  if (o !== n) throw new Error("snappy_tamanho_divergente");
  return out;
}

function lerBloco(b: Buffer, off: number, size: number): Buffer {
  if (off + size + 5 > b.length) throw new Error("bloco_fora_do_arquivo");
  const tipo = b[off + size];
  const cru = b.subarray(off, off + size);
  if (tipo === 0) return cru;
  if (tipo === 1) return snappy(cru);
  throw new Error("compressao_desconhecida");
}

function entradasDoBloco(blk: Buffer): [Buffer, Buffer][] {
  if (blk.length < 4) throw new Error("bloco_curto");
  const nRest = blk.readUInt32LE(blk.length - 4);
  const fim = blk.length - 4 - 4 * nRest;
  if (fim < 0) throw new Error("bloco_restart_invalido");
  const out: [Buffer, Buffer][] = []; const p: Pos = { i: 0 }; let ultima = Buffer.alloc(0);
  while (p.i < fim) {
    const shared = varint(blk, p), nonShared = varint(blk, p), vlen = varint(blk, p);
    if (shared > ultima.length || p.i + nonShared + vlen > fim) throw new Error("entrada_invalida");
    const chave = Buffer.concat([ultima.subarray(0, shared), blk.subarray(p.i, p.i + nonShared)]); p.i += nonShared;
    const valor = blk.subarray(p.i, p.i + vlen); p.i += vlen;
    ultima = chave; out.push([chave, valor]);
  }
  return out;
}

const MAGIC = Buffer.from([0x57, 0xfb, 0x80, 0x8b, 0x24, 0x75, 0x47, 0xdb]);

export function* tabela(f: string): Generator<Registro> {
  const b = lerArquivo(f);
  if (b.length < 48 || !b.subarray(b.length - 8).equals(MAGIC)) throw new Error("tabela_sem_assinatura");
  const pe: Pos = { i: b.length - 48 };
  varint(b, pe); varint(b, pe);
  const io = varint(b, pe), is = varint(b, pe);
  for (const [, h] of entradasDoBloco(lerBloco(b, io, is))) {
    const ph: Pos = { i: 0 };
    const o = varint(h, ph), s = varint(h, ph);
    for (const [ik, v] of entradasDoBloco(lerBloco(b, o, s))) {
      if (ik.length < 8) throw new Error("chave_interna_curta");
      const tr = ik.subarray(ik.length - 8);
      const num = tr.readUInt32LE(0) + tr.readUInt32LE(4) * 2 ** 32;
      yield { chave: ik.subarray(0, ik.length - 8), seq: Math.floor(num / 256), tipo: num % 256, valor: v };
    }
  }
}

export function* diario(f: string): Generator<Registro> {
  const b = lerArquivo(f); const BL = 32768; let frag: Buffer[] = [];
  for (let bo = 0; bo < b.length; bo += BL) {
    let i = bo; const fimBloco = Math.min(bo + BL, b.length);
    while (i + 7 <= fimBloco) {
      const len = b.readUInt16LE(i + 4), tipo = b[i + 6]!;
      if (tipo === 0 && len === 0) break;
      if (i + 7 + len > fimBloco) break; // registro truncado: o dono ainda esta escrevendo
      const dado = b.subarray(i + 7, i + 7 + len); i += 7 + len;
      if (tipo === 1 || tipo === 2) frag = [dado]; else if (tipo === 3 || tipo === 4) frag.push(dado); else { frag = []; continue; }
      if (tipo !== 1 && tipo !== 4) continue;
      const lote = Buffer.concat(frag); frag = [];
      if (lote.length < 12) continue;
      let seq = lote.readUInt32LE(0) + lote.readUInt32LE(4) * 2 ** 32;
      const n = lote.readUInt32LE(8); const p: Pos = { i: 12 };
      const doLote: Registro[] = [];
      try {
        for (let k = 0; k < n; k++) {
          const t = lote[p.i++]!; const kl = varint(lote, p);
          if (p.i + kl > lote.length) throw new Error("lote_truncado");
          const chave = lote.subarray(p.i, p.i + kl); p.i += kl;
          let valor: Buffer | null = null;
          if (t === 1) { const vl = varint(lote, p); if (p.i + vl > lote.length) throw new Error("lote_truncado"); valor = lote.subarray(p.i, p.i + vl); p.i += vl; }
          doLote.push({ chave, seq: seq++, tipo: t, valor });
        }
      } catch { continue; } // lote incompleto: descartado inteiro, nunca pela metade
      for (const r of doLote) yield r;
    }
  }
}

/**
 * Estado mais recente de cada chave (maior sequencia) entre todas as tabelas e diarios da pasta.
 * `aceita(chave)` filtra ANTES de guardar: o que o chamador nao pediu nao fica nem em memoria.
 */
export function estadoDaPasta(dir: string, aceita: (chave: Buffer) => boolean): Map<string, Registro> {
  const m = new Map<string, Registro>();
  for (const f of readdirSync(dir)) {
    const it = /^\d+\.ldb$/.test(f) ? tabela(join(dir, f)) : /^\d+\.log$/.test(f) ? diario(join(dir, f)) : null;
    if (!it) continue;
    for (const r of it) {
      if (!aceita(r.chave)) continue;
      const k = r.chave.toString("latin1"); const a = m.get(k);
      if (!a || r.seq > a.seq) m.set(k, r);
    }
  }
  return m;
}
