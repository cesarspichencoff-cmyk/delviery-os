'use strict';
// Cada mutante remove UMA garantia da tela do turno; a suíte do turno tem de reprovar. Restaura sempre.
//   node tools/mutantes-copiloto-turno.cjs [repo]
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const repo = path.resolve(process.argv[2] || '.');
const T = 'src/product/ui/surfaces/turno-itaim.js';
const H = 'src/product/ui/surfaces/home.js';
const M = [
  [T, [['if (pedido?.etapa !== "em preparo") continue;\n    const faltam', 'const faltam']], 'pronto_ou_cancelado_entra_na_conta'],
  [T, [['  if (dados.bloqueia) {\n    return { dados,', '  if (false) {\n    return { dados,']], 'fonte_parada_nao_suspende'],
  [T, [['faltam != null && faltam >= 0 && faltam <= JANELA_APERTO_MIN ? "vencendo"', 'faltam != null ? "atrasados"']], 'vencendo_vira_atrasado'],
  [T, [['acoes.sort((a, b) => a.prioridade - b.prioridade ||', 'acoes.sort((a, b) => b.prioridade - a.prioridade ||']], 'ordem_invertida'],
  [T, [['" só depende de " + g.rotulo', '" só depende de " + g.rotulo + ""'], ['return comandaCurta(c.pedido) + (fora.length ?', 'return comandaCurta(c.pedido) + (false ?']], 'destrava_esconde_outra_praca'],
  [T, [['if (o.leitura_velha) return {', 'if (false) return {']], 'leitura_velha_vira_atual'],
  [T, [['esc(p.nome_cliente || "cliente a conferir")', 'esc(p.nome_cliente || "")']], 'nome_ausente_some'],
  [H, [['if (a.pai) return grupos.filter(p => p.praca === a.id);', '']], 'pracas_internas_viram_ambiente'],
];
let mortos = 0;
for (const [f, trocas, nome] of M) {
  const p = path.join(repo, f); const orig = fs.readFileSync(p, 'utf8'); const lf = orig.replace(/\r\n/g, '\n');
  if (!trocas.every(([de]) => lf.includes(de))) { console.log('MUTANTE_INVALIDO ' + nome); continue; }
  fs.writeFileSync(p, trocas.reduce((s, [de, para]) => s.replace(de, para), lf));
  try {
    const r = cp.spawnSync(process.execPath, ['tests/copiloto-turno/run-turno-tests.mjs'], { cwd: repo, encoding: 'utf8' });
    const morto = r.status !== 0; if (morto) mortos++;
    console.log((morto ? 'MORTO ' : 'VIVO  ') + nome);
  } finally { fs.writeFileSync(p, orig); }
}
console.log(`MUTANTES ${mortos}/${M.length}`);
process.exitCode = mortos === M.length ? 0 : 1;
