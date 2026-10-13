import assert from "node:assert/strict";
import { PRACAS } from "./areas";
import { celulasCopilotoV33 } from "./copiloto-celulas-v33";
import type { CopilotoEntregasLeitura } from "./copiloto-entregas-leitura";

const base: CopilotoEntregasLeitura = {
  contrato: "copiloto-entregas-leitura@1",
  estado: "indisponivel",
  fonte: null,
  lida_em: null,
  unidade_solicitada: "ITAIM",
  grupos: [],
  historico_sem_modo: null,
  motivo: "sem banco",
  nenhuma_acao_executada: true,
};

let passed = 0;
function test(name: string, action: () => void): void {
  action(); passed++;
  console.log("  ok  " + name);
}

test("CV1 seis celulas com ordem e nomes exatos do V3.3", () => {
  const x = celulasCopilotoV33(base);
  assert.deepEqual(x.celulas.map(c => c.nome), [
    "Caixa", "Sushi", "Quentes", "Cozinha", "Conferência", "Entregas",
  ]);
  assert.equal(x.celulas.length, 6);
  assert.equal(x.modo, "somente_leitura_sem_motor_operacional");
});

test("CV2 Quentes e Cozinha sem colisao, Sushi nao duplica as pracas", () => {
  const cs = celulasCopilotoV33(base).celulas;
  const sushi = cs.find(c => c.id === "sushi")!;
  const quentes = cs.find(c => c.id === "quentes")!;
  const cozinha = cs.find(c => c.id === "cozinha")!;
  assert.deepEqual(sushi.pracas, ["combinados", "duplas", "enrolados"]);
  assert.deepEqual(quentes.pracas, ["enrolados_quentes"]);
  assert.deepEqual(cozinha.pracas, ["cozinha_quentes"]);
  const usadas = [...sushi.pracas, ...quentes.pracas, ...cozinha.pracas];
  assert.equal(new Set(usadas).size, usadas.length);
  assert.ok(usadas.every(id => PRACAS.some(p => p.id === id)));
  assert.ok(!usadas.includes("montagem_outros"));
});

test("CV3 sem fonte nunca se transforma em verde, calmo, pressão ou zero", () => {
  const xs = celulasCopilotoV33(base);
  assert.equal(xs.nenhuma_acao_executada, true);
  for (const c of xs.celulas) {
    assert.equal(c.estado, "nao_conectada");
    assert.equal(c.fonte, null);
    assert.equal(c.pressao, null);
    assert.equal(c.cor_operacional, null);
    assert.equal(c.fila, null);
    assert.equal(c.nenhuma_acao_executada, true);
  }
});

test("CV4 banco legivel sem viagem nao prova zero entregas", () => {
  const cs = celulasCopilotoV33({
    ...base, estado: "sem_evidencia", fonte: "platform.event_log",
  }).celulas;
  const e = cs.find(c => c.id === "entregas")!;
  assert.equal(e.estado, "sem_evidencia");
  assert.equal(e.fonte, "platform.event_log");
  assert.match(e.descricao, /não prova zero/i);
});

test("CV5 viagem simulada não vira operação real", () => {
  const e = celulasCopilotoV33({
    ...base, estado: "observado", fonte: "platform.event_log",
    grupos: [{ unit_id: "ITAIM", source_mode: "simulated", viagens_na_projecao: 8 }],
  }).celulas[5];
  assert.equal(e.estado, "historico_sintetico");
  assert.deepEqual(e.modos, ["simulated"]);
  assert.equal(e.pressao, null);
});

test("CV6 viagem real é somente história, não pronta, ativa ou atrasada", () => {
  const e = celulasCopilotoV33({
    ...base, estado: "observado", fonte: "platform.event_log",
    grupos: [{ unit_id: "ITAIM", source_mode: "real", viagens_na_projecao: 4 }],
  }).celulas[5];
  assert.equal(e.estado, "historico_real_parcial");
  assert.match(e.descricao, /não mede viagens ativas/i);
  assert.deepEqual(e.modos, ["real"]);
});

test("CV7 modos mistos ficam distintos, sem recomendacao/cor", () => {
  const cs = celulasCopilotoV33({
    ...base, estado: "observado", fonte: "platform.event_log",
    grupos: [
      { unit_id: "ITAIM", source_mode: "real", viagens_na_projecao: 1 },
      { unit_id: "ITAIM", source_mode: "control", viagens_na_projecao: 1 },
      { unit_id: "ITAIM", source_mode: "simulated", viagens_na_projecao: 5 },
    ],
  }).celulas;
  const e = cs[5];
  assert.deepEqual(e.modos, ["real", "simulated", "control"]);
  assert.ok(cs.slice(0, 5).every(c => c.estado === "nao_conectada"));
  for (const c of cs) {
    assert.equal(c.pressao, null);
    assert.equal(c.cor_operacional, null);
    assert.equal(c.fila, null);
    assert.equal(c.nenhuma_acao_executada, true);
    assert.equal("recomendacao" in c, false);
    assert.equal("executar" in c, false);
  }
});

console.log("COPILOTO_CELULAS_V33_SHADOW=" + passed + "/7 PASS");
