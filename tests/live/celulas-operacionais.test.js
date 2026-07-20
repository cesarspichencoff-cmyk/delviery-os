/* ============================================================================
 * Células operacionais do Copiloto V1 — leitura honesta das fontes reais.
 * ----------------------------------------------------------------------------
 * Testa a lógica PURA (src/live/interface/celulas-operacionais.js): agregação
 * de praças (Sushi), separação Quentes×Cozinha, e a célula derivada Caixa —
 * incluindo a proibição estrutural do estado "Sobrecarregado" e a leitura
 * parcial que nunca inventa dado.
 * ==========================================================================*/
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const CEL = require("../../src/live/interface/celulas-operacionais");

const DISPLAY = {
  combinados: "Combinados", duplas: "Duplas", enrolados: "Enrolados",
  enrolados_quentes: "Enrolados Quentes", cozinha_quentes: "Quentes"
};
const T = 1000;

/* NIGHT sintético: cada entrada pronta há `off` min (off=null → não pronto). */
function night(offsets) {
  return offsets.map((off, i) => ({
    id: "p" + i, curto: "P" + i,
    r: T - (off == null ? 3 : off) - 5,
    p: off == null ? null : T - off,
    c: null
  }));
}

/* ---- Sushi: agregação visual das três praças frias ---- */

test("Sushi: três praças estáveis → célula estável, sem inventar pressão", () => {
  const est = CEL.estadoAgregado({}, ["combinados", "duplas", "enrolados"], DISPLAY);
  assert.equal(est.cor, "verde");
  assert.equal(est.sev, 0);
  assert.match(est.motivo, /seguem estáveis/);
});

test("Sushi: uma praça em atenção, as demais estáveis → identifica a contribuinte", () => {
  const est = CEL.estadoAgregado({ enrolados: 1 }, ["combinados", "duplas", "enrolados"], DISPLAY);
  assert.equal(est.cor, "amarelo");
  assert.equal(est.pr, "enrolados");
  assert.match(est.motivo, /Enrolados concentra a maior espera/);
  assert.match(est.motivo, /Combinados e Duplas seguem estáveis/);
});

test("Sushi: severidade da célula = a pior praça do grupo (não soma incompatível)", () => {
  const est = CEL.estadoAgregado({ combinados: 1, enrolados: 3 }, ["combinados", "duplas", "enrolados"], DISPLAY);
  assert.equal(est.sev, 3, "deve refletir a pior praça, não uma soma");
  assert.equal(est.pr, "enrolados");
  assert.equal(est.cor, "vermelho");
});

/* ---- Quentes × Cozinha: células distintas, sem duplicar cozinha_quentes ---- */

test("Quentes usa SOMENTE enrolados_quentes", () => {
  // cozinha_quentes crítica NÃO pode afetar Quentes
  const est = CEL.estadoAgregado({ cozinha_quentes: 3 }, ["enrolados_quentes"], DISPLAY);
  assert.equal(est.sev, 0, "cozinha_quentes não pertence a Quentes");
  assert.equal(est.cor, "verde");
});

test("Cozinha usa SOMENTE cozinha_quentes", () => {
  const est = CEL.estadoAgregado({ cozinha_quentes: 3 }, ["cozinha_quentes"], DISPLAY);
  assert.equal(est.sev, 3);
  assert.equal(est.cor, "vermelho");
});

/* Regressão do rótulo contextual (auditoria D2): o DISPLAY do motor rotula
 * `cozinha_quentes` como "Quentes" — na célula Cozinha isso produzia o texto
 * errado "Quentes concentra a maior espera". O rótulo contextual corrige a
 * apresentação sem tocar no vínculo praça→célula nem no DISPLAY do motor. */
const DISPLAY_MOTOR = { cozinha_quentes: "Quentes", enrolados_quentes: "Enrolados Quentes" };

test("regressão: Cozinha explica com 'Cozinha', nunca 'Quentes concentra'", () => {
  const c = CEL.estadoAgregado({ cozinha_quentes: 2 }, ["cozinha_quentes"], DISPLAY_MOTOR, { cozinha_quentes: "Cozinha" });
  assert.match(c.motivo, /Cozinha concentra a maior espera/);
  assert.doesNotMatch(c.motivo, /Quentes concentra/);
  assert.doesNotMatch(c.motivo, /\bQuentes\b/);
});

test("regressão: cozinha_quentes continua alimentando a Cozinha (vínculo intacto)", () => {
  const c = CEL.estadoAgregado({ cozinha_quentes: 3 }, ["cozinha_quentes"], DISPLAY_MOTOR, { cozinha_quentes: "Cozinha" });
  assert.equal(c.sev, 3, "a severidade da Cozinha vem de cozinha_quentes");
  assert.equal(c.pr, "cozinha_quentes");
  assert.equal(c.cor, "vermelho");
});

test("regressão: Quentes continua usando enrolados_quentes e independente da Cozinha", () => {
  const sev = { enrolados_quentes: 1, cozinha_quentes: 3 };
  const q = CEL.estadoAgregado(sev, ["enrolados_quentes"], DISPLAY_MOTOR);
  const c = CEL.estadoAgregado(sev, ["cozinha_quentes"], DISPLAY_MOTOR, { cozinha_quentes: "Cozinha" });
  assert.equal(q.pr, "enrolados_quentes", "Quentes não pode ser dominado por cozinha_quentes");
  assert.notEqual(q.cor, c.cor, "as duas células continuam independentes");
  // o rótulo contextual da Cozinha não afeta o texto de Quentes
  assert.doesNotMatch(q.motivo, /Cozinha/);
});

test("Quentes e Cozinha podem apresentar estados diferentes ao mesmo tempo", () => {
  const sev = { enrolados_quentes: 1, cozinha_quentes: 3 };
  const q = CEL.estadoAgregado(sev, ["enrolados_quentes"], DISPLAY);
  const c = CEL.estadoAgregado(sev, ["cozinha_quentes"], DISPLAY);
  assert.notEqual(q.cor, c.cor, "as duas células precisam poder divergir");
  assert.equal(q.cor, "amarelo");
  assert.equal(c.cor, "vermelho");
});

/* ---- Caixa: célula operacional derivada, leitura parcial ---- */

test("Caixa calmo: poucos prontos na janela", () => {
  const r = CEL.leituraCaixa(night([2, 5]), T);
  assert.equal(r.frase, "calmo");
  assert.equal(r.cor, "verde");
  assert.match(r.motivo, /Leitura parcial/);
});

test("Caixa em movimento: concentração temporal de prontos", () => {
  const r = CEL.leituraCaixa(night([1, 2, 3, 8]), T);
  assert.equal(r.frase, "em movimento");
  assert.equal(r.cor, "verde");
  assert.equal(r.n, 4);
  assert.match(r.motivo, /ficaram prontos nos últimos 10 min/);
});

test("Caixa em atenção: muitos pedidos prontos quase juntos", () => {
  const r = CEL.leituraCaixa(night([1, 2, 3, 4, 5, 9]), T);
  assert.equal(r.frase, "atenção");
  assert.equal(r.cor, "amarelo");
  assert.equal(r.sev, 1);
});

test("Caixa NUNCA fica 'Sobrecarregado' só com pedidos prontos", () => {
  // muitíssimos prontos concentrados — o teto honesto é 'atenção'
  const r = CEL.leituraCaixa(night([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), T);
  assert.equal(r.frase, "atenção");
  assert.notEqual(r.frase, "sobrecarregado");
  assert.notEqual(r.cor, "vermelho", "vermelho/crítico exigiria sinais combinados inexistentes");
});

test("Caixa: leitura parcial sempre presente (fontes ausentes declaradas)", () => {
  for (const of of [[2], [1, 2, 3], [1, 2, 3, 4, 5, 6]]) {
    const r = CEL.leituraCaixa(night(of), T);
    assert.match(r.motivo, /sacolas, comandas, expedição e mensagens ainda não estão conectadas/);
  }
});

test("Caixa: dados ausentes NÃO viram zero nem número inventado", () => {
  const r = CEL.leituraCaixa(night([2]), T);
  // nunca menciona sacola/comanda/mensagem como quantidade
  assert.doesNotMatch(r.info, /sacola|comanda|mensage|motoboy|expedi/i);
  assert.doesNotMatch(r.motivo, /\d+\s+(sacola|comanda|mensage|motoboy)/i);
  // info só fala de prontos observados, nunca de fontes ausentes
  assert.ok(r.info === "" || /pronto/.test(r.info));
});

test("Caixa: fonte indisponível quando não há janela", () => {
  const r = CEL.leituraCaixa(null, T);
  assert.equal(r.frase, "fonte indisponível");
  assert.equal(r.cor, "validacao");
});

test("Caixa: sem pedidos observados → leitura parcial, não 'calmo' falso", () => {
  const r = CEL.leituraCaixa([{ r: T + 50, p: null, c: null }], T); // pedido ainda não chegou
  assert.equal(r.frase, "leitura parcial");
});

test("Caixa: pedido cancelado não conta como pronto", () => {
  const canc = night([2, 3]).map((o, i) => (i === 0 ? Object.assign({}, o, { c: T - 1 }) : o));
  const r = CEL.leituraCaixa(canc, T);
  assert.equal(r.n, 1, "o cancelado não entra na concentração de prontos");
});

test("estados permitidos do Caixa são só os 5 honestos (sem 'Sobrecarregado')", () => {
  const permitidos = new Set(["calmo", "em movimento", "atenção", "leitura parcial", "fonte indisponível"]);
  const casos = [null, [], night([2]), night([1, 2, 3]), night([1, 2, 3, 4, 5, 6]),
    night([1, 2, 3, 4, 5, 6, 7, 8, 9, 9])];
  for (const c of casos) {
    const r = CEL.leituraCaixa(c, T);
    assert.ok(permitidos.has(r.frase), "estado inesperado: " + r.frase);
  }
});
