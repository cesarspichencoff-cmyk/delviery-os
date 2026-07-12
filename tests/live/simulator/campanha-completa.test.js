/* Fase 3B — campanha COMPLETA de 30 dias, executada duas vezes no carregamento
 * do arquivo (compartilhada entre os testes): determinismo, volume, mix,
 * reinícios, replay, fronteira 23:00, F2-07, PII e gates. */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { executarCampanha } = require("../../../tools/live/simulator/campanha/executor");
const { CAMPANHA_30D } = require("../../../tools/live/simulator/campanha/contrato");

// duas execuções completas — a base de todos os testes deste arquivo
const execA = executarCampanha({});
const execB = executarCampanha({});

test("1/12. determinismo da campanha completa: hash canônico idêntico", () => {
  assert.equal(execA.hash_campanha, execB.hash_campanha);
  assert.equal(execA.snapshot_final_hash, execB.snapshot_final_hash);
  assert.deepEqual(execA.totais, execB.totais);
});

test("13. mesma campanha em runtimes temporários diferentes", () => {
  assert.notEqual(execA.runtime_root, execB.runtime_root); // diretórios distintos…
  assert.equal(execA.hash_campanha, execB.hash_campanha);  // …resultado idêntico
});

test("4. campanha de 30 dias com volume no alvo (8.000–10.000 pedidos)", () => {
  assert.equal(execA.dias.length, 30);
  assert.ok(execA.totais.pedidos >= CAMPANHA_30D.order_volume_target.total_min,
    `pedidos ${execA.totais.pedidos} abaixo do alvo`);
  assert.ok(execA.totais.pedidos <= CAMPANHA_30D.order_volume_target.total_max,
    `pedidos ${execA.totais.pedidos} acima do alvo`);
  assert.ok(execA.totais.eventos_gerados > execA.totais.pedidos * 2, "eventos correspondentes");
});

test("5. volume não uniforme: dias calmos, normais, altos e de pico", () => {
  const porPerfil = {};
  for (const d of execA.dias) {
    porPerfil[d.perfil] = porPerfil[d.perfil] || [];
    porPerfil[d.perfil].push(d.pedidos);
  }
  for (const perfil of ["calmo", "normal", "alto", "pico", "pressao",
    "fonte_instavel", "recuperacao", "invalidos_ampliado"]) {
    assert.ok(porPerfil[perfil] && porPerfil[perfil].length > 0, `perfil ${perfil} exercitado`);
  }
  assert.ok(Math.min(...porPerfil.pico) >= 480, "pico tem volume de pico");
  assert.ok(Math.max(...porPerfil.calmo) <= 200 + 8, "calmo é calmo"); // +fronteira
});

test("mix de cenários obrigatórios presente na campanha", () => {
  const t = execA.totais;
  assert.ok(t.duplicados > 100, "alto volume deduplicável");
  assert.ok(t.reimpressoes > 0 && t.cancelamentos > 0 && t.conflitos_pares > 0);
  assert.ok(t.fora_de_ordem > 0 && t.comandas_vazias > 0 && t.invalidos > 0);
  assert.equal(t.desconexoes, 2);
  assert.equal(t.reconexoes, 2); // recuperação após indisponibilidade
  assert.ok(t.amostras_freshness.atrasada > 0, "fonte atrasada observada");
  assert.ok(t.amostras_freshness.vencida > 0, "fonte vencida observada");
  assert.ok(t.amostras_freshness.desconectada > 0, "desconexão observada em amostra");
});

test("6/7. reinícios múltiplos em contextos distintos, replay sempre equivalente", () => {
  assert.equal(execA.replays.length, 6);
  const contextos = execA.replays.map((r) => r.contexto);
  for (const c of ["apos_periodo_calmo", "durante_volume_elevado", "apos_evento_duplicado",
    "apos_conflito", "durante_desconexao_antes_de_evidencia_fresca"]) {
    assert.ok(contextos.includes(c), `contexto de reinício: ${c}`);
  }
  for (const r of execA.replays) {
    assert.equal(r.snapshot_igual, true,
      `replay dia ${r.dia} (${r.contexto}) deveria reconstruir a projeção idêntica`);
    assert.ok(r.eventos_relidos > 0);
  }
});

test("8. eventos na fronteira das 23:00: separados, sem contaminar o dia", () => {
  assert.equal(execA.totais.fora_janela, 9); // 3 dias × 3 eventos deliberados
  for (const dia of [3, 12, 25]) {
    assert.equal(execA.dias[dia - 1].fora_janela, 3, `dia ${dia} com fronteira marcada`);
  }
  for (const dia of [1, 2, 4, 30]) {
    assert.equal(execA.dias[dia - 1].fora_janela, 0, `dia ${dia} sem fronteira`);
  }
});

test("9. F2-07 mensurável: série diária, total e classificação registrada", () => {
  const f = execA.f207;
  assert.equal(f.serie_diaria.length, 30);
  // crescimento monotônico das chaves de fato (nunca encolhe: append-only)
  for (let i = 1; i < f.serie_diaria.length; i++) {
    assert.ok(f.serie_diaria[i].chaves_fato_acum >= f.serie_diaria[i - 1].chaves_fato_acum);
  }
  // proporcionalidade: cada fato aceito gera exatamente uma chave de fato
  assert.equal(f.total_chaves_fato,
    execA.totais.aceitos - execA.totais.observacoes_repetidas);
  assert.equal(f.existe_limpeza_ou_expiracao, false); // fato do núcleo atual
  assert.equal(f.classificacao, "crescimento_linear_esperado");
  assert.ok(f.total_chaves_fato > 20000, "escala real testada");
});

test("11. PII: varredura do runtime da campanha completa limpa", () => {
  assert.deepEqual(execA.pii_achados, []);
  assert.equal(execA.gates.G4_privacidade, "verde");
});

test("gates da campanha: G3-G7 verdes, zero divergência, zero falha inesperada", () => {
  assert.equal(execA.gates.G3_replay, "verde");
  assert.equal(execA.gates.G5_volume, "verde");
  assert.match(execA.gates.G6_f207, /verde/);
  assert.match(execA.gates.G7_f208, /verde/);
  assert.equal(execA.totais.divergencias, 0);
  assert.equal(execA.totais.falhas_inesperadas, 0);
  assert.equal(execA.totais.replays_equivalentes, execA.totais.reinicios);
});

test("estados finais coerentes: consolidação em escala", () => {
  const e = execA.totais.estados_finais;
  assert.ok(e.matched > 8000, "maioria matched");
  assert.ok(e.conflict > 0 && e.cancelados > 0 && e.unmatched > 0);
  // log aceito = fatos únicos (dedup antes do append, F2-04, sob volume)
  assert.equal(execA.totais.linhas_log_aceito,
    execA.totais.aceitos - execA.totais.observacoes_repetidas);
});
