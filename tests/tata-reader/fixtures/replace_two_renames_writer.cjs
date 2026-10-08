#!/usr/bin/env node
"use strict";
/**
 * ESCRITOR que imita a troca de arquivo do Windows. File.Replace (ReplaceFile)
 * no NTFS sao dois renames: alvo -> backup, temporario -> alvo. Entre os dois,
 * o caminho NAO existe. No Linux um rename so e atomico e esconde essa janela;
 * este escritor a reabre de proposito, em laco, para que leitores sejam
 * testados contra ela.
 *
 * Uso: node replace_two_renames_writer.cjs <segundos> <pausa_ms> <arquivo>...
 * Cada arquivo recebe JSON valido; a janela sem arquivo e real em cada volta.
 * Grava {"voltas","falhas"} em stdout ao terminar.
 */
const fs = require("node:fs");

const [segundos, pausaMs, ...alvos] = process.argv.slice(2);
if (!segundos || !pausaMs || alvos.length === 0) {
  console.error("uso: replace_two_renames_writer.cjs <segundos> <pausa_ms> <arquivo>...");
  process.exit(64);
}
const fim = Date.now() + Number(segundos) * 1000;
const pausa = new Int32Array(new SharedArrayBuffer(4));
let voltas = 0;
let falhas = 0;
while (Date.now() < fim) {
  for (const alvo of alvos) {
    const tmp = `${alvo}.tmp.${process.pid}`;
    const bak = `${alvo}.bak.${process.pid}`;
    // No Windows, antivirus ou leitor com o arquivo aberto podem recusar um
    // rename por um instante: a volta e contada como falha e o laco segue.
    try {
      fs.writeFileSync(tmp, JSON.stringify({ schema: "deliveryos.tata-reader-heartbeat.v1", volta: voltas, em: new Date().toISOString() }));
      if (fs.existsSync(alvo)) fs.renameSync(alvo, bak);
      fs.renameSync(tmp, alvo);
    } catch {
      falhas += 1;
      try { if (!fs.existsSync(alvo) && fs.existsSync(bak)) fs.renameSync(bak, alvo); } catch { /* proxima volta */ }
    }
    try { fs.unlinkSync(bak); } catch { /* primeira volta ou ja sem backup */ }
  }
  voltas += 1;
  Atomics.wait(pausa, 0, 0, Number(pausaMs));
}
process.stdout.write(JSON.stringify({ voltas, falhas }));
