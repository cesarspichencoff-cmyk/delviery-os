'use strict';
// Cada mutante remove UMA garantia; a suite indicada tem de reprovar. Restaura o arquivo sempre.
//   node tools/mutantes-gestor-local.cjs [repo]
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const repo = path.resolve(process.argv[2] || '.');
const GESTOR = 'src/platform/run-gestor-local-tests.ts';
const READER = 'src/platform/run-pedidos-reais-do-reader-tests.ts';
// [arquivo, [[trecho, troca], ...], nome, suite]
const M = [
  ['src/platform/leitura/pedidos-do-gestor-local.ts', [['if (!s.startsWith(ORIGEM)) return false;', ''], ['const resto = s.slice(ORIGEM.length);', 'const resto = s.slice(s.indexOf("\\u0000\\u0001") + 2);']], 'origem', GESTOR],
  ['src/platform/leitura/conciliacao-gestor-teknisa.ts', [['soma(m, i.codigo_arvore, q);', 'soma(m, i.codigo, q);']], 'cdarvprod', GESTOR],
  ['src/platform/leitura/pedidos-do-gestor-local.ts', [['if (p === null || p.teste)', 'if (p === null)']], 'teste', GESTOR],
  ['src/platform/leitura/pedidos-do-gestor-local.ts', [['id_interno: o["id"].toLowerCase(),', 'id_interno: o["id"].toLowerCase(), ...({ cliente: o["customer"] } as object),']], 'privacidade', GESTOR],
  ['src/platform/leitura/conciliacao-gestor-teknisa.ts', [['const espera = minutos < ESPERA_PELA_TEKNISA_MIN', 'const espera = minutos < 9999']], 'espera', GESTOR],
  ['src/platform/leitura/pedidos-reais-do-reader.ts', [['idx >= 0 && idx < nItens ? itens[idx] : undefined', 'idx >= 1 && idx <= nItens ? itens[idx - 1] : undefined']], 'observacao_base_1', READER],
  ['src/platform/leitura/pedidos-reais-do-reader.ts', [['if (alvo !== undefined && produtoBate)', 'if (alvo !== undefined)']], 'observacao_sem_conferir_produto', READER],
];
let mortos = 0;
for (const [f, trocas, nome, suite] of M) {
  const p = path.join(repo, f); const orig = fs.readFileSync(p, 'utf8');
  if (!trocas.every(([de]) => orig.includes(de))) { console.log('MUTANTE_INVALIDO ' + nome); continue; }
  fs.writeFileSync(p, trocas.reduce((s, [de, para]) => s.replace(de, para), orig));
  try {
    const r = cp.spawnSync('npx', ['tsx', suite], { cwd: repo, shell: true, encoding: 'utf8', env: { ...process.env } });
    const morto = r.status !== 0; if (morto) mortos++;
    console.log((morto ? 'MORTO ' : 'VIVO  ') + nome);
  } finally { fs.writeFileSync(p, orig); }
}
console.log(`MUTANTES ${mortos}/${M.length}`);
process.exitCode = mortos === M.length ? 0 : 1;
