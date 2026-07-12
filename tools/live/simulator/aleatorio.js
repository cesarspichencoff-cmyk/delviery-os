/* ============================================================================
 * DeliveryOS · tools/live/simulator · PSEUDOALEATÓRIO COM SEED
 * ----------------------------------------------------------------------------
 * mulberry32: PRNG determinístico — a mesma seed produz exatamente a mesma
 * sequência em qualquer máquina; seed diferente produz outra execução válida.
 * Nunca usa Math.random().
 * ==========================================================================*/
"use strict";

/** FNV-1a de 32 bits para aceitar seed em texto */
function hashSeed(seed) {
  const texto = String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function criarAleatorio(seed) {
  let estado = hashSeed(seed);

  function proximo() { // mulberry32 — [0, 1)
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    seed: String(seed),
    proximo,
    inteiro(min, max) { // inclusivo nas duas pontas
      return min + Math.floor(proximo() * (max - min + 1));
    },
    escolher(lista) {
      return lista[Math.floor(proximo() * lista.length)];
    }
  };
}

module.exports = { criarAleatorio, hashSeed };
