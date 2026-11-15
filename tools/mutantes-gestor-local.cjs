'use strict';
// Cada mutante remove UMA garantia; a suite tem de reprovar. Restaura o arquivo sempre.
const fs = require('node:fs');
const cp = require('node:child_process');
const repo = require('node:path').resolve(process.argv[2] || '.');
const M = [
  ['src/platform/leitura/pedidos-do-gestor-local.ts', 'if (!s.startsWith(ORIGEM)) return false;\n      const resto = s.slice(ORIGEM.length);', 'const resto = s.slice(s.indexOf("\\u0000\\u0001") + 2);', 'origem'],
  ['src/platform/leitura/conciliacao-gestor-teknisa.ts', 'soma(m, i.codigo_arvore, q);', 'soma(m, i.codigo, q);', 'cdarvprod'],
  ['src/platform/leitura/pedidos-do-gestor-local.ts', 'if (p === null || p.teste)', 'if (p === null)', 'teste'],
  ['src/platform/leitura/pedidos-do-gestor-local.ts', 'id_interno: o["id"].toLowerCase(),', 'id_interno: o["id"].toLowerCase(), ...({ cliente: o["customer"] } as object),', 'privacidade'],
  ['src/platform/leitura/conciliacao-gestor-teknisa.ts', 'const espera = minutos < ESPERA_PELA_TEKNISA_MIN', 'const espera = minutos < 9999', 'espera'],
];
let mortos = 0;
for (const [f, de, para, nome] of M) {
  const p = repo + '/' + f; const orig = fs.readFileSync(p, 'utf8');
  if (!orig.includes(de)) { console.log('MUTANTE_INVALIDO ' + nome); continue; }
  fs.writeFileSync(p, orig.replace(de, para));
  try {
    const r = cp.spawnSync('npx', ['tsx', 'src/platform/run-gestor-local-tests.ts'], { cwd: repo, shell: true, encoding: 'utf8', env: { ...process.env } });
    const morto = r.status !== 0; if (morto) mortos++;
    console.log((morto ? 'MORTO ' : 'VIVO  ') + nome);
  } finally { fs.writeFileSync(p, orig); }
}
console.log(`MUTANTES ${mortos}/${M.length}`);
process.exitCode = mortos === M.length ? 0 : 1;
